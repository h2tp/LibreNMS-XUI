<template>
  <div class="rv-scroll">
    <div ref="rv" class="rv" :class="{ cabling: cableMode }" :style="{ zoom }" @mousemove="onMove" @mouseleave="cursor = null">
      <div ref="refEl" class="rv-ref"></div>
      <div v-for="r in room.racks" :key="r.id" class="rack" :class="{ sel: selected?.type === 'rack' && selected.id === r.id }">
        <div class="rack-head" @click="$emit('select', { type: 'rack', id: r.id })">
          <b class="ellipsis">{{ r.name || t('Baie') }}</b><span class="faint">{{ r.units }}U</span>
          <span class="grow"></span><span class="faint small">{{ t('{n} U libres', { n: free(r) }) }}</span>
        </div>
        <div class="frame">
          <div class="rail"><span v-for="u in r.units" :key="u" :style="{ height: `${UH}px` }">{{ r.units - u + 1 }}</span></div>
          <div class="slots" :style="{ height: `${r.units * UH}px`, width: `${FACE_W}px`, backgroundSize: `100% ${UH}px` }"
            @dragover.prevent="over(r, $event)" @dragleave="leave(r, $event)" @drop.prevent="drop(r)" @click.self="$emit('select', null)">
            <div v-if="preview && preview.rack === r.id" class="preview" :class="{ bad: !preview.ok }"
              :style="{ top: `${(r.units - (preview.u + preview.h - 1)) * UH}px`, height: `${preview.h * UH}px` }"></div>
            <div v-for="it in itemsOf(r)" :key="it.id" class="slot-item"
              :class="{ sel: selected?.type === 'item' && selected.id === it.id, editing, dim: dragId === it.id }"
              :style="{ top: `${(r.units - (it.u + it.h - 1)) * UH + 1}px`, height: `${it.h * UH - 2}px` }"
              :draggable="editing && !cableMode" @dragstart="startMove(it, $event)" @dragend="endDrag" @click.stop="onItemClick(it, $event)">
              <RackItem :item="it" :dev="it.device_id ? devById[it.device_id] : null" :ports="it.device_id ? portsByDev[it.device_id] || [] : []" :editing="editing"
                :cable-mode="cableMode" :cabled="cabled" :highlight="highlight" @socket="(e) => $emit('socket', e)" />
            </div>
          </div>
          <div class="rail"><span v-for="u in r.units" :key="u" :style="{ height: `${UH}px` }">{{ r.units - u + 1 }}</span></div>
        </div>
      </div>
      <div v-if="!room.racks.length" class="empty small">{{ t('Aucune baie dans cette salle.') }}</div>

      <!-- câbles, tracés au-dessus des façades -->
      <svg v-if="cableView !== 'hidden'" class="cables" :width="size.w" :height="size.h">
        <g v-for="c in drawn" :key="c.id" class="cable" :class="{ sel: selected?.type === 'cable' && selected.id === c.id, down: c.down }"
          @mouseenter="$emit('hover', { cable: c.raw, event: $event })" @mousemove="$emit('hover', { cable: c.raw, event: $event })" @mouseleave="$emit('unhover')"
          @click.stop="$emit('cable', { cable: c.raw, event: $event })">
          <path :d="c.d" class="hit" />
          <path :d="c.d" class="halo" />
          <path :d="c.d" class="wire" :stroke="c.color" :stroke-dasharray="c.down ? '6 5' : null" />
          <circle :cx="c.a.x" :cy="c.a.y" r="2.6" :fill="c.color" class="plug" /><circle :cx="c.b.x" :cy="c.b.y" r="2.6" :fill="c.color" class="plug" />
        </g>
        <path v-if="pending" :d="pending" class="pending" />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import RackItem from './RackItem.vue'
import { UH, FACE_W, fits, dragPayload } from '../rack/core'
import { linkState, colorScale } from '../diagram/core'
import { t } from '../i18n'

const props = defineProps({
  room: Object, devById: Object, portsByDev: Object, portById: { type: Object, default: () => ({}) }, editing: Boolean, selected: Object,
  zoom: { type: Number, default: 1 }, cableMode: Boolean, cableFrom: Object, cableView: { type: String, default: 'real' },
})
const emit = defineEmits(['select', 'drop', 'open', 'invalid', 'socket', 'cable', 'hover', 'unhover'])

