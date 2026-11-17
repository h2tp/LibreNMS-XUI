<template>
  <div class="card">
    <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" row-key="port_id" :row-click="(p) => $router.push(`/port/${p.port_id}`)" :filename="`ports-${device.hostname}.csv`" :page-size="100" :placeholder="t('Filtrer les ports…')" :filter="filterFn">
      <template #tools>
        <div class="seg">
          <button v-for="f in filters" :key="f.v" :class="{ on: flt === f.v }" @click="flt = f.v">{{ f.l }} <span class="faint">{{ count(f.v) }}</span></button>
        </div>
      </template>
      <template #c-ifName="{ row }">
        <div class="row"><span class="dot" :class="portStatus(row)"></span>
          <div class="col" style="gap:0;min-width:0"><b class="nowrap">{{ row.ifName || row.ifDescr }}</b><span class="small muted ellipsis" style="max-width:280px">{{ row.ifAlias }}</span></div>
        </div>
      </template>
      <template #c-ifSpeed="{ row }"><span class="nowrap">{{ fmtSpeed(row.ifSpeed) }}</span> <span v-if="row.ifDuplex && row.ifDuplex !== 'unknown'" class="faint small">{{ row.ifDuplex }}</span></template>
      <template #c-traffic="{ row }">
        <div class="col" style="gap:4px;min-width:150px">
          <span class="small nowrap mono"><span style="color:var(--in)">↓ {{ fmtBits(row.ifInOctets_rate * 8) }}</span> <span style="color:var(--out)">↑ {{ fmtBits(row.ifOutOctets_rate * 8) }}</span></span>
          <div class="bar"><i :style="{ width: Math.max(1, row.util) + '%', background: utilColor(row.util) }"></i></div>
        </div>
      </template>
      <template #c-spark="{ row }"><Spark v-if="sparks[row.port_id]" :data="sparks[row.port_id]" :w="110" :h="28" /><span v-else class="faint small">—</span></template>
      <template #c-pkts="{ row }"><span class="small mono nowrap">{{ fmtNum(row.ifInUcastPkts_rate) }} / {{ fmtNum(row.ifOutUcastPkts_rate) }}</span></template>
      <template #c-errors="{ row }"><span class="small mono" :style="{ color: row.errors > 0 ? 'var(--red)' : '' }">{{ fmtNum(row.errors) }}</span></template>
      <template #c-ifPhysAddress="{ row }"><span class="small mono">{{ mac(row.ifPhysAddress) }}</span></template>
      <template #c-ifLastChange="{ row }"><span class="small nowrap">{{ fmtUptime((device.uptime || 0) - (row.ifLastChange || 0) / 100) }}</span></template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import DataTable from '../../components/DataTable.vue'
import Spark from '../../components/Spark.vue'
import { session, safeList, rrd, L } from '../../api'
import { useLoader } from '../../refresh'
import { portStatus, portUtil, utilColor, fmtBits, fmtSpeed, fmtNum, fmtUptime } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ device: Object, files: Array })
const ports = ref([])
const sparks = ref({})
const flt = ref('active')
const filters = [{ v: 'active', l: t('Actifs') }, { v: 'up', l: t('Up') }, { v: 'down', l: t('Down') }, { v: 'all', l: t('Tous') }]
function match(p, f) {
  if (f === 'all') return true
  if (+p.deleted) return false
  if (f === 'up') return p.ifOperStatus === 'up'
  if (f === 'down') return p.ifOperStatus !== 'up' && p.ifAdminStatus === 'up'
  return !+p.disabled && !+p.ignore
}
const filterFn = (p) => match(p, flt.value)
function count(f) { return ports.value.filter((p) => match(p, f)).length }
function mac(m) { return m && m.length === 12 ? m.match(/../g).join(':') : m || '—' }

const rows = computed(() => ports.value.map((p) => ({
  ...p, util: portUtil(p), traffic: (+p.ifInOctets_rate || 0) + (+p.ifOutOctets_rate || 0), spark: 0,
  pkts: (+p.ifInUcastPkts_rate || 0) + (+p.ifOutUcastPkts_rate || 0), errors: (+p.ifInErrors_rate || 0) + (+p.ifOutErrors_rate || 0),
})))
const cols = [
  { key: 'ifName', label: t('Port'), sortValue: (r) => r.ifIndex },
  { key: 'ifSpeed', label: t('Vitesse') },
  { key: 'traffic', label: t('Trafic') },
  { key: 'spark', label: '6 h', sortable: false },
  { key: 'pkts', label: t('Paquets/s') },
  { key: 'errors', label: t('Erreurs/s') },
  { key: 'ifVlan', label: 'VLAN' },
  { key: 'ifType', label: t('Type') },
  { key: 'ifMtu', label: 'MTU' },
  { key: 'ifPhysAddress', label: 'MAC' },
  { key: 'ifLastChange', label: t('Dernier changement') },
]

const { loading, error } = useLoader(async () => {
  ports.value = await safeList(`devices/${L.enc(props.device.hostname)}/ports`, {
    columns: 'port_id,ifIndex,ifName,ifDescr,ifAlias,ifType,ifMtu,ifSpeed,ifDuplex,ifVlan,ifPhysAddress,ifOperStatus,ifAdminStatus,ifLastChange,ifInOctets_rate,ifOutOctets_rate,ifInUcastPkts_rate,ifOutUcastPkts_rate,ifInErrors_rate,ifOutErrors_rate,deleted,disabled,ignore',
  }, 'ports')
  if (!session.rrd) return
  const items = ports.value.filter((p) => !+p.deleted && props.files?.includes(`port-id${p.port_id}.rrd`)).slice(0, 200)
    .map((p) => ({ host: props.device.hostname, name: `port-id${p.port_id}.rrd`, ds: ['INOCTETS', 'OUTOCTETS'], start: '-6h', rows: 60 }))
  if (!items.length) return
  const r = await rrd.batch(items)
  const out = {}
  r.results.forEach((res, i) => {
    if (!res || res.error) return
    const a = res.series.INOCTETS || []; const b = res.series.OUTOCTETS || []
    out[items[i].name.match(/\d+/)[0]] = a.map((v, k) => (v === null && b[k] === null ? null : ((v || 0) + (b[k] || 0)) * 8))
  })
  sparks.value = out
})
</script>
