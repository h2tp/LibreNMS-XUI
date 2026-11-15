<template>
  <div class="card">
    <div class="card-title"><Bell :size="17" /> {{ deviceId ? t('Alertes de l\'équipement') : t('Alertes') }}
      <div class="right">
        <div class="seg">
          <button v-for="s in states" :key="s.v" :class="{ on: state === s.v }" @click="state = s.v">{{ s.l }} <span class="faint">{{ counts[s.v] ?? '' }}</span></button>
        </div>
      </div>
    </div>
    <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" row-key="id" filename="alertes.csv" :row-click="(r) => (detail = r)" :empty-text="state === 1 ? 'Aucune alerte active 🎉' : 'Aucune alerte'">
      <template #tools>
        <select v-model="sev" class="input" style="padding:6px 10px"><option value="">{{ t('Toutes sévérités') }}</option><option value="critical">{{ t('Critique') }}</option><option value="warning">{{ t('Avertissement') }}</option><option value="ok">OK</option></select>
      </template>
      <template #c-severity="{ row }"><span class="badge" :class="severityClass(row.severity)"><span class="dot" :class="severityClass(row.severity)"></span>{{ row.severity }}</span></template>
      <template #c-device_id="{ row }"><DeviceCell :device="devById[row.device_id]" :sub="false" :fallback="row.hostname" /></template>
      <template #c-rule="{ row }"><b>{{ row.rule }}</b></template>
      <template #c-timestamp="{ row }"><span class="nowrap small" :title="fmtDate(row.timestamp)">{{ timeAgo(row.timestamp) }}</span></template>
      <template #c-state="{ row }"><span class="badge" :class="+row.state === 2 ? 'info' : +row.state === 0 ? 'ok' : 'critical'">{{ stateLbl(row.state) }}</span></template>
      <template #c-actions="{ row }">
        <div v-if="!session.read_only" class="row" style="gap:4px" @click.stop>
          <button v-if="+row.state === 1" class="btn sm" @click="ackRow = row; ackNote = ''; untilClear = false"><Check /> {{ t('Acquitter') }}</button>
          <button v-if="+row.state === 2" class="btn sm" @click="unack(row)"><BellRing /> {{ t('Réactiver') }}</button>
        </div>
      </template>
    </DataTable>

    <Modal v-if="ackRow" :title="t('Acquitter l\'alerte')" :icon="Check" @close="ackRow = null">
      <p class="muted" style="margin-top:0">{{ ackRow.rule }} — {{ devName(devById[ackRow.device_id]) }}</p>
      <label class="field"><span>{{ t('Note') }}</span><textarea v-model="ackNote" class="input" rows="3" :placeholder="t('Pris en charge par…')"></textarea></label>
      <label class="check mt"><input v-model="untilClear" type="checkbox" /> {{ t('Jusqu\'à résolution (sinon ré-alerte si l\'état s\'aggrave)') }}</label>
      <template #foot><button class="btn" @click="ackRow = null">{{ t('Annuler') }}</button><button class="btn primary" @click="ack"><Check /> {{ t('Acquitter') }}</button></template>
    </Modal>

    <Modal v-if="detail" :title="detail.rule" :icon="Bell" wide @close="detail = null">
      <AlertDetail :alert="detail.raw" :rule="rules[detail.rule_id]" :device="devById[detail.device_id]" />
      <template v-if="!session.read_only && (+detail.state === 1 || +detail.state === 2)" #foot>
        <button v-if="+detail.state === 1" class="btn primary" @click="ackRow = detail; ackNote = ''; untilClear = false; detail = null"><Check /> {{ t('Acquitter') }}</button>
        <button v-if="+detail.state === 2" class="btn" @click="unack(detail); detail = null"><BellRing /> {{ t('Réactiver') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Bell, Check, BellRing } from 'lucide-vue-next'
import DataTable from './DataTable.vue'
import DeviceCell from './DeviceCell.vue'
import Modal from './Modal.vue'
import AlertDetail from './AlertDetail.vue'
import { session, api, pick, safeList, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, fmtDate, timeAgo, severityClass, toast, toastError } from '../utils'
import { t } from '../i18n'

const props = defineProps({ deviceId: Number })
const states = [{ v: 1, l: t('Actives') }, { v: 2, l: t('Acquittées') }, { v: 0, l: t('Résolues') }]
const state = ref(1)
const sev = ref('')
const raw = ref([])
const rules = ref({})
const devById = ref({})
const counts = ref({})
const ackRow = ref(null)
const ackNote = ref('')
const untilClear = ref(false)
const detail = ref(null)
const stateLbl = (s) => ({ 0: t('Résolue'), 1: 'Active', 2: t('Acquittée'), 3: t('Aggravée'), 4: t('Améliorée') }[s] ?? s)

const rows = computed(() => raw.value
  .filter((a) => (!props.deviceId || +a.device_id === props.deviceId) && (!sev.value || severityClass(a.severity) === sev.value))
  .map((a) => ({ ...a, rule: a.name || a.rule_name || rules.value[a.rule_id]?.name || t('Règle #{id}', { id: a.rule_id }), severity: a.severity || rules.value[a.rule_id]?.severity, raw: a })))
const cols = computed(() => [
  { key: 'severity', label: t('Sévérité') }, { key: 'rule', label: t('Règle') },
  ...(props.deviceId ? [] : [{ key: 'device_id', label: t('Équipement'), sortValue: (r) => devName(devById.value[r.device_id]) }]),
  { key: 'state', label: t('État') }, { key: 'timestamp', label: t('Depuis') }, { key: 'note', label: t('Note') }, { key: 'actions', label: '', sortable: false },
])

const { loading, error, reload } = useLoader(async () => {
  const [a, r, d, c1, c2] = await Promise.all([
    api.get('alerts', { state: state.value }).then((x) => pick(x, 'alerts')),
    Object.keys(rules.value).length ? null : safeList('rules', null, 'rules'),
    devicesCached().catch(() => []),
    safeList('alerts', { state: 1 }, 'alerts'),
    safeList('alerts', { state: 2 }, 'alerts'),
  ])
  raw.value = a
  if (r) rules.value = Object.fromEntries(r.map((x) => [x.id, x]))
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  const f = (l) => (props.deviceId ? l.filter((x) => +x.device_id === props.deviceId) : l).length
  counts.value = { 1: f(c1), 2: f(c2) }
})
watch(state, () => { raw.value = []; reload() })

async function ack() {
  try {
    await api.put(`alerts/${ackRow.value.id}`, { note: ackNote.value, until_clear: untilClear.value })
    toast(t('Alerte acquittée'), 'success'); ackRow.value = null; reload()
  } catch (e) { toastError(e) }
}
async function unack(row) {
  try { await api.put(`alerts/unmute/${row.id}`); toast(t('Alerte réactivée'), 'success'); reload() } catch (e) { toastError(e) }
}
</script>
