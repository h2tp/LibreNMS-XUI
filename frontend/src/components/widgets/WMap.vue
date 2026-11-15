<template><div ref="el" class="wmap" :style="{ height: `${Math.max(120, size.h)}px` }"></div></template>
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Lf from 'leaflet'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, devStatus } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const el = ref(null)
const devices = ref([])
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
  return Object.values(m).map((s) => ({ ...s, name: [...s.names].join(' · ') })).filter((s) => !props.config.onlyDown || s.down)
})
function draw() {
  if (!map) return
  layer.clearLayers()
  sites.value.forEach((s) => {
    const cls = s.down === s.devices.length ? 'down' : s.down ? 'warn' : 'up'
    const size = Math.min(34, 16 + s.devices.length * 2)
    const icon = Lf.divIcon({ className: '', html: `<div class="map-marker ${cls}" style="width:${size}px;height:${size}px;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:700">${s.devices.length > 1 ? s.devices.length : ''}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const list = s.devices.map((d) => `<div style="display:flex;gap:8px;align-items:center;padding:3px 0"><span class="dot ${devStatus(d)}"></span><a href="/device/${encodeURIComponent(d.hostname)}" data-host="${encodeURIComponent(d.hostname)}">${esc(devName(d))}</a></div>`).join('')
    Lf.marker([s.lat, s.lng], { icon, zIndexOffset: cls === 'down' ? 2000 : cls === 'warn' ? 1000 : 0 }).bindPopup(`<b>${esc(s.name)}</b><div style="max-height:200px;overflow:auto;margin-top:6px">${list}</div>`).addTo(layer)
  })
  if (!fitted && sites.value.length) { map.fitBounds(Lf.latLngBounds(sites.value.map((s) => [s.lat, s.lng])).pad(0.2), { maxZoom: 14 }); fitted = true }
}
onMounted(() => {
  map = Lf.map(el.value, { zoomControl: true, scrollWheelZoom: false, attributionControl: false }).setView([46.6, 2.4], 5)
  Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
  layer = Lf.layerGroup().addTo(map)
  el.value.addEventListener('click', (e) => { const a = e.target.closest('a[data-host]'); if (a) { e.preventDefault(); router.push(`/device/${a.dataset.host}`) } })
  draw()
})
watch(() => [props.size.w, props.size.h], () => map && setTimeout(() => map.invalidateSize(), 50))
watch(() => props.config.onlyDown, () => { fitted = false; draw() })
useLoader(async () => { devices.value = await devicesFor(props.config); draw() })
onBeforeUnmount(() => map && map.remove())
</script>
<style scoped>
.wmap { border-radius: 10px; overflow: hidden; }
</style>
