<template>
  <div ref="wrap" class="dcanvas" :class="{ editing, linking: tool === 'link', panning }"
    @dragover.prevent @drop.prevent="onDrop" @wheel="onWheel">
    <svg ref="svg" :viewBox="`${vb.x} ${vb.y} ${vb.w} ${vb.h}`" preserveAspectRatio="xMidYMid meet"
      @pointerdown="onBgDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp">
      <defs>
        <pattern id="dgrid" :width="20" :height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" class="gridline" />
        </pattern>
        <filter id="dshadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity=".25" /></filter>
      </defs>

      <rect v-if="view.background === 'grid'" :x="vb.x - 5000" :y="vb.y - 5000" :width="vb.w + 10000" :height="vb.h + 10000" fill="url(#dgrid)" />
      <image v-if="view.background === 'image' && bgUrl && view.bgW" :href="bgUrl" x="0" y="0" :width="view.bgW" :height="view.bgH" :opacity="view.bgOpacity ?? .6" preserveAspectRatio="none" />

      <!-- liens -->
      <g v-for="l in drawnLinks" :key="l.id" class="link" :class="{ sel: selected?.type === 'link' && selected.id === l.id, down: l.st.down, unknown: !l.st.known }"
        @pointerdown.stop="onLinkDown(l, $event)" @dblclick.stop="$emit('edit-link', l.raw)"
        @pointerenter="hoverLink(l, $event)" @pointermove="hoverLink(l, $event)" @pointerleave="unhover">
        <path :d="l.d" class="hit" />
        <path :d="l.d" class="line" :stroke="l.st.color" :stroke-width="l.st.width" :stroke-dasharray="l.st.down ? '8 6' : null" />
        <path v-if="l.st.known && !l.st.down && l.st.util > 1" :d="l.d" class="flow" :stroke-width="Math.max(1.5, l.st.width - 1.5)" :style="{ animationDuration: `${Math.max(0.6, 4 - l.st.util / 30)}s` }" />
      </g>

      <!-- trait en cours de création -->
      <line v-if="linkFrom && cursor" :x1="nodeById[linkFrom].x" :y1="nodeById[linkFrom].y" :x2="cursor.x" :y2="cursor.y" class="pending" />

      <!-- nœuds -->
      <g v-for="nd in drawnNodes" :key="nd.id" :transform="`translate(${nd.x},${nd.y}) scale(${nd.size || 1})`"
        class="node" :class="[nd.kind, nd.status, { sel: selected?.type === 'node' && selected.id === nd.id, from: linkFrom === nd.id }]"
        @pointerdown.stop="onNodeDown(nd, $event)" @dblclick.stop="$emit('edit-node', nd.raw)" @click.stop="onNodeClick(nd)">
        <title>{{ nd.tip }}</title>
        <template v-if="nd.boxed && nd.mode === 'image'">
          <rect x="-64" y="-46" width="128" height="72" rx="10" class="img-frame" />
          <image :href="nd.img" x="-60" y="-42" width="120" height="64" preserveAspectRatio="xMidYMid meet" filter="url(#dshadow)" />
          <g transform="translate(0,40)">
            <circle v-if="nd.kind === 'device'" :cx="-(nd.nameW + 13) / 2 + 4.5" cy="0" r="4.5" class="dot" />
            <text :x="nd.kind === 'device' ? -(nd.nameW + 13) / 2 + 13 : -nd.nameW / 2" y="0" dominant-baseline="central" class="name halo">{{ nd.name }}</text>
            <text v-if="nd.kind === 'custom' && nd.sub" y="16" text-anchor="middle" dominant-baseline="central" class="sub halo">{{ nd.sub }}</text>
          </g>
          <g v-if="nd.alerts" transform="translate(62,-44)"><circle r="10" class="abadge" /><text text-anchor="middle" dominant-baseline="central" class="atxt">{{ nd.alerts > 9 ? '9+' : nd.alerts }}</text></g>
          <circle v-if="nd.status === 'down'" cx="0" cy="-10" r="0" class="pulse" />
        </template>
        <template v-else-if="nd.boxed">
          <rect x="-82" y="-27" width="164" height="54" rx="12" class="card" filter="url(#dshadow)" />
          <rect x="-82" y="-27" width="5" height="54" rx="2" class="bar" />
          <image v-if="nd.mode === 'icon'" :href="nd.img" x="-72" y="-16" width="32" height="32" preserveAspectRatio="xMidYMid meet" />
          <image v-else-if="nd.icon" :href="nd.icon" x="-70" y="-14" width="28" height="28" />
          <g v-else transform="translate(-70,-14)"><rect width="28" height="28" rx="7" class="ico-bg" /><text x="14" y="15" text-anchor="middle" dominant-baseline="middle" class="ico-txt">{{ nd.initial }}</text></g>
          <text x="-34" y="-5" class="name">{{ nd.name }}</text>
          <text x="-34" y="12" class="sub">{{ nd.sub }}</text>
          <g v-if="nd.alerts" transform="translate(76,-27)"><circle r="10" class="abadge" /><text text-anchor="middle" dominant-baseline="central" class="atxt">{{ nd.alerts > 9 ? '9+' : nd.alerts }}</text></g>
          <circle v-if="nd.status === 'down'" cx="-80" cy="0" r="0" class="pulse" />
        </template>
        <template v-else-if="nd.kind === 'cloud'">
          <path d="M-42,18 a20,20 0 0,1 2,-38 a28,28 0 0,1 52,-6 a20,20 0 0,1 30,22 a16,16 0 0,1 -6,22 z" class="cloud" filter="url(#dshadow)" />
          <text y="4" text-anchor="middle" class="name">{{ nd.name }}</text>
        </template>
        <template v-else>
          <text text-anchor="middle" dominant-baseline="middle" class="free">{{ nd.name }}</text>
        </template>
      </g>
      <!-- étiquettes (ports, débits) au-dessus des cartes -->
      <g class="labels">
        <g v-for="l in drawnLinks" :key="'lb' + l.id" @pointerdown.stop="onLinkDown(l, $event)" @dblclick.stop="$emit('edit-link', l.raw)"
          @pointerenter="hoverLink(l, $event)" @pointermove="hoverLink(l, $event)" @pointerleave="unhover">
          <template v-if="view.showPorts !== false">
            <text v-if="l.pa" :x="l.pA.x" :y="l.pA.y" class="plabel" text-anchor="middle" dominant-baseline="middle">{{ l.pa }}</text>
            <text v-if="l.pb" :x="l.pB.x" :y="l.pB.y" class="plabel" text-anchor="middle" dominant-baseline="middle">{{ l.pb }}</text>
          </template>
          <g v-if="(view.showRates !== false && l.st.known && !l.st.down) || l.raw.label" :transform="`translate(${l.mid.x},${l.mid.y})`">
            <rect :x="-l.lw / 2" y="-11" :width="l.lw" height="22" rx="11" class="rate-bg" />
            <text class="rate" text-anchor="middle" dominant-baseline="central">{{ l.text }}</text>
          </g>
        </g>
      </g>
    </svg>

    <LinkHover v-if="hover && hoverData" :link="hoverData" :x="hover.x" :y="hover.y" :pinned="hover.pinned" @close="closePopup" />

    <div class="zoom">
      <button class="btn ghost sm icon" title="Zoom +" @click="zoomBy(0.8)"><ZoomIn /></button>
      <button class="btn ghost sm icon" title="Zoom −" @click="zoomBy(1.25)"><ZoomOut /></button>
      <button class="btn ghost sm icon" title="Ajuster à l'écran" @click="fit()"><Maximize /></button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ZoomIn, ZoomOut, Maximize } from 'lucide-vue-next'
