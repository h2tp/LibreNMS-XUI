<template>
  <RrdChart v-if="hasRrd" :host="config.device" :file="`port-id${config.port}.rrd`" :range="config.range || '-1d'" hide-range compact :zoom="false"
    :show-stats="config.stats !== false" :height="`${Math.max(100, size.h - (config.stats !== false ? 56 : 0))}px`" />
  <ApiGraph v-else-if="hasRrd === false" :path="`devices/${encodeURIComponent(config.device)}/ports/${encodeURIComponent(config.portName || '')}/port_bits`" :range="config.range || '-1d'" :width="Math.round(size.w)" :height="Math.max(80, Math.round(size.h * 0.62))" />
</template>
<script setup>
import { ref, onMounted } from 'vue'
import RrdChart from '../RrdChart.vue'
import ApiGraph from '../ApiGraph.vue'
import { session, rrd } from '../../api'
import { cached } from '../../dashboard/data'

const props = defineProps({ config: Object, size: Object })
const hasRrd = ref(null)
onMounted(async () => {
  if (!session.rrd) { hasRrd.value = false; return }
  const list = await cached(`rrd:${props.config.device}`, () => rrd.list(props.config.device), 300000).catch(() => ({ files: [] }))
  hasRrd.value = list.files.some((f) => f.name === `port-id${props.config.port}.rrd`)
})
</script>
