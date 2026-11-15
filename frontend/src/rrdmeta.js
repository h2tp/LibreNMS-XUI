import { t } from './i18n'
// Connaissance des fichiers RRD de LibreNMS : catégorie, libellé, unité, séries.

const SENSOR_UNITS = {
  temperature: '°C', voltage: 'V', current: 'A', power: 'W', fanspeed: 'tr/min', humidity: '%', frequency: 'Hz',
  dbm: 'dBm', load: '%', percent: '%', runtime: 'min', charge: '%', airflow: 'cfm', pressure: 'kPa', snr: 'dB',
  signal: 'dBm', state: '', count: '', cooling: 'W', delay: 's', quality_factor: 'dB', chromatic_dispersion: 'ps/nm',
  ber: '', eer: '', waterflow: 'l/min', power_consumed: 'kWh', power_factor: '', bitrate: 'bps', tv_signal: 'dBmV',
}
export const SENSOR_LABELS = {
  temperature: t('Température'), voltage: t('Tension'), current: t('Courant'), power: t('Puissance'), fanspeed: t('Ventilateurs'), humidity: t('Humidité'),
  frequency: t('Fréquence'), dbm: t('Optique (dBm)'), load: t('Charge'), percent: t('Pourcentage'), runtime: t('Autonomie'), charge: t('Charge batterie'),
  state: t('États'), count: t('Compteurs'), airflow: t('Flux d\'air'), pressure: t('Pression'), snr: 'SNR', signal: t('Signal'), cooling: t('Refroidissement'),
  delay: t('Délai'), power_consumed: t('Énergie consommée'), power_factor: t('Facteur de puissance'), bitrate: t('Débit'), ber: 'BER',
}
export function sensorUnit(cls) { return SENSOR_UNITS[cls] ?? '' }

export const CATEGORIES = [
  ['system', t('Système')], ['processor', t('Processeurs')], ['memory', t('Mémoire')], ['storage', t('Stockage')], ['diskio', t('E/S disques')],
  ['sensor', t('Capteurs')], ['wireless', t('Sans-fil')], ['network', t('Pile réseau')], ['port', 'Ports'], ['app', t('Applications')],
  ['poller', t('Performances du poller')], ['other', t('Autres')],
]

