// Baies : géométrie, catalogue des éléments passifs, ports physiques et disposition des façades.
import { ref } from 'vue'
import { t } from '../i18n'

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
