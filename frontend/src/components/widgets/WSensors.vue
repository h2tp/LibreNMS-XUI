<template>
  <div v-if="loaded && !list.length" class="empty small"><Thermometer /><div>{{ all.length ? 'Aucun capteur ne correspond aux filtres' : 'Aucun capteur de ce type' }}</div></div>

  <div v-else-if="mode === 'tiles'" class="tiles">
    <router-link v-for="s in list" :key="s.sensor_id" :to="link(s)" class="tile" :class="s.state" :title="tip(s)">
      <div class="row" style="gap:6px;min-width:0">
        <span class="dot" :class="s.state === 'ok' ? 'up' : s.state === 'warn' ? 'warning' : 'down'"></span>
        <span class="ellipsis small muted grow">{{ devName(devById[s.device_id]) }}</span>
      </div>
      <div class="ellipsis descr">{{ s.sensor_descr }}</div>
      <div class="v">{{ fmt(s.sensor_current) }}<small>{{ unit }}</small>
        <span v-if="s.trend" class="trend" :class="s.trend > 0 ? 'up' : 'down'">{{ s.trend > 0 ? '▲' : '▼' }}</span>
      </div>
      <div v-if="s.gauge !== null" class="gauge"><i :style="{ width: s.gauge + '%' }"></i></div>
      <div v-if="s.sensor_limit != null || s.sensor_limit_low != null" class="lim">
        <span>{{ s.sensor_limit_low != null ? fmt(s.sensor_limit_low) : '' }}</span><span>{{ s.sensor_limit != null ? fmt(s.sensor_limit) + ' ' + unit : '' }}</span>
      </div>
    </router-link>
  </div>

  <EChart v-else-if="mode === 'bars'" :option="barsOpt" :height="`${Math.max(120, size.h)}px`" @click="(p) => go(list[p.dataIndex])" />

  <template v-else>
    <div v-if="!session.rrd" class="empty small">L'historique nécessite l'accès aux fichiers RRD.</div>
    <div v-else-if="!histOpt" class="skeleton" :style="{ height: `${size.h}px` }"></div>
    <EChart v-else :option="histOpt" :height="`${Math.max(120, size.h)}px`" />
  </template>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Thermometer } from 'lucide-vue-next'
import EChart from '../EChart.vue'
import { session, rrd } from '../../api'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { sensorUnit } from '../../rrdmeta'
import { rrdNameFor } from '../../health'
import { barOption, timeOption, PALETTE } from '../../charts'
import { devName } from '../../utils'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const all = ref([]); const devById = ref({}); const loaded = ref(false)
const mode = computed(() => props.config.mode || 'tiles')
const cls = computed(() => props.config.cls || 'temperature')
const unit = computed(() => sensorUnit(cls.value))
const num = (v) => (v === null || v === undefined || v === '' ? null : +v)

function state(s) {
  const v = num(s.sensor_current); const hi = num(s.sensor_limit); const lo = num(s.sensor_limit_low)
  if (v === null) return 'ok'
  if ((hi !== null && v >= hi) || (lo !== null && v <= lo)) return 'crit'
  const hw = num(s.sensor_limit_warn); const lw = num(s.sensor_limit_low_warn)
  if ((hw !== null && v >= hw) || (lw !== null && v <= lw)) return 'warn'
  // sans seuil d'avertissement : on prévient à 10 % de l'écart avant le seuil haut
  if (hw === null && hi !== null) { const span = hi - (lo ?? 0); if (span > 0 && v >= hi - span * 0.1) return 'warn' }
  return 'ok'
}
function gauge(s) {
  const v = num(s.sensor_current); const hi = num(s.sensor_limit)
  if (v === null || hi === null) return null
  const lo = Math.min(num(s.sensor_limit_low) ?? 0, v)
  return hi > lo ? Math.max(2, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : null
}

const list = computed(() => {
  const c = props.config
  const q = (c.filter || '').trim().toLowerCase()
  let l = all.value.filter((s) => s.sensor_class === cls.value && !+s.sensor_deleted && devById.value[s.device_id]
    && (!c.device || devById.value[s.device_id].hostname === c.device)
    && (!q || String(s.sensor_descr).toLowerCase().includes(q)))
    .map((s) => ({ ...s, state: state(s), gauge: gauge(s), trend: s.sensor_prev != null ? Math.sign(Math.round((+s.sensor_current - +s.sensor_prev) * 10)) : 0 }))
  if (c.onlyAlarm) l = l.filter((s) => s.state !== 'ok')
  const rank = { crit: 0, warn: 1, ok: 2 }
  if (c.sort === 'name') l.sort((a, b) => devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id])) || String(a.sensor_descr).localeCompare(String(b.sensor_descr)))
  else l.sort((a, b) => rank[a.state] - rank[b.state] || (c.sort === 'asc' ? a.sensor_current - b.sensor_current : b.sensor_current - a.sensor_current))
  return l.slice(0, c.limit || 12)
})

