<template>
  <div v-if="loaded && !aps.length" class="empty small"><Wifi /><div>{{ t('Aucun point d\'accès Wi-Fi remonté par LibreNMS') }}</div></div>
  <div v-else class="col" style="gap:12px;height:100%">
    <div class="summary small">
      <span><b>{{ totals.clients }}</b> client(s)</span>
      <span class="muted">· {{ t('{a} point(s) d\'accès · {r} radio(s)', { a: totals.aps, r: totals.radios }) }}</span>
      <span v-for="s in ssids" :key="s.name" class="ssid" :title="t('{n} client(s) sur le SSID {s}', { n: s.clients, s: s.name })"><Wifi :size="12" /> {{ s.name }} <b>{{ s.clients }}</b></span>
    </div>

    <template v-if="mode === 'history'">
      <div v-if="!session.rrd" class="empty small">{{ t('L\'historique nécessite l\'accès aux fichiers RRD.') }}</div>
      <div v-else-if="!series" class="skeleton" :style="{ height: `${chartH}px` }"></div>
      <div v-else-if="!series.length" class="empty small">{{ t('Aucun historique de clients') }}</div>
      <EChart v-else :option="histOpt" :height="`${chartH}px`" />
    </template>

    <div v-else class="cards">
      <router-link v-for="ap in aps" :key="ap.key" :to="link(ap)" class="ap" :class="ap.st">
        <div class="head">
          <span class="dot" :class="ap.down ? 'down' : ap.st === 'ok' ? 'up' : 'warning'"></span>
          <div class="grow" style="min-width:0">
            <b class="ellipsis" style="display:block">{{ ap.name }}</b>
            <span class="small muted ellipsis" style="display:block">{{ ap.sub }}</span>
          </div>
          <span class="clients"><Users :size="14" /> {{ ap.clients }}</span>
        </div>
        <div v-for="r in ap.radios" :key="r.index" class="radio">
          <div class="rline small">
            <span class="band" :class="'b' + r.bandKey">{{ r.band }}</span>
            <b class="nowrap">{{ r.channel ? `canal ${r.channel}` : r.label }}</b>
            <span class="muted nowrap">{{ r.clients ?? '—' }} client(s)</span>
            <span class="grow"></span>
            <span class="rf">
            <span v-if="r.noise !== null" class="muted nowrap" :class="{ warnTxt: r.noise > -80 }" :title="t('Bruit de fond')">{{ r.noise }} dBm</span>
            <span v-if="r.power !== null" class="muted nowrap" :title="t('Puissance d\'émission')">· Tx {{ r.power }} dBm</span>
            </span>
          </div>
          <div v-if="r.util !== null" class="row" style="gap:8px">
            <div class="bar grow" :title="t('Occupation du canal : {p} %', { p: r.util })"><i :style="{ width: Math.max(1, r.util) + '%', background: COL[r.utilSt] }"></i></div>
            <span class="small nowrap pct" :class="r.utilSt">{{ r.util }} %</span>
          </div>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Wifi, Users } from 'lucide-vue-next'
import EChart from '../EChart.vue'
import { session, rrd, safeList, L } from '../../api'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { timeOption, PALETTE } from '../../charts'
import { devName } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false)
const series = ref(null)
const mode = computed(() => props.config.mode || 'cards')
const chartH = computed(() => Math.max(120, props.size.h - 40))
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const num = (v) => (v === null || v === undefined || v === '' ? null : +v)

function band(f) {
  if (!f) return ['?', '']
  if (f < 3000) return ['2,4 GHz', '24']
  if (f < 5925) return ['5 GHz', '5']
  return ['6 GHz', '6']
}
function channel(f) {
  if (!f) return null
  if (f === 2484) return 14
  if (f >= 2412 && f < 2484) return (f - 2407) / 5
  if (f >= 5000 && f < 5925) return (f - 5000) / 5
  if (f >= 5955) return (f - 5950) / 5
  return null
}
const isSsid = (s) => /ssid/i.test(s.sensor_descr || '')
const ssidName = (s) => (/ssid\s+(.+?)(\s+clients?)?$/i.exec(s.sensor_descr || '') || [])[1] || s.sensor_descr
const isTotal = (s) => /^total/i.test(String(s.sensor_index)) || /^total/i.test(s.sensor_descr || '')

const mine = computed(() => all.value.filter((s) => devById.value[s.device_id] && (!props.config.device || s.hostname === props.config.device)))