import { linkState, nodeStatus } from '../diagram/core'
import { diagApi } from '../api'
import LinkHover from './LinkHover.vue'
import { devName, fmtBits, fmtSpeed, osIcon, statusLabel } from '../utils'

const props = defineProps({
  diagram: Object, live: Object, editing: Boolean, tool: { type: String, default: 'select' },
  selected: Object, bgUrl: String, wheel: { type: String, default: 'zoom' }, navigate: { type: Boolean, default: true },
})
const emit = defineEmits(['update:selected', 'move', 'moved', 'connect', 'drop-device', 'edit-node', 'edit-link'])
const router = useRouter()
const wrap = ref(null); const svg = ref(null)
const vb = reactive({ x: -600, y: -350, w: 1200, h: 700 })
const view = computed(() => props.diagram?.view || {})
const nodeById = computed(() => Object.fromEntries((props.diagram?.nodes || []).map((n) => [n.id, n])))

// --------------------------------------------------------------- rendu
// débit compact pour les étiquettes : « 11M », « 328K »
const compact = (v) => fmtBits(v, v >= 1e9 ? 1 : 0).replace(/\s*([KMGT]?)bps$/i, (m, u) => u || 'b').replace(/\s+/g, '')
const short = (p) => (p ? String(p.ifName || '').replace(/^(gigabitethernet|tengigabitethernet|ethernet|port)/i, '').slice(0, 14) || p.ifName : '')
// tronque un texte à une largeur donnée (mesurée avec la police de la page) en ajoutant « … »
let ctx2d = null
const fontFamily = () => getComputedStyle(document.body).fontFamily || 'sans-serif'
const measure = (t, font) => { ctx2d ||= document.createElement('canvas').getContext('2d'); ctx2d.font = font; return ctx2d.measureText(t).width }
function fitText(text, max, size, weight = 400) {
  const font = `${weight} ${size}px ${fontFamily()}`
  text = String(text || '')
  if (measure(text, font) <= max) return text
  let lo = 0; let hi = text.length
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (measure(text.slice(0, m).trimEnd() + '…', font) <= max) lo = m; else hi = m - 1 }
  return text.slice(0, lo).trimEnd() + '…'
}
const drawnNodes = computed(() => (props.diagram?.nodes || []).map((n) => {
  const d = n.kind === 'device' ? props.live.devById.value[n.device_id] : null
  const status = nodeStatus(n, props.live.devById.value)
  const boxed = n.kind === 'device' || n.kind === 'custom' // rendu en carte (équipement LibreNMS ou élément libre)
  const full = n.label || (d ? devName(d) : n.kind === 'device' ? `#${n.device_id}` : n.kind === 'cloud' ? 'Internet' : n.kind === 'custom' ? 'Élément' : 'Texte')
  const mode = boxed && n.image && (n.display === 'icon' || n.display === 'image') ? n.display : 'card'
  // largeur utile : carte = de x -34 au badge d'alerte (≈ 106 px) ; image seule = 170 px ; nuage ≈ 110 px
  const name = n.kind === 'text' ? full : fitText(full, mode === 'image' ? 170 : n.kind === 'cloud' ? 110 : 106, 13, 700)
  const sub = d ? fitText(d.hardware || d.os || d.hostname || '', 106, 10.5) : n.kind === 'device' ? 'équipement inconnu'
    : n.kind === 'custom' ? fitText(n.sub || '', mode === 'image' ? 170 : 106, 10.5) : ''
  return {
    ...n, raw: n, name, sub, status, mode, boxed, img: mode !== 'card' ? diagApi.imgUrl(n.image) : null,
    nameW: mode === 'image' ? measure(name, `700 13px ${fontFamily()}`) : 0,
    icon: d ? osIcon(d) : null, initial: (name[0] || '?').toUpperCase(), alerts: d ? props.live.alertsByDev.value[n.device_id] || 0 : 0,
    tip: d ? `${devName(d)} (${d.hostname})\n${statusLabel[status] || status}${d.hardware ? '\n' + d.hardware : ''}` : n.kind === 'custom' && n.sub ? `${full}\n${n.sub}` : full,
  }
}))
const drawnLinks = computed(() => (props.diagram?.links || []).map((l) => {
  const A = nodeById.value[l.a]; const B = nodeById.value[l.b]
  if (!A || !B) return null
  const st = linkState(l, props.live.portById.value, view.value)
  const dx = B.x - A.x; const dy = B.y - A.y; const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len; const ny = dx / len
  const bend = l.bend || 0
  const c = { x: (A.x + B.x) / 2 + nx * bend, y: (A.y + B.y) / 2 + ny * bend }
  const d = bend ? `M${A.x},${A.y} Q${c.x},${c.y} ${B.x},${B.y}` : `M${A.x},${A.y} L${B.x},${B.y}`
  const at = (t) => (bend
    ? { x: (1 - t) ** 2 * A.x + 2 * (1 - t) * t * c.x + t * t * B.x, y: (1 - t) ** 2 * A.y + 2 * (1 - t) * t * c.y + t * t * B.y }
    : { x: A.x + dx * t, y: A.y + dy * t })
  const pa = props.live.portById.value[l.port_a]; const pb = props.live.portById.value[l.port_b]
  // noms de ports juste au bord de la carte (164 × 54) : distance au bord le long du lien
  const box = (n) => ((n.kind === 'device' || n.kind === 'custom') && n.image && n.display === 'image' ? [64, 50] : [82, 27])
  const edge = (n) => Math.min(Math.abs(dx) > 0.01 ? (box(n)[0] * (n.size || 1)) / Math.abs(dx) : Infinity, Math.abs(dy) > 0.01 ? (box(n)[1] * (n.size || 1)) / Math.abs(dy) : Infinity)
  const offA = Math.min(0.4, edge(A) + 16 / len); const offB = Math.min(0.4, edge(B) + 16 / len)
  const text = l.label && !(view.value.showRates !== false && st.known && !st.down) ? l.label
    : `${l.label ? l.label + ' · ' : ''}↓${compact(st.rin)} ↑${compact(st.rout)}`
  const devA = props.live.devById.value[A.device_id]; const devB = props.live.devById.value[B.device_id]
  const nameA = devA ? devName(devA) : A.label || 'A'
  // historique : RRD du port A, à défaut celui du port B (sens inversé)
  const rp = pa || pb; const rdev = rp && props.live.devById.value[rp.device_id]
  const info = {
    titleA: `${nameA}${pa ? ` (${pa.ifName})` : ''}`, titleB: `${devB ? devName(devB) : B.label || 'B'}${pb ? ` (${pb.ifName})` : ''}`, nameA,
    status: st.known ? (st.down ? 'Lien coupé' : `${fmtSpeed(st.speed)} · charge ${Math.round(st.util)} % · ↓ ${fmtBits(st.rin)} ↑ ${fmtBits(st.rout)}`) : 'Ports non renseignés : état inconnu',
    host: rdev?.hostname || null, portId: rp ? +rp.port_id : null, flip: !pa && !!pb,
    // liens vers les fiches des ports (affichés quand la fenêtre est épinglée)
    ports: [[pa, A, devA], [pb, B, devB]].filter(([p]) => p).map(([p, n, dv]) => ({
      id: +p.port_id, name: p.ifName, alias: p.ifAlias && p.ifAlias !== p.ifName ? p.ifAlias : '', dev: dv ? devName(dv) : n.label || '',
    })),
  }
  return { id: l.id, raw: l, d, st, mid: at(0.5), pA: at(offA), pB: at(1 - offB), pa: short(pa), pb: short(pb), text, lw: text.length * 7.2 + 18, info }
}).filter(Boolean))

