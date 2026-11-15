<template>
  <div>
    <div class="row small muted mb2">
      <span class="row"><span class="dot up"></span>{{ c.up }}</span>
      <span class="row"><span class="dot down"></span>{{ c.down }}</span>
      <span v-if="c.disabled + c.ignored" class="row"><span class="dot disabled"></span>{{ c.disabled + c.ignored }}</span>
    </div>
    <div v-if="!shown.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>{{ devices.length ? t('Tous les équipements sont en ligne') : t('Aucun équipement') }}</div></div>
    <div v-else class="avail" :class="config.mode">
      <router-link v-for="d in shown" :key="d.device_id" :to="`/device/${encodeURIComponent(d.hostname)}`" class="tile" :class="devStatus(d)"
        :title="`${devName(d)} — ${statusLabel[devStatus(d)]}${d.location ? ' · ' + d.location : ''}`">
        <span v-if="config.mode !== 'compact'" class="ellipsis">{{ devName(d) }}</span>
      </router-link>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, devStatus, statusLabel } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const devices = ref([])
const order = { down: 0, up: 1, ignored: 2, disabled: 3 }
const shown = computed(() => devices.value
  .filter((d) => !props.config.hideUp || devStatus(d) !== 'up')
  .sort((a, b) => order[devStatus(a)] - order[devStatus(b)] || devName(a).localeCompare(devName(b))))
const c = computed(() => {
  const r = { up: 0, down: 0, disabled: 0, ignored: 0 }
  devices.value.forEach((d) => r[devStatus(d)]++)
  return r
})
useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>
<style scoped>
.mb2 { margin-bottom: 10px; gap: 14px; }
.avail { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.avail.compact { grid-template-columns: repeat(auto-fill, 20px); gap: 4px; }
.tile { display: flex; align-items: center; min-width: 0; padding: 6px 9px; border-radius: 8px; font-size: 12px; font-weight: 600; color: #fff; background: #16a34a; transition: transform .15s, filter .15s; }
.tile:hover { text-decoration: none; transform: translateY(-1px); filter: brightness(1.12); }
.compact .tile { width: 20px; height: 20px; padding: 0; border-radius: 5px; }
.tile.down { background: #e11d48; animation: pulse 2s infinite; }
.tile.disabled, .tile.ignored { background: #64748b; }
@keyframes pulse { 50% { filter: brightness(1.25); } }
</style>
