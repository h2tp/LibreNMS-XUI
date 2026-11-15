<template>
  <div>
    <div class="seg mb">
      <button v-for="s in subs" :key="s.id" :class="{ on: sub === s.id }" @click="sub = s.id"><component :is="s.icon" />{{ s.label }}</button>
    </div>
    <div class="card" v-if="sub === 'links'">
      <div v-if="links.length" class="mb"><EChart :option="graph" height="380px" @click="onNode" /></div>
      <DataTable :rows="links" :columns="linkCols" :filename="`voisins-${device.hostname}.csv`" empty-text="Aucun voisin CDP/LLDP">
        <template #c-local_port_id="{ row }"><router-link :to="`/port/${row.local_port_id}`">{{ portName(row.local_port_id) }}</router-link></template>
        <template #c-remote_hostname="{ row }">
          <router-link v-if="row.remote_device_id && devById[row.remote_device_id]" :to="`/device/${enc(devById[row.remote_device_id].hostname)}`">{{ row.remote_hostname }}</router-link>
          <span v-else>{{ row.remote_hostname }}</span>
        </template>
      </DataTable>
    </div>
    <div class="card" v-else>
      <ApiTable :key="sub" :path="cur.path" :params="cur.params" :list-key="cur.key" :columns="cur.cols" :transform="cur.transform" :filename="`${sub}-${device.hostname}.csv`">
        <template #c-port_id="{ row }"><router-link v-if="row.port_id" :to="`/port/${row.port_id}`">{{ portName(row.port_id) }}</router-link></template>
        <template #c-mac_address="{ row }"><span class="mono">{{ fmtMac(row.mac_address) }}</span></template>
      </ApiTable>
    </div>
  </div>
</template>

<script setup>
import { timeAgo } from '../../utils'
import { ref, computed, onMounted } from 'vue'
import { Share2, Globe, Tag, Table2, Waypoints, Layers, Radio } from 'lucide-vue-next'
import ApiTable from '../../components/ApiTable.vue'
import DataTable from '../../components/DataTable.vue'
import EChart from '../../components/EChart.vue'
import { safeList, devicesCached, L } from '../../api'
import { devName, devStatus } from '../../utils'
import { css } from '../../charts'
import { useRouter } from 'vue-router'
import { t } from '../../i18n'

const props = defineProps({ device: Object })
const router = useRouter()
const enc = L.enc
const h = enc(props.device.hostname)
const sub = ref('links')
const ports = ref({})
const links = ref([])
const devById = ref({})
const portName = (id) => ports.value[id] || `#${id}`
const fmtMac = (m) => (m && m.length === 12 ? m.match(/../g).join(':') : m)
const addPort = (rows) => rows.map((r) => ({ ...r, port: ports.value[r.port_id] }))

