<template><div ref="el" :style="{ height }"></div></template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Lf from 'leaflet'
const props = defineProps({ lat: Number, lng: Number, status: String, height: { type: String, default: '200px' } })
const el = ref(null)
let map = null
onMounted(() => {
  map = Lf.map(el.value, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([props.lat, props.lng], 13)
  Lf.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
  Lf.marker([props.lat, props.lng], { icon: Lf.divIcon({ className: '', html: `<div class="map-marker ${props.status === 'down' ? 'down' : 'up'}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map)
})
onBeforeUnmount(() => map && map.remove())
</script>
