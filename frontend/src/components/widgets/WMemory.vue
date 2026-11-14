<template>
  <div v-if="error" class="err small">{{ error }}</div>
  <div v-else-if="!loaded" class="col" style="gap:10px"><div v-for="i in 4" :key="i" class="skeleton" style="height:38px"></div></div>
  <div v-else-if="!list.length" class="empty small"><MemoryStick /><div>{{ rows.length ? 'Aucun équipement ne correspond aux filtres' : 'Aucune donnée mémoire remontée' }}</div></div>
  <div v-else class="col" style="gap:12px">
    <div class="summary small">
      <span><b>{{ fmtBytes(total.used) }}</b> utilisés sur <b>{{ fmtBytes(total.size) }}</b> · {{ total.n }} équipement(s)</span>
      <span v-if="total.crit" class="badge critical">{{ total.crit }} critique(s)</span>
      <span v-if="total.warn" class="badge warning">{{ total.warn }} à surveiller</span>
    </div>

    <div v-if="mode === 'list'" class="col" style="gap:6px">
      <router-link v-for="r in list" :key="r.key" :to="link(r)" class="mem" :title="tip(r)">
        <div class="row" style="gap:8px;min-width:0">
          <MemoryStick :size="15" class="faint" style="flex:none" />
          <b class="ellipsis">{{ r.name }}</b>
          <span v-if="r.sub" class="muted small ellipsis">{{ r.sub }}</span>
          <span class="grow"></span>
          <span class="small nowrap muted">{{ fmtBytes(r.used) }} / {{ fmtBytes(r.total) }}</span>
          <b class="pct nowrap" :class="r.st">{{ r.perc }} %</b>
        </div>
        <div class="bar stack">
          <i :style="{ width: Math.max(1, r.perc) + '%', background: COL[r.st] }"></i>
          <i v-if="r.cachePct" class="cache" :style="{ width: r.cachePct + '%' }"></i>
        </div>
        <div v-if="(config.swap !== false && r.swap) || r.cache" class="small muted swap">
          <template v-if="config.swap !== false && r.swap">Swap {{ r.swap.perc }} % <span class="faint">({{ fmtBytes(r.swap.used) }} / {{ fmtBytes(r.swap.total) }})</span></template>
          <span v-if="r.cache" class="faint"><template v-if="config.swap !== false && r.swap"> · </template>cache et tampons {{ fmtBytes(r.cache) }}</span>
        </div>
      </router-link>
    </div>

    <div v-else class="rings">
      <router-link v-for="r in list" :key="r.key" :to="link(r)" class="rcard" :title="tip(r)">
        <Ring :value="r.perc" :size="86" :stroke="9" :colors="RING[r.st]" />
        <b class="ellipsis" style="max-width:100%">{{ r.name }}</b>
        <span v-if="r.sub" class="muted small ellipsis" style="max-width:100%">{{ r.sub }}</span>
        <span class="small muted nowrap">{{ fmtBytes(r.used) }} / {{ fmtBytes(r.total) }}</span>
        <span v-if="config.swap !== false && r.swap" class="small faint nowrap">swap {{ r.swap.perc }} %</span>
      </router-link>
    </div>

    <div class="legend small muted">
      <span><i :style="{ background: 'var(--green)' }"></i>utilisée</span>
      <span v-if="mode === 'list'"><i class="cache"></i>cache et tampons (récupérable)</span>
      <span v-if="more" style="margin-left:auto">+ {{ more }} autre(s)</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { MemoryStick } from 'lucide-vue-next'
import Ring from '../Ring.vue'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, fmtBytes } from '../../utils'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false); const error = ref(null)
const mode = computed(() => props.config.mode || 'list')
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const RING = { ok: ['#22c55e', '#4ade80'], warn: ['#fb923c', '#fdba74'], crit: ['#f43f5e', '#fb7185'] }
const AUX = ['virtual', 'buffers', 'cached', 'shared', 'swap']