// --------------------------------------------------------------- câbles
const rv = ref(null); const refEl = ref(null)
const pos = ref({}) // "item:port" -> { x, y } en pixels non zoomés, relatifs à .rv
const size = ref({ w: 0, h: 0 })
const cursor = ref(null)
const key = (e) => `${e.item}:${e.port}`
const cabled = computed(() => new Set((props.room.cables || []).flatMap((c) => [key(c.a), key(c.b)])))
const highlight = computed(() => {
  const s = new Set()
  if (props.cableFrom) s.add(key(props.cableFrom))
  const c = props.selected?.type === 'cable' && (props.room.cables || []).find((x) => x.id === props.selected.id)
  if (c) { s.add(key(c.a)); s.add(key(c.b)) }
  return s
})
// mesure des prises dans la page (indépendant du zoom : on divise par l'échelle d'un repère de 1000 px)
function measure() {
  const root = rv.value; const ref0 = refEl.value
  if (!root || !ref0) return
  const k = ref0.getBoundingClientRect().width / 1000 || 1
  const base = root.getBoundingClientRect()
  const out = {}
  for (const el of root.querySelectorAll('[data-ep]')) {
    const r = el.getBoundingClientRect()
    out[el.dataset.ep] = { x: (r.left + r.width / 2 - base.left) / k, y: (r.top + r.height / 2 - base.top) / k }
  }
  pos.value = out
  size.value = { w: base.width / k, h: base.height / k }
}
let raf = 0
const remeasure = () => { cancelAnimationFrame(raf); nextTick(() => { raf = requestAnimationFrame(measure) }) }
watch(() => [props.room.items, props.room.racks, props.room.cables, props.zoom, props.portsByDev, props.cableView], remeasure, { deep: true })
let ro = null
onMounted(() => { ro = new ResizeObserver(remeasure); ro.observe(rv.value); remeasure() })
onBeforeUnmount(() => { ro?.disconnect(); cancelAnimationFrame(raf) })

// courbe d'un câble qui « pend » entre les deux prises
function curve(a, b) {
  const sag = 18 + Math.min(150, Math.abs(b.x - a.x) * 0.22 + Math.abs(b.y - a.y) * 0.08)
  return `M${a.x},${a.y} C${a.x},${a.y + sag} ${b.x},${b.y + sag} ${b.x},${b.y}`
}
const devPortId = (e) => {
  const it = props.room.items.find((i) => i.id === e.item)
  return it?.kind === 'device' && e.port > 0 ? e.port : null
}
// port virtuel (équipement en ping) : l'état du câble suit la joignabilité de l'équipement
function virtState(c, st) {
  const devs = [c.a, c.b].filter((e) => String(e.port).startsWith('v'))
    .map((e) => props.devById[props.room.items.find((i) => i.id === e.item)?.device_id]).filter(Boolean)
  if (!devs.length) return st
  const down = st.down || devs.some((d) => +d.status !== 1)
  const sc = colorScale(props.room.view || {})
  return { ...st, known: true, down, color: down ? sc.down : st.known ? st.color : sc.steps[0]?.color || '#22c55e' }
}
const drawn = computed(() => (props.room.cables || []).map((c) => {
  const a = pos.value[key(c.a)]; const b = pos.value[key(c.b)]
  if (!a || !b) return null
  const st = virtState(c, linkState({ port_a: devPortId(c.a), port_b: devPortId(c.b) }, props.portById, props.room.view || {}))
  const color = props.cableView === 'state' ? (st.known ? st.color : '#64748b') : c.color
  return { id: c.id, raw: c, a, b, d: curve(a, b), color, down: st.known && st.down }
}).filter(Boolean))
function onMove(e) {
  if (!props.cableFrom || !refEl.value) { cursor.value = null; return }
  const k = refEl.value.getBoundingClientRect().width / 1000 || 1
  const base = rv.value.getBoundingClientRect()
  cursor.value = { x: (e.clientX - base.left) / k, y: (e.clientY - base.top) / k }
}
const pending = computed(() => {
  const a = props.cableFrom && pos.value[key(props.cableFrom)]
  return a && cursor.value ? curve(a, cursor.value) : null
})
const preview = ref(null) // { rack, u, h, ok }
const dragId = ref(null)

const itemsOf = (r) => props.room.items.filter((i) => i.rack === r.id)
const free = (r) => r.units - itemsOf(r).reduce((s, i) => s + i.h, 0)

