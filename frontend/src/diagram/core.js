// Schémas : données en direct, liens LLDP, disposition automatique.
import { ref, computed } from 'vue'
import { safeList } from '../api'
import { D, cached } from '../dashboard/data'
import { useLoader } from '../refresh'
import { devStatus, portUtil, utilColor } from '../utils'

export const lldpLinks = () => cached('lldp', () => safeList('resources/links', null, 'links'), 60000)

/** Données vivantes d'un schéma : équipements, ports (débits), alertes ; rechargées à chaque tick. */
export function useDiagramLive() {
  const devices = ref([]); const ports = ref([]); const alerts = ref([])
  const devById = computed(() => Object.fromEntries(devices.value.map((d) => [+d.device_id, d])))
  const portById = computed(() => Object.fromEntries(ports.value.map((p) => [+p.port_id, p])))
  const alertsByDev = computed(() => {
    const m = {}
    for (const a of alerts.value) m[+a.device_id] = (m[+a.device_id] || 0) + 1
    return m
  })
  const { loading } = useLoader(async () => {
    const [d, p, a] = await Promise.all([D.devices(), D.ports(), D.alerts().catch(() => [])])
    devices.value = d; ports.value = p; alerts.value = a
  })
  return { devices, ports, devById, portById, alertsByDev, loading }
}

export const UTIL_HEX = { 'var(--red)': '#f43f5e', 'var(--orange)': '#fb923c', 'var(--yellow)': '#facc15', 'var(--green)': '#22c55e' }

/** État visuel d'un lien d'après ses ports (charge max des deux extrémités). */
export function linkState(link, portById) {
  const pa = link.port_a ? portById[link.port_a] : null
  const pb = link.port_b ? portById[link.port_b] : null
  const known = [pa, pb].filter(Boolean)
  if (!known.length) return { known: false, color: '#64748b', width: 2, down: false, util: 0, speed: 0, rin: 0, rout: 0 }
  const down = known.some((p) => p.ifOperStatus !== 'up' || p.ifAdminStatus === 'down')
  const util = Math.max(...known.map((p) => portUtil(p)))
  const speed = Math.max(...known.map((p) => +p.ifSpeed || 0))
  const ref = pa || pb
  // débits vus depuis l'extrémité A (entrant = vers A)
  const rin = (+ref.ifInOctets_rate || 0) * 8; const rout = (+ref.ifOutOctets_rate || 0) * 8
  const width = speed >= 1e10 ? 6 : speed >= 1e9 ? 4 : speed >= 1e8 ? 2.5 : 2
  return { known: true, down, util, speed, rin: pa ? rin : rout, rout: pa ? rout : rin, width, color: down ? '#f43f5e' : UTIL_HEX[utilColor(util)] || '#22c55e' }
}

export function nodeStatus(node, devById) {
  if (node.kind !== 'device') return 'none'
  const d = devById[node.device_id]
  return d ? devStatus(d) : 'unknown'
}

const TYPE_ORDER = ['network', 'firewall', 'wireless', 'server', 'storage', 'power', 'appliance', 'printer', '']
/** Disposition en couches : réseau en haut, puis sans-fil, serveurs, stockage, autres. */
export function layeredLayout(devs, { dx = 210, dy = 170 } = {}) {
  const rows = {}
  for (const d of devs) {
    const t = TYPE_ORDER.includes(d.type || '') ? d.type || '' : ''
    ;(rows[t] ||= []).push(d)
  }
  const out = {}
  let y = 0
  for (const t of TYPE_ORDER) {
    const list = (rows[t] || []).sort((a, b) => String(a.sysName || a.hostname).localeCompare(String(b.sysName || b.hostname)))
    if (!list.length) continue
    // au-delà de 8 par rangée, on passe à la ligne
    for (let i = 0; i < list.length; i += 8) {
      const chunk = list.slice(i, i + 8)
      chunk.forEach((d, j) => { out[d.device_id] = { x: (j - (chunk.length - 1) / 2) * dx, y } })
      y += dy
    }
  }
  return out
}

/**
 * Disposition en arbre à partir des liens : racine = équipement réseau le plus connecté,
 * chaque niveau sous son parent (ordre par barycentre pour limiter les croisements).
 * Les équipements sans lien sont rangés par type en dessous.
 */
export function topoLayout(devs, links, { dx = 270, dy = 200 } = {}) {
  const ids = new Set(devs.map((d) => +d.device_id))
  const adj = {}
  for (const l of links) {
    const a = +l.local_device_id; const b = +l.remote_device_id
    if (!ids.has(a) || !ids.has(b) || a === b) continue
    ;(adj[a] ||= new Set()).add(b); (adj[b] ||= new Set()).add(a)
  }
  const byId = Object.fromEntries(devs.map((d) => [+d.device_id, d]))
  const deg = (id) => adj[id]?.size || 0
  const out = {}
  const placed = new Set()
  let y = 0
  // un arbre par composante connexe, côte à côte
  let xOff = 0
  const comps = Object.keys(adj).map(Number).sort((a, b) => (byId[b].type === 'network') - (byId[a].type === 'network') || deg(b) - deg(a))
  for (const root of comps) {
    if (placed.has(root)) continue
    const levels = [[root]]; placed.add(root)
    const parent = {}
    while (true) {
      const next = []
      for (const id of levels.at(-1)) for (const c of [...(adj[id] || [])].sort((a, b) => deg(b) - deg(a))) if (!placed.has(c)) { placed.add(c); parent[c] = id; next.push(c) }
      if (!next.length) break
      levels.push(next)
    }
    const width = Math.max(...levels.map((l) => l.length))
    const x = {}
    levels.forEach((lvl, i) => {
      if (i > 0) lvl.sort((a, b) => x[parent[a]] - x[parent[b]])
      lvl.forEach((id, j) => { x[id] = xOff + (j - (lvl.length - 1) / 2) * dx; out[id] = { x: x[id], y: i * dy } })
    })
    y = Math.max(y, levels.length * dy)
    xOff += width * dx + dx
  }
  // recentrage horizontal des composantes
  const xs = Object.values(out).map((p) => p.x)
  if (xs.length) { const mid = (Math.min(...xs) + Math.max(...xs)) / 2; for (const k in out) out[k].x -= mid }
  const rest = devs.filter((d) => !placed.has(+d.device_id))
  const lay = layeredLayout(rest, { dx: dx - 30, dy: dy - 40 })
  for (const k in lay) out[k] = { x: lay[k].x, y: lay[k].y + y + (Object.keys(out).length ? 40 : 0) }
  return out
}

/** Liens LLDP entre équipements déjà présents dans le schéma (sans doublon). */
export function lldpLinksBetween(links, nodes) {
  const byDev = {}
  for (const n of nodes) if (n.kind === 'device' && n.device_id) byDev[n.device_id] = n.id
  const seen = new Set()
  const out = []
  for (const l of links) {
    const a = byDev[+l.local_device_id]; const b = byDev[+l.remote_device_id]
    if (!a || !b || a === b) continue
    const k = [l.local_port_id, l.remote_port_id].sort().join('-')
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ a, b, port_a: +l.local_port_id || null, port_b: +l.remote_port_id || null })
  }
  return out
}

let n = 0
export const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
