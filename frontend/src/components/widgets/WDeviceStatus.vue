<template>
  <div class="col" style="height:100%;gap:4px">
    <EChart :option="option" :height="`${Math.max(120, size.h - 34)}px`" @click="(p) => $router.push(`/devices?status=${p.data.key}`)" />
    <div class="legend-row">
      <span v-for="s in items" :key="s.key" class="row small"><i class="sw" :style="{ background: s.color }"></i>{{ s.name }} <b>{{ s.value }}</b></span>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import EChart from '../EChart.vue'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devStatus } from '../../utils'
import { donutOption } from '../../charts'

const props = defineProps({ config: Object, size: Object })
const devices = ref([])
const counts = computed(() => {
  const c = { up: 0, down: 0, disabled: 0, ignored: 0 }
  devices.value.forEach((d) => c[devStatus(d)]++)
  return c
})
const items = computed(() => [
  { key: 'up', name: 'En ligne', value: counts.value.up, color: '#22c55e' },
  { key: 'down', name: 'Hors ligne', value: counts.value.down, color: '#f43f5e' },
  { key: 'disabled', name: 'Désactivés', value: counts.value.disabled, color: '#64748b' },
  { key: 'ignored', name: 'Ignorés', value: counts.value.ignored, color: '#facc15' },
])
const option = computed(() => donutOption(items.value, {
  title: devices.value.length ? `${Math.round((counts.value.up / Math.max(1, devices.value.length - counts.value.disabled)) * 100)}%` : '—', sub: 'disponibles',
}))
useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>
<style scoped>
.legend-row { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
</style>
