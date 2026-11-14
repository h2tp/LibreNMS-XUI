<template><EChart :option="option" :height="`${Math.max(120, size.h)}px`" /></template>
<script setup>
import { ref, computed } from 'vue'
import EChart from '../EChart.vue'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { barOption } from '../../charts'

const props = defineProps({ config: Object, size: Object })
const devices = ref([])
const option = computed(() => {
  const m = {}
  devices.value.forEach((d) => { const l = (d.location || 'Non défini').replace(/\s*\[[-\d.,\s]+\]\s*$/, ''); m[l] = (m[l] || 0) + 1 })
  const e = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, props.config.limit || 12)
  return barOption(e.map((x) => x[0]), e.map((x) => x[1]), { color: '#34d399' })
})
useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>