// --------------------------------------------------------------- survol d'un lien : graphe de trafic
// clic sur un lien (hors édition) : la fenêtre est épinglée, cliquable, avec les liens vers les ports
const hover = ref(null) // { id, x, y, pinned } en pixels dans le canevas
const hoverData = computed(() => hover.value && drawnLinks.value.find((l) => l.id === hover.value.id)?.info)
function popupAt(l, e, pinned = false) {
  const r = wrap.value.getBoundingClientRect()
  const W = 324; const H = pinned ? 260 : 200; const px = e.clientX - r.left; const py = e.clientY - r.top
  const x = px + 16 + W > r.width ? Math.max(4, px - 16 - W) : px + 16
  const y = Math.max(4, Math.min(py + 16, r.height - H - 4))
  hover.value = { id: l.id, x, y, pinned }
}
function hoverLink(l, e) {
  if (hover.value?.pinned) return
  if (drag.value || (props.editing && props.tool === 'link')) { hover.value = null; return }
  popupAt(l, e)
}
function unhover() { if (!hover.value?.pinned) hover.value = null }
function closePopup() { hover.value = null }
function onEsc(e) { if (e.key === 'Escape' && hover.value?.pinned) hover.value = null }

// --------------------------------------------------------------- vue (zoom / déplacement)
function toSvg(e) {
  const pt = svg.value.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
  return pt.matrixTransform(svg.value.getScreenCTM().inverse())
}
function zoomAt(f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
  const w = Math.min(20000, Math.max(200, vb.w * f)); const k = w / vb.w
  vb.x = cx - (cx - vb.x) * k; vb.y = cy - (cy - vb.y) * k; vb.w = w; vb.h *= k
}
function zoomBy(f) { zoomAt(f) }
function onWheel(e) {
  if (props.wheel === 'none' || (props.wheel === 'ctrl' && !e.ctrlKey)) return
  e.preventDefault()
  const p = toSvg(e)
  zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y)
}
function fit() {
  const ns = props.diagram?.nodes || []
  const el = wrap.value
  if (!el) return
  const ratio = (el.clientWidth || 1200) / (el.clientHeight || 700)
  let x0 = -400; let y0 = -250; let x1 = 400; let y1 = 250
  if (ns.length) {
    x0 = Math.min(...ns.map((n) => n.x)) - 120; x1 = Math.max(...ns.map((n) => n.x)) + 120
    y0 = Math.min(...ns.map((n) => n.y)) - 70; y1 = Math.max(...ns.map((n) => n.y)) + 70
  }
  if (view.value.background === 'image' && view.value.bgW) { x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, view.value.bgW); y1 = Math.max(y1, view.value.bgH) }
  let w = x1 - x0; let h = y1 - y0
  if (w / h > ratio) h = w / ratio; else w = h * ratio
  vb.x = (x0 + x1) / 2 - w / 2; vb.y = (y0 + y1) / 2 - h / 2; vb.w = w; vb.h = h
}
defineExpose({ fit, center: () => ({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }) })

