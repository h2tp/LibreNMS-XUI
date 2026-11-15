<template>
  <div v-if="error" class="err small">{{ error }}</div>
  <div v-else-if="!loaded" class="col" style="gap:10px"><div v-for="i in 4" :key="i" class="skeleton" style="height:38px"></div></div>
  <div v-else-if="!list.length" class="empty small"><Cpu /><div>{{ rows.length ? t('Aucun équipement ne correspond aux filtres') : t('Aucune donnée processeur remontée') }}</div></div>

  <template v-else-if="mode === 'history'">
    <div v-if="!session.rrd" class="empty small">{{ t('L\'historique nécessite l\'accès aux fichiers RRD.') }}</div>
    <div v-else-if="!histOpt" class="skeleton" :style="{ height: `${size.h}px` }"></div>
    <EChart v-else :option="histOpt" :height="`${Math.max(120, size.h)}px`" />
  </template>

  <div v-else class="col" style="gap:12px">
    <div class="summary small">
      <span>{{ t('Moyenne du parc') }} <b>{{ total.avg }} %</b> · {{ t('{c} cœurs sur {n} équipement(s)', { c: total.cores, n: total.n }) }}</span>
      <span v-if="total.crit" class="badge critical">{{ total.crit }} critique(s)</span>
      <span v-if="total.warn" class="badge warning">{{ t('{n} à surveiller', { n: total.warn }) }}</span>
    </div>

    <div v-if="mode === 'list'" class="col" style="gap:6px">
      <router-link v-for="r in list" :key="r.device_id" :to="link(r)" class="cpu" :title="tip(r)">
        <div class="row" style="gap:8px;min-width:0">
          <Cpu :size="15" class="faint" style="flex:none" />
          <b class="ellipsis">{{ r.name }}</b>
          <span class="muted small nowrap">{{ r.cores > 1 ? t('{n} cœurs', { n: r.cores }) : t('{n} cœur', { n: r.cores }) }}</span>
          <span class="grow"></span>
          <span v-if="r.cores > 1" class="small nowrap muted">max {{ r.max }} %</span>
          <b class="pct nowrap" :class="r.st">{{ r.avg }} %</b>
        </div>
        <div class="bar"><i :style="{ width: Math.max(1, r.avg) + '%', background: COL[r.st] }"></i></div>
        <div v-if="r.cores > 1" class="cores">
          <i v-for="(c, k) in r.usages.slice(0, 128)" :key="k" :style="{ background: heat(c) }" :title="t('Cœur {k} : {v} %', { k: k + 1, v: c })"></i>
        </div>
      </router-link>
    </div>

    <div v-else class="rings">
      <router-link v-for="r in list" :key="r.device_id" :to="link(r)" class="rcard" :title="tip(r)">
        <Ring :value="r.avg" :size="86" :stroke="9" :colors="RING[r.st]" />
        <b class="ellipsis" style="max-width:100%">{{ r.name }}</b>
        <span class="small muted nowrap">{{ r.cores > 1 ? t('{n} cœurs', { n: r.cores }) : t('{n} cœur', { n: r.cores }) }}<template v-if="r.cores > 1"> · max {{ r.max }} %</template></span>
      </router-link>
    </div>

    <div v-if="more" class="small muted" style="text-align:center">{{ t('+ {n} autre(s) équipement(s)', { n: more }) }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Cpu } from 'lucide-vue-next'
import Ring from '../Ring.vue'
import EChart from '../EChart.vue'
import { session, rrd } from '../../api'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { timeOption, PALETTE } from '../../charts'
import { devName } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false); const error = ref(null)
const mode = computed(() => props.config.mode || 'list')
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const RING = { ok: ['#22c55e', '#4ade80'], warn: ['#fb923c', '#fdba74'], crit: ['#f43f5e', '#fb7185'] }
function heat(v) {
  if (v >= 90) return '#f43f5e'
  if (v >= 75) return '#fb923c'
  if (v >= 50) return '#facc15'
  if (v >= 20) return '#22c55e'
  return 'color-mix(in srgb, #22c55e 35%, var(--panel-2))'
}

