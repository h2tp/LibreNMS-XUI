<template>
  <div>
    <div v-if="error && !port" class="err">{{ error }}</div>
    <div v-else-if="!port" class="skeleton" style="height:140px"></div>
    <template v-else>
      <div class="page-head">
        <div>
          <div class="small muted row" style="gap:6px"><router-link v-if="device" :to="`/device/${enc(device.hostname)}/ports`">{{ devName(device) }}</router-link> <ChevronRight :size="13" /> Port</div>
          <h1 class="row"><span class="dot" :class="portStatus(port)"></span>{{ port.ifName || port.ifDescr }} <span class="muted" style="font-weight:500;font-size:16px">{{ port.ifAlias }}</span></h1>
        </div>
        <div class="right">
          <button v-if="!session.read_only && device" class="btn" @click="editDesc"><Pencil /> Description</button>
          <a v-if="device" class="btn" target="_blank" :href="`${session.librenms_url}/device/device=${device.device_id}/tab=port/port=${port.port_id}/`"><ExternalLink /> LibreNMS</a>
        </div>
      </div>

      <div class="grid g4 stagger">
        <div class="card big-stat"><span class="muted small">Entrant</span><b style="color:var(--accent)">{{ fmtBits(port.ifInOctets_rate * 8) }}</b><div class="bar"><i :style="{ width: pIn + '%', background: 'var(--accent)' }"></i></div><span class="small faint">{{ pIn.toFixed(1) }} % de {{ fmtSpeed(port.ifSpeed) }}</span></div>
        <div class="card big-stat"><span class="muted small">Sortant</span><b style="color:#a78bfa">{{ fmtBits(port.ifOutOctets_rate * 8) }}</b><div class="bar"><i :style="{ width: pOut + '%', background: '#a78bfa' }"></i></div><span class="small faint">{{ pOut.toFixed(1) }} % de {{ fmtSpeed(port.ifSpeed) }}</span></div>
        <div class="card big-stat"><span class="muted small">Paquets in / out</span><b>{{ fmtNum(port.ifInUcastPkts_rate) }} / {{ fmtNum(port.ifOutUcastPkts_rate) }}</b><span class="small faint">pps unicast</span></div>
        <div class="card big-stat"><span class="muted small">Erreurs in / out</span><b :style="{ color: errs ? 'var(--red)' : '' }">{{ fmtNum(port.ifInErrors_rate) }} / {{ fmtNum(port.ifOutErrors_rate) }}</b><span class="small faint">par seconde · discards {{ fmtNum(port.ifInDiscards_rate) }}/{{ fmtNum(port.ifOutDiscards_rate) }}</span></div>
      </div>

      <div class="card mt">
        <div class="card-title"><Activity :size="17" /> Graphiques
          <div class="right">
            <div class="seg"><button v-for="v in views" :key="v.id" :class="{ on: view === v.id }" @click="view = v.id">{{ v.l }}</button></div>
            <RangePicker v-model="range" />
          </div>
        </div>
        <RrdChart v-if="hasRrd" :key="view" :host="device.hostname" :file="`port-id${port.port_id}.rrd`" :range="range" hide-range :ds="views.find((v) => v.id === view).ds" :unit="views.find((v) => v.id === view).unit" height="340px" />
        <ApiGraph v-else-if="device" :path="`devices/${enc(device.hostname)}/ports/${enc(port.ifName)}/${views.find((v) => v.id === view).png}`" :range="range" :height="300" />
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <div class="card-title"><Info :size="17" /> Détails</div>
          <dl class="kv small"><template v-for="[k, v] in details" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
        </div>
        <div class="col" style="gap:18px">
          <div class="card">
            <div class="card-title"><Globe :size="17" /> Adresses IP</div>
            <div v-if="!ips.length" class="muted small">Aucune</div>
            <div class="chip-list"><span v-for="i in ips" :key="i.ipv4_address || i.ipv6_address" class="badge accent mono">{{ i.ipv4_address || i.ipv6_address }}/{{ i.ipv4_prefixlen || i.ipv6_prefixlen }}</span></div>
          </div>
          <div class="card">
            <div class="card-title"><Table2 :size="17" /> MAC apprises (FDB) <span class="sub">{{ fdb.length }}</span></div>
            <DataTable :rows="fdb" :columns="[{ key: 'mac_address', label: 'MAC', class: 'mono', format: fmtMac }, { key: 'vlan_id', label: 'VLAN' }, { key: 'updated_at', label: 'Vu', format: (v) => timeAgo(v) }]" :page-size="10" :exportable="false" />
          </div>
        </div>
      </div>
    </template>

    <Modal v-if="descOpen" title="Description du port" :icon="Pencil" @close="descOpen = false">
      <input v-model="desc" class="input" style="width:100%" placeholder="ifAlias" />
      <p class="small muted">Laisser vide pour revenir à la valeur SNMP.</p>
      <template #foot><button class="btn" @click="descOpen = false">Annuler</button><button class="btn primary" @click="saveDesc"><Save /> Enregistrer</button></template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, Pencil, ExternalLink, Activity, Info, Globe, Table2, Save } from 'lucide-vue-next'
