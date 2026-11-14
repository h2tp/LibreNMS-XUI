<template>
  <div class="col" style="gap:18px">
    <div class="grid g4">
      <div v-for="a in avail" :key="a.duration" class="card av">
        <Ring :value="+a.availability_perc" :text="(+a.availability_perc).toFixed(1) + '%'" :size="120" :colors="availColors(+a.availability_perc)" />
        <b>{{ period(a.duration) }}</b>
      </div>
      <div v-if="!avail.length && !loading" class="card empty span2">Aucune donnée de disponibilité</div>
    </div>
    <div v-if="files?.includes('availability-86400.rrd') || files?.includes('poller-perf.rrd')" class="grid g2">
      <div v-if="files?.includes('availability-86400.rrd')" class="card"><RrdChart :host="device.hostname" file="availability-86400.rrd" :icon="Activity" title="Disponibilité dans le temps (glissante 24 h)" height="180px" range="-7d" /></div>
      <div v-if="files?.includes('poller-perf.rrd')" class="card"><RrdChart :host="device.hostname" file="poller-perf.rrd" :icon="Gauge" height="180px" range="-1d" hide-range :show-stats="false" title="Durée de polling (24 h)" :zoom="false" /></div>
    </div>
    <div v-if="files?.includes('uptime.rrd')" class="card"><RrdChart :host="device.hostname" file="uptime.rrd" title="Uptime" range="-30d" /></div>
    <div class="card">
      <div class="card-title"><Unplug :size="17" /> Coupures <span class="sub">{{ outages.length }}</span></div>
      <DataTable :rows="outages" :columns="cols" :loading="loading" :filename="`coupures-${device.hostname}.csv`" empty-text="Aucune coupure enregistrée">
        <template #c-going_down="{ row }">{{ fmtDate(row.going_down) }}</template>
        <template #c-up_again="{ row }"><span v-if="row.up_again">{{ fmtDate(row.up_again) }}</span><span v-else class="badge down">en cours</span></template>
        <template #c-duration="{ row }"><b>{{ fmtUptime(row.duration) }}</b></template>
      </DataTable>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { Unplug, Activity, Gauge } from 'lucide-vue-next'
import Ring from '../../components/Ring.vue'
import RrdChart from '../../components/RrdChart.vue'
import DataTable from '../../components/DataTable.vue'
import { safeList, L } from '../../api'
import { useLoader } from '../../refresh'
import { fmtDate, fmtUptime, availColors } from '../../utils'
const props = defineProps({ device: Object, files: Array })
const avail = ref([])
const rawOut = ref([])
const outages = computed(() => rawOut.value.map((o) => ({ ...o, duration: (o.up_again || Date.now() / 1000) - o.going_down })))
const period = (s) => ({ 86400: '24 heures', 604800: '7 jours', 2592000: '30 jours', 31536000: '1 an' }[s] || `${s} s`)
const cols = [{ key: 'going_down', label: 'Début' }, { key: 'up_again', label: 'Fin' }, { key: 'duration', label: 'Durée' }]
const { loading } = useLoader(async () => {
  const h = L.enc(props.device.hostname)
  const [a, o] = await Promise.all([safeList(`devices/${h}/availability`, null, 'availability'), safeList(`devices/${h}/outages`, null, 'outages')])
  avail.value = a.sort((x, y) => x.duration - y.duration)
  rawOut.value = o.sort((x, y) => y.going_down - x.going_down)
})
</script>
<style scoped>
.av { display: flex; flex-direction: column; align-items: center; gap: 12px; }
</style>
