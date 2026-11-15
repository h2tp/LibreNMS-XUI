// Baies : géométrie, catalogue des éléments passifs, ports physiques et disposition des façades.
import { ref } from 'vue'
import { t } from '../i18n'
import { devName, fmtBits, fmtSpeed } from '../utils'
import { linkState } from '../diagram/core'

export const UH = 34 // hauteur d'un U en pixels (zoom 100 %)
export const FACE_W = 440 // largeur utile d'une baie 19" en pixels

// éléments passifs proposés dans la barre latérale
export const PASSIVE = [
  { kind: 'patch', h: 1, ports: 24, l: t('Panneau de brassage 24 ports') },
  { kind: 'patch', h: 1, ports: 48, l: t('Panneau de brassage 48 ports') },
  { kind: 'patch', h: 1, ports: 12, l: t('Panneau de brassage 12 ports') },
  { kind: 'pdu', h: 1, ports: 8, l: t('PDU / multiprise') },
  { kind: 'shelf', h: 1, ports: 0, l: t('Étagère') },
  { kind: 'cablemgmt', h: 1, ports: 0, l: t('Passe-câbles') },
  { kind: 'blank', h: 1, ports: 0, l: t('Obturateur') },
  { kind: 'custom', h: 1, ports: 0, l: t('Élément libre') },
]
export const KIND_LABEL = {
  device: t('Équipement'), patch: t('Panneau de brassage'), pdu: t('PDU / multiprise'), shelf: t('Étagère'),
  cablemgmt: t('Passe-câbles'), blank: t('Obturateur'), custom: t('Élément libre'),
}

// élément en cours de glisser-déposer (dataTransfer n'est pas lisible pendant dragover)
export const dragPayload = ref(null)

/** Les U [u, u+h-1] sont-ils libres dans la baie (hors élément `except`) ? */
export function fits(items, rack, u, h, except = null) {
  if (u < 1 || u + h - 1 > rack.units) return false
  return !items.some((it) => it.rack === rack.id && it.id !== except && it.u <= u + h - 1 && u <= it.u + it.h - 1)
}
/** Premier emplacement libre en partant du haut de la baie, ou null. */
export function firstFree(items, rack, h, except = null) {
  for (let u = rack.units - h + 1; u >= 1; u--) if (fits(items, rack, u, h, except)) return u
  return null
}
/** U le plus haut occupé (pour ne pas réduire une baie sous ses éléments). */
export const topUsed = (items, rackId) => Math.max(0, ...items.filter((i) => i.rack === rackId).map((i) => i.u + i.h - 1))

const PHYS = /^(ethernetCsmacd|gigabitEthernet|fastEther|fastEtherFX|iso88023Csmacd|ethernet3Mbit)$/i
const n = (v) => +v || 0
/** Ports physiques d'un équipement, dans l'ordre des ifIndex. */
export function physPorts(ports, deviceId) {
  return ports.filter((p) => +p.device_id === +deviceId && !+p.deleted && PHYS.test(p.ifType || '')).sort((a, b) => n(a.ifIndex) - n(b.ifIndex))
}
export const shortName = (p) => (/(\d+)$/.exec(p.ifName || '') || [])[1] || p.ifName

export function speedColor(s) {
  if (s >= 1e10) return '#22d3ee'
  if (s >= 1e9) return '#22c55e'
  if (s >= 1e8) return '#facc15'
  return '#fb923c'
}

/**
 * Disposition d'une grille de `count` prises dans une zone `w` × `h` (pixels) :
 * 1 rangée jusqu'à 12, puis 2 (impairs en haut / pairs en bas, comme un vrai switch), 4 si la hauteur le permet.
 */
