<template>
  <div class="stats" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }">
    <template v-for="k in items" :key="k">
      <StatCard v-if="k === 'devices'" :icon="Server" :label="t('Équipements')" :value="devices.length" color="#22d3ee" to="/devices" />
      <StatCard v-else-if="k === 'up'" :icon="CircleCheck" :label="t('En ligne')" :value="counts.up" color="#22c55e" to="/devices?status=up" />
      <StatCard v-else-if="k === 'down'" :icon="CircleX" :label="t('Hors ligne')" :value="counts.down" color="#f43f5e" to="/devices?status=down">
        <template #badge><span v-if="counts.down" class="dot down"></span></template>
      </StatCard>
      <StatCard v-else-if="k === 'ports'" :icon="Network" :label="t('Ports actifs')" :value="portCounts.up" :suffix="`/ ${portCounts.total}`" color="#a78bfa" to="/ports" />
      <StatCard v-else-if="k === 'alerts'" :icon="Bell" :label="t('Alertes actives')" :value="alerts.length" color="#fb923c" to="/alerts" />
      <StatCard v-else-if="k === 'traffic'" :icon="ArrowDownUp" :label="t('Trafic total')" :value="traffic.v" :suffix="traffic.u" color="#34d399" to="/ports" />
    </template>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { Server, CircleCheck, CircleX, Network, Bell, ArrowDownUp } from 'lucide-vue-next'
import StatCard from '../StatCard.vue'
import { D, devicesFor, isPhysical } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devStatus, fmtBits } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const devices = ref([]); const ports = ref([]); const alerts = ref([])
const items = computed(() => props.config.items?.length ? props.config.items : ['devices'])
const cols = computed(() => Math.max(1, Math.min(items.value.length, Math.floor(((props.size?.w || 1200) + 16) / (props.size?.w < 500 ? 150 : 170)))))
const ids = computed(() => new Set(devices.value.map((d) => +d.device_id)))
const counts = computed(() => {
  const c = { up: 0, down: 0, disabled: 0, ignored: 0 }
  devices.value.forEach((d) => c[devStatus(d)]++)
  return c
})
const myPorts = computed(() => ports.value.filter((p) => ids.value.has(+p.device_id) && !+p.deleted && !+p.disabled))
const portCounts = computed(() => ({ total: myPorts.value.length, up: myPorts.value.filter((p) => p.ifOperStatus === 'up').length }))
const traffic = computed(() => {
  const b = myPorts.value.filter(isPhysical).reduce((s, p) => s + (+p.ifInOctets_rate || 0) * 8, 0)
  const [v, u] = fmtBits(b).split(' ')
  return { v: parseFloat(v) || 0, u }
})
const need = (k) => items.value.includes(k)
useLoader(async () => {
  const [d, p, a] = await Promise.all([
    devicesFor(props.config),
    need('ports') || need('traffic') ? D.ports() : [],
    need('alerts') ? D.alerts() : [],
  ])
  devices.value = d; ports.value = p
  const set = new Set(d.map((x) => +x.device_id))
  alerts.value = props.config.group ? a.filter((x) => set.has(+x.device_id)) : a
})
</script>
<style scoped>
.stats { display: grid; gap: 16px; height: 100%; }
.stats :deep(.stat) { height: 100%; }
</style>
