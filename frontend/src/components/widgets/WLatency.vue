<template>
  <div v-if="!top.length" class="empty small">Aucune mesure de latence</div>
  <EChart v-else :option="option" :height="`${Math.max(120, size.h)}px`" @click="(p) => go(top[p.dataIndex])" />
</template>
<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import EChart from '../EChart.vue'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName } from '../../utils'
import { barOption } from '../../charts'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const devices = ref([])
const top = computed(() => [...devices.value].filter((d) => +d.last_ping_timetaken > 0).sort((a, b) => b.last_ping_timetaken - a.last_ping_timetaken).slice(0, props.config.limit || 10))
const option = computed(() => barOption(top.value.map(devName), top.value.map((d) => +d.last_ping_timetaken), { unit: 'ms', color: '#a78bfa' }))
function go(d) { d && router.push(`/device/${encodeURIComponent(d.hostname)}`) }
useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>
