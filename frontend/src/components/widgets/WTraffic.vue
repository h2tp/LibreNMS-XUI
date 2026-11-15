<template>
  <div class="col" style="gap:10px;height:100%">
    <div class="summary small">
      <span class="row nowrap"><ArrowDown :size="14" color="var(--accent)" /> {{ t('Entrant') }} <b>{{ fmtBits(now.in) }}</b></span>
      <span class="row nowrap"><ArrowUp :size="14" color="#a78bfa" /> {{ t('Sortant') }} <b>{{ fmtBits(now.out) }}</b></span>
      <span v-if="peak" class="muted nowrap">pic {{ fmtBits(peak) }}</span>
      <span class="faint nowrap" style="margin-left:auto">{{ t('{n} port(s)', { n: ports.length }) }}{{ truncated ? ` ${t('({n} max. pour la courbe)', { n: MAX })}` : '' }}</span>
    </div>

    <div v-if="loaded && !ports.length" class="empty small"><Activity /><div>Aucun port ne correspond{{ config.filter ? ` au filtre « ${config.filter} »` : '' }}</div></div>

    <template v-else-if="mode === 'chart'">
      <div v-if="!session.rrd" class="empty small">{{ t('La courbe nécessite l\'accès aux fichiers RRD.') }}</div>
      <div v-else-if="!series" class="skeleton grow" :style="{ height: `${chartH}px` }"></div>
      <EChart v-else :option="chartOpt" :height="`${chartH}px`" />
    </template>

    <EChart v-else-if="devRows.length" :option="devOpt" :height="`${chartH}px`" @click="(p) => go(devRows[p.dataIndex])" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Activity, ArrowDown, ArrowUp } from 'lucide-vue-next'
import EChart from '../EChart.vue'
import { session, rrd } from '../../api'
import { D, devicesFor, isPhysical } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { timeOption, css } from '../../charts'
import { devName, fmtBits } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const MAX = 200 // limite d'export RRD par requête
const allPorts = ref([]); const devById = ref({}); const loaded = ref(false)
const series = ref(null)
const mode = computed(() => props.config.mode || 'chart')
const chartH = computed(() => Math.max(120, props.size.h - 34))

const terms = computed(() => String(props.config.filter || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean))
const ports = computed(() => allPorts.value.filter((p) => {
  const d = devById.value[p.device_id]
  if (!d || +p.deleted || +p.disabled) return false
  if (props.config.device && d.hostname !== props.config.device) return false
  // Sans filtre : ports physiques seulement (évite de compter loopback, bridges, veth…)
  if (!terms.value.length) return isPhysical(p)
  const txt = `${p.ifName} ${p.ifAlias} ${p.ifDescr || ''}`.toLowerCase()
  return terms.value.some((t) => txt.includes(t))
}))
const truncated = computed(() => ports.value.length > MAX)
const now = computed(() => ports.value.reduce((s, p) => ({ in: s.in + (+p.ifInOctets_rate || 0) * 8, out: s.out + (+p.ifOutOctets_rate || 0) * 8 }), { in: 0, out: 0 }))
const peak = computed(() => {
  if (!series.value) return 0
  let m = 0
  for (const s of series.value) for (const [, v] of s.data) if (v > m) m = v
  return m
})

const chartOpt = computed(() => timeOption(series.value, { unit: 'bits', zoom: false }))

const devRows = computed(() => {
  const m = {}
  for (const p of ports.value) {
    const r = (m[p.device_id] ||= { device_id: p.device_id, name: devName(devById.value[p.device_id]), in: 0, out: 0 })
    r.in += (+p.ifInOctets_rate || 0) * 8; r.out += (+p.ifOutOctets_rate || 0) * 8
  }
  return Object.values(m).sort((a, b) => b.in + b.out - (a.in + a.out)).slice(0, props.config.limit || 10)
})
const devOpt = computed(() => {
  const text = css('--muted') || '#8b97ad'; const grid = css('--border') || 'rgba(148,163,184,.12)'
  const rows = [...devRows.value].reverse()
  return {
    grid: { left: 8, right: 16, top: 26, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0, textStyle: { color: text }, icon: 'roundRect', itemWidth: 12, itemHeight: 6 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmtBits(v) },
    xAxis: { type: 'value', axisLabel: { color: text, formatter: (v) => fmtBits(v, 0) }, splitLine: { lineStyle: { color: grid, type: 'dashed' } } },
    yAxis: { type: 'category', data: rows.map((r) => r.name), axisLabel: { color: text, width: 120, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: t('Entrant'), type: 'bar', stack: 't', data: rows.map((r) => r.in), itemStyle: { color: '#22d3ee', borderRadius: [0, 0, 0, 0] }, barMaxWidth: 16 },
      { name: t('Sortant'), type: 'bar', stack: 't', data: rows.map((r) => r.out), itemStyle: { color: '#a78bfa', borderRadius: [0, 6, 6, 0] }, barMaxWidth: 16 },
    ],
  }
})
function go(r) { const d = r && devById.value[r.device_id]; if (d) router.push(`/device/${encodeURIComponent(d.hostname)}/ports`) }

// Somme des fichiers port-id*.rrd, alignée sur les horodatages
async function loadSeries() {
  if (mode.value !== 'chart' || !session.rrd) return
  const sel = [...ports.value].sort((a, b) => (+b.ifInOctets_rate + +b.ifOutOctets_rate) - (+a.ifInOctets_rate + +a.ifOutOctets_rate)).slice(0, MAX)
  if (!sel.length) { series.value = []; return }
  const items = sel.map((p) => ({ host: devById.value[p.device_id].hostname, name: `port-id${p.port_id}.rrd`, ds: 'INOCTETS,OUTOCTETS', start: props.config.range || '-1d', rows: 240 }))
  const res = (await rrd.batch(items).catch(() => ({ results: [] }))).results
  const acc = new Map()
  for (const d of res) {
    if (!d || d.error || !d.series) continue
    d.timestamps.forEach((t, j) => {
      const a = acc.get(t) || [0, 0, 0]
      const i = d.series.INOCTETS?.[j]; const o = d.series.OUTOCTETS?.[j]
      if (i != null) { a[0] += i * 8; a[2]++ }
      if (o != null) { a[1] += o * 8 }
      acc.set(t, a)
    })
  }
  const ts = [...acc.keys()].sort((a, b) => a - b)
  series.value = [
    { name: t('Entrant'), color: '#22d3ee', data: ts.map((t) => [t * 1000, acc.get(t)[2] ? acc.get(t)[0] : null]) },
    { name: t('Sortant'), color: '#a78bfa', negate: true, data: ts.map((t) => [t * 1000, acc.get(t)[2] ? acc.get(t)[1] : null]) },
  ]
}

useLoader(async () => {
  const [p, d] = await Promise.all([D.ports(), devicesFor(props.config)])
  allPorts.value = p
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
  await loadSeries()
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; color: var(--muted); }
.summary b { color: var(--text); margin-left: 4px; font-variant-numeric: tabular-nums; }
</style>