/** Décrit un fichier RRD : { cat, title, unit, ds: {DS: {label, mul, negate}} | null, stack } */
export function describe(name) {
  const n = name.replace(/\.rrd$/, '')
  let m
  if ((m = n.match(/^port-id(\d+)$/))) return { cat: 'port', title: `Port #${m[1]}`, unit: 'bits', portId: +m[1], ds: { INOCTETS: { label: t('Entrant'), mul: 8 }, OUTOCTETS: { label: t('Sortant'), mul: 8, negate: true } } }
  if ((m = n.match(/^port-id(\d+)-(.+)$/))) return { cat: 'port', title: `Port #${m[1]} · ${m[2]}`, unit: 'num' }
  if (n === 'icmp-perf') return { cat: 'system', title: t('Latence ICMP'), unit: 'ms', ds: { avg: { label: t('Moyenne') }, min: { label: t('Min'), area: false, dashed: true }, max: { label: t('Max'), area: false, dashed: true } } }
  if (n === 'ping-perf') return { cat: 'system', title: t('Latence ping'), unit: 'ms' }
  if (n === 'uptime') return { cat: 'system', title: t('Uptime'), unit: 'uptime', ds: { uptime: { label: t('Uptime') } } }
  if ((m = n.match(/^availability-(\d+)$/))) {
    const p = { 86400: '24 h', 604800: '7 j', 2592000: '30 j', 31536000: '1 an' }[m[1]] || `${m[1]} s`
    return { cat: 'system', title: t('Disponibilité ({p})', { p }), unit: 'pct', ds: { availability: { label: t('Disponibilité') } } }
  }
  if (n === 'poller-perf') return { cat: 'system', title: t('Durée de polling'), unit: 's', ds: { poller: { label: t('Durée') } } }
  if ((m = n.match(/^poller-perf-(.+)$/))) return { cat: 'poller', title: `Module ${m[1]}`, unit: 's' }
  if (n === 'ucd_load') return { cat: 'system', title: t('Charge système (load)'), unit: 'num', ds: { '1min': { label: t('1 min'), mul: 0.01 }, '5min': { label: t('5 min'), mul: 0.01 }, '15min': { label: t('15 min'), mul: 0.01 } } }
  if (n === 'ucd_cpu') return { cat: 'processor', title: t('CPU (UCD)'), unit: 'num', stack: true }
  if ((m = n.match(/^ucd_ssCpuRaw(.+)$/))) return { cat: 'processor', title: `CPU ${m[1]}`, unit: 'ps' }
  if ((m = n.match(/^ucd_ss(.+)$/))) return { cat: 'system', title: m[1], unit: 'ps' }
  if (n === 'ucd_mem') return { cat: 'memory', title: t('Mémoire (UCD)'), unit: 'bytes' }
  if (n === 'hr_processes') return { cat: 'system', title: t('Processus'), unit: 'num' }
  if (n === 'hr_users') return { cat: 'system', title: t('Utilisateurs connectés'), unit: 'num' }
  if ((m = n.match(/^processor-(.+)$/))) return { cat: 'processor', title: `Processeur ${m[1]}`, unit: 'pct', ds: { usage: { label: t('Utilisation') } } }
  if ((m = n.match(/^mempool-(.+)$/))) return { cat: 'memory', title: t('Mémoire {n}', { n: m[1] }), unit: 'bytes', stack: true, ds: { used: { label: t('Utilisée') }, free: { label: t('Libre') } } }
  if ((m = n.match(/^storage-(.+)$/))) return { cat: 'storage', title: `Stockage ${m[1].replace(/^hrstorage-/, '').replace(/_/g, '/')}`, unit: 'bytes', stack: true, ds: { used: { label: t('Utilisé') }, free: { label: t('Libre') } } }
  if ((m = n.match(/^ucd_diskio-(.+)$/))) return { cat: 'diskio', title: `Disque ${m[1]}`, unit: 'bytes', ds: { read: { label: t('Lecture') }, written: { label: t('Écriture'), negate: true } } }
  if ((m = n.match(/^sensor-([a-z_]+)-(.+)$/))) return { cat: 'sensor', sensorClass: m[1], title: `${SENSOR_LABELS[m[1]] || m[1]} · ${m[2]}`, unit: sensorUnit(m[1]) || 'num', ds: { sensor: { label: SENSOR_LABELS[m[1]] || m[1] } } }
  if ((m = n.match(/^wireless-sensor-([a-z_-]+)-(.+)$/))) return { cat: 'wireless', title: `${m[1]} · ${m[2]}`, unit: 'num' }
  if ((m = n.match(/^netstats-(.+)$/))) return { cat: 'network', title: `Statistiques ${m[1].toUpperCase()}`, unit: 'ps' }
  if ((m = n.match(/^ipSystemStats-(.+)$/))) return { cat: 'network', title: `Statistiques ${m[1]}`, unit: 'ps' }
  if ((m = n.match(/^app-(.+)$/))) return { cat: 'app', title: `Application ${m[1]}`, unit: 'num' }
  return { cat: 'other', title: n, unit: 'num' }
}

/** Transforme une réponse /xui/rrd/.../data en séries ECharts. */
export function toSeries(data, meta = {}) {
  const ts = data.timestamps.map((t) => t * 1000)
  const out = []
  const conf = meta.ds
  const names = conf ? Object.keys(conf).filter((k) => k in data.series) : Object.keys(data.series)
  for (const k of names) {
    const c = (conf && conf[k]) || {}
    const mul = c.mul || 1
    out.push({
      name: c.label || k, negate: c.negate, area: c.area, dashed: c.dashed, color: c.color,
      data: data.series[k].map((v, i) => [ts[i], v === null ? null : v * mul]),
    })
  }
  return out
}

export function stats(arr) {
  const v = arr.map((p) => p[1]).filter((x) => x !== null && !isNaN(x))
  if (!v.length) return { last: null, avg: null, max: null, min: null }
  let sum = 0; let mx = -Infinity; let mn = Infinity
  for (const x of v) { sum += x; if (x > mx) mx = x; if (x < mn) mn = x }
  return { last: v[v.length - 1], avg: sum / v.length, max: mx, min: mn }
}
