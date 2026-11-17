<template>
  <div>
    <div v-if="error && !port" class="err">{{ error }}</div>
    <div v-else-if="!port" class="skeleton" style="height:140px"></div>
    <template v-else>
      <div class="page-head">
        <div>
          <div class="small muted row" style="gap:6px"><router-link v-if="device" :to="`/device/${enc(device.hostname)}/ports`">{{ devName(device) }}</router-link> <ChevronRight :size="13" /> {{ t('Port') }}</div>
          <h1 class="row"><span class="dot" :class="portStatus(port)"></span>{{ port.ifName || port.ifDescr }} <span class="muted" style="font-weight:500;font-size:16px">{{ port.ifAlias }}</span></h1>
        </div>
        <div class="right">
          <button v-if="canRealtime" class="btn" :class="{ primary: rtOpen }" :title="t('Débit mesuré en direct en SNMP, comme « Real time » dans LibreNMS')" @click="rtOpen = !rtOpen"><Radio /> {{ t('Temps réel') }}</button>
          <button v-if="!session.read_only && device" class="btn" @click="editDesc"><Pencil /> {{ t('Description') }}</button>
          <a v-if="device" class="btn" target="_blank" :href="`${session.librenms_url}/device/device=${device.device_id}/tab=port/port=${port.port_id}/`"><ExternalLink /> {{ t('LibreNMS') }}</a>
        </div>
      </div>

      <div class="grid g4 stagger">
        <div class="card big-stat"><span class="muted small">{{ t('Entrant') }}</span><b style="color:var(--in)">{{ fmtBits(port.ifInOctets_rate * 8) }}</b><div class="bar"><i :style="{ width: pIn + '%', background: 'var(--in)' }"></i></div><span class="small faint">{{ t('{p} % de {s}', { p: pIn.toFixed(1), s: fmtSpeed(port.ifSpeed) }) }}</span></div>
        <div class="card big-stat"><span class="muted small">{{ t('Sortant') }}</span><b style="color:var(--out)">{{ fmtBits(port.ifOutOctets_rate * 8) }}</b><div class="bar"><i :style="{ width: pOut + '%', background: 'var(--out)' }"></i></div><span class="small faint">{{ t('{p} % de {s}', { p: pOut.toFixed(1), s: fmtSpeed(port.ifSpeed) }) }}</span></div>
        <div class="card big-stat"><span class="muted small">{{ t('Paquets in / out') }}</span><b>{{ fmtNum(port.ifInUcastPkts_rate) }} / {{ fmtNum(port.ifOutUcastPkts_rate) }}</b><span class="small faint">{{ t('pps unicast') }}</span></div>
        <div class="card big-stat"><span class="muted small">{{ t('Erreurs in / out') }}</span><b :style="{ color: errs ? 'var(--red)' : '' }">{{ fmtNum(port.ifInErrors_rate) }} / {{ fmtNum(port.ifOutErrors_rate) }}</b><span class="small faint">{{ t('par seconde · discards {i}/{o}', { i: fmtNum(port.ifInDiscards_rate), o: fmtNum(port.ifOutDiscards_rate) }) }}</span></div>
      </div>

      <RealtimePort v-if="rtOpen && canRealtime" :key="port.port_id" :port-id="port.port_id" class="mt" @close="rtOpen = false" />

      <div class="card mt">
        <div class="card-title"><Activity :size="17" /> {{ t('Graphiques') }}
          <div class="right">
            <div class="seg"><button v-for="v in views" :key="v.id" :class="{ on: view === v.id }" @click="view = v.id">{{ v.l }}</button></div>
            <RangePicker v-model="range" />
          </div>
        </div>
        <!-- comme dans LibreNMS : la même métrique sur 4 périodes côte à côte ; un clic l'affiche en grand -->
        <div class="grid g4 periods">
          <div v-for="pr in PERIODS" :key="pr.v" class="period" :class="{ on: range === pr.v }" role="button" tabindex="0" :aria-pressed="range === pr.v"
            :title="t('Afficher {p} en grand', { p: pr.l })" @click="range = pr.v" @keydown.enter.prevent="range = pr.v" @keydown.space.prevent="range = pr.v">
            <span class="period-lbl">{{ pr.l }}</span>
            <RrdChart v-if="hasRrd" :key="view + pr.v" :host="device.hostname" :file="`port-id${port.port_id}.rrd`" :range="pr.v" hide-range compact :axes="true"
              :show-stats="false" :zoom="false" :ds="curView.ds" :unit="curView.unit" height="120px" />
            <ApiGraph v-else-if="device" :path="`devices/${enc(device.hostname)}/ports/${enc(port.ifName)}/${curView.png}`" :range="pr.v" :width="400" :height="130" />
          </div>
        </div>
        <RrdChart v-if="hasRrd" :key="view" :host="device.hostname" :file="`port-id${port.port_id}.rrd`" :range="range" hide-range :ds="curView.ds" :unit="curView.unit" height="340px" />
        <ApiGraph v-else-if="device" :path="`devices/${enc(device.hostname)}/ports/${enc(port.ifName)}/${curView.png}`" :range="range" :height="300" />
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <div class="card-title"><Info :size="17" /> {{ t('Détails') }}</div>
          <dl class="kv small"><template v-for="[k, v] in details" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
        </div>
        <div class="col" style="gap:18px">
          <div class="card">
            <div class="card-title"><Globe :size="17" /> {{ t('Adresses IP') }}</div>
            <div v-if="!ips.length" class="muted small">{{ t('Aucune') }}</div>
            <div class="chip-list"><span v-for="i in ips" :key="i.ipv4_address || i.ipv6_address" class="badge accent mono">{{ i.ipv4_address || i.ipv6_address }}/{{ i.ipv4_prefixlen || i.ipv6_prefixlen }}</span></div>
          </div>
          <div class="card">
            <div class="card-title"><Table2 :size="17" /> {{ t('MAC apprises (FDB)') }} <span class="sub">{{ fdb.length }}</span></div>
            <DataTable :rows="fdb" :columns="[{ key: 'mac_address', label: 'MAC', class: 'mono', format: fmtMac }, { key: 'vlan_id', label: 'VLAN' }, { key: 'updated_at', label: t('Vu'), format: (v) => timeAgo(v) }]" :page-size="10" :exportable="false" />
          </div>
        </div>
      </div>
    </template>

    <Modal v-if="descOpen" :title="t('Description du port')" :icon="Pencil" @close="descOpen = false">
      <input v-model="desc" class="input" style="width:100%" placeholder="ifAlias" />
      <p class="small muted">{{ t('Laisser vide pour revenir à la valeur SNMP.') }}</p>
      <template #foot><button class="btn" @click="descOpen = false">{{ t('Annuler') }}</button><button class="btn primary" @click="saveDesc"><Save /> {{ t('Enregistrer') }}</button></template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, Pencil, ExternalLink, Activity, Info, Globe, Table2, Save, Radio } from 'lucide-vue-next'
