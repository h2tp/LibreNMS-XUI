import { reactive } from 'vue'
import { t, lang } from './i18n'

export const session = reactive({ loaded: false, authenticated: false, user: null, auth_mode: 'password', read_only: false, role: '', librenms_url: '', rrd: false, realtime: false, deleted_ports: false })

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

async function request(url, opts = {}) {
  const init = { method: opts.method || 'GET', headers: { Accept: 'application/json', 'X-XUI-Lang': lang }, credentials: 'same-origin' }
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  let r
  try { r = await fetch(url, init) } catch (e) { throw new ApiError(t('Réseau indisponible'), 0) }
  if (r.status === 401 && !url.startsWith('/xui/login')) {
    session.authenticated = false
  }
  const ct = r.headers.get('content-type') || ''
  const data = ct.includes('json') ? await r.json().catch(() => null) : await r.text()
  if (!r.ok || (data && data.status === 'error')) {
    const msg = (data && (data.message || data.detail)) || t('Erreur HTTP {n}', { n: r.status })
    throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), r.status)
  }
  return data
}

function qs(params) {
  if (!params) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.append(k, v)
  const s = p.toString()
  return s ? '?' + s : ''
}

const enc = (s) => encodeURIComponent(s)

/** Appel brut à l'API LibreNMS v0 via le proxy. */
export const api = {
  get: (path, params) => request(`/xui/api/${path}${qs(params)}`),
  post: (path, body) => request(`/xui/api/${path}`, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(`/xui/api/${path}`, { method: 'PUT', body: body ?? {} }),
  patch: (path, body) => request(`/xui/api/${path}`, { method: 'PATCH', body: body ?? {} }),
  del: (path, body) => request(`/xui/api/${path}`, { method: 'DELETE', body }),
  img: (path, params) => `/xui/api/${path}${qs(params)}`,
}

/** Extrait le premier tableau d'une réponse LibreNMS ({status, devices:[...], count}). */
export function pick(resp, key) {
  if (!resp || typeof resp !== 'object') return []
  if (key && Array.isArray(resp[key])) return resp[key]
  if (key && resp[key] && typeof resp[key] === 'object') return Object.values(resp[key])
  for (const [k, v] of Object.entries(resp)) if (Array.isArray(v) && k !== 'status') return v
  return []
}

/** Variante tolérante : renvoie [] au lieu de lever une erreur (endpoint absent selon version). */
export async function safeList(path, params, key) {
  try { return pick(await api.get(path, params), key) } catch { return [] }
}

/**
 * L'endpoint /alerts ne renvoie pas les détails (port, capteur… concernés) :
 * on les récupère dans l'entrée du journal d'alertes qui a déclenché l'alerte.
 */
const alertDetailsCache = new Map()
export function alertDetails(a) {
  if (a?.details?.rule?.length || !a?.device_id) return Promise.resolve(a?.details || null)
  const key = `${a.id}|${a.timestamp}`
  if (!alertDetailsCache.has(key)) {
    const p = safeList(`logs/alertlog/${a.device_id}`, { from: a.timestamp, limit: 100 }, 'logs').then((logs) => {
      const hit = logs.filter((l) => +l.rule_id === +a.rule_id && +l.state !== 0 && l.details?.rule?.length).pop()
      if (!hit) alertDetailsCache.delete(key)
      return hit?.details || null
    })
    alertDetailsCache.set(key, p)
  }
  return alertDetailsCache.get(key)
}

/** Libellé court de l'élément concerné par une alerte (port, capteur, service). */
export function alertTargets(details) {
  return (details?.rule || []).map((e) =>
    e.port_id !== undefined && e.ifName !== undefined ? [e.ifName, e.ifAlias && e.ifAlias !== e.ifName ? e.ifAlias : ''].filter(Boolean).join(' · ')
      : e.sensor_id !== undefined ? e.sensor_descr || e.sensor_type
        : e.service_id !== undefined ? e.service_name || e.service_type
          : '').filter(Boolean)
}

export const auth = {
  async config() { Object.assign(session, await request('/xui/config'), { loaded: true }); return session },
  async login(payload) { await request('/xui/login', { method: 'POST', body: payload }); return auth.config() },
  async logout() { await request('/xui/logout', { method: 'POST', body: {} }); session.authenticated = false },
}

export const rrd = {
  list: (host) => request(`/xui/rrd/${enc(host)}`),
  info: (host, name) => request(`/xui/rrd/${enc(host)}/${enc(name)}/info`),
  data: (host, name, params) => request(`/xui/rrd/${enc(host)}/${enc(name)}/data${qs(params)}`),
  batch: (items) => request('/xui/rrd/batch', { method: 'POST', body: { items } }),
}

export const healthDbApi = { list: (host, type) => request(`/xui/devices/${encodeURIComponent(host)}/health/${type}`).then((r) => (r && r.graphs) || []) }
let stateTr = null
export const stateTrApi = { get: () => (stateTr ||= request('/xui/state-translations').catch(() => { stateTr = null; return null })) }
export const deletedPortsApi = { list: () => request('/xui/ports/deleted').then((r) => (r && r.ports) || []) }

export const realtimeApi = {
  port: (id) => request(`/xui/realtime/port/${enc(id)}`),
}

export const dashApi = {
  list: () => request('/xui/dashboards'),
  get: (id) => request(`/xui/dashboards/${enc(id)}`),
  create: (body) => request('/xui/dashboards', { method: 'POST', body }),
  update: (id, body) => request(`/xui/dashboards/${enc(id)}`, { method: 'PUT', body }),
  remove: (id) => request(`/xui/dashboards/${enc(id)}`, { method: 'DELETE' }),
  setDefault: (id) => request(`/xui/dashboards/${enc(id)}/default`, { method: 'POST', body: {} }),
}

export const diagApi = {
  list: () => request('/xui/diagrams'),
  get: (id) => request(`/xui/diagrams/${enc(id)}`),
  create: (body) => request('/xui/diagrams', { method: 'POST', body }),
  update: (id, body) => request(`/xui/diagrams/${enc(id)}`, { method: 'PUT', body }),
  remove: (id) => request(`/xui/diagrams/${enc(id)}`, { method: 'DELETE' }),
  bgUrl: (id, v) => `/xui/diagrams/${enc(id)}/background?v=${enc(v || '')}`,
  async setBackground(id, file) {
    const r = await fetch(`/xui/diagrams/${enc(id)}/background`, { method: 'PUT', headers: { 'Content-Type': file.type, 'X-XUI-Lang': lang }, body: file, credentials: 'same-origin' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new ApiError(j.detail || t('Erreur HTTP {n}', { n: r.status }), r.status)
    return j
  },
  removeBackground: (id) => request(`/xui/diagrams/${enc(id)}/background`, { method: 'DELETE' }),
  // bibliothèque d'images d'équipements (partagée entre schémas)
  images: () => request('/xui/diagram-images'),
  imgUrl: (name) => `/xui/diagram-images/${enc(name)}`,
  async uploadImage(file) {
    const r = await fetch('/xui/diagram-images', { method: 'POST', headers: { 'Content-Type': file.type, 'X-XUI-Lang': lang }, body: file, credentials: 'same-origin' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new ApiError(j.detail || t('Erreur HTTP {n}', { n: r.status }), r.status)
    return j
  },
  removeImage: (name) => request(`/xui/diagram-images/${enc(name)}`, { method: 'DELETE' }),
}

export const storageApi = { all: () => request('/xui/storage'), memory: () => request('/xui/memory'), cpu: () => request('/xui/cpu'), availability: () => request('/xui/availability'), printers: () => request('/xui/printers'), wireless: () => request('/xui/wireless') }

export const L = {
  devices: (params) => api.get('devices', params).then((r) => pick(r, 'devices')),
  device: (h) => api.get(`devices/${enc(h)}`).then((r) => pick(r, 'devices')[0]),
  enc,
}

// Cache léger de la liste des équipements (pour noms, recherche, carte...)
let devCache = { t: 0, p: null }
export function devicesCached(maxAge = 30000) {
  if (devCache.p && Date.now() - devCache.t < maxAge) return devCache.p
  devCache = { t: Date.now(), p: L.devices().catch((e) => { devCache.t = 0; throw e }) }
  return devCache.p
}
export function invalidateDevices() { devCache.t = 0 }

// photos d'un équipement (stockées par XUI, pas dans LibreNMS)
export const photoApi = {
  list: (deviceId) => request(`/xui/devices/${enc(deviceId)}/photos`),
  url: (name) => `/xui/device-photos/${enc(name)}`,
  async add(deviceId, file) {
    const r = await fetch(`/xui/devices/${enc(deviceId)}/photos`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-XUI-Lang': lang }, body: file, credentials: 'same-origin' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new ApiError(j.detail || t('Erreur HTTP {n}', { n: r.status }), r.status)
    return j
  },
  edit: (deviceId, name, body) => request(`/xui/devices/${enc(deviceId)}/photos/${enc(name)}`, { method: 'PATCH', body }),
  remove: (deviceId, name) => request(`/xui/devices/${enc(deviceId)}/photos/${enc(name)}`, { method: 'DELETE' }),
}

// baies : salles contenant une ou plusieurs baies, éléments placés en U
export const rackApi = {
  list: () => request('/xui/racks'),
  get: (id) => request(`/xui/racks/${enc(id)}`),
  create: (body) => request('/xui/racks', { method: 'POST', body }),
  update: (id, body) => request(`/xui/racks/${enc(id)}`, { method: 'PUT', body }),
  remove: (id) => request(`/xui/racks/${enc(id)}`, { method: 'DELETE' }),
  byDevice: (deviceId) => request(`/xui/racks/by-device/${enc(deviceId)}`),
}
