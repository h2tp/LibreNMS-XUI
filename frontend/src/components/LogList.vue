<template>
  <div>
    <div class="row wrap" style="margin-bottom:12px">
      <div class="seg" v-if="!fixedType">
        <button v-for="tb in types" :key="tb.v" :class="{ on: type === tb.v }" @click="type = tb.v">{{ tb.l }}</button>
      </div>
      <select v-model.number="limit" class="input" style="padding:6px 10px">
        <option v-for="n in [50, 200, 1000, 5000]" :key="n" :value="n">{{ t('{n} lignes', { n }) }}</option>
      </select>
      <input v-model="from" type="datetime-local" class="input" :title="t('Depuis')" style="padding:6px 10px" />
      <input v-model="to" type="datetime-local" class="input" :title="t('Jusqu\'à')" style="padding:6px 10px" />
    </div>
    <DataTable :rows="rows" :columns="columns" :loading="loading" :error="error" :filename="`${type}.csv`" :empty-text="t('Aucune entrée de journal')" :page-size="100">
      <template #c-device="{ row }"><DeviceCell :device="devById[row.device_id]" :show-icon="false" :sub="false" :fallback="row.device" /></template>
      <template #c-sev="{ row }"><span class="badge" :class="row.sevClass">{{ row.sev }}</span></template>
      <template #c-msg="{ row }"><span class="msg">{{ row.msg }}</span></template>
      <template #c-when="{ row }"><span class="nowrap">{{ fmtDate(row.when) }}</span></template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import DataTable from './DataTable.vue'
import DeviceCell from './DeviceCell.vue'
import { api, pick, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { fmtDate } from '../utils'
import { t } from '../i18n'

const props = defineProps({ host: String, initialType: { type: String, default: 'eventlog' }, fixedType: Boolean })
const types = [{ v: 'eventlog', l: t('Évènements') }, { v: 'syslog', l: t('Syslog') }, { v: 'alertlog', l: t('Alertes') }, { v: 'authlog', l: t('Authentification') }]
const type = ref(props.initialType)
const limit = ref(200)
const from = ref('')
const to = ref('')
const raw = ref([])
const devById = ref({})

const SYSLOG_LVL = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']
const EVT_SEV = { 1: 'ok', 2: 'info', 3: 'notice', 4: 'warning', 5: 'critical' }
const ALERT_STATE = { 0: t('Résolue'), 1: t('Alerte'), 2: t('Acquittée'), 3: t('Aggravée'), 4: t('Améliorée') }

const rows = computed(() => raw.value.map((r) => {
  let sevLabel = r.severity; let cls = 'info'; let msg = r.message || r.msg || ''; let when = r.datetime || r.timestamp || r.time_logged
  if (type.value === 'syslog') { sevLabel = r.level || SYSLOG_LVL[r.priority] || r.priority; cls = ['emerg', 'alert', 'crit', 'err'].includes(sevLabel) ? 'critical' : sevLabel === 'warning' ? 'warning' : 'info'; msg = `${r.program ? r.program + ': ' : ''}${r.msg || ''}` }
  if (type.value === 'eventlog') { sevLabel = EVT_SEV[r.severity] || r.severity; cls = sevLabel === 'critical' ? 'critical' : sevLabel === 'warning' ? 'warning' : sevLabel === 'ok' ? 'ok' : 'info' }
  if (type.value === 'alertlog') { sevLabel = ALERT_STATE[r.state] ?? r.state; cls = +r.state === 0 ? 'ok' : +r.state === 2 ? 'info' : 'critical'; msg = r.name || r.rule_name || r.rule || t('Règle #{id}', { id: r.rule_id }); when = r.time_logged || when }
  if (type.value === 'authlog') { sevLabel = r.result; cls = /fail|deni/i.test(r.result || '') ? 'critical' : 'ok'; msg = `${r.user || ''} @ ${r.address || ''}`; when = r.datetime }
  return { when, device: r.hostname || r.sysName || r.device_id, device_id: r.device_id, sev: sevLabel, sevClass: cls, evtype: r.type, msg }
}))

const columns = computed(() => {
  const c = [{ key: 'when', label: t('Date'), sortValue: (r) => String(r.when) }]
  if (!props.host && type.value !== 'authlog') c.push({ key: 'device', label: t('Équipement') })
  c.push({ key: 'sev', label: type.value === 'authlog' ? t('Résultat') : type.value === 'alertlog' ? t('État') : t('Sévérité') })
  if (type.value === 'eventlog') c.push({ key: 'evtype', label: t('Type') })
  c.push({ key: 'msg', label: type.value === 'alertlog' ? t('Règle') : t('Message') })
  return c
})

function ts(v) { return v ? new Date(v).toISOString().slice(0, 19).replace('T', ' ') : undefined }

const { loading, error, reload } = useLoader(async () => {
  const path = props.host ? `logs/${type.value}/${encodeURIComponent(props.host)}` : `logs/${type.value}`
  const [r, devs] = await Promise.all([
    api.get(path, { limit: limit.value, sortorder: 'DESC', from: ts(from.value), to: ts(to.value) }),
    devicesCached().catch(() => []),
  ])
  devById.value = Object.fromEntries(devs.map((d) => [d.device_id, d]))
  raw.value = pick(r, 'logs')
})
watch([type, limit, from, to], () => { raw.value = []; reload() })
</script>

<style scoped>
.msg { font-family: var(--mono); font-size: 12px; word-break: break-word; }
</style>
