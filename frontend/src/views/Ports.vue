<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Ports') }}</h1><div class="sub">{{ t('{n} interfaces supervisées', { n: ports.length }) }}<template v-if="deleted.length"> · {{ t('{n} supprimées', { n: deleted.length }) }}</template></div></div></div>
    <div class="grid g4 mb stagger">
      <StatCard :icon="Network" :label="t('Ports')" :value="ports.length" color="#22d3ee" />
      <StatCard :icon="ArrowUpCircle" :label="t('Up')" :value="cnt.up" color="#22c55e" />
      <StatCard :icon="ArrowDownCircle" :label="t('Down (admin up)')" :value="cnt.down" color="#f43f5e" />
      <StatCard :icon="AlertTriangle" :label="t('Avec erreurs')" :value="cnt.err" color="#fb923c" />
    </div>
    <div class="card">
      <DataTable :rows="rows" :columns="flt === 'deleted' ? delCols : cols" :loading="loading || delLoading" :error="error || delError" row-key="port_id" :row-click="(p) => $router.push(`/port/${p.port_id}`)" filename="ports.csv" :page-size="100" :filter="filterFn" :default-sort="{ key: 'traffic', dir: -1 }">
        <template #tools>
          <div class="seg"><button v-for="f in filters" :key="f.v" :class="{ on: flt === f.v }" @click="flt = f.v">{{ f.l }}<span v-if="f.v === 'deleted' && deleted.length" class="faint"> {{ deleted.length }}</span></button></div>
          <select v-model="ifType" class="input" style="padding:6px 10px"><option value="">{{ t('Tous types') }}</option><option v-for="tb in typeList" :key="tb">{{ tb }}</option></select>
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
        <template #c-poll_time="{ row }"><span class="nowrap small">{{ row.poll_time ? timeAgo(row.poll_time) : '—' }}</span></template>
        <template #c-errors="{ row }"><span class="small mono" :style="{ color: row.errors ? 'var(--red)' : '' }">{{ fmtNum(row.errors) }}</span></template>
      </DataTable>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Network, ArrowUpCircle, ArrowDownCircle, AlertTriangle } from 'lucide-vue-next'
import StatCard from '../components/StatCard.vue'
import DataTable from '../components/DataTable.vue'
import DeviceCell from '../components/DeviceCell.vue'
import { safeList, devicesCached, deletedPortsApi, session } from '../api'
import { useLoader } from '../refresh'
import { devName, portStatus, portUtil, utilColor, fmtBits, fmtSpeed, fmtNum, timeAgo } from '../utils'
import { t } from '../i18n'

const ports = ref([])
const devById = ref({})
const route = useRoute()
const router = useRouter()
const flt = ref(route.query.filter === 'deleted' && !session.deleted_ports ? 'active' : route.query.filter || 'active')
const ifType = ref('')
// ports supprimés : l'API LibreNMS ne les renvoie pas, XUI les lit dans la base (LIBRENMS_DB_*)
const deleted = ref([])
const delLoading = ref(false)
const delError = ref('')
const filters = computed(() => [{ v: 'active', l: t('Actifs') }, { v: 'up', l: t('Up') }, { v: 'down', l: t('Down') }, { v: 'errors', l: t('Erreurs') }, { v: 'all', l: t('Tous') },
  ...(session.deleted_ports ? [{ v: 'deleted', l: t('Supprimés') }] : [])])
const source = computed(() => (flt.value === 'deleted' ? deleted.value : ports.value))
const typeList = computed(() => [...new Set(source.value.map((p) => p.ifType).filter(Boolean))].sort())
const rows = computed(() => source.value.map((p) => ({
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
  if (flt.value === 'deleted') return true
  if (flt.value === 'all') return true
  if (+p.deleted) return false
  if (flt.value === 'up') return p.ifOperStatus === 'up'
  if (flt.value === 'down') return p.ifOperStatus !== 'up' && p.ifAdminStatus === 'up'
  if (flt.value === 'errors') return p.errors > 0
  return !+p.disabled && !+p.ignore
}
const cols = [
  { key: 'device', label: t('Équipement') }, { key: 'ifName', label: t('Port') }, { key: 'ifAlias', label: t('Description') }, { key: 'ifSpeed', label: t('Vitesse') },
  { key: 'traffic', label: t('Trafic') }, { key: 'util', label: t('Util.') }, { key: 'errors', label: t('Erreurs/s') }, { key: 'ifType', label: t('Type') }, { key: 'ifVlan', label: 'VLAN' },
]
const delCols = [
  { key: 'device', label: t('Équipement') }, { key: 'ifName', label: t('Port') }, { key: 'ifAlias', label: t('Description') }, { key: 'ifSpeed', label: t('Vitesse') },
  { key: 'ifType', label: t('Type') }, { key: 'ifVlan', label: 'VLAN' }, { key: 'poll_time', label: t('Dernier relevé') },
]
async function loadDeleted() {
  if (!session.deleted_ports) return
  delLoading.value = true; delError.value = ''
  try { deleted.value = await deletedPortsApi.list() } catch (e) { delError.value = e.message } finally { delLoading.value = false }
}
watch(flt, (v) => { router.replace({ query: { ...route.query, filter: v === 'active' ? undefined : v } }); if (v === 'deleted') loadDeleted() })
const { loading, error } = useLoader(async ({ silent }) => {
  if (session.deleted_ports && (!silent || flt.value === 'deleted')) loadDeleted()
  const [p, d] = await Promise.all([
    safeList('ports', { columns: 'port_id,device_id,ifName,ifAlias,ifType,ifSpeed,ifVlan,ifOperStatus,ifAdminStatus,ifInOctets_rate,ifOutOctets_rate,ifInErrors_rate,ifOutErrors_rate,deleted,disabled,ignore' }, 'ports'),
    devicesCached(),
  ])
  ports.value = p; devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
})
</script>