const rows = computed(() => {
  const warn = +props.config.warn || 75; const crit = +props.config.crit || 90
  const byDev = {}
  for (const p of all.value) if (devById.value[p.device_id] && p.usage != null) (byDev[p.device_id] ||= []).push(p)
  return Object.entries(byDev)
    .filter(([id]) => !props.config.device || devById.value[id].hostname === props.config.device)
    .map(([id, procs]) => {
      const usages = procs.map((p) => Math.round(+p.usage))
      const avg = Math.round(usages.reduce((s, v) => s + v, 0) / usages.length)
      const max = Math.max(...usages)
      const d = devById.value[id]
      return { device_id: +id, hostname: d.hostname, name: devName(d), procs, usages, cores: usages.length, avg, max, st: avg >= crit ? 'crit' : avg >= warn ? 'warn' : 'ok' }
    })
})
const filtered = computed(() => {
  let l = rows.value
  if (props.config.onlyAlarm) l = l.filter((r) => r.st !== 'ok')
  const by = {
    avg: (a, b) => b.avg - a.avg || b.max - a.max,
    max: (a, b) => b.max - a.max || b.avg - a.avg,
    cores: (a, b) => b.cores - a.cores,
    name: (a, b) => a.name.localeCompare(b.name),
  }[props.config.sort || 'avg']
  return [...l].sort(by)
})
const list = computed(() => filtered.value.slice(0, props.config.limit || 15))
const more = computed(() => filtered.value.length - list.value.length)
const total = computed(() => {
  const cores = rows.value.reduce((s, r) => s + r.cores, 0)
  const sum = rows.value.reduce((s, r) => s + r.usages.reduce((a, b) => a + b, 0), 0)
  return {
    n: rows.value.length, cores, avg: cores ? Math.round(sum / cores) : 0,
    warn: rows.value.filter((r) => r.st === 'warn').length, crit: rows.value.filter((r) => r.st === 'crit').length,
  }
})
const link = (r) => `/device/${encodeURIComponent(r.hostname)}/health`
const tip = (r) => `${r.name}\n${r.procs[0]?.descr || ''}\n${t('Moyenne : {a} % · cœur le plus chargé : {m} %', { a: r.avg, m: r.max })}\n${t('{n} cœur(s)', { n: r.cores })}`

// Historique : charge moyenne (tous cœurs) par équipement, 8 équipements au plus
const hist = ref(null)
const histOpt = computed(() => {
  if (!hist.value) return null
  const o = timeOption(hist.value, { unit: 'pct', zoom: false, min: 0, max: 100 })
  if (o.legend) Object.assign(o.legend, { type: 'scroll', right: 0, pageIconColor: '#22d3ee', pageTextStyle: { color: '#8b97ad' } })
  return o
})
async function loadHistory() {
  if (mode.value !== 'history' || !session.rrd) return
  const sel = list.value.slice(0, 8)
  const items = []; const owner = []
  sel.forEach((r, i) => r.procs.slice(0, 64).forEach((p) => {
    items.push({ host: r.hostname, name: `processor-${p.type}-${p.index}.rrd`, ds: 'usage', start: props.config.range || '-1d', rows: 200 })
    owner.push(i)
  }))
  const res = (await rrd.batch(items).catch(() => ({ results: [] }))).results
  hist.value = sel.map((r, i) => {
    let ts = null; const sums = []; const counts = []
    res.forEach((d, k) => {
      if (owner[k] !== i || !d || d.error || !d.series) return
      const s = d.series.usage || Object.values(d.series)[0]
      if (!ts) ts = d.timestamps
      s.forEach((v, j) => { if (v !== null && j < ts.length) { sums[j] = (sums[j] || 0) + v; counts[j] = (counts[j] || 0) + 1 } })
    })
    if (!ts) return null
    return { name: r.name, color: PALETTE[i % PALETTE.length], area: false, data: ts.map((t, j) => [t * 1000, counts[j] ? sums[j] / counts[j] : null]) }
  }).filter(Boolean)
}

useLoader(async () => {
  try {
    const [c, d] = await Promise.all([D.cpu(), devicesFor(props.config)])
    all.value = c
    devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
    error.value = null
  } catch (e) { error.value = e.message } finally { loaded.value = true }
  await loadHistory()
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; color: var(--muted); }
.summary b { color: var(--text); }
.cpu { display: flex; flex-direction: column; gap: 6px; padding: 7px 8px; border-radius: 10px; color: var(--text); min-width: 0; transition: background .2s; }
.cpu:hover { background: var(--panel-2); text-decoration: none; }
.pct { min-width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
.pct.warn { color: var(--orange); }
.pct.crit { color: var(--red); }
.cores { display: flex; flex-wrap: wrap; gap: 2px; }
.cores i { width: 9px; height: 9px; border-radius: 2px; display: block; }
.rings { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.rcard { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); min-width: 0; text-align: center; transition: transform .15s; }
.rcard:hover { text-decoration: none; transform: translateY(-1px); }
</style>
