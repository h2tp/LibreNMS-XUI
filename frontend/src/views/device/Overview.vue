<template>
  <div class="grid ov">
    <div class="col" style="gap:18px">
      <div class="card">
        <div class="card-title"><Info :size="17" /> Informations</div>
        <dl class="kv small">
          <template v-for="[k, v] in info" :key="k"><dt>{{ k }}</dt><dd :class="{ mono: /IP|Nom d'hôte|Série/.test(k) }">{{ v }}</dd></template>
        </dl>
      </div>
      <div class="card" v-if="device.sysDescr">
        <div class="card-title"><FileText :size="17" /> Description système</div>
        <div class="small muted mono" style="word-break:break-word">{{ device.sysDescr }}</div>
      </div>
      <div v-if="device.lat && device.lng" class="card">
        <div class="card-title"><MapPin :size="17" /> Localisation</div>
        <MiniMap :lat="+device.lat" :lng="+device.lng" :status="devStatus(device)" />
      </div>
    </div>

    <div class="col" style="gap:18px;min-width:0">
      <div class="grid g4">
        <div class="card ring-card"><Ring :value="cpu" :label="'CPU'" /><span class="small muted">{{ procs.length }} processeur(s)</span></div>
        <div class="card ring-card"><Ring :value="mem.pct" label="Mémoire" :colors="['#a78bfa', '#f472b6']" /><span class="small muted">{{ fmtBytes(mem.used) }} / {{ fmtBytes(mem.total) }}</span></div>
        <div class="card ring-card"><Ring :value="disk.pct" label="Stockage" :colors="['#34d399', '#22d3ee']" /><span class="small muted">{{ fmtBytes(disk.used) }} / {{ fmtBytes(disk.total) }}</span></div>
        <div class="card ring-card"><Ring :value="avail" :text="avail !== null ? avail.toFixed(2) + '%' : '—'" label="Dispo. 30 j" :colors="['#22c55e', '#34d399']" /><span class="small muted">{{ fmtNum(device.last_ping_timetaken) }} ms ICMP</span></div>
      </div>

      <div v-if="device.type === 'network' && swCount !== 0" class="card"><WSwitches :config="{ device: device.hostname, embedded: true }" @count="(c) => (swCount = c)" /></div>

      <div class="card"><DeviceTraffic :device="device" :files="files" height="240px" /></div>

      <!-- tout le contenu de l'onglet Santé (processeurs, mémoire, stockage, capteurs) -->
      <div>
        <div class="row health-head">
          <HeartPulse :size="18" /><b>Santé</b><span class="grow"></span>
          <router-link :to="{ name: 'device', params: { host: device.hostname, tab: 'health' } }" class="small">Onglet Santé →</router-link>
        </div>
        <DevHealth :device="device" :files="files" compact class="health-in" />
      </div>

      <div class="card">
        <div class="card-title"><ArrowDownUp :size="17" /> Ports les plus actifs <div class="right"><router-link :to="{ name: 'device', params: { host: device.hostname, tab: 'ports' } }" class="small">Tous les ports →</router-link></div></div>
        <div v-if="!topPorts.length" class="empty small">Aucun port</div>
        <div v-for="p in topPorts" :key="p.port_id" class="tp-row">
          <router-link :to="`/port/${p.port_id}`" class="row" style="color:inherit;min-width:0">
            <span class="dot" :class="portStatus(p)"></span><b class="nowrap">{{ p.ifName }}</b><span class="muted small ellipsis">{{ p.ifAlias }}</span>
          </router-link>
          <div class="bar grow"><i :style="{ width: Math.max(1.5, portUtil(p)) + '%', background: utilColor(portUtil(p)) }"></i></div>
          <span class="small nowrap mono">↓ {{ fmtBits(p.ifInOctets_rate * 8) }} ↑ {{ fmtBits(p.ifOutOctets_rate * 8) }}</span>
        </div>
      </div>

      <div class="grid g2">
        <div v-if="has('poller-perf.rrd')" class="card"><RrdChart :host="device.hostname" file="poller-perf.rrd" :icon="Gauge" height="180px" range="-1d" hide-range :show-stats="false" title="Durée de polling (24 h)" :zoom="false" /></div>
        <div v-if="has('ucd_load.rrd')" class="card"><RrdChart :host="device.hostname" file="ucd_load.rrd" :icon="Cpu" height="180px" range="-1d" hide-range :show-stats="false" title="Load average (24 h)" :zoom="false" /></div>
        <div v-else-if="procFile" class="card"><RrdChart :host="device.hostname" :file="procFile" :icon="Cpu" height="180px" range="-1d" hide-range :show-stats="false" title="CPU (24 h)" :zoom="false" /></div>
      </div>

      <div class="card">
        <div class="card-title"><ScrollText :size="17" /> Évènements récents</div>
        <div v-for="(e, i) in events" :key="i" class="ev small">
          <span class="mono muted nowrap">{{ fmtDate(e.datetime) }}</span><span class="badge">{{ e.type }}</span><span class="ellipsis">{{ e.message }}</span>
        </div>
        <div v-if="!events.length" class="empty small">Aucun évènement</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Info, FileText, MapPin, ArrowDownUp, Gauge, Cpu, ScrollText, HeartPulse } from 'lucide-vue-next'
