<template>
  <div v-if="loaded && !upsList.length" class="empty small">
    <BatteryCharging /><div>{{ t('Aucun onduleur détecté') }}{{ config.device || config.group ? t(' pour ce filtre') : '' }}.</div>
    <div class="faint" style="max-width:340px">{{ t('Un onduleur apparaît ici dès que LibreNMS remonte sa charge batterie ou son autonomie (onduleur réseau, ou NUT / USB via un serveur ou un NAS).') }}</div>
  </div>
  <div v-else class="cards">
    <router-link v-for="u in upsList" :key="u.device_id" :to="link(u)" class="ups" :class="u.st">
      <div class="head">
        <span class="dot" :class="u.st === 'ok' ? 'up' : u.st === 'warn' ? 'warning' : 'down'"></span>
        <div style="min-width:0" class="grow">
          <b class="ellipsis" style="display:block">{{ u.name }}</b>
          <span v-if="u.model" class="small muted ellipsis" style="display:block">{{ u.model }}</span>
        </div>
        <span class="badge" :class="BADGE[u.st]">{{ u.headline }}</span>
      </div>

      <div class="body">
        <div v-if="u.charge !== null" class="ringbox">
          <Ring :value="u.charge" :size="92" :stroke="9" :colors="RING[u.chargeSt]" />
          <span class="small muted">batterie</span>
        </div>
        <div class="kpis">
          <div v-if="u.runtime !== null" :class="u.runtimeSt"><span>{{ t('Autonomie') }}</span><b>{{ fmtRuntime(u.runtime) }}</b></div>
          <div v-if="u.load !== null" :class="u.loadSt"><span>{{ t('Charge') }}</span><b>{{ fmt(u.load) }} %</b></div>
          <div v-if="u.vin !== null"><span>{{ t('Entrée') }}</span><b>{{ fmt(u.vin) }} V</b></div>
          <div v-if="u.vout !== null"><span>{{ t('Sortie') }}</span><b>{{ fmt(u.vout) }} V</b></div>
          <div v-if="u.power !== null"><span>{{ t('Puissance') }}</span><b>{{ fmt(u.power) }} W</b></div>
          <div v-if="u.freq !== null"><span>{{ t('Fréquence') }}</span><b>{{ fmt(u.freq) }} Hz</b></div>
          <div v-if="u.temp !== null"><span>{{ t('Temp. batterie') }}</span><b>{{ fmt(u.temp) }} °C</b></div>
        </div>
      </div>

      <div v-if="u.states.length" class="chips">
        <span v-for="s in u.states" :key="s.sensor_id" class="chip" :class="s.st" :title="`${s.sensor_descr} — valeur brute ${s.sensor_current} (${s.sensor_type})`">{{ s.sensor_descr }} : <b>{{ s.label }}</b></span>
      </div>
    </router-link>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { BatteryCharging } from 'lucide-vue-next'
import Ring from '../Ring.vue'
import { D, devicesFor } from '../../dashboard/data'
import { interpretState } from '../../dashboard/states'
import { useLoader } from '../../refresh'
import { devName } from '../../utils'
import { locale } from '../../i18n'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false)
const RING = { ok: ['#22c55e', '#4ade80'], warn: ['#fb923c', '#fdba74'], crit: ['#f43f5e', '#fb7185'] }
const BADGE = { ok: 'ok', warn: 'warning', crit: 'critical' }
const RANK = { crit: 0, warn: 1, ok: 2 }
const UPS_OS = /ups|apc|cyberpower|eaton|powerwalker|riello|socomec|liebert|netvision|generex|netagent|netman|orvaldi|marathon|gamatronic/i

const num = (v) => (v === null || v === undefined || v === '' || isNaN(+v) ? null : +v)
const pick = (l, re) => { const s = re ? l.find((x) => re.test(x.sensor_descr || '')) : l[0]; return s ? num(s.sensor_current) : null }
const worst = (a, b) => (RANK[a] <= RANK[b] ? a : b)