const fmt = (v) => (v === null || v === undefined ? '—' : (Math.round(+v * 10) / 10).toLocaleString('fr-FR'))
const label = (s) => `${devName(devById.value[s.device_id])} · ${s.sensor_descr}`
const tip = (s) => `${label(s)}\nValeur : ${fmt(s.sensor_current)} ${unit.value}${s.sensor_limit != null ? `\nSeuil haut : ${fmt(s.sensor_limit)} ${unit.value}` : ''}${s.sensor_limit_low != null ? `\nSeuil bas : ${fmt(s.sensor_limit_low)} ${unit.value}` : ''}`
const link = (s) => `/device/${encodeURIComponent(devById.value[s.device_id]?.hostname || '')}/health`
function go(s) { s && router.push(link(s)) }

const COLORS = { ok: '#22d3ee', warn: '#fb923c', crit: '#f43f5e' }
const barsOpt = computed(() => {
  const o = barOption(list.value.map(label), list.value.map((s) => +s.sensor_current), { unit: unit.value || 'num', color: '#22d3ee' })
  o.series[0].itemStyle.color = (p) => COLORS[list.value[p.dataIndex]?.state] || '#22d3ee'
  return o
})

// Historique : une courbe par capteur (12 au plus)
const hist = ref(null)
const histOpt = computed(() => {
  if (!hist.value) return null
  const o = timeOption(hist.value, { unit: unit.value || 'num', zoom: false })
  if (o.legend) Object.assign(o.legend, { type: 'scroll', right: 0, pageIconColor: '#22d3ee', pageTextStyle: { color: '#8b97ad' } })
  return o
})
async function loadHistory() {
  if (mode.value !== 'history' || !session.rrd) return
  const sel = list.value.slice(0, 12)
  const items = sel.map((s) => ({ host: devById.value[s.device_id].hostname, name: rrdNameFor(`device_${s.sensor_class}`, s), start: props.config.range || '-1d', rows: 200 }))
  const r = await rrd.batch(items).catch(() => ({ results: [] }))
  hist.value = sel.map((s, i) => {
    const d = r.results[i]
    if (!d || d.error || !d.series) return null
    const k = Object.keys(d.series)[0]
    return { name: label(s), color: PALETTE[i % PALETTE.length], area: false, data: d.series[k].map((v, j) => [d.timestamps[j] * 1000, v]) }
  }).filter(Boolean)
}

useLoader(async () => {
  const [s, d] = await Promise.all([D.sensors(), devicesFor(props.config)])
  all.value = s
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
  await loadHistory()
})
</script>

<style scoped>
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tile { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); color: var(--text); min-width: 0; transition: transform .15s, border-color .15s; }
.tile:hover { text-decoration: none; transform: translateY(-1px); }
.tile.warn { border-top-color: var(--orange); }
.tile.crit { border-top-color: var(--red); background: color-mix(in srgb, var(--red) 10%, var(--panel-2)); }
.descr { font-size: 12.5px; font-weight: 500; }
.v { font-size: 24px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 3px; }
.v small { font-size: 13px; font-weight: 500; color: var(--muted); }
.trend { font-size: 10px; margin-left: 4px; }
.trend.up { color: var(--orange); }
.trend.down { color: var(--accent); }
.tile.ok .v { color: var(--text); }
.tile.warn .v { color: var(--orange); }
.tile.crit .v { color: var(--red); }
.gauge { height: 5px; border-radius: 4px; background: var(--border); overflow: hidden; }
.gauge i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #22c55e, #facc15 70%, #f43f5e); background-size: 200px 100%; }
.tile.warn .gauge i { background: var(--orange); }
.tile.crit .gauge i { background: var(--red); }
.lim { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
