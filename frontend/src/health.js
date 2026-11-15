import { api, pick, L } from './api'
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

function idOf(it) {
  return it.sensor_id ?? it.processor_id ?? it.mempool_id ?? it.storage_id ?? it.id
}

/**
 * Charge les données de santé d'un équipement via l'API.
 * Retourne { types: [{name, desc}], data: { device_temperature: [row...], ... } }
 */
export async function loadHealth(host, only = null) {
  const h = L.enc(host)
  let types = []
  try { types = pick(await api.get(`devices/${h}/health`), 'graphs') } catch { return { types: [], data: {} } }
  if (only) types = types.filter((t) => only.includes(t.name))
  const data = {}
  await pool(types, 4, async (t) => {
    const items = pick(await api.get(`devices/${h}/health/${t.name}`), 'graphs')
    const details = await pool(items, 6, async (it) => {
      const id = idOf(it)
      const d = pick(await api.get(`devices/${h}/health/${t.name}/${id}`), 'graphs')[0]
      return { ...it, ...(d || {}), _id: id }
    })
    data[t.name] = details.map((d, i) => d || { ...items[i], _id: idOf(items[i]) })
  })
  return { types, data }
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