export function faceGrid(count, w, h) {
  if (!count) return { rows: 0, cols: 0, pw: 0, ph: 0, pos: () => ({}) }
  let rows = count <= 12 ? 1 : 2
  if (count > 52 && h >= 70) rows = 4
  const cols = Math.ceil(count / rows)
  const gap = 3
  const pw = Math.max(7, Math.min(24, Math.floor((w - gap * (cols - 1)) / cols)))
  const ph = Math.max(7, Math.min(18, Math.floor((h - gap * (rows - 1)) / rows)))
  const pos = (i) => (rows === 2 ? { row: (i % 2) + 1, col: Math.floor(i / 2) + 1 } : { row: Math.floor(i / cols) + 1, col: (i % cols) + 1 })
  return { rows, cols, pw, ph, gap, pos }
}

export const CABLE_TYPES = { copper: t('Cuivre (RJ45)'), fiber: t('Fibre'), dac: t('DAC / Twinax'), power: t('Alimentation'), other: t('Autre') }

/**
 * Noms des éléments / extrémités et infos d'un câble pour la fenêtre de trafic (éditeur et widget).
 * room, devById, portById : refs (ou computed).
 */
export function cableHelpers(room, devById, portById) {
  const itemName = (it) => it.label || (it.device_id && devById.value[it.device_id] ? devName(devById.value[it.device_id]) : KIND_LABEL[it.kind])
  function epName(e) {
    const it = room.value.items.find((i) => i.id === e.item)
    if (!it) return '?'
    const p = it.kind === 'device' ? portById.value[e.port] : null
    if (e.port < 0) return `${itemName(it)} · ${t('alimentation {n}', { n: -e.port })}`
    if (String(e.port).startsWith('v')) return `${itemName(it)} · ${t('port virtuel {n}', { n: String(e.port).slice(1) })}`
    return `${itemName(it)} · ${it.kind === 'device' ? (p ? p.ifName : `#${e.port}`) : t('prise {n}', { n: e.port })}`
  }
  function cableInfo(c) {
    const side = (e) => {
      const it = room.value.items.find((i) => i.id === e.item)
      const p = it?.kind === 'device' && e.port > 0 ? portById.value[e.port] : null
      return { it, p, dev: p ? devById.value[p.device_id] : null }
    }
    const A = side(c.a); const B = side(c.b)
    let st = linkState({ port_a: A.p ? +A.p.port_id : null, port_b: B.p ? +B.p.port_id : null }, portById.value, { colorMode: 'util' })
    // port virtuel : état = joignabilité (ping) de l'équipement
    const vdev = [c.a, c.b].filter((e) => String(e.port).startsWith('v')).map((e) => devById.value[room.value.items.find((i) => i.id === e.item)?.device_id]).filter(Boolean)
    const vtxt = vdev.map((d) => `${devName(d)} : ${+d.status === 1 ? t('joignable') : t('injoignable')}${d.last_ping_timetaken ? ` (${(+d.last_ping_timetaken).toFixed(1)} ms)` : ''}`).join(' · ')
    if (vdev.length && !st.known) st = { ...st, known: true, virtual: true, down: vdev.some((d) => +d.status !== 1) }
    const rp = A.p || B.p; const rdev = rp && devById.value[rp.device_id]
    const extra = [c.label, c.length, CABLE_TYPES[c.type]].filter(Boolean).join(' · ')
    return {
      titleA: epName(c.a), titleB: epName(c.b), nameA: A.it ? itemName(A.it) : 'A',
      status: st.virtual ? (st.down ? `${t('Lien coupé')} — ${vtxt}` : vtxt) : (st.known ? (st.down ? t('Lien coupé') : `${fmtSpeed(st.speed)} · ${t('charge {p} %', { p: Math.round(st.util) })} · ↓ ${fmtBits(st.rin)} ↑ ${fmtBits(st.rout)}`) : t('Câble passif : pas d\'état en direct')) + (extra ? ` — ${extra}` : ''),
      host: rdev?.hostname || null, portId: rp ? +rp.port_id : null, flip: !A.p && !!B.p,
      ports: [A.p, B.p].filter(Boolean).map((p) => ({ id: +p.port_id, name: p.ifName, alias: p.ifAlias && p.ifAlias !== p.ifName ? p.ifAlias : '', dev: devById.value[p.device_id] ? devName(devById.value[p.device_id]) : '' })),
      st,
    }
  }
  return { itemName, epName, cableInfo }
}
