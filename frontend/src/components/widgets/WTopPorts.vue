<template>
  <div v-if="!top.length" class="empty small">Aucune donnée de trafic</div>
  <div v-else class="col" style="gap:10px">
    <router-link v-for="p in top" :key="p.port_id" :to="`/port/${p.port_id}`" class="tp">
      <div class="row">
        <b class="ellipsis">{{ p.ifName }}</b><span class="muted small ellipsis grow">{{ p.ifAlias }} · {{ devName(devById[p.device_id]) }}</span>
        <span class="small nowrap"><span style="color:var(--accent)">↓ {{ fmtBits(p.ifInOctets_rate * 8) }}</span> · <span style="color:#a78bfa">↑ {{ fmtBits(p.ifOutOctets_rate * 8) }}</span></span>
      </div>
      <div class="bar"><i :style="{ width: Math.max(2, portUtil(p)) + '%', background: utilColor(portUtil(p)) }"></i></div>
    </router-link>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { D, devicesFor, isPhysical } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, fmtBits, portUtil, utilColor } from '../../utils'

const props = defineProps({ config: Object, size: Object })
const devices = ref([]); const ports = ref([])
const devById = computed(() => Object.fromEntries(devices.value.map((d) => [d.device_id, d])))
const top = computed(() => {
  const rate = (p) => +p.ifInOctets_rate + +p.ifOutOctets_rate
  const key = props.config.sort === 'util' ? portUtil : rate
  return ports.value.filter((p) => devById.value[p.device_id] && !+p.deleted && isPhysical(p))
    .sort((a, b) => key(b) - key(a)).slice(0, props.config.limit || 8)
})
useLoader(async () => { [devices.value, ports.value] = await Promise.all([devicesFor(props.config), D.ports()]) })
</script>
<style scoped>
.tp { color: var(--text); display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; border-radius: 10px; transition: background .2s; }
.tp:hover { background: var(--panel-2); text-decoration: none; }
</style>
