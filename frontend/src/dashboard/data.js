// Données partagées entre les widgets d'un tableau de bord : un même jeu de données n'est
// demandé qu'une fois par période, même si plusieurs widgets l'utilisent.
import { api, pick, safeList, devicesCached, storageApi, healthDbApi } from '../api'

const PORT_COLS = 'port_id,device_id,ifIndex,ifName,ifAlias,ifType,ifOperStatus,ifAdminStatus,ifSpeed,ifInOctets_rate,ifOutOctets_rate,deleted,disabled,ignore,ifInErrors,ifOutErrors,ifInErrors_delta,ifOutErrors_delta,ifInUcastPkts_delta,ifOutUcastPkts_delta,poll_period,ifLastChange'
import { t } from '../i18n'

const cache = new Map()
export function cached(key, fn, maxAge = 10000) {
  const c = cache.get(key)
  if (c && Date.now() - c.t < maxAge) return c.p
  const p = fn().catch((e) => { cache.delete(key); throw e })
  cache.set(key, { t: Date.now(), p })
  return p
}

export const D = {
  devices: () => devicesCached(10000),
  ports: () => cached('ports', () => safeList('ports', { columns: PORT_COLS }, 'ports')),
  // un seul équipement : évite de télécharger les ports / capteurs de tout le parc
  devPorts: (host) => cached(`ports:${host}`, () => safeList(`devices/${encodeURIComponent(host)}/ports`, { columns: PORT_COLS }, 'ports')),
  devSensors: (host, types) => cached(`sensors:${host}:${types}`, () => healthDbApi.all(host, types).then((r) => Object.values(r.data || {}).flat())
    .catch(() => D.sensors().then((l) => l.filter((s) => types.includes(`device_${s.sensor_class}`))))),
  alerts: () => cached('alerts', () => safeList('alerts', { state: 1 }, 'alerts')),
  rules: () => cached('rules', () => safeList('rules', null, 'rules').then((r) => Object.fromEntries(r.map((x) => [x.id, x]))), 300000),
  groups: () => cached('groups', () => safeList('devicegroups', null, 'groups'), 60000),
  groupIds: (name) => cached(`group:${name}`, () => api.get(`devicegroups/${encodeURIComponent(name)}`).then((r) => new Set(pick(r, 'devices').map((d) => +d.device_id))), 60000),
  logs: (type, limit, host) => cached(`logs:${type}:${limit}:${host || ''}`, () => api.get(host ? `logs/${type}/${encodeURIComponent(host)}` : `logs/${type}`, { limit, sortorder: 'DESC' }).then((r) => pick(r, 'logs'))),
  // base : colonnes utiles seulement, cache serveur partagé ; sinon l'API (plus lourde)
  sensors: () => cached('sensors', () => storageApi.sensors().then((r) => r.items)
    .catch((e) => (e?.status === 501 ? safeList('resources/sensors', null, 'sensors') : Promise.reject(e)))),
  storage: () => cached('storage', () => storageApi.all().then((r) => r.items), 30000),
  memory: () => cached('memory', () => storageApi.memory().then((r) => r.items), 30000),
  cpu: () => cached('cpu', () => storageApi.cpu().then((r) => r.items), 30000),
  availability: () => cached('availability', () => storageApi.availability().then((r) => r.items), 30000),
  services: () => cached('services', () => api.get('services').then((r) => { const l = pick(r, 'services'); return l.length && Array.isArray(l[0]) ? l.flat() : l })),
  printers: () => cached('printers', () => storageApi.printers().then((r) => r.items), 30000),
  wireless: () => cached('wireless', () => storageApi.wireless().then((r) => r.items), 30000),
  system: () => cached('system', () => api.get('system').then((r) => pick(r, 'system')[0] || null), 300000),
}

/** Équipements, filtrés par groupe si la configuration du widget en indique un. */
export async function devicesFor(cfg) {
  const devs = await D.devices()
  if (!cfg?.group) return devs
  const ids = await D.groupIds(cfg.group).catch(() => new Set())
  return devs.filter((d) => ids.has(+d.device_id))
}

export const isPhysical = (p) => p.ifType !== 'softwareLoopback' && p.ifName !== 'lo' && !/^(veth|br-|docker|virbr|lo\d*$|tunnel_|ppp_|isatap|teredo)/i.test(p.ifName || '')
