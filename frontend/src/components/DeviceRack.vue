<template>
  <div v-if="places.length" ref="box" class="card drack">
    <div class="card-title"><Rows3 :size="17" /> {{ places.length > 1 ? t('Baies') : t('Baie') }}</div>
    <div v-for="pl in places" :key="pl.room.id + pl.item" class="place">
      <router-link :to="{ path: `/racks/${pl.room.id}`, query: { item: pl.item } }" class="where" :title="t('Ouvrir la baie')">
        <b class="ellipsis">{{ pl.room.name }}</b><ChevronRight :size="13" class="faint" /><span class="ellipsis">{{ pl.rackName }}</span>
        <span class="badge">{{ pl.uLabel }}</span>
      </router-link>
      <div v-if="pl.room.location" class="small faint">{{ pl.room.location }}</div>

      <!-- extrait de la baie autour de l'équipement -->
      <div class="extract">
        <RackView :room="pl.view" :dev-by-id="devById" :ports-by-dev="portsByDev(pl.view)" :port-by-id="portById" :selected="{ type: 'item', id: pl.item }"
          :zoom="zoom" cable-view="real" @open="openItem" />
      </div>

      <!-- câbles de l'équipement -->
      <div v-if="pl.cables.length" class="cables">
        <div v-for="c in pl.cables" :key="c.id" class="crow small" :title="[c.label, c.length, CABLE_TYPES[c.type]].filter(Boolean).join(' · ')">
          <span class="cdot" :style="{ background: c.color }"></span>
          <span class="mono nowrap">{{ c.mine }}</span><ArrowRight :size="12" class="faint" style="flex:none" />
          <span class="ellipsis">{{ c.other }}</span>
          <span v-if="c.label" class="faint ellipsis lbl">{{ c.label }}</span>
        </div>
      </div>
      <div v-else class="small faint">{{ t('Aucun câble déclaré pour cet équipement.') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Rows3, ChevronRight, ArrowRight } from 'lucide-vue-next'
import RackView from './RackView.vue'
import { rackApi } from '../api'
import { D } from '../dashboard/data'
import { useLoader } from '../refresh'
import { FACE_W, physPorts, cableHelpers, CABLE_TYPES } from '../rack/core'
import { t } from '../i18n'

const props = defineProps({ device: Object })
const router = useRouter()
const raw = ref([]) // [{ room, rack, item }]
const devices = ref([]); const ports = ref([])
const devById = computed(() => Object.fromEntries(devices.value.map((d) => [+d.device_id, d])))
const portById = computed(() => Object.fromEntries(ports.value.map((p) => [+p.port_id, p])))
const portsByDev = (room) => Object.fromEntries(room.items.filter((i) => i.device_id).map((i) => [+i.device_id, physPorts(ports.value, i.device_id)]))

async function loadPlaces() {
  try { raw.value = await rackApi.byDevice(props.device.device_id) } catch { raw.value = [] }
}
watch(() => props.device?.device_id, loadPlaces, { immediate: true })
const AROUND = 3
// ports des seuls équipements utiles : ceux de l'extrait et ceux au bout des câbles de l'équipement
// (au lieu des ports de tout le parc)
function neededIds() {
  const ids = new Set()
  for (const { room, rack, item } of raw.value) {
    const it = (room.items || []).find((x) => x.id === item)
    if (!it) continue
    const lo = it.u - AROUND; const hi = it.u + it.h - 1 + AROUND
    const keep = new Set((room.items || []).filter((x) => x.rack === rack && x.u >= lo && x.u + x.h - 1 <= hi).map((x) => x.id))
    for (const c of room.cables || []) if (c.a.item === item || c.b.item === item) { keep.add(c.a.item); keep.add(c.b.item) }
    for (const x of room.items || []) if (keep.has(x.id) && x.device_id) ids.add(+x.device_id)
  }
  return ids
}
async function loadPorts() {
  if (!raw.value.length) return
  const d = await D.devices()
  const ids = neededIds()
  const lists = await Promise.all(d.filter((x) => ids.has(+x.device_id)).map((x) => D.devPorts(x.hostname).catch(() => [])))
  devices.value = d; ports.value = lists.flat()
}
useLoader(loadPorts)
watch(raw, (v) => { if (v.length && !devices.value.length) loadPorts() })

// extrait : l'équipement et ses voisins (3 U au-dessus et en dessous), numérotation des U conservée
const places = computed(() => raw.value.map(({ room, rack, item }) => {
  room.items ||= []; room.cables ||= []
  const r = room.racks.find((x) => x.id === rack)
  const it = room.items.find((x) => x.id === item)
  if (!r || !it) return null
  const lo = Math.max(1, it.u - AROUND); const hi = Math.min(r.units, it.u + it.h - 1 + AROUND)
  const items = room.items.filter((x) => x.rack === rack && x.u >= lo && x.u + x.h - 1 <= hi).map((x) => ({ ...x, u: x.u - lo + 1 }))
  const ids = new Set(items.map((x) => x.id))
  const view = {
    ...room, racks: [{ ...r, units: hi - lo + 1, offset: lo - 1, label: `U ${lo}–${hi}` }], items,
    cables: room.cables.filter((c) => ids.has(c.a.item) && ids.has(c.b.item)),
  }
  // câbles de l'équipement, nommés depuis la salle entière (l'autre extrémité peut être hors de l'extrait)
  const roomRef = { value: room }
  const { epName, itemName } = cableHelpers(roomRef, devById, portById)
  const prefix = `${itemName(it)} · `
  const cables = room.cables.filter((c) => c.a.item === item || c.b.item === item).map((c) => {
    const [mine, other] = c.a.item === item ? [c.a, c.b] : [c.b, c.a]
    return { ...c, mine: epName(mine).replace(prefix, ''), other: epName(other) }
  }).sort((a, b) => String(a.mine).localeCompare(String(b.mine), undefined, { numeric: true }))
  const top = it.u + it.h - 1
  return { room, item, rackName: r.name || t('Baie'), uLabel: it.h > 1 ? `U ${it.u}–${top}` : `U ${it.u}`, view, cables }
}).filter(Boolean))

// mise à l'échelle pour la largeur de la carte
const box = ref(null); const width = ref(340)
let ro = null
onMounted(() => { ro = new ResizeObserver(() => { if (box.value) width.value = box.value.clientWidth }); watch(box, (el) => el && ro.observe(el), { immediate: true }) })
onBeforeUnmount(() => ro?.disconnect())
const zoom = computed(() => Math.max(0.4, Math.min(1, (width.value - 40) / (FACE_W + 76))))

function openItem(it) {
  const d = it.device_id && devById.value[it.device_id]
  if (d && +d.device_id !== +props.device.device_id) router.push(`/device/${encodeURIComponent(d.hostname)}`)
}
</script>

<style scoped>
.place + .place { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.where { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--text); font-size: 13.5px; }
.where:hover { text-decoration: none; color: var(--accent); }
.where .badge { margin-left: auto; flex: none; }
.extract { margin: 10px 0; display: flex; justify-content: center; }
.extract :deep(.rv-scroll) { padding: 0; overflow: hidden; }
.extract :deep(.rack) { box-shadow: none; }
.cables { display: flex; flex-direction: column; gap: 2px; }
.crow { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 4px 2px; border-bottom: 1px solid var(--border); }
.crow:last-child { border-bottom: 0; }
.cdot { width: 10px; height: 10px; border-radius: 3px; flex: none; border: 1px solid rgba(0, 0, 0, .3); }
.lbl { margin-left: auto; padding-left: 6px; }
</style>
