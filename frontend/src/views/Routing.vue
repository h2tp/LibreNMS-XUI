<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Routage') }}</h1><div class="sub">{{ t('Sessions BGP, OSPF, VRF et MPLS de l\'ensemble du parc') }}</div></div></div>
    <div class="tabs"><button v-for="tb in tabs" :key="tb.id" :class="{ on: tab === tb.id }" @click="$router.replace(`/routing/${tb.id === 'bgp' ? '' : tb.id}`)">{{ tb.label }}</button></div>
    <div v-if="tab === 'bgp'" class="grid g4 mb stagger">
      <StatCard :icon="Route" :label="t('Sessions BGP')" :value="bgp.length" color="#22d3ee" />
      <StatCard :icon="CircleCheck" :label="t('Établies')" :value="bgp.filter((b) => b.bgpPeerState === 'established').length" color="#22c55e" />
      <StatCard :icon="CircleX" :label="t('Non établies')" :value="bgp.filter((b) => b.bgpPeerState !== 'established' && b.bgpPeerAdminStatus !== 'stop').length" color="#f43f5e" />
      <StatCard :icon="Globe" :label="t('AS distincts')" :value="new Set(bgp.map((b) => b.bgpPeerRemoteAs)).size" color="#a78bfa" />
    </div>
    <div class="card">
      <ApiTable :key="tab" :path="cur.path" :list-key="cur.key" :columns="cur.cols ? [{ key: 'device_id', label: t('Équipement') }, ...cur.cols.filter((c) => c.key !== 'device_id')] : undefined" :filename="`${tab}.csv`" @loaded="(r) => tab === 'bgp' && (bgp = r)">
        <template #c-device_id="{ row }"><DeviceCell :device="devById[row.device_id]" :show-icon="false" :sub="false" :fallback="row.device_id" /></template>
        <template #c-bgpPeerState="{ row }"><span class="badge" :class="row.bgpPeerState === 'established' ? 'ok' : 'critical'">{{ row.bgpPeerState }}</span></template>
        <template #c-ospfNbrState="{ row }"><span class="badge" :class="row.ospfNbrState === 'full' ? 'ok' : 'warning'">{{ row.ospfNbrState }}</span></template>
        <template #c-bgpPeerFsmEstablishedTime="{ row }">{{ fmtUptime(row.bgpPeerFsmEstablishedTime) }}</template>
      </ApiTable>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Route, CircleCheck, CircleX, Globe } from 'lucide-vue-next'
import ApiTable from '../components/ApiTable.vue'
import StatCard from '../components/StatCard.vue'
import DeviceCell from '../components/DeviceCell.vue'
import { devicesCached } from '../api'
import { BGP_COLS, OSPF_COLS, OSPF_PORT_COLS, VRF_COLS } from '../columns'
import { fmtUptime } from '../utils'
import { t } from '../i18n'
const route = useRoute()
const tab = computed(() => route.params.tab || 'bgp')
const bgp = ref([])
const devById = ref({})
const tabs = [{ id: 'bgp', label: 'BGP' }, { id: 'cbgp', label: t('BGP (compteurs)') }, { id: 'ospf', label: t('Voisins OSPF') }, { id: 'ospf_ports', label: t('Interfaces OSPF') }, { id: 'ospfv3', label: t('OSPFv3') }, { id: 'vrf', label: 'VRF' }, { id: 'mpls', label: 'MPLS' }]
const defs = {
  bgp: { path: 'bgp', key: 'bgp_sessions', cols: BGP_COLS },
  cbgp: { path: 'routing/bgp/cbgp', key: 'bgp_counters' },
  ospf: { path: 'ospf', key: 'ospf_neighbours', cols: OSPF_COLS },
  ospf_ports: { path: 'ospf_ports', key: 'ospf_ports', cols: OSPF_PORT_COLS },
  ospfv3: { path: 'ospfv3', key: 'ospfv3_neighbours' },
  vrf: { path: 'routing/vrf', key: 'vrfs', cols: VRF_COLS },
  mpls: { path: 'routing/mpls/services', key: 'mpls_services' },
}
const cur = computed(() => defs[tab.value] || defs.bgp)
onMounted(async () => { devById.value = Object.fromEntries((await devicesCached().catch(() => [])).map((d) => [d.device_id, d])) })
</script>
