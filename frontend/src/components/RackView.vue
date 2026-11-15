<template>
  <div class="rv-scroll">
    <div class="rv" :style="{ zoom }">
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
              :draggable="editing" @dragstart="startMove(it, $event)" @dragend="endDrag" @click.stop="onItemClick(it, $event)">
              <RackItem :item="it" :dev="it.device_id ? devById[it.device_id] : null" :ports="it.device_id ? portsByDev[it.device_id] || [] : []" :editing="editing" />
            </div>
          </div>
          <div class="rail"><span v-for="u in r.units" :key="u" :style="{ height: `${UH}px` }">{{ r.units - u + 1 }}</span></div>
        </div>
      </div>
      <div v-if="!room.racks.length" class="empty small">{{ t('Aucune baie dans cette salle.') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import RackItem from './RackItem.vue'
import { UH, FACE_W, fits, dragPayload } from '../rack/core'
import { t } from '../i18n'

const props = defineProps({
  room: Object, devById: Object, portsByDev: Object, editing: Boolean, selected: Object, zoom: { type: Number, default: 1 },
})
const emit = defineEmits(['select', 'drop', 'open', 'invalid'])
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
.rv { display: flex; gap: 26px; align-items: flex-start; width: max-content; }
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
