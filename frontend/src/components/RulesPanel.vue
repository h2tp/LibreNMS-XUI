<template>
  <div class="card">
    <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" row-key="id" filename="regles.csv" :row-click="session.read_only ? null : openEdit">
      <template #tools><button v-if="!session.read_only" class="btn sm primary" @click="openEdit(null)"><Plus /> Nouvelle règle</button></template>
      <template #c-severity="{ row }"><span class="badge" :class="severityClass(row.severity)">{{ row.severity }}</span></template>
      <template #c-disabled="{ row }"><span class="badge" :class="+row.disabled ? 'disabled' : 'ok'">{{ +row.disabled ? 'Désactivée' : 'Active' }}</span></template>
      <template #c-rule="{ row }"><code class="small ellipsis" style="display:block;max-width:420px">{{ row.rule || row.query }}</code></template>
      <template #c-actions="{ row }">
        <div v-if="!session.read_only" class="row" style="gap:4px" @click.stop>
          <button class="btn sm icon ghost" :title="+row.disabled ? 'Activer' : 'Désactiver'" @click="toggle(row)"><Power /></button>
          <button class="btn sm icon ghost danger" title="Supprimer" @click="remove(row)"><Trash2 /></button>
        </div>
      </template>
    </DataTable>

    <Modal v-if="edit" :title="edit.id ? 'Modifier la règle' : 'Nouvelle règle d\'alerte'" :icon="ListChecks" wide @close="edit = null">
      <div class="form-grid">
        <label class="field full"><span>Nom *</span><input v-model="edit.name" class="input" /></label>
        <label class="field"><span>Sévérité</span><select v-model="edit.severity" class="input"><option value="ok">ok</option><option value="warning">warning</option><option value="critical">critical</option></select></label>
        <label class="field"><span>Appliquer à</span>
          <select v-model="edit.scope" class="input"><option value="all">Tous les équipements</option><option value="devices">Équipements choisis</option><option value="groups">Groupes choisis</option></select></label>
        <label v-if="edit.scope === 'devices'" class="field full"><span>Équipements</span>
          <select v-model="edit.devices" multiple class="input" size="6"><option v-for="d in devList" :key="d.device_id" :value="+d.device_id">{{ devName(d) }}</option></select></label>
        <label v-if="edit.scope === 'groups'" class="field full"><span>Groupes</span>
          <select v-model="edit.groups" multiple class="input" size="5"><option v-for="g in groupList" :key="g.id" :value="+g.id">{{ g.name }}</option></select></label>

        <div class="field full"><span>Conditions</span>
          <div class="seg" style="align-self:flex-start;margin-bottom:8px">
            <button :class="{ on: !edit.raw }" @click="edit.raw = false">Assistant</button><button :class="{ on: edit.raw }" @click="toRaw">JSON (QueryBuilder)</button>
          </div>
          <template v-if="!edit.raw">
            <div class="row" style="margin-bottom:8px"><span class="small muted">Combiner avec</span>
              <div class="seg"><button :class="{ on: edit.condition === 'AND' }" @click="edit.condition = 'AND'">ET</button><button :class="{ on: edit.condition === 'OR' }" @click="edit.condition = 'OR'">OU</button></div></div>
            <div v-for="(c, i) in edit.conds" :key="i" class="row cond">
              <input v-model="c.field" class="input grow mono" list="rule-fields" placeholder="devices.status" />
              <select v-model="c.operator" class="input"><option v-for="o in OPS" :key="o.v" :value="o.v">{{ o.l }}</option></select>
              <input v-if="!['is_null', 'is_not_null', 'is_empty', 'is_not_empty'].includes(c.operator)" v-model="c.value" class="input mono" style="width:160px" placeholder="valeur" />
              <button class="btn sm icon ghost danger" @click="edit.conds.splice(i, 1)"><X /></button>
            </div>
            <datalist id="rule-fields"><option v-for="f in FIELDS" :key="f" :value="f" /></datalist>
            <button class="btn sm" @click="edit.conds.push({ field: '', operator: 'equal', value: '' })"><Plus /> Condition</button>
          </template>
          <textarea v-else v-model="edit.builderText" class="input" rows="10"></textarea>
        </div>

        <label class="field"><span>Nombre max d'alertes (count)</span><input v-model.number="edit.count" type="number" class="input" /></label>
        <label class="field"><span>Délai avant alerte</span><input v-model="edit.delay" class="input" placeholder="5m" /></label>
        <label class="field"><span>Intervalle de ré-alerte</span><input v-model="edit.interval" class="input" placeholder="5m" /></label>
        <div class="col" style="justify-content:flex-end">
          <label class="check"><input v-model="edit.mute" type="checkbox" /> Muette (pas de notification)</label>
          <label class="check"><input v-model="edit.invert" type="checkbox" /> Inverser la règle</label>
          <label class="check"><input v-model="edit.disabled" type="checkbox" /> Désactivée</label>
        </div>
        <label class="field full"><span>Notes</span><textarea v-model="edit.notes" class="input" rows="2"></textarea></label>
      </div>
      <template #foot><button class="btn" @click="edit = null">Annuler</button><button class="btn primary" @click="save"><Save /> Enregistrer</button></template>
    </Modal>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Plus, Power, Trash2, ListChecks, Save, X } from 'lucide-vue-next'
import DataTable from './DataTable.vue'
import Modal from './Modal.vue'
import { session, api, pick, safeList, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, severityClass, toast, toastError, confirmAction } from '../utils'

