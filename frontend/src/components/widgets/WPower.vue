<template>
  <div v-if="loaded && !states.length && !poe.length && !measures.length" class="empty small">
    <Plug /><div>Aucun capteur d'alimentation{{ config.device || config.group ? ' pour ce filtre' : '' }}</div>
  </div>
  <div v-else class="col" style="gap:14px">
    <div v-if="states.length || poe.length" class="summary small">
      <span v-if="cnt.ok" class="badge ok">{{ cnt.ok }} alimentation(s) OK</span>
      <span v-if="cnt.bad" class="badge critical">{{ cnt.bad }} en défaut</span>
      <span v-if="cnt.unk" class="badge">{{ cnt.unk }} état(s) inconnu(s)</span>
      <span v-if="poeTotal.budget" class="muted">PoE {{ fmtW(poeTotal.used) }} / {{ fmtW(poeTotal.budget) }}</span>
    </div>

    <div v-if="states.length" class="psus">
      <router-link v-for="s in states" :key="s.sensor_id" :to="link(s)" class="psu" :class="s.st" :title="`${devName(devById[s.device_id])} · ${s.sensor_descr}\nValeur brute : ${s.sensor_current} (${s.sensor_type})`">
        <component :is="s.st === 'ok' ? PlugZap : Unplug" :size="22" class="ico" />
        <div style="min-width:0">
          <div class="ellipsis small muted">{{ devName(devById[s.device_id]) }}</div>
          <div class="ellipsis descr">{{ s.sensor_descr }}</div>
          <div class="lbl">{{ s.label }}</div>
        </div>
      </router-link>
    </div>

    <div v-if="poe.length" class="col" style="gap:8px">
      <router-link v-for="b in poe" :key="b.key" :to="link(b)" class="poe" :title="`${b.usedDescr} : ${fmtW(b.used)}\n${b.totalDescr} : ${fmtW(b.total)}`">
        <div class="row" style="gap:8px;min-width:0">
          <Zap :size="15" class="faint" style="flex:none" />
          <b class="ellipsis">Budget PoE</b><span class="muted small ellipsis grow">{{ devName(devById[b.device_id]) }}</span>
          <span class="small nowrap muted">{{ fmtW(b.used) }} / {{ fmtW(b.total) }}</span>
          <b class="nowrap pct" :class="b.st">{{ b.pct }} %</b>
        </div>
        <div class="bar"><i :style="{ width: Math.max(1, b.pct) + '%', background: COL[b.st] }"></i></div>
      </router-link>
    </div>

    <div v-if="measures.length" class="tiles">
      <router-link v-for="s in measures" :key="s.sensor_id" :to="link(s)" class="tile" :class="s.st" :title="tip(s)">
        <div class="row" style="gap:6px;min-width:0">
          <span class="dot" :class="s.st === 'ok' ? 'up' : s.st === 'warn' ? 'warning' : 'down'"></span>
          <span class="ellipsis small muted grow">{{ devName(devById[s.device_id]) }}</span>
        </div>
        <div class="ellipsis descr">{{ s.sensor_descr }}</div>
        <div class="v">{{ fmt(s.sensor_current) }}<small>{{ unit(s) }}</small></div>
        <div v-if="s.gauge !== null" class="gauge"><i :style="{ width: s.gauge + '%' }"></i></div>
        <div v-if="s.sensor_limit != null || s.sensor_limit_low != null" class="lim">
          <span>{{ s.sensor_limit_low != null ? fmt(s.sensor_limit_low) : '' }}</span><span>{{ s.sensor_limit != null ? fmt(s.sensor_limit) + ' ' + unit(s) : '' }}</span>
        </div>
      </router-link>
    </div>
    <div v-if="more" class="small muted" style="text-align:center">+ {{ more }} autre(s) mesure(s)</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plug, PlugZap, Unplug, Zap } from 'lucide-vue-next'
import { D, devicesFor } from '../../dashboard/data'
import { interpretState } from '../../dashboard/states'
import { POWER_CLASSES } from '../../dashboard/widgets'
import { useLoader } from '../../refresh'
import { sensorUnit } from '../../rrdmeta'
import { devName } from '../../utils'
import { locale } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false)
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const num = (v) => (v === null || v === undefined || v === '' ? null : +v)
const isPsuState = (s) => s.sensor_class === 'state' && /pow(er)?|psu|supply|alim|\bups\b|batt|output\s*source/i.test(`${s.sensor_descr} ${s.sensor_type}`)
const isPoe = (s) => s.sensor_class === 'power' && /poe/i.test(s.sensor_descr || '')

const mine = computed(() => all.value.filter((s) => !+s.sensor_deleted && devById.value[s.device_id]
  && (!props.config.device || devById.value[s.device_id].hostname === props.config.device)))

const states = computed(() => {
  const rank = { crit: 0, warn: 1, unk: 2, ok: 3 }
  return mine.value.filter(isPsuState)
    .map((s) => { const [label, st] = interpretState(s, props.config.okValue); return { ...s, label, st } })
    .filter((s) => !props.config.onlyAlarm || s.st !== 'ok')
    .sort((a, b) => rank[a.st] - rank[b.st] || devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id])))
})
const cnt = computed(() => ({
  ok: states.value.filter((s) => s.st === 'ok').length,
  bad: states.value.filter((s) => s.st === 'crit' || s.st === 'warn').length,
  unk: states.value.filter((s) => s.st === 'unk').length,
}))