import RrdChart from '../components/RrdChart.vue'
import ApiGraph from '../components/ApiGraph.vue'
import RangePicker from '../components/RangePicker.vue'
import DataTable from '../components/DataTable.vue'
import Modal from '../components/Modal.vue'
import { session, api, pick, safeList, devicesCached, rrd, L } from '../api'
import { useLoader } from '../refresh'
import { timeAgo, devName, portStatus, fmtBits, fmtSpeed, fmtNum, fmtUptime, prefs, toast, toastError } from '../utils'

const route = useRoute()
const fmtMac = (m) => (m && m.length === 12 ? m.match(/../g).join(':') : m || '—')
const enc = L.enc
const port = ref(null)
const device = ref(null)
const ips = ref([])
const fdb = ref([])
const hasRrd = ref(false)
const range = ref(prefs.range)
const view = ref('bits')
const views = [
  { id: 'bits', l: 'Trafic', unit: 'bits', png: 'port_bits', ds: { INOCTETS: { label: 'Entrant', mul: 8 }, OUTOCTETS: { label: 'Sortant', mul: 8, negate: true } } },
  { id: 'upkts', l: 'Paquets', unit: 'pps', png: 'port_upkts', ds: { INUCASTPKTS: { label: 'Unicast in' }, OUTUCASTPKTS: { label: 'Unicast out', negate: true } } },
  { id: 'nupkts', l: 'Broad/Multicast', unit: 'pps', png: 'port_nupkts', ds: { INBROADCASTPKTS: { label: 'Broadcast in' }, OUTBROADCASTPKTS: { label: 'Broadcast out', negate: true }, INMULTICASTPKTS: { label: 'Multicast in' }, OUTMULTICASTPKTS: { label: 'Multicast out', negate: true } } },
  { id: 'errors', l: 'Erreurs', unit: 'ps', png: 'port_errors', ds: { INERRORS: { label: 'Erreurs in', color: '#f43f5e' }, OUTERRORS: { label: 'Erreurs out', negate: true, color: '#fb923c' }, INDISCARDS: { label: 'Discards in', color: '#facc15' }, OUTDISCARDS: { label: 'Discards out', negate: true, color: '#f472b6' } } },
]
const pIn = computed(() => (port.value?.ifSpeed ? Math.min(100, (port.value.ifInOctets_rate * 800) / port.value.ifSpeed) : 0))
const pOut = computed(() => (port.value?.ifSpeed ? Math.min(100, (port.value.ifOutOctets_rate * 800) / port.value.ifSpeed) : 0))
const errs = computed(() => +port.value?.ifInErrors_rate + +port.value?.ifOutErrors_rate > 0)
const details = computed(() => {
  const p = port.value
  const mac = p.ifPhysAddress && p.ifPhysAddress.length === 12 ? p.ifPhysAddress.match(/../g).join(':') : p.ifPhysAddress
  return [
    ['ifIndex', p.ifIndex], ['ifDescr', p.ifDescr], ['ifName', p.ifName], ['ifAlias', p.ifAlias], ['Type', p.ifType], ['Vitesse', fmtSpeed(p.ifSpeed)],
    ['Duplex', p.ifDuplex], ['MTU', p.ifMtu], ['MAC', mac], ['VLAN', p.ifVlan], ['Trunk', p.ifTrunk], ['État admin', p.ifAdminStatus], ['État opérationnel', p.ifOperStatus],
    ['Dernier changement', device.value && p.ifLastChange ? `il y a ${fmtUptime(device.value.uptime - p.ifLastChange / 100)}` : null],
    ['Octets in / out', `${fmtNum(p.ifInOctets)} / ${fmtNum(p.ifOutOctets)}`], ['Dernier polling', p.poll_time ? new Date(p.poll_time * 1000).toLocaleString('fr-FR') : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '')
})

const { error } = useLoader(async ({ silent }) => {
  const id = route.params.id
  const p = pick(await api.get(`ports/${id}`), 'port')[0]
  if (!p) throw new Error('Port introuvable')
  port.value = p
  if (silent) return
  const devs = await devicesCached()
  device.value = devs.find((d) => +d.device_id === +p.device_id) || null
  if (device.value && session.rrd) {
    hasRrd.value = (await rrd.list(device.value.hostname).catch(() => ({ files: [] }))).files.some((f) => f.name === `port-id${id}.rrd`)
  }
  ips.value = await safeList(`ports/${id}/ip`, null, 'addresses')
  fdb.value = await safeList(`ports/${id}/fdb`, null, 'macs')
})

const descOpen = ref(false)
const desc = ref('')
function editDesc() { desc.value = port.value.ifAlias || ''; descOpen.value = true }
async function saveDesc() {
  try {
    await api.patch(`ports/${port.value.port_id}/description`, { description: desc.value })
    port.value.ifAlias = desc.value; descOpen.value = false; toast('Description mise à jour', 'success')
  } catch (e) { toastError(e) }
}
</script>

<style scoped>
.big-stat { display: flex; flex-direction: column; gap: 8px; }
.big-stat b { font-size: 24px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
</style>