import DevHealth from './DevHealth.vue'
import Ring from '../../components/Ring.vue'
import RrdChart from '../../components/RrdChart.vue'
import MiniMap from '../../components/MiniMap.vue'
import DeviceTraffic from '../../components/DeviceTraffic.vue'
import WSwitches from '../../components/widgets/WSwitches.vue'
import { api, pick, safeList, L } from '../../api'
import { useLoader } from '../../refresh'
import { loadHealth } from '../../health'
import { devStatus, fmtUptime, fmtDate, fmtBytes, fmtBits, fmtNum, timeAgo, portStatus, portUtil, utilColor } from '../../utils'

const props = defineProps({ device: Object, files: Array })
const enc = L.enc
const has = (f) => props.files?.includes(f)
const procs = ref([])
const mempools = ref([])
const storage = ref([])
const ports = ref([])
const events = ref([])
const avail = ref(null)
const swCount = ref(null)

const info = computed(() => {
  const d = props.device
  return [
    ['Nom d\'hôte', d.hostname], ['sysName', d.sysName], ['IP', d.ip || d.overwrite_ip], ['Type', d.type], ['OS', `${d.os || ''} ${d.version || ''}`],
    ['Matériel', d.hardware], ['N° de série', d.serial], ['Fonctions', d.features], ['Contact', d.sysContact], ['Emplacement', d.location],
    ['Uptime', fmtUptime(d.uptime)], ['Dernier polling', `${timeAgo(d.last_polled)} (${fmtNum(d.last_polled_timetaken)} s)`],
    ['Dernière découverte', `${timeAgo(d.last_discovered)} (${fmtNum(d.last_discovered_timetaken)} s)`],
    ['SNMP', d.snmp_disable && +d.snmp_disable ? 'désactivé' : `${d.snmpver || ''} · ${d.transport || 'udp'}:${d.port || 161}`],
    ['Groupe de pollers', d.poller_group], ['Rôle', d.purpose], ['Notes', d.notes],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '' && String(v).trim() !== '')
})

const cpu = computed(() => procs.value.length ? procs.value.reduce((s, p) => s + (+p.processor_usage || 0), 0) / procs.value.length : 0)
const mem = computed(() => {
  const m = mempools.value.filter((x) => !['virtual', 'swap', 'buffers', 'cached', 'shared'].includes(x.mempool_class))
  const used = m.reduce((s, x) => s + (+x.mempool_used || 0), 0); const total = m.reduce((s, x) => s + (+x.mempool_total || 0), 0)
  const pct = total ? (used / total) * 100 : (m[0] ? +m[0].mempool_perc : 0)
  return { used, total, pct }
})
const disk = computed(() => {
  const used = storage.value.reduce((s, x) => s + (+x.storage_used || 0), 0); const total = storage.value.reduce((s, x) => s + (+x.storage_size || 0), 0)
  return { used, total, pct: total ? (used / total) * 100 : 0 }
})
const topPorts = computed(() => [...ports.value].filter((p) => !+p.deleted && p.ifType !== 'softwareLoopback').sort((a, b) => (+b.ifInOctets_rate + +b.ifOutOctets_rate) - (+a.ifInOctets_rate + +a.ifOutOctets_rate)).slice(0, 8))
const procFile = computed(() => (props.files || []).find((f) => f.startsWith('processor-')))

useLoader(async ({ silent }) => {
  const h = enc(props.device.hostname)
  const [hl, p, e, a] = await Promise.all([
    loadHealth(props.device.hostname, ['device_processor', 'device_mempool', 'device_storage']),
    safeList(`devices/${h}/ports`, { columns: 'port_id,ifName,ifAlias,ifType,ifOperStatus,ifAdminStatus,ifSpeed,ifInOctets_rate,ifOutOctets_rate,deleted,disabled' }, 'ports'),
    safeList(`logs/eventlog/${h}`, { limit: 10, sortorder: 'DESC' }, 'logs'),
    silent && avail.value !== null ? null : api.get(`devices/${h}/availability`).catch(() => null),
  ])
  procs.value = hl.data.device_processor || []
  mempools.value = hl.data.device_mempool || []
  storage.value = hl.data.device_storage || []
  ports.value = p; events.value = e
  if (a) {
    const list = pick(a, 'availability')
    const m = list.find((x) => +x.duration === 2592000) || list[list.length - 1]
    avail.value = m ? +m.availability_perc : null
  }
})
</script>

<style scoped>
.health-head { gap: 8px; margin-bottom: 12px; font-size: 15px; }
.health-in > :deep(.mb:last-child) { margin-bottom: 0; }
.ov { grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); }
@media (max-width: 1100px) { .ov { grid-template-columns: minmax(0, 1fr); } }
.ring-card { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 10px; }
.tp-row { display: grid; grid-template-columns: minmax(120px, 260px) 1fr auto; gap: 14px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border); }
.tp-row:last-child { border-bottom: 0; }
.ev { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border); }
.ev:last-child { border-bottom: 0; }
</style>