// --------------------------------------------------------------- interactions
const drag = ref(null) // { kind: 'node'|'pan', ... }
const panning = computed(() => drag.value?.kind === 'pan')
const linkFrom = ref(null)
const cursor = ref(null)
watch(() => props.tool, () => { linkFrom.value = null })

function onBgDown(e) {
  hover.value = null
  if (e.button !== 0 && e.button !== 1) return
  emit('update:selected', null)
  linkFrom.value = null
  drag.value = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, k: vb.w / svg.value.clientWidth }
  svg.value.setPointerCapture(e.pointerId)
}
function onNodeDown(nd, e) {
  if (!props.editing) { drag.value = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, k: vb.w / svg.value.clientWidth, click: nd }; return }
  emit('update:selected', { type: 'node', id: nd.id })
  if (props.tool === 'link') return
  const p = toSvg(e)
  drag.value = { kind: 'node', id: nd.id, ox: p.x - nd.x, oy: p.y - nd.y, moved: false }
  svg.value.setPointerCapture(e.pointerId)
}
function onLinkDown(l, e) {
  if (!props.editing) { if (e.button === 0) popupAt(l, e, true); return }
  emit('update:selected', { type: 'link', id: l.id })
  const p = toSvg(e)
  drag.value = { kind: 'bend', id: l.id, sx: p.x, sy: p.y, b0: l.raw.bend || 0, moved: false }
  svg.value.setPointerCapture(e.pointerId)
}
function onMove(e) {
  if (props.tool === 'link' && linkFrom.value) cursor.value = toSvg(e)
  const g = drag.value
  if (!g) return
  if (g.kind === 'pan') {
    const dx = (e.clientX - g.sx) * g.k; const dy = (e.clientY - g.sy) * g.k
    if (Math.abs(dx) + Math.abs(dy) > 3) g.click = null
    vb.x = g.vx - dx; vb.y = g.vy - dy
  } else if (g.kind === 'node') {
    const p = toSvg(e)
    const snap = (v) => Math.round(v / 10) * 10
    emit('move', { id: g.id, x: snap(p.x - g.ox), y: snap(p.y - g.oy) })
    g.moved = true
  } else if (g.kind === 'bend') {
    // courbure : déplacement perpendiculaire au lien
    const l = props.diagram.links.find((x) => x.id === g.id); const A = nodeById.value[l.a]; const B = nodeById.value[l.b]
    const p = toSvg(e)
    const dx = B.x - A.x; const dy = B.y - A.y; const len = Math.hypot(dx, dy) || 1
    const proj = ((p.x - g.sx) * -dy + (p.y - g.sy) * dx) / len
    if (Math.abs(proj) > 4 || g.moved) { g.moved = true; emit('move', { link: g.id, bend: Math.round(g.b0 + proj * 2) }) }
  }
}
function onUp() {
  const g = drag.value
  drag.value = null
  if (g && (g.kind === 'node' || g.kind === 'bend') && g.moved) emit('moved')
  if (g?.click && props.navigate) {
    const d = props.live.devById.value[g.click.device_id]
    if (d) router.push(`/device/${encodeURIComponent(d.hostname)}`)
  }
}
function onNodeClick(nd) {
  if (!props.editing || props.tool !== 'link') return
  if (!linkFrom.value) { linkFrom.value = nd.id; return }
  if (linkFrom.value !== nd.id) emit('connect', { a: linkFrom.value, b: nd.id })
  linkFrom.value = null; cursor.value = null
}
function onDrop(e) {
  const id = e.dataTransfer.getData('text/x-device')
  if (!id || !props.editing) return
  const p = toSvg(e)
  emit('drop-device', { device_id: +id, x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 })
}

