<template>
  <div class="rrd-chart">
    <div v-if="title || !hideRange" class="card-title">
      <component :is="icon" v-if="icon" :size="17" />
      <span class="ellipsis">{{ title || meta.title }}</span>
      <div class="right">
        <slot name="actions" />
        <RangePicker v-if="!hideRange" v-model="localRange" />
      </div>
    </div>
    <div v-if="error" class="err small">{{ error }}</div>
    <div v-else-if="!series" class="skeleton" :style="{ height }"></div>
    <EChart v-else :option="option" :height="height" />
    <div v-if="series && showStats" class="stats-row">
      <div v-for="(s, i) in series" :key="s.name" class="st">
        <span class="sw" :style="{ background: s.color || PALETTE[i % PALETTE.length] }"></span>
        <b>{{ s.name }}</b>
        <span class="muted">act.</span> {{ u.fmt(st[i].last) }}
        <span class="muted">moy.</span> {{ u.fmt(st[i].avg) }}
        <span class="muted">max</span> {{ u.fmt(st[i].max) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import EChart from './EChart.vue'
import RangePicker from './RangePicker.vue'
import { rrd } from '../api'
import { clock } from '../refresh'
import { describe, toSeries, stats } from '../rrdmeta'
import { timeOption, unitFor, PALETTE } from '../charts'
import { prefs } from '../utils'

const props = defineProps({
  host: String, file: String, title: String, range: String, hideRange: Boolean, icon: Object,
  height: { type: String, default: '260px' }, compact: Boolean, axes: { type: Boolean, default: undefined }, showStats: { type: Boolean, default: true },
  ds: Object, unit: String, zoom: { type: Boolean, default: true }, cf: { type: String, default: 'AVERAGE' },
})
const localRange = ref(props.range || prefs.range)
watch(() => props.range, (v) => v && (localRange.value = v))
const raw = ref(null)
const error = ref(null)
const meta = computed(() => {
  const d = describe(props.file || '')
  return { ...d, ds: props.ds || d.ds, unit: props.unit || d.unit }
})
const u = computed(() => unitFor(meta.value.unit))
const series = computed(() => (raw.value ? toSeries(raw.value, meta.value) : null))
const st = computed(() => (series.value || []).map((s) => stats(s.data)))
const option = computed(() => series.value && timeOption(series.value, {
  unit: meta.value.unit, zoom: props.zoom && !props.compact, compact: props.compact, axes: props.axes ?? !props.compact, stack: meta.value.stack,
  max: meta.value.unit === 'pct' ? 100 : undefined, min: meta.value.unit === 'pct' ? 0 : undefined,
}))

async function load() {
  if (!props.host || !props.file) return
  try {
    const ds = meta.value.ds ? Object.keys(meta.value.ds).join(',') : undefined
    raw.value = await rrd.data(props.host, props.file, { start: localRange.value, ds, cf: props.cf, rows: props.compact ? 150 : 500 })
    error.value = null
  } catch (e) {
    // DS absents du fichier : on retente avec toutes les sources
    if (meta.value.ds && /source|DS/i.test(e.message)) {
      try { raw.value = await rrd.data(props.host, props.file, { start: localRange.value, cf: props.cf }); return } catch { /* */ }
    }
    error.value = e.message
  }
}
onMounted(load)
watch([localRange, () => props.file, () => props.host, () => props.cf], () => { raw.value = null; load() })
watch(() => clock.tick, load)
</script>

<style scoped>
.stats-row { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12px; margin-top: 8px; font-variant-numeric: tabular-nums; }
.st { display: flex; gap: 6px; align-items: center; }
.sw { width: 10px; height: 10px; border-radius: 3px; }
</style>
