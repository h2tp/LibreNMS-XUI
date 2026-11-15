<template>
  <div v-if="!loaded" class="col" style="gap:10px"><div v-for="i in 3" :key="i" class="skeleton" style="height:40px"></div></div>
  <div v-else class="col" style="gap:12px;height:100%">
    <div class="summary small">
      <span v-if="counts.err" class="badge critical">{{ counts.err }} port(s) en erreur</span>
      <span v-else class="badge ok">{{ t('aucune erreur au dernier relevé') }}</span>
      <span v-if="counts.cum" class="muted">{{ t('{n} avec un cumul d\'erreurs', { n: counts.cum }) }}</span>
      <span v-if="config.down && counts.down" class="badge warning">{{ t('{n} déconnecté(s)', { n: counts.down }) }}</span>
    </div>

    <template v-if="mode === 'history'">
      <div v-if="!session.rrd" class="empty small">{{ t('L\'historique nécessite l\'accès aux fichiers RRD.') }}</div>
      <div v-else-if="!errPorts.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>{{ t('Aucun port en erreur à tracer') }}</div></div>
      <div v-else-if="!series" class="skeleton" :style="{ height: `${chartH}px` }"></div>
      <EChart v-else :option="histOpt" :height="`${chartH}px`" />
    </template>

    <div v-else-if="!list.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>{{ mode === 'total' ? t('Aucun compteur d\'erreur non nul') : t('Aucun port ne produit d\'erreurs actuellement') }}</div></div>

    <div v-else class="col" style="gap:6px">
      <router-link v-for="r in list" :key="r.port_id" :to="`/port/${r.port_id}`" class="perr" :class="r.st">
        <span class="dot" :class="r.st === 'down' ? 'warning' : r.st === 'crit' ? 'down' : r.st === 'warn' ? 'warning' : 'disabled'"></span>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:8px;min-width:0">
            <b class="ellipsis">{{ r.ifName }}</b>
            <span class="muted small ellipsis">{{ r.ifAlias && r.ifAlias !== r.ifName ? r.ifAlias + ' · ' : '' }}{{ devName(devById[r.device_id]) }}</span>
          </div>
          <div class="small muted">
            <template v-if="r.st === 'down'">{{ t('Activé mais déconnecté') }}{{ r.since ? ` · ${r.since}` : '' }}</template>
            <template v-else-if="mode === 'total'">{{ t('entrée {i} · sortie {o} erreurs cumulées', { i: fmtNum(+r.ifInErrors || 0, 0), o: fmtNum(+r.ifOutErrors || 0, 0) }) }}</template>
            <template v-else>{{ t('entrée {i} · sortie {o}', { i: fmtRate(r.inRate), o: fmtRate(r.outRate) }) }}</template>
          </div>
        </div>
        <b v-if="r.st !== 'down' && mode !== 'total'" class="ratio nowrap" :class="r.st" :title="t('Erreurs / paquets au dernier relevé')">{{ r.ratio === null ? '—' : fmtPct(r.ratio) }}</b>
        <b v-else-if="mode === 'total' && r.st !== 'down'" class="nowrap">{{ fmtNum(r.total, 0) }}</b>
      </router-link>
    </div>

    <div v-if="more" class="small muted" style="text-align:center">+ {{ more }} autre(s)</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import EChart from '../EChart.vue'
import { session, rrd } from '../../api'
import { D, devicesFor, isPhysical } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { timeOption, PALETTE } from '../../charts'
import { devName, fmtNum, fmtUptime } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false)
const series = ref(null)
const mode = computed(() => props.config.mode || 'current')
const chartH = computed(() => Math.max(120, props.size.h - 40))
const crit = computed(() => +(props.config.crit ?? 1))

