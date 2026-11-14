<template>
  <div>
    <div class="page-head"><div><h1>Ports</h1><div class="sub">{{ ports.length }} interfaces supervisées</div></div></div>
    <div class="grid g4 mb stagger">
      <StatCard :icon="Network" label="Ports" :value="ports.length" color="#22d3ee" />
      <StatCard :icon="ArrowUpCircle" label="Up" :value="cnt.up" color="#22c55e" />
      <StatCard :icon="ArrowDownCircle" label="Down (admin up)" :value="cnt.down" color="#f43f5e" />
      <StatCard :icon="AlertTriangle" label="Avec erreurs" :value="cnt.err" color="#fb923c" />
    </div>
    <div class="card">
      <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" row-key="port_id" :row-click="(p) => $router.push(`/port/${p.port_id}`)" filename="ports.csv" :page-size="100" :filter="filterFn" :default-sort="{ key: 'traffic', dir: -1 }">
        <template #tools>
          <div class="seg"><button v-for="f in filters" :key="f.v" :class="{ on: flt === f.v }" @click="flt = f.v">{{ f.l }}</button></div>
          <select v-model="ifType" class="input" style="padding:6px 10px"><option value="">Tous types</option><option v-for="t in typeList" :key="t">{{ t }}</option></select>
        </template>
        <template #c-device="{ row }"><DeviceCell :device="devById[row.device_id]" :show-icon="false" :sub="false" /></template>
        <template #c-ifName="{ row }"><div class="row"><span class="dot" :class="portStatus(row)"></span><b class="nowrap">{{ row.ifName }}</b></div></template>
        <template #c-ifAlias="{ row }"><span class="small muted">{{ row.ifAlias }}</span></template>
        <template #c-ifSpeed="{ row }">{{ fmtSpeed(row.ifSpeed) }}</template>
        <template #c-traffic="{ row }">
          <div class="col" style="gap:4px;min-width:150px"><span class="small mono nowrap"><span style="color:var(--accent)">↓ {{ fmtBits(row.ifInOctets_rate * 8) }}</span> <span style="color:#a78bfa">↑ {{ fmtBits(row.ifOutOctets_rate * 8) }}</span></span>
            <div class="bar"><i :style="{ width: Math.max(1, row.util) + '%', background: utilColor(row.util) }"></i></div></div>
        </template>
        <template #c-util="{ row }"><span class="small">{{ row.util.toFixed(1) }} %</span></template>
        <template #c-errors="{ row }"><span class="small mono" :style="{ color: row.errors ? 'var(--red)' : '' }">{{ fmtNum(row.errors) }}</span></template>
      </DataTable>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { Network, ArrowUpCircle, ArrowDownCircle, AlertTriangle } from 'lucide-vue-next'
import StatCard from '../components/StatCard.vue'
import DataTable from '../components/DataTable.vue'
import DeviceCell from '../components/DeviceCell.vue'
import { safeList, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, portStatus, portUtil, utilColor, fmtBits, fmtSpeed, fmtNum } from '../utils'

const ports = ref([])
const devById = ref({})
const flt = ref('active')
const ifType = ref('')
const filters = [{ v: 'active', l: 'Actifs' }, { v: 'up', l: 'Up' }, { v: 'down', l: 'Down' }, { v: 'errors', l: 'Erreurs' }, { v: 'all', l: 'Tous' }]
const typeList = computed(() => [...new Set(ports.value.map((p) => p.ifType).filter(Boolean))].sort())
const rows = computed(() => ports.value.map((p) => ({
  ...p, device: devName(devById.value[p.device_id]), util: portUtil(p), traffic: (+p.ifInOctets_rate || 0) + (+p.ifOutOctets_rate || 0),
  errors: (+p.ifInErrors_rate || 0) + (+p.ifOutErrors_rate || 0),
})))
const cnt = computed(() => ({
  up: ports.value.filter((p) => p.ifOperStatus === 'up' && !+p.deleted).length,
  down: ports.value.filter((p) => p.ifOperStatus !== 'up' && p.ifAdminStatus === 'up' && !+p.deleted).length,
  err: ports.value.filter((p) => (+p.ifInErrors_rate || 0) + (+p.ifOutErrors_rate || 0) > 0).length,
}))
function filterFn(p) {
  if (ifType.value && p.ifType !== ifType.value) return false
  if (flt.value === 'all') return true
  if (+p.deleted) return false
  if (flt.value === 'up') return p.ifOperStatus === 'up'
  if (flt.value === 'down') return p.ifOperStatus !== 'up' && p.ifAdminStatus === 'up'
  if (flt.value === 'errors') return p.errors > 0
  return !+p.disabled && !+p.ignore
}
const cols = [
  { key: 'device', label: 'Équipement' }, { key: 'ifName', label: 'Port' }, { key: 'ifAlias', label: 'Description' }, { key: 'ifSpeed', label: 'Vitesse' },
  { key: 'traffic', label: 'Trafic' }, { key: 'util', label: 'Util.' }, { key: 'errors', label: 'Erreurs/s' }, { key: 'ifType', label: 'Type' }, { key: 'ifVlan', label: 'VLAN' },
]
const { loading, error } = useLoader(async () => {
  const [p, d] = await Promise.all([
    safeList('ports', { columns: 'port_id,device_id,ifName,ifAlias,ifType,ifSpeed,ifVlan,ifOperStatus,ifAdminStatus,ifInOctets_rate,ifOutOctets_rate,ifInErrors_rate,ifOutErrors_rate,deleted,disabled,ignore' }, 'ports'),
    devicesCached(),
  ])
  ports.value = p; devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
})
</script>