// Budget PoE : paire « total / budget » + « utilisé » sur un même équipement
const poe = computed(() => {
  const byDev = {}
  for (const s of mine.value.filter(isPoe)) (byDev[s.device_id] ||= []).push(s)
  return Object.entries(byDev).map(([id, l]) => {
    const total = l.find((s) => /total|budget|avail|max|alloc/i.test(s.sensor_descr))
    const used = l.find((s) => /used|consum|draw|actual/i.test(s.sensor_descr))
    if (!total || !used || !+total.sensor_current) return null
    const pct = Math.round((+used.sensor_current / +total.sensor_current) * 100)
    return { key: id, device_id: +id, used: +used.sensor_current, total: +total.sensor_current, usedDescr: used.sensor_descr, totalDescr: total.sensor_descr,
      ids: [total.sensor_id, used.sensor_id], pct, st: pct >= 90 ? 'crit' : pct >= 75 ? 'warn' : 'ok' }
  }).filter(Boolean).filter((b) => !props.config.onlyAlarm || b.st !== 'ok')
})
const poeIds = computed(() => new Set(poe.value.flatMap((b) => b.ids)))
const poeTotal = computed(() => ({ used: poe.value.reduce((a, b) => a + b.used, 0), budget: poe.value.reduce((a, b) => a + b.total, 0) }))

function level(s) {
  const v = num(s.sensor_current); const hi = num(s.sensor_limit); const lo = num(s.sensor_limit_low)
  if (v === null) return 'ok'
  if ((hi !== null && v >= hi) || (lo !== null && v <= lo)) return 'crit'
  const hw = num(s.sensor_limit_warn); const lw = num(s.sensor_limit_low_warn)
  if ((hw !== null && v >= hw) || (lw !== null && v <= lw)) return 'warn'
  return 'ok'
}
function gauge(s) {
  const v = num(s.sensor_current); const hi = num(s.sensor_limit)
  if (v === null || hi === null) return null
  const lo = Math.min(num(s.sensor_limit_low) ?? 0, v)
  return hi > lo ? Math.max(2, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : null
}
const classes = computed(() => (props.config.classes?.length ? props.config.classes : POWER_CLASSES.map((x) => x.v)))
const allMeasures = computed(() => {
  const rank = { crit: 0, warn: 1, ok: 2 }
  return mine.value.filter((s) => classes.value.includes(s.sensor_class) && !poeIds.value.has(s.sensor_id))
    .map((s) => ({ ...s, st: level(s), gauge: gauge(s) }))
    .filter((s) => !props.config.onlyAlarm || s.st !== 'ok')
    .sort((a, b) => rank[a.st] - rank[b.st] || classes.value.indexOf(a.sensor_class) - classes.value.indexOf(b.sensor_class)
      || devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id])))
})
const measures = computed(() => allMeasures.value.slice(0, props.config.limit || 24))
const more = computed(() => allMeasures.value.length - measures.value.length)

const unit = (s) => sensorUnit(s.sensor_class)
const fmt = (v) => (v === null || v === undefined ? '—' : (Math.round(+v * 100) / 100).toLocaleString(locale))
const fmtW = (v) => `${(Math.round(v * 10) / 10).toLocaleString(locale)} W`
const tip = (s) => `${devName(devById.value[s.device_id])} · ${s.sensor_descr}\nValeur : ${fmt(s.sensor_current)} ${unit(s)}${s.sensor_limit != null ? `\nSeuil haut : ${fmt(s.sensor_limit)} ${unit(s)}` : ''}${s.sensor_limit_low != null ? `\nSeuil bas : ${fmt(s.sensor_limit_low)} ${unit(s)}` : ''}`
const link = (s) => `/device/${encodeURIComponent(devById.value[s.device_id]?.hostname || '')}/health`

useLoader(async () => {
  const [s, d] = await Promise.all([D.sensors(), devicesFor(props.config)])
  all.value = s
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.psus { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.psu { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); border-left: 3px solid var(--green); color: var(--text); min-width: 0; }
.psu:hover { text-decoration: none; filter: brightness(1.1); }
.psu .ico { flex: none; color: var(--green); }
.psu .lbl { font-size: 14px; font-weight: 700; color: var(--green); }
.psu.warn { border-left-color: var(--orange); } .psu.warn .ico, .psu.warn .lbl { color: var(--orange); }
.psu.crit { border-left-color: var(--red); background: color-mix(in srgb, var(--red) 10%, var(--panel-2)); } .psu.crit .ico, .psu.crit .lbl { color: var(--red); }
.psu.unk { border-left-color: #64748b; } .psu.unk .ico { color: #64748b; } .psu.unk .lbl { color: var(--muted); }
.descr { font-size: 12.5px; font-weight: 500; }
.poe { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; border-radius: 10px; color: var(--text); }
.poe:hover { background: var(--panel-2); text-decoration: none; }
.pct { min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
.pct.warn { color: var(--orange); } .pct.crit { color: var(--red); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.tile { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); color: var(--text); min-width: 0; }
.tile:hover { text-decoration: none; filter: brightness(1.1); }
.tile.warn { border-top-color: var(--orange); } .tile.crit { border-top-color: var(--red); }
.v { font-size: 22px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 3px; }
.v small { font-size: 13px; font-weight: 500; color: var(--muted); }
.tile.warn .v { color: var(--orange); } .tile.crit .v { color: var(--red); }
.gauge { height: 5px; border-radius: 4px; background: var(--border); overflow: hidden; }
.gauge i { display: block; height: 100%; border-radius: 4px; background: var(--green); }
.tile.warn .gauge i { background: var(--orange); } .tile.crit .gauge i { background: var(--red); }
.lim { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