function payloadH(p) {
  if (!p) return 1
  if (p.move) return props.room.items.find((i) => i.id === p.move)?.h || 1
  return p.h || 1
}
// emplacement visé : le haut de l'élément se cale sur le U survolé
function target(r, e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const idx = Math.max(0, Math.min(r.units - 1, Math.floor(((e.clientY - rect.top) / rect.height) * r.units)))
  const h = payloadH(dragPayload.value)
  const u = Math.max(1, r.units - idx - h + 1)
  return { rack: r.id, u, h, ok: fits(props.room.items, r, u, h, dragPayload.value?.move || null) }
}
function over(r, e) {
  if (!props.editing || !dragPayload.value) return
  e.dataTransfer.dropEffect = dragPayload.value.move ? 'move' : 'copy'
  preview.value = target(r, e)
}
function leave(r, e) { if (!e.currentTarget.contains(e.relatedTarget)) preview.value = null }
function drop(r) {
  const p = preview.value; const payload = dragPayload.value
  preview.value = null
  if (!props.editing || !payload || !p || p.rack !== r.id) return
  if (!p.ok) { emit('invalid'); return }
  emit('drop', { rack: r.id, u: p.u, payload })
  dragPayload.value = null
}
function startMove(it, e) {
  if (!props.editing) return
  dragPayload.value = { move: it.id }
  dragId.value = it.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', it.id)
}
function endDrag() { dragId.value = null; preview.value = null; dragPayload.value = null }
function onItemClick(it, e) {
  if (props.editing) { emit('select', { type: 'item', id: it.id }); return }
  if (e.target.closest('a')) return // clic sur un port : la navigation est faite par le lien
  emit('open', it)
}
</script>

<style scoped>
.rv-scroll { overflow: auto; padding: 6px 2px 14px; }
.rv { position: relative; display: flex; gap: 26px; align-items: flex-start; width: max-content; }
.rv-ref { position: absolute; left: 0; top: 0; width: 1000px; height: 0; visibility: hidden; pointer-events: none; }
.cables { position: absolute; left: 0; top: 0; z-index: 5; overflow: visible; pointer-events: none; }
.cable { pointer-events: auto; cursor: pointer; }
.cable .hit { fill: none; stroke: transparent; stroke-width: 12; }
.cable .halo { fill: none; stroke: rgba(0, 0, 0, .55); stroke-width: 5; stroke-linecap: round; }
.cable .wire { fill: none; stroke-width: 2.6; stroke-linecap: round; opacity: .92; }
.cable:hover .wire, .cable.sel .wire { stroke-width: 3.6; opacity: 1; }
.cable.sel .halo { stroke: var(--accent); stroke-width: 7; opacity: .6; }
.cable .plug { stroke: #0b1018; stroke-width: 1; }
.pending { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-dasharray: 6 5; pointer-events: none; }
.rack { flex: none; border-radius: 12px; padding: 8px 8px 10px; background: var(--panel-solid); border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0, 0, 0, .18); }
.rack.sel { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.rack-head { display: flex; gap: 8px; align-items: baseline; padding: 2px 6px 8px; cursor: pointer; font-size: 13.5px; min-width: 0; }
.frame { display: flex; border-radius: 6px; overflow: hidden; background: #0d1117; border: 3px solid #2b3240; }
[data-theme='light'] .frame { border-color: #64748b; }
.rail { width: 24px; flex: none; display: flex; flex-direction: column; background: linear-gradient(90deg, #1a2029, #232b37); }
.rail span { display: flex; align-items: center; justify-content: center; font-size: 9px; color: #6b7a90; font-variant-numeric: tabular-nums;
  border-bottom: 1px solid #10151c; box-sizing: border-box; }
.slots { position: relative; flex: none; background-image: linear-gradient(180deg, transparent calc(100% - 1px), #1b222d calc(100% - 1px)); }
.slot-item { position: absolute; left: 1px; right: 1px; z-index: 1; border-radius: 3px; }
.slot-item.editing { cursor: grab; }
.slot-item:not(.editing) { cursor: pointer; }
.slot-item.sel { outline: 2px solid var(--accent); outline-offset: 1px; z-index: 2; }
.slot-item.dim { opacity: .35; }
.preview { position: absolute; left: 1px; right: 1px; z-index: 3; pointer-events: none; border-radius: 3px;
  background: color-mix(in srgb, #22c55e 25%, transparent); border: 2px dashed #22c55e; }
.preview.bad { background: color-mix(in srgb, #f43f5e 22%, transparent); border-color: #f43f5e; }
</style>