const subs = [
  { id: 'links', label: t('Voisins'), icon: Share2 },
  { id: 'ip', label: t('Adresses IP'), icon: Globe },
  { id: 'vlans', label: t('VLANs'), icon: Tag },
  { id: 'fdb', label: t('Table FDB'), icon: Table2 },
  { id: 'arp', label: 'ARP', icon: Waypoints },
  { id: 'stack', label: t('Pile de ports'), icon: Layers },
  { id: 'transceivers', label: t('Transceivers'), icon: Radio },
]
const defs = {
  ip: { path: `devices/${h}/ip`, key: 'addresses', cols: [{ key: 'ipv4_address', label: t('IPv4') }, { key: 'ipv6_address', label: t('IPv6') }, { key: 'ipv4_prefixlen', label: t('Préfixe') }, { key: 'ipv6_prefixlen', label: t('Préfixe v6') }, { key: 'port_id', label: t('Port') }, { key: 'context_name', label: t('Contexte') }] },
  vlans: { path: `devices/${h}/vlans`, key: 'vlans', cols: [{ key: 'vlan_vlan', label: 'VLAN' }, { key: 'vlan_name', label: t('Nom') }, { key: 'vlan_type', label: t('Type') }, { key: 'vlan_state', label: t('État') }, { key: 'vlan_domain', label: t('Domaine') }] },
  fdb: { path: `devices/${h}/fdb`, key: 'ports_fdb', cols: [{ key: 'mac_address', label: 'MAC' }, { key: 'port_id', label: t('Port') }, { key: 'vlan_id', label: 'VLAN' }, { key: 'updated_at', label: t('Vu'), format: (v) => timeAgo(v) }] },
  arp: { path: 'resources/ip/arp/all', params: { device: props.device.hostname }, key: 'arp', cols: [{ key: 'ipv4_address', label: 'IP' }, { key: 'mac_address', label: 'MAC' }, { key: 'port_id', label: t('Port') }, { key: 'context_name', label: t('Contexte') }] },
  stack: { path: `devices/${h}/port_stack`, key: 'mappings', cols: [{ key: 'port_id_high', label: t('Port parent') }, { key: 'port_id_low', label: t('Port enfant') }, { key: 'ifStackStatus', label: t('État') }],
    transform: (r) => r.map((x) => ({ ...x, port_id_high: ports.value[x.port_id_high] || x.port_id_high, port_id_low: ports.value[x.port_id_low] || x.port_id_low })) },
  transceivers: { path: `devices/${h}/transceivers`, key: 'transceivers', cols: [{ key: 'port_id', label: t('Port') }, { key: 'type', label: t('Type') }, { key: 'vendor', label: t('Fabricant') }, { key: 'model', label: t('Modèle') }, { key: 'serial', label: t('N° série') }, { key: 'distance', label: t('Distance') }, { key: 'wavelength', label: t('λ (nm)') }, { key: 'connector', label: t('Connecteur') }] },
}
const cur = computed(() => defs[sub.value] || defs.ip)
const linkCols = [
  { key: 'local_port_id', label: t('Port local') }, { key: 'remote_hostname', label: t('Voisin') }, { key: 'remote_port', label: t('Port distant') },
  { key: 'remote_platform', label: t('Plateforme') }, { key: 'protocol', label: t('Protocole') }, { key: 'remote_version', label: t('Version') },
]

const graph = computed(() => {
  const me = devName(props.device)
  const nodes = [{ id: 'me', name: me, symbolSize: 54, itemStyle: { color: '#22d3ee' }, label: { show: true, fontWeight: 700 } }]
  const edges = []
  const seen = new Set()
  links.value.forEach((l) => {
    const id = 'n' + (l.remote_device_id || l.remote_hostname)
    if (!seen.has(id)) {
      seen.add(id)
      const d = devById.value[l.remote_device_id]
      nodes.push({ id, name: l.remote_hostname, symbolSize: 32, dev: d, itemStyle: { color: d ? (devStatus(d) === 'down' ? '#f43f5e' : '#a78bfa') : '#64748b' } })
    }
    edges.push({ source: 'me', target: id, value: `${portName(l.local_port_id)} ↔ ${l.remote_port}` })
  })
  return {
    tooltip: { formatter: (p) => p.dataType === 'edge' ? p.data.value : p.data.name, backgroundColor: css('--panel-solid'), textStyle: { color: css('--text') } },
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true, data: nodes, links: edges,
      force: { repulsion: 500, edgeLength: [120, 200] }, label: { show: true, position: 'bottom', color: css('--text') },
      lineStyle: { color: css('--border-strong'), width: 2, curveness: 0.1 }, emphasis: { focus: 'adjacency' }, animationDuration: 1500,
    }],
  }
})
function onNode(p) { if (p.dataType === 'node' && p.data.dev) router.push(`/device/${enc(p.data.dev.hostname)}`) }

onMounted(async () => {
  const [p, l, d] = await Promise.all([
    safeList(`devices/${h}/ports`, { columns: 'port_id,ifName' }, 'ports'),
    safeList(`devices/${h}/links`, null, 'links'),
    devicesCached().catch(() => []),
  ])
  ports.value = Object.fromEntries(p.map((x) => [x.port_id, x.ifName]))
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  links.value = l
})
</script>
