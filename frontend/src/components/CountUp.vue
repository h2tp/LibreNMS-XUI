<template><span>{{ text }}</span></template>
<script setup>
import { ref, watch, onMounted, computed } from 'vue'
const props = defineProps({ value: { type: Number, default: 0 }, duration: { type: Number, default: 900 }, decimals: { type: Number, default: 0 } })
const cur = ref(0)
let raf = null
import { reducedMotion } from '../utils'
function animate(from, to) {
  cancelAnimationFrame(raf)
  if (reducedMotion) { cur.value = to; return }
  const t0 = performance.now()
  const step = (t) => {
    const k = Math.max(0, Math.min(1, (t - t0) / props.duration))
    const e = 1 - Math.pow(1 - k, 3)
    cur.value = from + (to - from) * e
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
onMounted(() => animate(0, props.value || 0))
watch(() => props.value, (v, o) => animate(o || 0, v || 0))
const text = computed(() => (props.value === null || props.value === undefined || isNaN(props.value) ? '—' : cur.value.toLocaleString('fr-FR', { maximumFractionDigits: props.decimals, minimumFractionDigits: props.decimals })))
</script>
