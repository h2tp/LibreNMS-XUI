<template>
  <div class="ring" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :viewBox="`0 0 ${size} ${size}`">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="c1" /><stop offset="1" :stop-color="c2" />
        </linearGradient>
      </defs>
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--panel-2)" :stroke-width="stroke" />
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" :stroke="`url(#${gid})`" :stroke-width="stroke" stroke-linecap="round"
        :stroke-dasharray="circ" :stroke-dashoffset="offset" :transform="`rotate(-90 ${size / 2} ${size / 2})`" class="arc" />
    </svg>
    <div class="ring-in">
      <b :style="{ fontSize: size / 5 + 'px' }">{{ display }}</b>
      <span v-if="label" class="muted">{{ label }}</span>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted, watch } from 'vue'
const props = defineProps({ value: Number, size: { type: Number, default: 110 }, stroke: { type: Number, default: 10 }, label: String, text: String, colors: Array })
const gid = 'rg' + Math.random().toString(36).slice(2)
const r = computed(() => (props.size - props.stroke) / 2)
const circ = computed(() => 2 * Math.PI * r.value)
const shown = ref(0)
const offset = computed(() => circ.value * (1 - Math.min(100, Math.max(0, shown.value)) / 100))
const display = computed(() => props.text ?? `${Math.round(props.value || 0)}%`)
const auto = computed(() => {
  const v = props.value || 0
  if (v >= 90) return ['#f43f5e', '#fb7185']
  if (v >= 75) return ['#fb923c', '#facc15']
  return ['#22d3ee', '#8b5cf6']
})
const c1 = computed(() => (props.colors || auto.value)[0])
const c2 = computed(() => (props.colors || auto.value)[1])
onMounted(() => setTimeout(() => (shown.value = props.value || 0), 30))
watch(() => props.value, (v) => (shown.value = v || 0))
</script>
<style scoped>
.ring { position: relative; flex-shrink: 0; }
.ring svg { width: 100%; height: 100%; }
.arc { transition: stroke-dashoffset 1.2s cubic-bezier(.2, .8, .2, 1); }
.ring-in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
.ring-in span { font-size: 11px; max-width: 80%; text-align: center; }
</style>