import RealtimePort from '../components/RealtimePort.vue'
import RrdChart from '../components/RrdChart.vue'
import ApiGraph from '../components/ApiGraph.vue'
import RangePicker from '../components/RangePicker.vue'
import DataTable from '../components/DataTable.vue'
import Modal from '../components/Modal.vue'
import { session, api, pick, safeList, devicesCached, rrd, L } from '../api'
import { useLoader } from '../refresh'
import { timeAgo, devName, portStatus, fmtBits, fmtSpeed, fmtNum, fmtUptime, prefs, toast, toastError, RANGES } from '../utils'
import { locale } from '../i18n'
import { t } from '../i18n'

const route = useRoute()
const fmtMac = (m) => (m && m.length === 12 ? m.match(/../g).join(':') : m || '—')
const enc = L.enc
const port = ref(null)
const device = ref(null)
const ips = ref([])
const fdb = ref([])
const hasRrd = ref(false)
// temps réel : lecture SNMP directe, impossible sur un équipement supervisé par ping
const rtOpen = ref(route.query.realtime === '1')
const canRealtime = computed(() => session.realtime && device.value && !+device.value.snmp_disable)
const range = ref(prefs.range)
const view = ref('bits')
const views = [
  { id: 'bits', l: t('Trafic'), unit: 'bits', png: 'port_bits', ds: { INOCTETS: { label: t('Entrant'), mul: 8 }, OUTOCTETS: { label: t('Sortant'), mul: 8, negate: true } } },
  { id: 'upkts', l: t('Paquets'), unit: 'pps', png: 'port_upkts', ds: { INUCASTPKTS: { label: t('Unicast in') }, OUTUCASTPKTS: { label: t('Unicast out'), negate: true } } },
  { id: 'nupkts', l: t('Broad/Multicast'), unit: 'pps', png: 'port_nupkts', ds: { INBROADCASTPKTS: { label: t('Broadcast in') }, OUTBROADCASTPKTS: { label: t('Broadcast out'), negate: true }, INMULTICASTPKTS: { label: t('Multicast in') }, OUTMULTICASTPKTS: { label: t('Multicast out'), negate: true } } },
  { id: 'errors', l: t('Erreurs'), unit: 'ps', png: 'port_errors', ds: { INERRORS: { label: t('Erreurs in'), color: '#f43f5e' }, OUTERRORS: { label: t('Erreurs out'), negate: true, color: '#fb923c' }, INDISCARDS: { label: t('Discards in'), color: '#facc15' }, OUTDISCARDS: { label: t('Discards out'), negate: true, color: '#f472b6' } } },
]
const curView = computed(() => views.find((v) => v.id === view.value))
// les 4 périodes des vignettes (jour, semaine, mois, année)
const PERIODS = RANGES.filter((r) => ['-1d', '-7d', '-30d', '-1y'].includes(r.v))
const pIn = computed(() => (port.value?.ifSpeed ? Math.min(100, (port.value.ifInOctets_rate * 800) / port.value.ifSpeed) : 0))
const pOut = computed(() => (port.value?.ifSpeed ? Math.min(100, (port.value.ifOutOctets_rate * 800) / port.value.ifSpeed) : 0))
const errs = computed(() => +port.value?.ifInErrors_rate + +port.value?.ifOutErrors_rate > 0)
const details = computed(() => {
  const p = port.value
  const mac = p.ifPhysAddress && p.ifPhysAddress.length === 12 ? p.ifPhysAddress.match(/../g).join(':') : p.ifPhysAddress
  return [
    ['ifIndex', p.ifIndex], ['ifDescr', p.ifDescr], ['ifName', p.ifName], ['ifAlias', p.ifAlias], ['Type', p.ifType], [t('Vitesse'), fmtSpeed(p.ifSpeed)],
    ['Duplex', p.ifDuplex], ['MTU', p.ifMtu], ['MAC', mac], ['VLAN', p.ifVlan], ['Trunk', p.ifTrunk], [t('État admin'), p.ifAdminStatus], [t('État opérationnel'), p.ifOperStatus],
    [t('Dernier changement'), device.value && p.ifLastChange ? t('il y a {n} {u}', { n: fmtUptime(device.value.uptime - p.ifLastChange / 100), u: '' }).trim() : null],
    [t('Octets in / out'), `${fmtNum(p.ifInOctets)} / ${fmtNum(p.ifOutOctets)}`], [t('Dernier polling'), p.poll_time ? new Date(p.poll_time * 1000).toLocaleString(locale) : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '')
})

const { error } = useLoader(async ({ silent }) => {
  const id = route.params.id
  const p = pick(await api.get(`ports/${id}`), 'port')[0]
  if (!p) throw new Error(t('Port introuvable'))
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
    port.value.ifAlias = desc.value; descOpen.value = false; toast(t('Description mise à jour'), 'success')
  } catch (e) { toastError(e) }
}
</script>

<style scoped>
.big-stat { display: flex; flex-direction: column; gap: 8px; }
.periods { gap: 10px; margin-bottom: 14px; }
.period { box-sizing: border-box; display: block; min-width: 0; cursor: pointer; padding: 8px 8px 4px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--panel-2); transition: border-color .15s, box-shadow .15s; }
.period:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
.period.on { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
.period:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.period-lbl { display: block; font-size: 11.5px; font-weight: 600; color: var(--muted); margin: 0 0 2px 2px; }
.period.on .period-lbl { color: var(--accent); }
.period :deep(img) { width: 100%; height: auto; display: block; }
.big-stat b { font-size: 24px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
</style>
