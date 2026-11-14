<template>
  <div class="hc" @click.stop>
    <RrdChart v-if="file" :host="device.hostname" :file="file" height="240px" />
    <template v-else>
      <div class="row" style="justify-content:flex-end;margin-bottom:8px"><RangePicker v-model="range" /></div>
      <ApiGraph :path="`devices/${enc(device.hostname)}/graphs/health/${type}/${row._id}`" :range="range" />
    </template>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import RrdChart from './RrdChart.vue'
import ApiGraph from './ApiGraph.vue'
import RangePicker from './RangePicker.vue'
import { L } from '../api'
import { rrdNameFor } from '../health'
import { prefs } from '../utils'
const props = defineProps({ device: Object, files: Array, type: String, row: Object })
const enc = L.enc
const range = ref(prefs.range)
const file = computed(() => {
  if (!props.row) return null
  const n = rrdNameFor(props.type, props.row)
  return n && props.files?.includes(n) ? n : null
})
</script>
<style scoped>
.hc { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); animation: rise .4s ease; cursor: default; }
</style>
