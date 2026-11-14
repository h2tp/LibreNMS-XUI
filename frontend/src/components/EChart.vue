<template>
  <div ref="el" class="echart" :style="{ height }"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import * as echarts from 'echarts'
import { prefs, reducedMotion } from '../utils'

const props = defineProps({ option: Object, height: { type: String, default: '280px' } })
const emit = defineEmits(['click', 'ready'])
const el = ref(null)
const chart = shallowRef(null)
let ro = null

function render() {
  if (!chart.value || !props.option) return
  chart.value.setOption(reducedMotion ? { ...props.option, animation: false } : props.option, { notMerge: true, lazyUpdate: true })
}

onMounted(() => {
  chart.value = echarts.init(el.value, null, { renderer: 'canvas' })
  chart.value.on('click', (p) => emit('click', p))
  render()
  emit('ready', chart.value)
  ro = new ResizeObserver(() => chart.value && chart.value.resize())
  ro.observe(el.value)
})
onBeforeUnmount(() => { ro && ro.disconnect(); chart.value && chart.value.dispose() })
watch(() => props.option, render, { deep: false })
watch(() => prefs.theme, () => setTimeout(render, 30))
defineExpose({ chart })
</script>

<style scoped>
.echart { width: 100%; }
</style>
