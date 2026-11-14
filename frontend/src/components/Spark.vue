<template>
  <svg :width="w" :height="h" class="spark" :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none">
    <defs><linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" :stop-color="color" stop-opacity=".45" /><stop offset="1" :stop-color="color" stop-opacity="0" /></linearGradient></defs>
    <path v-if="area" :d="area" :fill="`url(#${gid})`" />
    <path v-if="line" :d="line" fill="none" :stroke="color" stroke-width="1.6" stroke-linejoin="round" class="spark-line" />
  </svg>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ data: Array, w: { type: Number, default: 120 }, h: { type: Number, default: 32 }, color: { type: String, default: '#22d3ee' } })
const gid = 'sp' + Math.random().toString(36).slice(2)
const pts = computed(() => {
  const d = (props.data || []).map((v) => (v === null || isNaN(v) ? null : +v))
  const vals = d.filter((v) => v !== null)
  if (vals.length < 2) return null
  const mx = Math.max(...vals); const mn = Math.min(0, ...vals)
  const span = mx - mn || 1
  return d.map((v, i) => [(i / (d.length - 1)) * props.w, v === null ? null : props.h - 2 - ((v - mn) / span) * (props.h - 4)])
})
const line = computed(() => pts.value && pts.value.filter((p) => p[1] !== null).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(''))
const area = computed(() => line.value && `${line.value}L${props.w},${props.h}L0,${props.h}Z`)
</script>
<style scoped>
.spark { display: block; overflow: visible; }
.spark-line { stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: draw 1.4s ease forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
</style>
