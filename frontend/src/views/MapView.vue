<template>
  <div>
    <div class="page-head">
      <div><h1>Carte géographique</h1><div class="sub">{{ sites.length }} sites localisés · {{ unlocated }} équipements sans coordonnées</div></div>
      <div class="right"><label class="check"><input v-model="onlyDown" type="checkbox" /> Sites en défaut uniquement</label></div>
    </div>
    <div class="map-layout">
      <div class="card" style="padding:8px"><div ref="el" class="map"></div></div>
      <div class="card sites">
        <div class="card-title"><MapPin :size="17" /> Sites</div>
        <div v-for="s in shownSites" :key="s.name" class="site" @click="focus(s)">
          <span class="dot" :class="s.down ? (s.down === s.devices.length ? 'down' : 'warning') : 'up'"></span>
          <div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">{{ s.name }}</b><span class="small muted">{{ s.devices.length }} équipement(s){{ s.down ? ` · ${s.down} hors ligne` : '' }}</span></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import Lf from 'leaflet'
import { MapPin } from 'lucide-vue-next'
import { devicesCached, invalidateDevices } from '../api'
import { clock } from '../refresh'
import { devName, devStatus } from '../utils'

const router = useRouter()
const el = ref(null)
const devices = ref([])
const onlyDown = ref(false)
let map = null; let layer = null; let fitted = false

const sites = computed(() => {
  const m = {}
  devices.value.forEach((d) => {
    if (!d.lat || !d.lng || +d.disabled) return
    const k = `${(+d.lat).toFixed(5)},${(+d.lng).toFixed(5)}`
    const s = (m[k] ||= { names: new Set(), lat: +d.lat, lng: +d.lng, devices: [], down: 0 })
    s.names.add((d.location || k).replace(/\s*\[[-\d.,\s]+\]\s*$/, '') || k)
    s.devices.push(d)
    if (devStatus(d) === 'down') s.down++
  })
  return Object.values(m).map((s) => ({ ...s, name: [...s.names].join(' · ') })).sort((a, b) => b.down - a.down || a.name.localeCompare(b.name))
})
const shownSites = computed(() => (onlyDown.value ? sites.value.filter((s) => s.down) : sites.value))
const unlocated = computed(() => devices.value.filter((d) => !d.lat || !d.lng).length)

function draw() {
  if (!map) return
  layer.clearLayers()
  shownSites.value.forEach((s) => {
    const cls = s.down === s.devices.length ? 'down' : s.down ? 'warn' : 'up'
    const size = Math.min(34, 16 + s.devices.length * 2)
    const icon = Lf.divIcon({ className: '', html: `<div class="map-marker ${cls}" style="width:${size}px;height:${size}px;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:700">${s.devices.length > 1 ? s.devices.length : ''}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
    const list = s.devices.map((d) => `<div style="display:flex;gap:8px;align-items:center;padding:3px 0"><span class="dot ${devStatus(d)}"></span><a href="/device/${encodeURIComponent(d.hostname)}" data-host="${encodeURIComponent(d.hostname)}">${devName(d)}</a></div>`).join('')
    Lf.marker([s.lat, s.lng], { icon, zIndexOffset: cls === 'down' ? 2000 : cls === 'warn' ? 1000 : 0 }).bindPopup(`<b>${s.name}</b><div style="max-height:220px;overflow:auto;margin-top:6px">${list}</div>`).addTo(layer)
  })
  if (!fitted && shownSites.value.length) { map.fitBounds(Lf.latLngBounds(shownSites.value.map((s) => [s.lat, s.lng])).pad(0.2)); fitted = true }
}
function focus(s) { map.flyTo([s.lat, s.lng], 15, { duration: 1.2 }) }
async function load() { invalidateDevices(); devices.value = await devicesCached().catch(() => []); draw() }

onMounted(() => {
  map = Lf.map(el.value, { zoomControl: true }).setView([46.6, 2.4], 6)
  Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
  layer = Lf.layerGroup().addTo(map)
  el.value.addEventListener('click', (e) => { const a = e.target.closest('a[data-host]'); if (a) { e.preventDefault(); router.push(`/device/${a.dataset.host}`) } })
  load()
})
watch(onlyDown, draw)
watch(() => clock.tick, load)
onBeforeUnmount(() => map && map.remove())
</script>
<style scoped>
.map-layout { display: grid; grid-template-columns: 1fr 300px; gap: 18px; }
.map { height: calc(100vh - 200px); min-height: 450px; }
.sites { max-height: calc(100vh - 184px); overflow-y: auto; }
.site { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; cursor: pointer; }
.site:hover { background: var(--panel-2); }
@media (max-width: 1000px) { .map-layout { grid-template-columns: 1fr; } }
</style>
