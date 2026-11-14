<template>
  <div v-if="!down.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>Tous les équipements répondent</div></div>
  <div v-else class="col" style="gap:10px">
    <div v-for="d in down.slice(0, config.limit || 10)" :key="d.device_id" class="row">
      <DeviceCell :device="d" class="grow" />
      <span class="small muted">{{ d.status_reason || 'icmp' }}</span>
      <span class="small muted nowrap">{{ timeAgo(d.last_polled) }}</span>
    </div>
    <router-link v-if="down.length > (config.limit || 10)" to="/devices?status=down" class="small" style="text-align:center">+ {{ down.length - (config.limit || 10) }} autre(s) →</router-link>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import DeviceCell from '../DeviceCell.vue'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devStatus, timeAgo } from '../../utils'

const props = defineProps({ config: Object, size: Object })
const devices = ref([])
const down = computed(() => devices.value.filter((d) => devStatus(d) === 'down'))
useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>