let ro = null
let fitted = false
onMounted(() => {
  ro = new ResizeObserver(() => { if (!fitted && wrap.value?.clientWidth) { fit(); fitted = true } })
  ro.observe(wrap.value)
})
watch(() => props.diagram?.id, () => nextTick(fit))
onMounted(() => window.addEventListener('keydown', onEsc))
onBeforeUnmount(() => { ro && ro.disconnect(); window.removeEventListener('keydown', onEsc) })
</script>

<style scoped>
.dcanvas { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 12px; background: var(--panel-2); user-select: none; touch-action: none; }
.dcanvas svg { width: 100%; height: 100%; display: block; cursor: grab; }
.dcanvas.panning svg { cursor: grabbing; }
.dcanvas.linking .node { cursor: crosshair; }
.gridline { stroke: var(--border); stroke-width: 1; }
.labels { cursor: default; }
.link .hit { stroke: transparent; stroke-width: 16; fill: none; }
.link .line { fill: none; stroke-linecap: round; }
.link.unknown .line { stroke-dasharray: 2 6; }
.link .flow { fill: none; stroke: #fff; opacity: .55; stroke-dasharray: 2 14; stroke-linecap: round; animation: flow linear infinite; pointer-events: none; }
@keyframes flow { to { stroke-dashoffset: -32; } }
.link.sel .line { filter: drop-shadow(0 0 4px var(--accent)); }
.editing .link { cursor: pointer; }
.plabel { font-size: 10.5px; font-weight: 700; fill: var(--text); paint-order: stroke; stroke: var(--panel-2); stroke-width: 4px; }
.rate-bg { fill: var(--panel-solid); stroke: var(--border); }
.rate { font-size: 11px; fill: var(--text); font-variant-numeric: tabular-nums; }
.pending { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 6 5; pointer-events: none; }
.node { cursor: pointer; }
.editing .node { cursor: move; }
.node .card { fill: var(--panel-solid); stroke: var(--border); stroke-width: 1.5; }
.node .bar { fill: #64748b; }
.node.custom .bar { fill: var(--accent); opacity: .7; }
.node.up .bar { fill: #22c55e; } .node.down .bar { fill: #f43f5e; } .node.disabled .bar, .node.ignored .bar { fill: #64748b; }
.node.down .card { stroke: #f43f5e; stroke-width: 2; }
.node.sel .card, .node.sel .cloud { stroke: var(--accent); stroke-width: 2.5; }
.node.from .card { stroke: var(--accent); stroke-dasharray: 5 4; stroke-width: 2.5; }
.node .name { font-size: 13px; font-weight: 700; fill: var(--text); }
.node .name.halo { paint-order: stroke; stroke: var(--panel-2); stroke-width: 4px; }
.img-frame { fill: transparent; stroke: transparent; stroke-width: 2; }
.node.down .img-frame { stroke: #f43f5e; }
.node.sel .img-frame { stroke: var(--accent); stroke-width: 2.5; }
.node.from .img-frame { stroke: var(--accent); stroke-dasharray: 5 4; }
.node .dot { fill: #64748b; }
.node.up .dot { fill: #22c55e; } .node.down .dot { fill: #f43f5e; }
.node .sub { font-size: 10.5px; fill: var(--muted); }
.ico-bg { fill: color-mix(in srgb, var(--accent) 20%, transparent); }
.ico-txt { font-size: 13px; font-weight: 800; fill: var(--accent); }
.abadge { fill: #f43f5e; stroke: var(--panel-solid); stroke-width: 2; }
.atxt { font-size: 10px; font-weight: 800; fill: #fff; }
.pulse { fill: none; stroke: #f43f5e; animation: pulse 1.6s ease-out infinite; }
@keyframes pulse { 0% { r: 4; opacity: .9; } 100% { r: 30; opacity: 0; } }
.cloud { fill: var(--panel-solid); stroke: var(--border); stroke-width: 1.5; }
.free { font-size: 16px; font-weight: 700; fill: var(--text); paint-order: stroke; stroke: var(--panel-2); stroke-width: 5px; }
.zoom { position: absolute; right: 10px; bottom: 10px; display: flex; gap: 4px; background: var(--panel-solid); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
</style>
