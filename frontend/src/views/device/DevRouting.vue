<template>
  <div>
    <div class="seg mb">
      <button v-for="s in subs" :key="s.id" :class="{ on: sub === s.id }" @click="sub = s.id">{{ s.label }}</button>
    </div>
    <div class="card">
      <ApiTable :key="sub" :path="cur.path" :params="cur.params" :list-key="cur.key" :columns="cur.cols" :filename="`${sub}-${device.hostname}.csv`" empty-text="Aucune session pour cet équipement">
        <template #c-bgpPeerState="{ row }"><span class="badge" :class="row.bgpPeerState === 'established' ? 'ok' : 'critical'">{{ row.bgpPeerState }}</span></template>
        <template #c-ospfNbrState="{ row }"><span class="badge" :class="row.ospfNbrState === 'full' ? 'ok' : 'warning'">{{ row.ospfNbrState }}</span></template>
        <template #c-bgpPeerFsmEstablishedTime="{ row }">{{ fmtUptime(row.bgpPeerFsmEstablishedTime) }}</template>
      </ApiTable>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import ApiTable from '../../components/ApiTable.vue'
import { BGP_COLS, OSPF_COLS, OSPF_PORT_COLS, VRF_COLS } from '../../columns'
import { fmtUptime } from '../../utils'
const props = defineProps({ device: Object })
const h = props.device.hostname
const sub = ref('bgp')
const subs = [{ id: 'bgp', label: 'BGP' }, { id: 'ospf', label: 'Voisins OSPF' }, { id: 'ospf_ports', label: 'Interfaces OSPF' }, { id: 'ospfv3', label: 'OSPFv3' }, { id: 'vrf', label: 'VRF' }, { id: 'ipsec', label: 'IPsec' }]
const defs = {
  bgp: { path: 'bgp', params: { hostname: h }, key: 'bgp_sessions', cols: BGP_COLS },
  ospf: { path: 'ospf', params: { hostname: h }, key: 'ospf_neighbours', cols: OSPF_COLS },
  ospf_ports: { path: 'ospf_ports', params: { hostname: h }, key: 'ospf_ports', cols: OSPF_PORT_COLS },
  ospfv3: { path: 'ospfv3', params: { hostname: h }, key: 'ospfv3_neighbours' },
  vrf: { path: 'routing/vrf', params: { hostname: h }, key: 'vrfs', cols: VRF_COLS },
  ipsec: { path: `routing/ipsec/data/${encodeURIComponent(h)}`, key: 'ipsec' },
}
const cur = computed(() => defs[sub.value])
</script>
