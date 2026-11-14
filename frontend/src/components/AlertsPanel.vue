<template>
  <div class="card">
    <div class="card-title"><Bell :size="17" /> {{ deviceId ? 'Alertes de l\'équipement' : 'Alertes' }}
      <div class="right">
        <div class="seg">
          <button v-for="s in states" :key="s.v" :class="{ on: state === s.v }" @click="state = s.v">{{ s.l }} <span class="faint">{{ counts[s.v] ?? '' }}</span></button>
        </div>
      </div>
    </div>
    <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" row-key="id" filename="alertes.csv" :row-click="(r) => (detail = r)" :empty-text="state === 1 ? 'Aucune alerte active 🎉' : 'Aucune alerte'">
      <template #tools>
        <select v-model="sev" class="input" style="padding:6px 10px"><option value="">Toutes sévérités</option><option value="critical">Critique</option><option value="warning">Avertissement</option><option value="ok">OK</option></select>
      </template>
      <template #c-severity="{ row }"><span class="badge" :class="severityClass(row.severity)"><span class="dot" :class="severityClass(row.severity)"></span>{{ row.severity }}</span></template>
      <template #c-device_id="{ row }"><DeviceCell :device="devById[row.device_id]" :sub="false" :fallback="row.hostname" /></template>
      <template #c-rule="{ row }"><b>{{ row.rule }}</b></template>
      <template #c-timestamp="{ row }"><span class="nowrap small" :title="fmtDate(row.timestamp)">{{ timeAgo(row.timestamp) }}</span></template>
      <template #c-state="{ row }"><span class="badge" :class="+row.state === 2 ? 'info' : +row.state === 0 ? 'ok' : 'critical'">{{ stateLbl(row.state) }}</span></template>
      <template #c-actions="{ row }">
        <div v-if="!session.read_only" class="row" style="gap:4px" @click.stop>
          <button v-if="+row.state === 1" class="btn sm" @click="ackRow = row; ackNote = ''; untilClear = false"><Check /> Acquitter</button>
          <button v-if="+row.state === 2" class="btn sm" @click="unack(row)"><BellRing /> Réactiver</button>
        </div>
      </template>
    </DataTable>

    <Modal v-if="ackRow" title="Acquitter l'alerte" :icon="Check" @close="ackRow = null">
      <p class="muted" style="margin-top:0">{{ ackRow.rule }} — {{ devName(devById[ackRow.device_id]) }}</p>
      <label class="field"><span>Note</span><textarea v-model="ackNote" class="input" rows="3" placeholder="Pris en charge par…"></textarea></label>
      <label class="check mt"><input v-model="untilClear" type="checkbox" /> Jusqu'à résolution (sinon ré-alerte si l'état s'aggrave)</label>
      <template #foot><button class="btn" @click="ackRow = null">Annuler</button><button class="btn primary" @click="ack"><Check /> Acquitter</button></template>
    </Modal>

    <Modal v-if="detail" :title="detail.rule" :icon="Bell" wide @close="detail = null">
      <dl class="kv small">
        <dt>Équipement</dt><dd><DeviceCell :device="devById[detail.device_id]" /></dd>
        <dt>Sévérité</dt><dd><span class="badge" :class="severityClass(detail.severity)">{{ detail.severity }}</span></dd>
        <dt>État</dt><dd>{{ stateLbl(detail.state) }}</dd>
        <dt>Déclenchée</dt><dd>{{ fmtDate(detail.timestamp) }}</dd>
        <dt>Règle</dt><dd><code>{{ rules[detail.rule_id]?.rule || rules[detail.rule_id]?.builder || '—' }}</code></dd>
        <dt v-if="detail.note">Note</dt><dd v-if="detail.note">{{ detail.note }}</dd>
      </dl>
      <div class="hr"></div>
      <div class="small muted" style="margin-bottom:6px">Données brutes</div>
      <pre class="code">{{ JSON.stringify(detail.raw, null, 2) }}</pre>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Bell, Check, BellRing } from 'lucide-vue-next'
import DataTable from './DataTable.vue'
import DeviceCell from './DeviceCell.vue'
import Modal from './Modal.vue'
import { session, api, pick, safeList, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, fmtDate, timeAgo, severityClass, toast, toastError } from '../utils'

const props = defineProps({ deviceId: Number })
const states = [{ v: 1, l: 'Actives' }, { v: 2, l: 'Acquittées' }, { v: 0, l: 'Résolues' }]
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
const stateLbl = (s) => ({ 0: 'Résolue', 1: 'Active', 2: 'Acquittée', 3: 'Aggravée', 4: 'Améliorée' }[s] ?? s)

const rows = computed(() => raw.value
  .filter((a) => (!props.deviceId || +a.device_id === props.deviceId) && (!sev.value || severityClass(a.severity) === sev.value))
  .map((a) => ({ ...a, rule: a.name || a.rule_name || rules.value[a.rule_id]?.name || `Règle #${a.rule_id}`, severity: a.severity || rules.value[a.rule_id]?.severity, raw: a })))
const cols = computed(() => [
  { key: 'severity', label: 'Sévérité' }, { key: 'rule', label: 'Règle' },
  ...(props.deviceId ? [] : [{ key: 'device_id', label: 'Équipement', sortValue: (r) => devName(devById.value[r.device_id]) }]),
  { key: 'state', label: 'État' }, { key: 'timestamp', label: 'Depuis' }, { key: 'note', label: 'Note' }, { key: 'actions', label: '', sortable: false },
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
    toast('Alerte acquittée', 'success'); ackRow.value = null; reload()
  } catch (e) { toastError(e) }
}
async function unack(row) {
  try { await api.put(`alerts/unmute/${row.id}`); toast('Alerte réactivée', 'success'); reload() } catch (e) { toastError(e) }
}
</script>