const n = (v) => +v || 0
const terms = computed(() => String(props.config.filter || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean))
const ports = computed(() => all.value.filter((p) => {
  const d = devById.value[p.device_id]
  if (!d || +p.deleted || +p.disabled || +p.ignore) return false
  if (props.config.device && d.hostname !== props.config.device) return false
  return !terms.value.length || terms.value.some((t) => `${p.ifName} ${p.ifAlias}`.toLowerCase().includes(t))
}).map((p) => {
  const period = n(p.poll_period) || 300
  const errs = n(p.ifInErrors_delta) + n(p.ifOutErrors_delta)
  const pkts = n(p.ifInUcastPkts_delta) + n(p.ifOutUcastPkts_delta)
  const ratio = errs > 0 ? (pkts > 0 ? (errs / (pkts + errs)) * 100 : null) : 0
  // interfaces virtuelles (bridges Docker, veth, loopback) souvent « down » sans que ce soit une panne
  const down = p.ifAdminStatus === 'up' && p.ifOperStatus !== 'up' && (terms.value.length > 0 || isPhysical(p))
  const st = errs > 0 ? (ratio === null || ratio >= crit.value ? 'crit' : 'warn') : down ? 'down' : 'ok'
  const dev = devById.value[p.device_id]
  const since = down && dev?.uptime && p.ifLastChange ? `depuis ${fmtUptime(Math.max(0, dev.uptime - n(p.ifLastChange) / 100))}` : ''
  return { ...p, errs, ratio, st, since, inRate: n(p.ifInErrors_delta) / period, outRate: n(p.ifOutErrors_delta) / period, total: n(p.ifInErrors) + n(p.ifOutErrors) }
}))
const errPorts = computed(() => ports.value.filter((p) => p.errs > 0).sort((a, b) => (b.ratio ?? 101) - (a.ratio ?? 101) || b.errs - a.errs))
const counts = computed(() => ({
  err: errPorts.value.length,
  cum: ports.value.filter((p) => p.total > 0).length,
  down: ports.value.filter((p) => p.st === 'down').length,
}))
const filtered = computed(() => {
  const downs = props.config.down ? ports.value.filter((p) => p.st === 'down').sort((a, b) => devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id]))) : []
  const main = mode.value === 'total' ? ports.value.filter((p) => p.total > 0).sort((a, b) => b.total - a.total) : errPorts.value
  const seen = new Set(main.map((p) => p.port_id))
  return [...main, ...downs.filter((p) => !seen.has(p.port_id))]
})
const list = computed(() => filtered.value.slice(0, props.config.limit || 10))
const more = computed(() => (mode.value === 'history' ? 0 : filtered.value.length - list.value.length))

const fmtRate = (v) => (v <= 0 ? '0' : v < 1 ? `${(v * 60).toFixed(1).replace('.', ',')}/min` : `${v.toFixed(1).replace('.', ',')}/s`)
const fmtPct = (v) => `${v < 0.1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)} %`.replace('.', ',')

const histOpt = computed(() => {
  const o = timeOption(series.value, { unit: 'ps', zoom: false })
  if (o.legend) Object.assign(o.legend, { type: 'scroll', right: 0, pageIconColor: '#22d3ee', pageTextStyle: { color: '#8b97ad' } })
  return o
})
async function loadHistory() {
  if (mode.value !== 'history' || !session.rrd) return
  const sel = errPorts.value.slice(0, 8)
  if (!sel.length) { series.value = []; return }
  const items = sel.map((p) => ({ host: devById.value[p.device_id].hostname, name: `port-id${p.port_id}.rrd`, ds: 'INERRORS,OUTERRORS', start: props.config.range || '-1d', rows: 240 }))
  const res = (await rrd.batch(items).catch(() => ({ results: [] }))).results
  series.value = sel.map((p, i) => {
    const d = res[i]
    if (!d || d.error || !d.series) return null
    const a = d.series.INERRORS || []; const b = d.series.OUTERRORS || []
    return { name: `${devName(devById.value[p.device_id])} · ${p.ifName}`, color: PALETTE[i % PALETTE.length], area: false,
      data: d.timestamps.map((t, j) => [t * 1000, a[j] == null && b[j] == null ? null : n(a[j]) + n(b[j])]) }
  }).filter(Boolean)
}

useLoader(async () => {
  const [p, d] = await Promise.all([D.ports(), devicesFor(props.config)])
  all.value = p
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
  await loadHistory()
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.perr { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--panel-2); border-left: 3px solid #64748b; color: var(--text); min-width: 0; }
.perr:hover { text-decoration: none; filter: brightness(1.1); }
.perr.crit { border-left-color: var(--red); } .perr.warn, .perr.down { border-left-color: var(--orange); }
.ratio { font-variant-numeric: tabular-nums; }
.ratio.crit { color: var(--red); } .ratio.warn { color: var(--orange); }
</style>
