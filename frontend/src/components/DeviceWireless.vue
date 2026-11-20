<template>
  <div v-if="sensors.length">
    <div class="card-title">
      <Wifi :size="17" /> {{ t('Sans-fil') }}
      <div class="right row" style="gap:10px">
        <RangePicker v-model="range" />
        <router-link :to="{ name: 'device', params: { host: device.hostname, tab: 'graphs' }, query: { cat: 'wireless' } }" class="small nowrap">{{ t('Graphiques sans-fil →') }}</router-link>
      </div>
    </div>

    <!-- état actuel : cartes AP / radios (même rendu que le widget Wi-Fi) -->
    <WWifi :config="{ device: device.hostname, embedded: true }" :size="{ h: 300 }" />

    <div v-if="charts.length" class="grid g2 mt">
      <div v-for="c in charts" :key="c.cls" class="sub">
        <div class="small muted mb-s"><b style="color:var(--text)">{{ c.label }}</b></div>
        <div v-if="!c.series" class="skeleton" style="height:200px"></div>
        <div v-else-if="!c.series.length" class="empty small" style="height:200px">{{ t('Aucune donnée') }}</div>
        <EChart v-else :option="c.option" height="200px" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Wifi } from 'lucide-vue-next'
import WWifi from './widgets/WWifi.vue'
import EChart from './EChart.vue'
import RangePicker from './RangePicker.vue'
import { session, safeList, rrd, L } from '../api'
import { useLoader } from '../refresh'
import { timeOption, PALETTE } from '../charts'
import { prefs } from '../utils'
import { t } from '../i18n'

const props = defineProps({ device: Object, files: Array })
const sensors = ref([])
const range = ref(prefs.range)
const data = ref({}) // classe -> séries

// classes tracées (dans cet ordre) ; la fréquence (quasi constante) et le nombre d'AP sont omis
const CLASSES = {
  clients: [t('Clients'), 'num'], utilization: [t('Occupation du canal'), 'pct'], 'noise-floor': [t('Bruit de fond'), 'dBm'],
  power: [t('Puissance d\'émission'), 'dBm'], rssi: ['RSSI', 'dBm'], snr: ['SNR', 'dB'], ccq: ['CCQ', 'pct'], quality: [t('Qualité'), 'pct'],
  rate: [t('Débit'), 'bits'], errors: [t('Erreurs'), 'num'], distance: [t('Distance'), 'km'], cell: [t('Cellule'), 'num'],
}
const SKIP = new Set(['frequency', 'ap-count'])
const isSsid = (s) => /ssid/i.test(s.sensor_descr || '')
const isTotal = (s) => /^total/i.test(String(s.sensor_index)) || /^total/i.test(s.sensor_descr || '')
const rrdName = (s) => `wireless-sensor-${s.sensor_class}-${s.sensor_type}-${s.sensor_index}.rrd`

function bandOf(idx) {
  const f = +(sensors.value.find((s) => s.sensor_class === 'frequency' && String(s.sensor_index) === String(idx))?.sensor_current || 0)
  if (!f) return ''
  const b = f < 3000 ? '2,4 GHz' : f < 5925 ? '5 GHz' : '6 GHz'
  const ch = f === 2484 ? 14 : f >= 2412 && f < 2484 ? (f - 2407) / 5 : f >= 5000 && f < 5925 ? (f - 5000) / 5 : f >= 5955 ? (f - 5950) / 5 : null
  return ch ? `${b} ch ${ch}` : b
}
function label(s) {
  if (isSsid(s)) return (/ssid\s+(.+?)(\s+clients?)?$/i.exec(s.sensor_descr || '') || [])[1] || s.sensor_descr
  const d = String(s.sensor_descr || '').replace(/:.*$/, '').trim()
  const b = bandOf(s.sensor_index)
  return b ? `${d} · ${b}` : d
}

// capteurs à tracer, par classe ; pour les clients on préfère le détail par radio (sinon par SSID)
const plan = computed(() => {
  const avail = new Set(props.files || [])
  const by = {}
  for (const s of sensors.value) {
    if (SKIP.has(s.sensor_class) || isTotal(s) || !avail.has(rrdName(s))) continue
    ;(by[s.sensor_class] ||= []).push(s)
  }
  if (by.clients?.some((s) => !isSsid(s))) by.clients = by.clients.filter((s) => !isSsid(s))
  const order = Object.keys(CLASSES)
  return Object.entries(by).sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([cls, list]) => ({ cls, list: list.slice(0, 10) }))
})

const charts = computed(() => (session.rrd ? plan.value.map(({ cls }) => {
  const [lbl, unit] = CLASSES[cls] || [cls, 'num']
  const series = data.value[cls] || null
  const option = series?.length ? timeOption(series, { unit, zoom: false, stack: cls === 'clients' }) : null
  if (option?.legend) Object.assign(option.legend, { type: 'scroll', right: 0 })
  return { cls, label: lbl, series, option }
}) : []))

async function loadHistory() {
  if (!session.rrd || !plan.value.length) return
  const flat = plan.value.flatMap(({ cls, list }) => list.map((s) => ({ cls, s })))
  const items = flat.map(({ s }) => ({ host: props.device.hostname, name: rrdName(s), start: range.value, rows: 300 }))
  const res = (await rrd.batch(items).catch(() => ({ results: [] }))).results || []
  const out = {}
  flat.forEach(({ cls, s }, i) => {
    const d = res[i]
    ;(out[cls] ||= [])
    if (!d || d.error || !d.series) return
    const v = Object.values(d.series)[0] || []
    out[cls].push({ name: label(s), color: PALETTE[out[cls].length % PALETTE.length], data: d.timestamps.map((ts, j) => [ts * 1000, v[j]]) })
  })
  data.value = out
}

useLoader(async () => {
  const h = props.device.hostname
  sensors.value = await safeList(`devices/${L.enc(h)}/wireless-sensors`, null, 'wireless_sensors')
  await loadHistory()
})
watch(range, () => { data.value = {}; loadHistory() })
</script>

<style scoped>
.sub { min-width: 0; }
.mt { margin-top: 14px; }
.mb-s { margin-bottom: 6px; }
</style>
