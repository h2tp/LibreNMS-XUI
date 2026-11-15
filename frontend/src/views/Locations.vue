<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Emplacements') }}</h1><div class="sub">{{ t('{n} emplacements · cliquez sur la carte pour placer l\'emplacement sélectionné', { n: locations.length }) }}</div></div>
      <div class="right"><button v-if="!session.read_only" class="btn primary" @click="edit = { location: '', lat: '', lng: '' }"><Plus /> {{ t('Nouvel emplacement') }}</button></div></div>
    <div class="loc-layout">
      <div class="card">
        <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" row-key="id" filename="emplacements.csv" :row-click="select">
          <template #c-location="{ row }"><div class="row"><MapPin :size="15" :color="row.lat ? 'var(--accent)' : 'var(--faint)'" /><b :style="sel?.id === row.id ? 'color:var(--accent)' : ''">{{ row.location }}</b></div></template>
          <template #c-coords="{ row }"><span class="mono small">{{ row.lat ? `${(+row.lat).toFixed(5)}, ${(+row.lng).toFixed(5)}` : '—' }}</span></template>
          <template #c-count="{ row }"><router-link :to="`/devices?location=${encodeURIComponent(row.location)}`" @click.stop>{{ row.count }}</router-link> <span v-if="row.down" class="badge down">{{ row.down }} ↓</span></template>
          <template #c-actions="{ row }">
            <div v-if="!session.read_only" class="row" style="gap:4px" @click.stop>
              <button class="btn sm icon ghost" @click="edit = { ...row, orig: row.location }"><Pencil /></button>
              <button class="btn sm icon ghost danger" @click="remove(row)"><Trash2 /></button>
            </div>
          </template>
        </DataTable>
      </div>
      <div class="card" style="padding:8px"><div ref="el" class="map"></div></div>
    </div>
    <Modal v-if="edit" :title="edit.id ? t('Modifier l\'emplacement') : t('Nouvel emplacement')" :icon="MapPin" @close="edit = null">
      <div class="form-grid">
        <label class="field full"><span>{{ t('Nom') }}</span><input v-model="edit.location" class="input" :disabled="!!edit.id" /></label>
        <label class="field"><span>{{ t('Latitude') }}</span><input v-model="edit.lat" class="input mono" /></label>
        <label class="field"><span>{{ t('Longitude') }}</span><input v-model="edit.lng" class="input mono" /></label>
      </div>
      <template #foot><button class="btn" @click="edit = null">{{ t('Annuler') }}</button><button class="btn primary" @click="save(edit)"><Save /> {{ t('Enregistrer') }}</button></template>
    </Modal>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Lf from 'leaflet'
import { MapPin, Plus, Pencil, Trash2, Save } from 'lucide-vue-next'
import DataTable from '../components/DataTable.vue'
import Modal from '../components/Modal.vue'
import { session, api, pick, devicesCached, invalidateDevices } from '../api'
import { useLoader } from '../refresh'
import { devStatus, toast, toastError, confirmAction } from '../utils'
import { t } from '../i18n'

const el = ref(null)
const locations = ref([])
const devices = ref([])
const sel = ref(null)
const edit = ref(null)
let map = null; let layer = null

const rows = computed(() => locations.value.map((l) => {
  const ds = devices.value.filter((d) => d.location === l.location)
  return { ...l, coords: l.lat, count: ds.length, down: ds.filter((d) => devStatus(d) === 'down').length }
}))
const cols = [{ key: 'location', label: t('Emplacement') }, { key: 'coords', label: t('Coordonnées') }, { key: 'count', label: t('Équipements') }, { key: 'actions', label: '', sortable: false }]

function draw() {
  if (!map) return
  layer.clearLayers()
  const pts = []
  rows.value.filter((l) => l.lat && l.lng).forEach((l) => {
    pts.push([+l.lat, +l.lng])
    const m = Lf.marker([+l.lat, +l.lng], { draggable: !session.read_only, icon: Lf.divIcon({ className: '', html: `<div class="map-marker ${l.down ? 'down' : 'up'}" style="${sel.value?.id === l.id ? 'outline:3px solid #22d3ee' : ''}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }) })
      .bindTooltip(`${l.location} (${l.count})`).addTo(layer)
    m.on('click', () => select(l))
    m.on('dragend', (e) => { const p = e.target.getLatLng(); save({ ...l, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }) })
  })
  if (pts.length && !map._fitted) { map.fitBounds(Lf.latLngBounds(pts).pad(0.2)); map._fitted = true }
}
function select(l) { sel.value = l; draw(); if (l.lat) map.flyTo([+l.lat, +l.lng], 14, { duration: 1 }) }

const { loading, error, reload } = useLoader(async () => {
  const [l, d] = await Promise.all([api.get('resources/locations').then((r) => pick(r, 'locations')), devicesCached()])
  locations.value = l; devices.value = d; draw()
})
watch(rows, draw)

async function save(l) {
  try {
    const body = { lat: l.lat === '' ? null : +l.lat, lng: l.lng === '' ? null : +l.lng }
    if (l.id) await api.patch(`locations/${encodeURIComponent(l.orig || l.location)}`, body)
    else await api.post('locations', { location: l.location, ...body })
    toast(t('Emplacement enregistré'), 'success'); edit.value = null; invalidateDevices(); reload()
  } catch (e) { toastError(e) }
}
async function remove(l) {
  if (!confirmAction(t('Supprimer l\'emplacement « {n} » ?', { n: l.location }))) return
  try { await api.del(`locations/${encodeURIComponent(l.location)}`); toast(t('Emplacement supprimé'), 'success'); reload() } catch (e) { toastError(e) }
}
onMounted(() => {
  map = Lf.map(el.value).setView([46.6, 2.4], 6)
  Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  layer = Lf.layerGroup().addTo(map)
  map.on('click', (e) => {
    if (session.read_only || !sel.value) return
    if (confirmAction(`Placer « ${sel.value.location} » ici ?`)) save({ ...sel.value, lat: e.latlng.lat.toFixed(6), lng: e.latlng.lng.toFixed(6) })
  })
  draw()
})
onBeforeUnmount(() => map && map.remove())
</script>
<style scoped>
.loc-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
.map { height: calc(100vh - 200px); min-height: 420px; }
@media (max-width: 1100px) { .loc-layout { grid-template-columns: 1fr; } }
</style>