const OPS = [
  { v: 'equal', l: '=' }, { v: 'not_equal', l: '≠' }, { v: 'less', l: '<' }, { v: 'less_or_equal', l: '≤' }, { v: 'greater', l: '>' }, { v: 'greater_or_equal', l: '≥' },
  { v: 'contains', l: 'contient' }, { v: 'not_contains', l: 'ne contient pas' }, { v: 'begins_with', l: 'commence par' }, { v: 'ends_with', l: 'finit par' },
  { v: 'regex', l: 'regex' }, { v: 'not_regex', l: 'pas regex' }, { v: 'in', l: 'dans' }, { v: 'is_null', l: 'est nul' }, { v: 'is_not_null', l: 'non nul' },
]
const FIELDS = [
  'macros.device_down', 'macros.device_up', 'macros.port_down', 'macros.port_up', 'macros.port_usage_perc', 'macros.state_sensor_critical', 'macros.sensor',
  'devices.status', 'devices.uptime', 'devices.os', 'devices.hostname', 'devices.type', 'devices.disabled', 'devices.ignore', 'devices.last_ping_timetaken',
  'ports.ifOperStatus', 'ports.ifAdminStatus', 'ports.ifInErrors_delta', 'ports.ifOutErrors_delta', 'ports.ifInOctets_rate', 'ports.ifOutOctets_rate', 'ports.ifSpeed', 'ports.ifAlias',
  'sensors.sensor_current', 'sensors.sensor_limit', 'sensors.sensor_limit_low', 'sensors.sensor_class', 'sensors.sensor_alert',
  'processors.processor_usage', 'mempools.mempool_perc', 'storage.storage_perc', 'services.service_status', 'bgpPeers.bgpPeerState', 'bgpPeers.bgpPeerAdminStatus',
]
const rows = ref([])
const devList = ref([])
const groupList = ref([])
const edit = ref(null)
const cols = [
  { key: 'name', label: 'Nom' }, { key: 'severity', label: 'Sévérité' }, { key: 'disabled', label: 'État' }, { key: 'rule', label: 'Règle' }, { key: 'actions', label: '', sortable: false },
]

const { loading, error, reload } = useLoader(async () => {
  rows.value = pick(await api.get('rules'), 'rules')
}, { auto: false })

function parseJSON(v, d) { if (!v) return d; if (typeof v === 'object') return v; try { return JSON.parse(v) } catch { return d } }

async function openEdit(r) {
  if (!devList.value.length) {
    devList.value = await devicesCached().catch(() => [])
    groupList.value = await safeList('devicegroups', null, 'groups')
  }
  const extra = parseJSON(r?.extra, {})
  const builder = parseJSON(r?.builder, null)
  const flat = builder && Array.isArray(builder.rules) && builder.rules.every((x) => !x.rules)
  const devs = r ? parseJSON(r.devices, []) : []
  const grps = r ? parseJSON(r.groups, []) : []
  edit.value = {
    id: r?.id, name: r?.name || '', severity: r?.severity || 'critical', disabled: !!+(r?.disabled || 0),
    scope: grps.length ? 'groups' : devs.length && !devs.includes(-1) ? 'devices' : 'all', devices: devs.map(Number), groups: grps.map(Number),
    raw: !!builder && !flat, condition: builder?.condition || 'AND',
    conds: flat ? builder.rules.map((x) => ({ field: x.field, operator: x.operator, value: x.value ?? '' })) : [{ field: 'macros.device_down', operator: 'equal', value: '1' }],
    builderText: builder ? JSON.stringify(builder, null, 2) : '',
    count: extra.count ?? 1, delay: extra.delay ?? '1m', interval: extra.interval ?? '5m', mute: !!extra.mute, invert: !!extra.invert, notes: r?.notes || '',
  }
}
function buildFromConds(e) {
  return { condition: e.condition, rules: e.conds.filter((c) => c.field).map((c) => ({ id: c.field, field: c.field, type: 'string', input: 'text', operator: c.operator, value: c.value })), valid: true }
}
function toRaw() { const e = edit.value; if (!e.raw) e.builderText = JSON.stringify(buildFromConds(e), null, 2); e.raw = true }

async function save() {
  const e = edit.value
  let builder
  try { builder = e.raw ? JSON.parse(e.builderText) : buildFromConds(e) } catch { return toastError('JSON invalide') }
  if (!e.name) return toastError('Nom requis')
  const body = {
    name: e.name, severity: e.severity, disabled: e.disabled ? 1 : 0, builder: JSON.stringify(builder),
    devices: e.scope === 'devices' ? e.devices : [-1], groups: e.scope === 'groups' ? e.groups : [],
    count: e.count, delay: e.delay, interval: e.interval, mute: e.mute, invert: e.invert, notes: e.notes,
  }
  try {
    if (e.id) await api.put('rules', { ...body, rule_id: e.id })
    else await api.post('rules', body)
    toast('Règle enregistrée', 'success'); edit.value = null; reload()
  } catch (err) { toastError(err) }
}
async function toggle(r) {
  const extra = parseJSON(r.extra, {})
  try {
    await api.put('rules', { rule_id: r.id, name: r.name, severity: r.severity, builder: typeof r.builder === 'string' ? r.builder : JSON.stringify(r.builder), disabled: +r.disabled ? 0 : 1, devices: parseJSON(r.devices, [-1]), groups: parseJSON(r.groups, []), ...extra })
    toast(+r.disabled ? 'Règle activée' : 'Règle désactivée', 'success'); reload()
  } catch (e) { toastError(e) }
}
async function remove(r) {
  if (!confirmAction(`Supprimer la règle « ${r.name} » ?`)) return
  try { await api.del(`rules/${r.id}`); toast('Règle supprimée', 'success'); reload() } catch (e) { toastError(e) }
}
</script>
<style scoped>
.cond { margin-bottom: 8px; }
select[multiple].input { padding: 6px; }
</style>