// Regroupement des radios : capteurs partageant le même index (« <ap>.<radio> » chez Aruba, Ubiquiti…)
const aps = computed(() => {
  const hi = +(props.config.util ?? 60)
  const out = {}
  for (const s of mine.value) {
    if (s.sensor_class === 'ap-count' || isSsid(s) || isTotal(s)) continue
    const idx = String(s.sensor_index)
    const [apId, radioId] = idx.includes('.') ? [idx.slice(0, idx.lastIndexOf('.')), idx.slice(idx.lastIndexOf('.') + 1)] : ['', idx]
    const key = `${s.device_id}:${apId}`
    const ap = (out[key] ||= { key, device_id: s.device_id, hostname: s.hostname, apId, radios: {}, label: '' })
    const r = (ap.radios[idx] ||= { index: idx, radioId, label: '', clients: null, freq: null, util: null, noise: null, power: null })
    const descr = String(s.sensor_descr || '').replace(/:.*$/, '')
    r.label ||= (/(radio\s*\d+)/i.exec(descr) || [])[1] || `Radio ${radioId}`
    if (!ap.label) ap.label = descr.replace(/\s*radio\s*\d+\s*$/i, '').trim()
    const v = num(s.sensor_current)
    if (s.sensor_class === 'clients') r.clients = v
    else if (s.sensor_class === 'frequency') r.freq = v
    else if (s.sensor_class === 'utilization') r.util = v
    else if (s.sensor_class === 'noise-floor') r.noise = v
    else if (s.sensor_class === 'power') r.power = v
  }
  return Object.values(out).map((ap) => {
    const d = devById.value[ap.device_id]
    const radios = Object.values(ap.radios).map((r) => {
      const [b, bk] = band(r.freq)
      const utilSt = r.util === null ? 'ok' : r.util >= Math.min(100, hi + 20) ? 'crit' : r.util >= hi ? 'warn' : 'ok'
      return { ...r, band: b, bandKey: bk, channel: channel(r.freq), utilSt }
    }).sort((a, b) => (a.freq || 0) - (b.freq || 0))
    const clients = radios.reduce((s, r) => s + (r.clients || 0), 0)
    const down = +d.status === 0
    const st = down ? 'crit' : radios.some((r) => r.utilSt === 'crit') ? 'crit' : radios.some((r) => r.utilSt === 'warn') ? 'warn' : 'ok'
    // un contrôleur (Aruba Instant, Unifi…) porte plusieurs AP : on nomme alors l'AP par son libellé
    const multi = Object.values(out).filter((x) => x.device_id === ap.device_id).length > 1
    return {
      ...ap, radios, clients, st, down,
      name: multi && ap.label ? ap.label : devName(d),
      sub: [multi ? devName(d) : (ap.label ? `AP ${ap.label}` : ''), d.hardware].filter(Boolean).join(' · '),
    }
  }).sort((a, b) => ({ crit: 0, warn: 1, ok: 2 })[a.st] - ({ crit: 0, warn: 1, ok: 2 })[b.st] || b.clients - a.clients)
})
const ssids = computed(() => {
  const m = {}
  for (const s of mine.value.filter((x) => x.sensor_class === 'clients' && isSsid(x))) m[ssidName(s)] = (m[ssidName(s)] || 0) + (num(s.sensor_current) || 0)
  return Object.entries(m).map(([name, clients]) => ({ name, clients })).sort((a, b) => b.clients - a.clients)
})
const totals = computed(() => {
  const radioSum = aps.value.reduce((s, a) => s + a.clients, 0)
  const ssidSum = ssids.value.reduce((s, x) => s + x.clients, 0)
  return { clients: Math.max(radioSum, ssidSum), aps: aps.value.length, radios: aps.value.reduce((s, a) => s + a.radios.length, 0) }
})
const link = (ap) => `/device/${encodeURIComponent(ap.hostname)}/health`

const histOpt = computed(() => {
  const o = timeOption(series.value, { unit: 'num', zoom: false, stack: true })
  if (o.legend) Object.assign(o.legend, { type: 'scroll', right: 0, pageIconColor: '#22d3ee', pageTextStyle: { color: '#8b97ad' } })
  return o
})
async function loadHistory() {
  if (mode.value !== 'history' || !session.rrd) return
  const bySsid = props.config.by !== 'radio' && ssids.value.length
  const sel = mine.value.filter((s) => s.sensor_class === 'clients' && !isTotal(s) && (bySsid ? isSsid(s) : !isSsid(s))).slice(0, 12)
  const items = sel.map((s) => ({ host: s.hostname, name: `wireless-sensor-clients-${s.sensor_type}-${s.sensor_index}.rrd`, start: props.config.range || '-1d', rows: 240 }))
  const res = items.length ? (await rrd.batch(items).catch(() => ({ results: [] }))).results : []
  series.value = sel.map((s, i) => {
    const d = res[i]
    if (!d || d.error || !d.series) return null
    const v = Object.values(d.series)[0]
    const r = aps.value.flatMap((a) => a.radios.map((x) => ({ ...x, ap: a.name }))).find((x) => x.index === String(s.sensor_index))
    const name = bySsid ? ssidName(s) : r ? `${r.ap} · ${r.band}${r.channel ? ' ch ' + r.channel : ''}` : s.sensor_descr
    return { name, color: PALETTE[i % PALETTE.length], data: d.timestamps.map((t, j) => [t * 1000, v[j]]) }
  }).filter(Boolean)
}

useLoader(async () => {
  // filtré sur un seul équipement (vue d'ensemble) : on n'interroge que lui
  const one = props.config.device
  const [w, d] = await Promise.all([
    one ? safeList(`devices/${L.enc(one)}/wireless-sensors`, null, 'wireless_sensors').then((l) => l.map((x) => ({ ...x, hostname: one }))) : D.wireless(),
    devicesFor(props.config),
  ])
  all.value = w
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
  await loadHistory()
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.summary b { font-variant-numeric: tabular-nums; }
.ssid { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 20px; background: color-mix(in srgb, var(--accent) 14%, transparent); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ap { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); color: var(--text); min-width: 0; }
.ap:hover { text-decoration: none; filter: brightness(1.08); }
.ap.warn { border-top-color: var(--orange); } .ap.crit { border-top-color: var(--red); }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.clients { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
/* ligne radio : passe à la ligne si la carte est étroite plutôt que de déborder */
.rline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.rf { display: inline-flex; flex-wrap: wrap; gap: 0 6px; justify-content: flex-end; margin-left: auto; }
.summary .ssid { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.radio { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border); }
.band { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 6px; background: var(--border); white-space: nowrap; }
.band.b24 { background: color-mix(in srgb, #f59e0b 22%, transparent); color: #f59e0b; }
.band.b5 { background: color-mix(in srgb, #22d3ee 20%, transparent); color: #22d3ee; }
.band.b6 { background: color-mix(in srgb, #a78bfa 22%, transparent); color: #a78bfa; }
.pct { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
.pct.warn, .warnTxt { color: var(--orange); } .pct.crit { color: var(--red); }
</style>
