<template>
  <div>
    <div class="page-head"><div><h1>Ressources IP / MAC</h1><div class="sub">Recherche dans les adresses IP, ARP, FDB, VLANs et réseaux</div></div></div>
    <div class="tabs"><button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id }" @click="$router.replace(`/resources/${t.id === 'ip' ? '' : t.id}`)"><component :is="t.icon" />{{ t.label }}</button></div>
    <div v-if="needsQuery" class="card mb">
      <form class="row" @submit.prevent="query = q.trim()">
        <input v-model="q" class="input grow mono" :placeholder="tab === 'arp' ? 'IP, MAC ou CIDR (ex. 192.168.1.0/24) — « all » pour tout' : 'Adresse MAC (ex. 00:11:22:33:44:55 ou partielle)'" />
        <button class="btn primary"><Search /> Rechercher</button>
      </form>
    </div>
    <div class="card">
      <div v-if="needsQuery && !query" class="empty"><Search /><div>Saisissez une recherche</div></div>
      <ApiTable v-else :key="tab + query" :path="cur.path" :list-key="cur.key" :columns="cur.cols" :transform="withDevice" :filename="`${tab}.csv`" :auto="false">
        <template #c-device="{ row }"><DeviceCell :device="devById[row.device_id]" :show-icon="false" :sub="false" :fallback="row.device_id" /></template>
        <template #c-port_id="{ row }"><router-link v-if="row.port_id" :to="`/port/${row.port_id}`">port #{{ row.port_id }}</router-link></template>
        <template #c-mac_address="{ row }"><span class="mono">{{ mac(row.mac_address) }}</span></template>
      </ApiTable>
    </div>
  </div>
</template>
<script setup>
import { timeAgo } from '../utils'
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Globe, Waypoints, Table2, Tag, Network, Search } from 'lucide-vue-next'
import ApiTable from '../components/ApiTable.vue'
import DeviceCell from '../components/DeviceCell.vue'
import { devicesCached } from '../api'
const route = useRoute()
const tab = computed(() => route.params.tab || 'ip')
const q = ref('')
const query = ref('')
watch(tab, () => { q.value = ''; query.value = '' })
const devById = ref({})
const mac = (m) => (m && m.length === 12 ? m.match(/../g).join(':') : m)
const withDevice = (rows) => rows.map((r) => ({ ...r, device: r.hostname || r.device_id }))
const tabs = [{ id: 'ip', label: 'Adresses IP', icon: Globe }, { id: 'networks', label: 'Réseaux', icon: Network }, { id: 'arp', label: 'ARP', icon: Waypoints }, { id: 'fdb', label: 'FDB (MAC)', icon: Table2 }, { id: 'vlans', label: 'VLANs', icon: Tag }]
const needsQuery = computed(() => ['arp', 'fdb'].includes(tab.value))
const cur = computed(() => ({
  ip: { path: 'resources/ip/addresses', key: 'ip_addresses', cols: [{ key: 'device', label: 'Équipement' }, { key: 'ipv4_address', label: 'IPv4', class: 'mono' }, { key: 'ipv6_address', label: 'IPv6', class: 'mono' }, { key: 'ipv4_prefixlen', label: '/' }, { key: 'port_id', label: 'Port' }, { key: 'context_name', label: 'Contexte' }] },
  networks: { path: 'resources/ip/networks', key: 'ip_networks', cols: [{ key: 'ipv4_network', label: 'Réseau IPv4', class: 'mono' }, { key: 'ipv6_network', label: 'Réseau IPv6', class: 'mono' }, { key: 'context_name', label: 'Contexte' }] },
  arp: { path: `resources/ip/arp/${query.value.split('/').map(encodeURIComponent).join('/')}`, key: 'arp', cols: [{ key: 'device', label: 'Équipement' }, { key: 'ipv4_address', label: 'IP', class: 'mono' }, { key: 'mac_address', label: 'MAC' }, { key: 'port_id', label: 'Port' }, { key: 'context_name', label: 'Contexte' }] },
  fdb: { path: `resources/fdb/${encodeURIComponent(query.value)}`, key: 'ports_fdb', cols: [{ key: 'device', label: 'Équipement' }, { key: 'mac_address', label: 'MAC' }, { key: 'port_id', label: 'Port' }, { key: 'vlan_id', label: 'VLAN' }, { key: 'updated_at', label: 'Vu', format: (v) => timeAgo(v) }] },
  vlans: { path: 'resources/vlans', key: 'vlans', cols: [{ key: 'device', label: 'Équipement' }, { key: 'vlan_vlan', label: 'VLAN' }, { key: 'vlan_name', label: 'Nom' }, { key: 'vlan_type', label: 'Type' }, { key: 'vlan_state', label: 'État' }] },
}[tab.value]))
onMounted(async () => { devById.value = Object.fromEntries((await devicesCached().catch(() => [])).map((d) => [d.device_id, d])) })
</script>
