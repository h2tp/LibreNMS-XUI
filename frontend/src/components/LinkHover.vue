<template>
  <div class="lh" :style="{ left: `${x}px`, top: `${y}px` }">
    <div class="lh-title">{{ link.titleA }} <span class="muted">↔</span> {{ link.titleB }}</div>
    <div class="small muted">{{ link.status }}</div>
    <template v-if="host">
      <div v-if="err" class="small muted lh-empty">{{ err }}</div>
      <div v-else-if="!pts" class="skeleton" :style="{ height: `${H}px`, marginTop: '8px' }"></div>
      <svg v-else :width="W" :height="H" :viewBox="`0 0 ${W} ${H}`" class="lh-chart">
        <line :x1="0" :x2="W" :y1="H / 2" :y2="H / 2" class="axis" />
        <path :d="pts.inArea" fill="#22d3ee" fill-opacity=".25" /><path :d="pts.inLine" fill="none" stroke="#22d3ee" stroke-width="1.5" />
        <path :d="pts.outArea" fill="#a78bfa" fill-opacity=".25" /><path :d="pts.outLine" fill="none" stroke="#a78bfa" stroke-width="1.5" />
        <text x="2" y="10" class="ax">{{ fmtBits(pts.max) }}</text>
        <text x="2" :y="H - 3" class="ax">{{ fmtBits(pts.max) }}</text>
      </svg>
      <div v-if="pts" class="lh-legend small">
        <span><i style="background:#22d3ee"></i>vers {{ link.nameA }} · moy. {{ fmtBits(pts.avgIn) }} · max {{ fmtBits(pts.maxIn) }}</span>
        <span><i style="background:#a78bfa"></i>depuis {{ link.nameA }} · moy. {{ fmtBits(pts.avgOut) }} · max {{ fmtBits(pts.maxOut) }}</span>
        <span class="muted">24 dernières heures</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { rrd, session } from '../api'
import { cached } from '../dashboard/data'
import { fmtBits } from '../utils'

// link : { titleA, titleB, nameA, status, host, portId, flip } — flip : le RRD est celui de l'extrémité B (entrant/sortant inversés)
const props = defineProps({ link: Object, x: Number, y: Number })
const W = 300; const H = 90
const data = ref(null); const err = ref('')
const host = computed(() => (session.rrd && props.link.host && props.link.portId ? props.link.host : null))

watch(() => [host.value, props.link.portId], async ([h, id]) => {
  data.value = null; err.value = ''
  if (!h) return
  try {
    const r = await cached(`linkgraph:${id}`, () => rrd.data(h, `port-id${id}.rrd`, { ds: 'INOCTETS,OUTOCTETS', start: '-1d', rows: 150 }), 300000)
    if (props.link.portId === id) data.value = r
  } catch { if (props.link.portId === id) err.value = 'Pas d\'historique pour ce port' }
}, { immediate: true })

const pts = computed(() => {
  const s = data.value?.series
  if (!s) return null
  const a = (s.INOCTETS || []).map((v) => (v == null ? null : v * 8)); const b = (s.OUTOCTETS || []).map((v) => (v == null ? null : v * 8))
  const [vin, vout] = props.link.flip ? [b, a] : [a, b]
  const n = Math.max(vin.length, vout.length)
  if (n < 2) return null
  const vals = (l) => l.filter((v) => v != null)
  const max = Math.max(1, ...vals(vin), ...vals(vout))
  const mid = H / 2; const k = (mid - 2) / max
  const path = (l, sign) => {
    let line = ''; let start = null; let last = null
    l.forEach((v, i) => {
      if (v == null) return
      const px = ((i / (n - 1)) * W).toFixed(1); const py = (mid - sign * v * k).toFixed(1)
      line += `${line ? 'L' : 'M'}${px},${py}`; if (start === null) start = px; last = px
    })
    return { line, area: line ? `${line}L${last},${mid}L${start},${mid}Z` : '' }
  }
  const pi = path(vin, 1); const po = path(vout, -1)
  const avg = (l) => { const v = vals(l); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0 }
  return {
    max, inLine: pi.line, inArea: pi.area, outLine: po.line, outArea: po.area,
    avgIn: avg(vin), avgOut: avg(vout), maxIn: Math.max(0, ...vals(vin)), maxOut: Math.max(0, ...vals(vout)),
  }
})
</script>

<style scoped>
.lh { position: absolute; z-index: 5; pointer-events: none; width: 324px; padding: 10px 12px; border-radius: 12px;
  background: var(--panel-solid); border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0, 0, 0, .3); }
.lh-title { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
.lh-empty { margin-top: 8px; }
.lh-chart { display: block; margin-top: 8px; overflow: visible; }
.axis { stroke: var(--border); }
.ax { font-size: 9.5px; fill: var(--muted); }
.lh-legend { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; font-size: 11px; }
.lh-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
</style>
