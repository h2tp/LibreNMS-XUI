<template>
  <div v-if="error" class="empty small"><Rows3 /><div>{{ error }}</div></div>
  <div v-else-if="!room" class="skeleton" :style="{ height: `${size.h}px` }"></div>
  <div v-else class="wr" :style="{ height: `${size.h}px` }">
    <RackView :room="shown" :dev-by-id="devById" :ports-by-dev="portsByDev" :port-by-id="portById" :zoom="zoom"
      :cable-view="config.cables || 'real'" @open="openItem" />
    <router-link :to="`/racks/${room.id}`" class="btn ghost sm icon open" :title="t('Ouvrir la salle')"><Maximize2 :size="14" /></router-link>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Rows3, Maximize2 } from 'lucide-vue-next'
import RackView from '../RackView.vue'
import { rackApi } from '../../api'
import { D } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { UH, FACE_W, physPorts } from '../../rack/core'
import { t } from '../../i18n'

// config.rack : « idSalle » (toutes les baies) ou « idSalle:idBaie » (une seule baie)
const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const room = ref(null); const error = ref(null)
const devices = ref([]); const ports = ref([])
const [roomId, rackId] = String(props.config.rack || '').split(':')

onMounted(async () => {
  try {
    const d = await rackApi.get(roomId)
    d.racks ||= []; d.items ||= []; d.cables ||= []
    if (rackId && !d.racks.some((r) => r.id === rackId)) throw Object.assign(new Error(), { status: 404 })
    room.value = d
  } catch (e) { error.value = e.status === 404 ? t('Baie introuvable (supprimée ou non partagée)') : e.message }
})
useLoader(async () => {
  const [d, p] = await Promise.all([D.devices(), D.ports()])
  devices.value = d; ports.value = p
})

// une seule baie : on ne garde que ses éléments et les câbles internes à cette baie
const shown = computed(() => {
  const d = room.value
  if (!rackId) return d
  const items = d.items.filter((i) => i.rack === rackId)
  const ids = new Set(items.map((i) => i.id))
  return { ...d, racks: d.racks.filter((r) => r.id === rackId), items, cables: d.cables.filter((c) => ids.has(c.a.item) && ids.has(c.b.item)) }
})
const devById = computed(() => Object.fromEntries(devices.value.map((d) => [+d.device_id, d])))
const portById = computed(() => Object.fromEntries(ports.value.map((p) => [+p.port_id, p])))
const portsByDev = computed(() => {
  const ids = new Set(shown.value?.items.filter((i) => i.device_id).map((i) => +i.device_id) || [])
  return Object.fromEntries([...ids].map((id) => [id, physPorts(ports.value, id)]))
})

// mise à l'échelle pour tenir dans le widget (dimensions d'une baie : cadre, montants, façade 19")
const zoom = computed(() => {
  const racks = shown.value?.racks || []
  if (!racks.length) return 1
  const w = racks.length * (FACE_W + 76) + (racks.length - 1) * 26 + 8
  const h = Math.max(...racks.map((r) => r.units)) * UH + 70
  return Math.max(0.25, Math.min(1.5, (props.size.w - 8) / w, (props.size.h - 8) / h))
})
function openItem(it) {
  const d = it.device_id && devById.value[it.device_id]
  if (d) router.push(`/device/${encodeURIComponent(d.hostname)}`)
}
</script>

<style scoped>
.wr { position: relative; overflow: hidden; display: flex; justify-content: center; }
.wr :deep(.rv-scroll) { padding: 0; overflow: hidden; }
.wr :deep(.rack) { box-shadow: none; }
.open { position: absolute; top: 4px; right: 4px; z-index: 6; background: var(--panel-solid); border: 1px solid var(--border); }
</style>
