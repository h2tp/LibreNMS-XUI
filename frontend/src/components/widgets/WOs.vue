<template><EChart :option="option" :height="`${Math.max(120, size.h)}px`" /></template>
<script setup>
import { ref, computed } from 'vue'
import EChart from '../EChart.vue'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { donutOption, PALETTE } from '../../charts'

const props = defineProps({ config: Object, size: Object })
const devices = ref([])
const option = computed(() => {
  const m = {}
  devices.value.forEach((d) => { m[d.os || 'inconnu'] = (m[d.os || 'inconnu'] || 0) + 1 })
  const items = Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }))
  const o = donutOption(items, { title: String(items.length), sub: 'OS' })
  o.series[0].label = { show: true, color: 'inherit', formatter: '{b}', fontSize: 11 }
  o.series[0].radius = ['48%', '68%']
  o.title.top = '40%'
  return o
})
useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>