const upsList = computed(() => {
  const byDev = {}
  for (const s of all.value) if (!+s.sensor_deleted && devById.value[s.device_id]) (byDev[s.device_id] ||= []).push(s)
  const lowBat = +(props.config.lowBattery ?? 30); const lowRun = +(props.config.lowRuntime ?? 10)
  const out = []
  for (const d of Object.values(devById.value)) {
    if (props.config.device && d.hostname !== props.config.device) continue
    const sens = byDev[d.device_id] || []
    const cls = (c) => sens.filter((s) => s.sensor_class === c)
    const isUps = cls('charge').length || cls('runtime').length || (d.type === 'power' && UPS_OS.test(d.os || ''))
    if (!isUps) continue
    const volt = cls('voltage')
    const charge = pick(cls('charge'))
    const runtime = pick(cls('runtime'))
    const load = pick(cls('load'), /output|load|sortie|charge/i) ?? pick(cls('load'))
    const states = sens.filter((s) => s.sensor_class === 'state')
      .map((s) => { const [label, st] = interpretState(s, props.config.okValue); return { ...s, label, st } })
      .sort((a, b) => ({ crit: 0, warn: 1, unk: 2, ok: 3 })[a.st] - ({ crit: 0, warn: 1, unk: 2, ok: 3 })[b.st])
    const onBattery = states.some((s) => /batter/i.test(s.label) && s.st === 'crit' && /source|output|status/i.test(s.sensor_type + s.sensor_descr))
    const onMains = states.some((s) => s.st === 'ok' && /secteur|en ligne/i.test(s.label))
    const chargeSt = charge === null ? 'ok' : charge <= lowBat ? 'crit' : charge <= Math.min(100, lowBat * 2) ? 'warn' : 'ok'
    const runtimeSt = runtime === null ? 'ok' : runtime <= lowRun ? 'crit' : runtime <= lowRun * 2 ? 'warn' : 'ok'
    const loadSt = load === null ? 'ok' : load >= 90 ? 'crit' : load >= 75 ? 'warn' : 'ok'
    let st = [chargeSt, runtimeSt, loadSt, ...states.map((s) => s.st).filter((x) => x !== 'unk')].reduce(worst, 'ok')
    if (+d.status === 0) st = 'crit'
    const bad = states.find((s) => s.st === st && st !== 'ok')
    const headline = +d.status === 0 ? t('Injoignable') : onBattery ? t('Sur batterie') : bad ? bad.label
      : st === 'ok' ? (onMains ? t('Sur secteur') : 'OK') : chargeSt !== 'ok' ? t('Batterie faible') : runtimeSt !== 'ok' ? t('Autonomie faible') : t('Surcharge')
    out.push({
      device_id: d.device_id, hostname: d.hostname, name: devName(d), model: [d.hardware, d.version].filter(Boolean).join(' · '),
      charge, runtime, load, chargeSt, runtimeSt, loadSt, st, headline,
      vin: pick(volt, /input|in\b|entr|line|bypass/i), vout: pick(volt, /output|out\b|sortie/i),
      power: pick(cls('power'), /output|out|sortie|load|total/i) ?? pick(cls('power')),
      freq: pick(cls('frequency'), /output|out|sortie/i) ?? pick(cls('frequency')),
      temp: pick(cls('temperature'), /batt/i) ?? pick(cls('temperature')),
      states: states.slice(0, 6),
    })
  }
  return out.sort((a, b) => RANK[a.st] - RANK[b.st] || a.name.localeCompare(b.name))
})

const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString(locale)
function fmtRuntime(m) {
  if (m >= 120) return `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`
  return `${Math.round(m)} min`
}
const link = (u) => `/device/${encodeURIComponent(u.hostname)}/health`

useLoader(async () => {
  const [s, d] = await Promise.all([D.sensors(), devicesFor(props.config)])
  all.value = s
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
})
</script>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ups { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); color: var(--text); min-width: 0; }
.ups:hover { text-decoration: none; filter: brightness(1.08); }
.ups.warn { border-top-color: var(--orange); }
.ups.crit { border-top-color: var(--red); background: color-mix(in srgb, var(--red) 8%, var(--panel-2)); }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.body { display: flex; gap: 16px; align-items: center; }
.ringbox { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: none; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px 12px; flex: 1; min-width: 0; }
.kpis div { display: flex; flex-direction: column; min-width: 0; }
.kpis span { font-size: 11px; color: var(--muted); }
.kpis b { font-size: 15px; font-variant-numeric: tabular-nums; }
.kpis .warn b { color: var(--orange); } .kpis .crit b { color: var(--red); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 11px; padding: 3px 8px; border-radius: 20px; background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--muted); }
.chip b { color: var(--green); font-weight: 600; }
.chip.warn { background: color-mix(in srgb, var(--orange) 16%, transparent); } .chip.warn b { color: var(--orange); }
.chip.unk { background: color-mix(in srgb, #64748b 18%, transparent); } .chip.unk b { color: var(--muted); }
.chip.crit { background: color-mix(in srgb, var(--red) 16%, transparent); } .chip.crit b { color: var(--red); }
</style>
