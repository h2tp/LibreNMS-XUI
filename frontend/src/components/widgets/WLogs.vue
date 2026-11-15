<template>
  <div class="col" style="gap:0">
    <div v-for="(e, i) in rows" :key="i" class="ev">
      <span class="badge" :class="e.cls">{{ e.label }}</span>
      <span class="small muted nowrap mono">{{ fmtDate(e.when) }}</span>
      <DeviceCell v-if="!config.device" :device="devById[e.device_id]" :show-icon="false" :sub="false" :fallback="e.host" />
      <span class="small ellipsis grow" :title="e.msg">{{ e.msg }}</span>
    </div>
    <div v-if="!rows.length" class="empty small">{{ t('Aucune entrée') }}</div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import DeviceCell from '../DeviceCell.vue'
import { D } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { fmtDate } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const raw = ref([]); const devById = ref({})
const SYSLOG = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']
const EVT = { 1: 'ok', 2: 'info', 3: 'notice', 4: 'warning', 5: 'critical' }
const ALERT = { 0: t('Résolue'), 1: t('Alerte'), 2: t('Acquittée'), 3: t('Aggravée'), 4: t('Améliorée') }
const rows = computed(() => raw.value.map((r) => {
  const lt = props.config.type || 'eventlog'
  const base = { when: r.datetime || r.timestamp || r.time_logged, device_id: r.device_id, host: r.hostname || r.sysName || r.device_id }
  if (lt === 'syslog') {
    const lvl = r.level || SYSLOG[r.priority] || r.priority
    return { ...base, label: lvl, cls: ['emerg', 'alert', 'crit', 'err'].includes(lvl) ? 'critical' : lvl === 'warning' ? 'warning' : 'info', msg: `${r.program ? r.program + ': ' : ''}${r.msg || ''}` }
  }
  if (lt === 'alertlog') return { ...base, when: r.time_logged || base.when, label: ALERT[r.state] ?? r.state, cls: +r.state === 0 ? 'ok' : +r.state === 2 ? 'info' : 'critical', msg: r.name || r.rule_name || r.rule || t('Règle #{id}', { id: r.rule_id }) }
  const s = EVT[r.severity] || 'info'
  return { ...base, label: r.type || 'system', cls: s === 'critical' ? 'critical' : s === 'warning' ? 'warning' : s === 'ok' ? 'ok' : 'info', msg: r.message || '' }
}))
useLoader(async () => {
  const [l, d] = await Promise.all([D.logs(props.config.type || 'eventlog', props.config.limit || 15, props.config.device), D.devices().catch(() => [])])
  raw.value = l
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
})
</script>
<style scoped>
.ev { display: flex; align-items: center; gap: 12px; padding: 7px 4px; border-bottom: 1px solid var(--border); min-width: 0; }
.ev:last-child { border-bottom: 0; }
</style>
