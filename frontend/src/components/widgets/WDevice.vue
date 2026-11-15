<template>
  <div v-if="!dev" class="empty small">{{ loaded ? t('Équipement « {h} » introuvable', { h: config.device }) : t('Chargement…') }}</div>
  <div v-else class="col" style="gap:12px">
    <div class="row">
      <DeviceCell :device="dev" class="grow" />
      <span class="badge" :class="devStatus(dev) === 'up' ? 'ok' : devStatus(dev) === 'down' ? 'critical' : ''">{{ statusLabel[devStatus(dev)] }}</span>
    </div>
    <div class="kvs">
      <div><span>{{ t('Uptime') }}</span><b>{{ dev.uptime ? fmtUptime(dev.uptime) : '—' }}</b></div>
      <div><span>{{ t('Latence') }}</span><b>{{ +dev.last_ping_timetaken ? `${(+dev.last_ping_timetaken).toFixed(1)} ms` : '—' }}</b></div>
      <div><span>{{ t('Alertes') }}</span><b :style="{ color: nAlerts ? 'var(--orange)' : '' }">{{ nAlerts }}</b></div>
      <div><span>{{ t('Matériel') }}</span><b class="ellipsis">{{ dev.hardware || '—' }}</b></div>
      <div><span>OS</span><b class="ellipsis">{{ [dev.os, dev.version].filter(Boolean).join(' ') || '—' }}</b></div>
      <div><span>{{ t('Emplacement') }}</span><b class="ellipsis">{{ (dev.location || '—').replace(/\s*\[[-\d.,\s]+\]\s*$/, '') }}</b></div>
    </div>
    <RrdChart v-if="session.rrd && size.h > 230" :host="dev.hostname" file="icmp-perf.rrd" range="-1d" hide-range compact axes :show-stats="false" :zoom="false" :height="`${size.h - 150}px`" />
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import DeviceCell from '../DeviceCell.vue'
import RrdChart from '../RrdChart.vue'
import { session } from '../../api'
import { D } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devStatus, statusLabel, fmtUptime } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const dev = ref(null); const alerts = ref([]); const loaded = ref(false)
const nAlerts = computed(() => alerts.value.filter((a) => dev.value && +a.device_id === +dev.value.device_id).length)
useLoader(async () => {
  const [d, a] = await Promise.all([D.devices(), D.alerts()])
  dev.value = d.find((x) => x.hostname === props.config.device) || null
  alerts.value = a; loaded.value = true
})
</script>
<style scoped>
.kvs { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px 14px; }
.kvs div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kvs span { font-size: 11.5px; color: var(--muted); }
.kvs b { font-size: 14px; font-variant-numeric: tabular-nums; }
</style>
