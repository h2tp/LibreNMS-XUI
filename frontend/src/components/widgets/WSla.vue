<template>
  <div v-if="error" class="err small">{{ error }}</div>
  <div v-else-if="!loaded" class="col" style="gap:10px"><div v-for="i in 4" :key="i" class="skeleton" style="height:34px"></div></div>
  <div v-else-if="!rows.length" class="empty small"><ShieldCheck /><div>Aucune donnée de disponibilité</div></div>
  <div v-else class="col" style="gap:12px">
    <div class="summary">
      <div class="big" :class="cls(fleet)">{{ fmtPct(fleet) }}</div>
      <div class="small muted">
        disponibilité moyenne sur {{ PERIODS[period] }}<br />
        <b :style="{ color: below ? 'var(--red)' : 'var(--green)' }">{{ below }}</b> / {{ rows.length }} sous l'objectif de {{ String(target).replace('.', ',') }} %
        <template v-if="ongoing"> · <b style="color:var(--red)">{{ ongoing }}</b> coupure(s) en cours</template>
      </div>
    </div>

    <table v-if="mode === 'table'" class="sla">
      <thead><tr><th>Équipement</th><th v-for="(l, p) in PERIODS" :key="p" :class="{ cur: p === period }">{{ l }}</th><th title="Coupures sur la période de référence">Coup.</th></tr></thead>
      <tbody>
        <tr v-for="r in list" :key="r.device_id" @click="go(r)">
          <td class="dev"><div class="devin"><span class="dot" :class="r.ongoing ? 'down' : 'up'"></span><span class="ellipsis">{{ r.name }}</span></div></td>
          <td v-for="(l, p) in PERIODS" :key="p" :class="[cls(r.perc[p]), { cur: p === period }]">{{ fmtPct(r.perc[p]) }}</td>
          <td class="muted" :title="r.stats[period]?.down ? `Indisponible ${fmtUptime(r.stats[period].down)}` : ''">{{ r.stats[period]?.count || '—' }}</td>
        </tr>
      </tbody>
    </table>

    <div v-else class="col" style="gap:6px">
      <div v-if="!outages.length" class="empty small"><ShieldCheck color="var(--green)" style="opacity:1" /><div>Aucune coupure sur {{ PERIODS[period] }}</div></div>
      <router-link v-for="(o, i) in outages" :key="i" :to="`/device/${encodeURIComponent(o.hostname)}/availability`" class="out" :class="{ live: !o.end }">
        <span class="dot" :class="o.end ? 'warning' : 'down'"></span>
        <b class="ellipsis" style="min-width:0">{{ o.name }}</b>
        <span class="grow"></span>
        <span class="small muted nowrap mono">{{ fmtDate(o.start * 1000) }}</span>
        <span class="small nowrap dur">{{ o.end ? fmtUptime(o.end - o.start) : 'en cours · ' + fmtUptime(nowS - o.start) }}</span>
      </router-link>
    </div>

    <div v-if="more" class="small muted" style="text-align:center">+ {{ more }} autre(s)</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ShieldCheck } from 'lucide-vue-next'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, fmtDate, fmtUptime } from '../../utils'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const all = ref([]); const devById = ref({}); const loaded = ref(false); const error = ref(null)
const PERIODS = { 86400: '24 h', 604800: '7 j', 2592000: '30 j', 31536000: '1 an' }
const mode = computed(() => props.config.mode || 'table')
const period = computed(() => String(props.config.period || '604800'))
const target = computed(() => +(props.config.target ?? 99.9))
const nowS = computed(() => Math.floor(Date.now() / 1000))

function cls(v) {
  if (v == null) return 'na'
  if (v >= target.value) return 'ok'
  return v >= target.value - (100 - target.value) * 9 - 0.5 ? 'warn' : 'crit'
}
function fmtPct(v) {
  if (v == null) return '—'
  if (v >= 100) return '100 %'
  // arrondi par défaut : 99,998 % ne doit pas s'afficher « 100 % »
  const d = v >= 99 ? 2 : 1
  return `${(Math.floor(v * 10 ** d) / 10 ** d).toFixed(d)} %`.replace('.', ',')
}

const rows = computed(() => all.value
  .filter((a) => devById.value[a.device_id] && (!props.config.device || a.hostname === props.config.device))
  .map((a) => ({ ...a, name: devName(devById.value[a.device_id]), cur: a.perc[period.value] })))
const fleet = computed(() => {
  const v = rows.value.map((r) => r.cur).filter((x) => x != null)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
})
const below = computed(() => rows.value.filter((r) => r.cur != null && r.cur < target.value).length)
const ongoing = computed(() => rows.value.filter((r) => r.ongoing).length)
const filtered = computed(() => {
  let l = rows.value
  if (props.config.onlyBelow) l = l.filter((r) => r.cur != null && r.cur < target.value)
  return [...l].sort(props.config.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (a.cur ?? 101) - (b.cur ?? 101) || a.name.localeCompare(b.name))
})
const outagesAll = computed(() => {
  const since = nowS.value - +period.value
  return rows.value.flatMap((r) => r.recent.filter((o) => (o.end || nowS.value) > since).map((o) => ({ ...o, name: r.name, hostname: r.hostname })))
    .sort((a, b) => (!a.end) - (!b.end) ? (!b.end) - (!a.end) : b.start - a.start)
})
const limit = computed(() => props.config.limit || 15)
const list = computed(() => filtered.value.slice(0, limit.value))
const outages = computed(() => outagesAll.value.slice(0, limit.value))
const more = computed(() => (mode.value === 'table' ? filtered.value.length : outagesAll.value.length) - limit.value)
function go(r) { router.push(`/device/${encodeURIComponent(r.hostname)}/availability`) }

useLoader(async () => {
  try {
    const [a, d] = await Promise.all([D.availability(), devicesFor(props.config)])
    all.value = a
    devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
    error.value = null
  } catch (e) { error.value = e.message } finally { loaded.value = true }
})
</script>

<style scoped>
.summary { display: flex; align-items: center; gap: 14px; }
.big { font-size: 30px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.big.ok { color: var(--green); } .big.warn { color: var(--orange); } .big.crit { color: var(--red); }
.sla { width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; table-layout: fixed; }
.sla th { text-align: right; font-weight: 500; color: var(--muted); font-size: 11.5px; padding: 4px 6px; border-bottom: 1px solid var(--border); }
.sla th:first-child { text-align: left; width: 34%; }
.sla th:last-child { width: 46px; }
.sla td { text-align: right; padding: 6px; border-bottom: 1px solid var(--border); }
.sla tr { cursor: pointer; transition: background .15s; }
.sla tbody tr:hover { background: var(--panel-2); }
.sla td.dev { text-align: left; font-weight: 600; }
.devin { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sla .cur { font-weight: 700; }
.sla th.cur { color: var(--text); }
.sla td.ok { color: var(--green); } .sla td.warn { color: var(--orange); } .sla td.crit { color: var(--red); } .sla td.na { color: var(--muted); }
.out { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--panel-2); border-left: 3px solid var(--orange); color: var(--text); min-width: 0; }
.out:hover { text-decoration: none; filter: brightness(1.1); }
.out.live { border-left-color: var(--red); }
.out.live .dur { color: var(--red); font-weight: 600; }
.dur { min-width: 90px; text-align: right; }
</style>
