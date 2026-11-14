<template>
  <div>
    <div class="page-head"><div><h1>Santé & capteurs</h1><div class="sub">Vue globale des capteurs de tous les équipements</div></div></div>
    <div v-if="error" class="err mb">{{ error }}</div>
    <div class="seg mb wrap">
      <button v-for="c in classes" :key="c" :class="{ on: cls === c }" @click="cls = c">{{ SENSOR_LABELS[c] || c }} <span class="faint">{{ byClass[c].length }}</span></button>
    </div>
    <div v-if="loading && !sensors.length" class="grid gauto-s"><div v-for="i in 12" :key="i" class="skeleton" style="height:110px"></div></div>
    <div v-else-if="!sensors.length" class="card empty"><Thermometer /><div>Aucun capteur trouvé (endpoint <code>resources/sensors</code> indisponible ?)</div></div>
    <template v-else>
      <div class="card mb"><EChart :option="chart" :height="Math.max(220, Math.min(600, current.length * 22)) + 'px'" @click="(p) => go(current[p.dataIndex])" /></div>
      <div class="card">
        <DataTable :rows="current" :columns="cols" :filename="`capteurs-${cls}.csv`" :row-click="go" :default-sort="{ key: 'sensor_current', dir: -1 }">
          <template #c-device_id="{ row }"><DeviceCell :device="devById[row.device_id]" :show-icon="false" :sub="false" /></template>
          <template #c-sensor_current="{ row }"><b :style="{ color: alarm(row) ? 'var(--red)' : '' }">{{ row.sensor_current }} {{ sensorUnit(row.sensor_class) }}</b></template>
        </DataTable>
      </div>
    </template>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Thermometer } from 'lucide-vue-next'
import EChart from '../components/EChart.vue'
import DataTable from '../components/DataTable.vue'
import DeviceCell from '../components/DeviceCell.vue'
import { api, pick, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { SENSOR_LABELS, sensorUnit } from '../rrdmeta'
import { barOption } from '../charts'
import { devName } from '../utils'

const router = useRouter()
const sensors = ref([])
const devById = ref({})
const cls = ref('temperature')
const byClass = computed(() => { const m = {}; sensors.value.forEach((s) => (m[s.sensor_class] ||= []).push(s)); return m })
const classes = computed(() => Object.keys(byClass.value).sort((a, b) => byClass.value[b].length - byClass.value[a].length))
const current = computed(() => (byClass.value[cls.value] || []).slice().sort((a, b) => b.sensor_current - a.sensor_current))
const alarm = (s) => (s.sensor_limit && +s.sensor_current >= +s.sensor_limit) || (s.sensor_limit_low && +s.sensor_current <= +s.sensor_limit_low)
const chart = computed(() => {
  const o = barOption(current.value.map((s) => `${devName(devById.value[s.device_id])} · ${s.sensor_descr}`), current.value.map((s) => +s.sensor_current), { unit: sensorUnit(cls.value) || 'num', color: '#22d3ee' })
  o.series[0].itemStyle.color = (p) => (alarm(current.value[p.dataIndex]) ? '#f43f5e' : '#22d3ee')
  return o
})
const cols = [
  { key: 'device_id', label: 'Équipement', sortValue: (r) => devName(devById.value[r.device_id]) }, { key: 'sensor_descr', label: 'Capteur' },
  { key: 'sensor_current', label: 'Valeur' }, { key: 'sensor_limit_low', label: 'Seuil bas' }, { key: 'sensor_limit', label: 'Seuil haut' }, { key: 'sensor_type', label: 'Source' },
]
function go(s) { const d = devById.value[s?.device_id]; if (d) router.push(`/device/${encodeURIComponent(d.hostname)}/health`) }
const { loading, error } = useLoader(async () => {
  const [s, d] = await Promise.all([api.get('resources/sensors').then((r) => pick(r, 'sensors')), devicesCached()])
  sensors.value = s; devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  if (!byClass.value[cls.value] && classes.value.length) cls.value = classes.value[0]
})
</script>
