import { api, pick, L, healthDbApi, stateTrApi } from './api'
import { stateLabel } from './dashboard/states'
import { t } from './i18n'

export const HEALTH_LABELS = {
  device_processor: t('Processeurs'), device_mempool: t('Mémoire'), device_storage: t('Stockage'),
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) }
  }))
  return out
}

const DB_TYPES = ['device_processor', 'device_mempool', 'device_storage']

function idOf(it) {
  return it.sensor_id ?? it.processor_id ?? it.mempool_id ?? it.storage_id ?? it.id
}

/**
 * Charge les données de santé d'un équipement via l'API.
 * Retourne { types: [{name, desc}], data: { device_temperature: [row...], ... } }
 */
let dbHealth = true  // passe à false si XUI n'a pas accès à la base (on reste alors sur l'API)

async function fromDb(host, only) {
  try {
    const r = await healthDbApi.all(host, only)
    const data = {}
    for (const [k, rows] of Object.entries(r.data || {})) data[k] = rows.map((x) => ({ ...x, _id: idOf(x) }))
    return { types: r.types || [], data }
  } catch (e) {
    if (e?.status === 501) dbHealth = false
    return null
  }
}

export async function loadHealth(host, only = null) {
  const h = L.enc(host)
  // base disponible : une seule requête au lieu d'un appel API par capteur (LibreNMS n'a que peu de processus PHP)
  const db = dbHealth ? await fromDb(host, only) : null
  if (db) return withStates(db)
  let types = []
  try { types = pick(await api.get(`devices/${h}/health`), 'graphs') } catch { return { types: [], data: {} } }
  if (only) types = types.filter((t) => only.includes(t.name))
  const data = {}
  await pool(types, 4, async (t) => {
    const items = pick(await api.get(`devices/${h}/health/${t.name}`), 'graphs')
    // LibreNMS < 26.7 : type annoncé mais liste toujours vide pour processeurs / mémoire / stockage
    // (cherchés dans la table des capteurs) -> lecture dans la base si XUI y a accès
    if (!items.length && DB_TYPES.includes(t.name)) {
      const rows = await healthDbApi.list(host, t.name).catch(() => null)
      if (rows) { data[t.name] = rows.map((r) => ({ ...r, _id: idOf(r) })); return }
    }
    const details = await pool(items, 6, async (it) => {
      const id = idOf(it)
      const d = pick(await api.get(`devices/${h}/health/${t.name}/${id}`), 'graphs')[0]
      return { ...it, ...(d || {}), _id: id }
    })
    data[t.name] = details.map((d, i) => d || { ...items[i], _id: idOf(items[i]) })
  })
  return withStates({ types, data })
}

// capteurs d'état : libellé traduit (« Actif », « Connecté »…) au lieu de la valeur brute
async function withStates(r) {
  if (r.data.device_state?.length) {
    const tr = await stateTrApi.get()
    r.data.device_state = r.data.device_state.map((x) => ({ ...x, _state: stateLabel(x, tr) }))
  }
  return r
}

export function sensorClassOf(type) { return type.replace(/^device_/, '') }

export function rrdNameFor(type, row) {
  const cls = sensorClassOf(type)
  if (cls === 'processor') return `processor-${row.processor_type}-${row.processor_index}.rrd`
  if (cls === 'mempool') return `mempool-${row.mempool_type}-${row.mempool_class}-${row.mempool_index}.rrd`
  if (cls === 'storage') return `storage-${row.type || row.storage_type}-${String(row.storage_descr || '').replace(/[^A-Za-z0-9_.\-]/g, '_')}.rrd`
  if (row.sensor_class) return `sensor-${row.sensor_class}-${row.sensor_type}-${row.sensor_index}.rrd`
  return null
}