// Une ligne par pool de mémoire « système » (en général une seule par équipement).
const rows = computed(() => {
  const warn = +props.config.warn || 80; const crit = +props.config.crit || 90
  const byDev = {}
  for (const p of all.value) if (devById.value[p.device_id] && +p.total > 0) (byDev[p.device_id] ||= []).push(p)
  const out = []
  for (const [id, pools] of Object.entries(byDev)) {
    const d = devById.value[id]
    if (props.config.device && d.hostname !== props.config.device) continue
    let sys = pools.filter((p) => p.cls === 'system')
    if (!sys.length) sys = pools.filter((p) => !AUX.includes(p.cls))
    // pools identiques (ex. « Local » et « Global » sur certains switchs) : un seul suffit
    sys = sys.filter((p, i) => sys.findIndex((q) => +q.used === +p.used && +q.total === +p.total) === i)
    const swapP = pools.find((p) => p.cls === 'swap')
    const cache = pools.filter((p) => p.cls === 'buffers' || p.cls === 'cached').reduce((s, p) => s + (+p.used || 0), 0)
    for (const p of sys) {
      const perc = p.perc != null ? Math.round(+p.perc) : Math.round((+p.used / +p.total) * 100)
      const single = sys.length === 1
      const cachePct = single && cache && +p.used + cache <= +p.total ? Math.round((cache / +p.total) * 100) : 0
      out.push({
        key: `${id}:${p.mempool_id}`, device_id: +id, hostname: d.hostname,
        name: devName(d), sub: single ? '' : p.descr,
        used: +p.used, total: +p.total, perc, st: perc >= crit ? 'crit' : perc >= warn ? 'warn' : 'ok',
        cache: single ? cache : 0, cachePct,
        swap: single && swapP ? { perc: Math.round(+swapP.perc || 0), used: +swapP.used, total: +swapP.total } : null,
      })
    }
  }
  return out
})
const filtered = computed(() => {
  let l = rows.value
  if (props.config.onlyAlarm) l = l.filter((r) => r.st !== 'ok')
  const by = {
    perc: (a, b) => b.perc - a.perc,
    total: (a, b) => b.total - a.total,
    name: (a, b) => a.name.localeCompare(b.name) || String(a.sub).localeCompare(String(b.sub)),
  }[props.config.sort || 'perc']
  return [...l].sort(by)
})
const list = computed(() => filtered.value.slice(0, props.config.limit || 15))
const more = computed(() => filtered.value.length - list.value.length)
const total = computed(() => ({
  n: new Set(rows.value.map((r) => r.device_id)).size,
  used: rows.value.reduce((s, r) => s + r.used, 0),
  size: rows.value.reduce((s, r) => s + r.total, 0),
  warn: rows.value.filter((r) => r.st === 'warn').length,
  crit: rows.value.filter((r) => r.st === 'crit').length,
}))
const link = (r) => `/device/${encodeURIComponent(r.hostname)}/health`
const tip = (r) => [
  `${r.name}${r.sub ? ' · ' + r.sub : ''}`,
  `Utilisée : ${fmtBytes(r.used)} (${r.perc} %) sur ${fmtBytes(r.total)}`,
  r.cache ? `Cache et tampons : ${fmtBytes(r.cache)}` : '',
  r.swap ? `Swap : ${fmtBytes(r.swap.used)} / ${fmtBytes(r.swap.total)} (${r.swap.perc} %)` : '',
].filter(Boolean).join('\n')

useLoader(async () => {
  try {
    const [m, d] = await Promise.all([D.memory(), devicesFor(props.config)])
    all.value = m
    devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
    error.value = null
  } catch (e) { error.value = e.message } finally { loaded.value = true }
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; color: var(--muted); }
.summary b { color: var(--text); }
.mem { display: flex; flex-direction: column; gap: 6px; padding: 7px 8px; border-radius: 10px; color: var(--text); min-width: 0; transition: background .2s; }
.mem:hover { background: var(--panel-2); text-decoration: none; }
.pct { min-width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
.pct.warn { color: var(--orange); }
.pct.crit { color: var(--red); }
.bar.stack { display: flex; }
.bar.stack i { border-radius: 0; }
.bar.stack i:first-child { border-radius: 4px 0 0 4px; }
i.cache { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 45%, transparent) 0 4px, color-mix(in srgb, var(--accent) 22%, transparent) 4px 8px); }
.swap { margin-top: -2px; font-size: 11.5px; }
.legend { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 11.5px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.rings { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.rcard { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); min-width: 0; text-align: center; transition: transform .15s; }
.rcard:hover { text-decoration: none; transform: translateY(-1px); }
</style>
