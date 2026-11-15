<template>
  <div>
    <div class="grid g4 mb">
      <div v-for="s in summary" :key="s.k" class="card mini-stat"><span class="dot" :class="s.cls"></span><b>{{ s.n }}</b><span class="muted small">{{ s.l }}</span></div>
    </div>
    <div class="card">
      <DataTable :rows="rows" :columns="cols" :loading="loading" :error="error" filename="services.csv" row-key="service_id">
        <template #tools><button v-if="!session.read_only" class="btn sm primary" @click="edit = { service_type: '', service_ip: '', service_desc: '', service_param: '', service_ignore: false, hostname: host || '' }"><Plus /> {{ t('Nouveau service') }}</button></template>
        <template #c-service_status="{ row }"><span class="badge" :class="stCls(row.service_status)">{{ stLbl(row.service_status) }}</span></template>
        <template #c-device_id="{ row }"><DeviceCell :device="devById[row.device_id]" :show-icon="false" :sub="false" :fallback="row.device_id" /></template>
        <template #c-service_message="{ row }"><span class="small mono">{{ row.service_message }}</span></template>
        <template #c-service_changed="{ row }"><span class="nowrap small">{{ timeAgo(row.service_changed) }}</span></template>
        <template #c-actions="{ row }">
          <div v-if="!session.read_only" class="row" style="gap:4px" @click.stop>
            <button class="btn sm icon ghost" :title="t('Modifier')" @click="edit = { ...row, service_ignore: !!+row.service_ignore }"><Pencil /></button>
            <button class="btn sm icon ghost danger" :title="t('Supprimer')" @click="remove(row)"><Trash2 /></button>
          </div>
        </template>
      </DataTable>
    </div>

    <Modal v-if="edit" :title="edit.service_id ? t('Modifier le service') : t('Nouveau service')" :icon="HeartPulse" @close="edit = null">
      <div class="form-grid">
        <label v-if="!edit.service_id && !host" class="field full"><span>{{ t('Équipement *') }}</span>
          <select v-model="edit.hostname" class="input"><option v-for="d in devList" :key="d.device_id" :value="d.hostname">{{ devName(d) }} ({{ d.hostname }})</option></select></label>
        <label class="field"><span>{{ t('Type (check Nagios) *') }}</span><input v-model="edit.service_type" class="input" list="svc-types" :placeholder="t('http, icmp, ssh, dns…')" /><datalist id="svc-types"><option v-for="tb in svcTypes" :key="tb" :value="tb" /></datalist></label>
        <label class="field"><span>{{ t('IP / hôte') }}</span><input v-model="edit.service_ip" class="input mono" /></label>
        <label class="field full"><span>{{ t('Description') }}</span><input v-model="edit.service_desc" class="input" /></label>
        <label class="field full"><span>{{ t('Paramètres') }}</span><input v-model="edit.service_param" class="input mono" :placeholder="t('-p 443 -S')" /></label>
        <label class="check full"><input v-model="edit.service_ignore" type="checkbox" /> {{ t('Ignorer les alertes') }}</label>
      </div>
      <template #foot><button class="btn" @click="edit = null">{{ t('Annuler') }}</button><button class="btn primary" @click="saveSvc"><Save /> {{ t('Enregistrer') }}</button></template>
    </Modal>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { Plus, Pencil, Trash2, Save, HeartPulse } from 'lucide-vue-next'
import DataTable from './DataTable.vue'
import DeviceCell from './DeviceCell.vue'
import Modal from './Modal.vue'
import { session, api, pick, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, timeAgo, toast, toastError, confirmAction } from '../utils'
import { t } from '../i18n'

const props = defineProps({ host: String })
const rows = ref([])
const devList = ref([])
const devById = computed(() => Object.fromEntries(devList.value.map((d) => [d.device_id, d])))
const edit = ref(null)
const svcTypes = ['http', 'icmp', 'ssh', 'dns', 'smtp', 'imap', 'pop', 'ftp', 'tcp', 'udp', 'ntp', 'ldap', 'mysql', 'pgsql', 'snmp', 'disk', 'load', 'procs', 'cert']
const stCls = (s) => ({ 0: 'ok', 1: 'warning', 2: 'critical' }[s] || 'info')
const stLbl = (s) => ({ 0: 'OK', 1: t('Avertissement'), 2: t('Critique') }[s] || t('Inconnu'))
const summary = computed(() => [
  { k: 't', n: rows.value.length, l: 'services', cls: '' },
  { k: 0, n: rows.value.filter((r) => +r.service_status === 0).length, l: 'OK', cls: 'ok' },
  { k: 1, n: rows.value.filter((r) => +r.service_status === 1).length, l: 'avertissements', cls: 'warning' },
  { k: 2, n: rows.value.filter((r) => +r.service_status === 2).length, l: 'critiques', cls: 'critical' },
])
const cols = computed(() => [
  { key: 'service_status', label: t('État') },
  ...(props.host ? [] : [{ key: 'device_id', label: t('Équipement'), sortValue: (r) => devName(devById.value[r.device_id]) }]),
  { key: 'service_type', label: t('Type') }, { key: 'service_desc', label: t('Description') }, { key: 'service_ip', label: 'IP', class: 'mono' },
  { key: 'service_message', label: t('Message') }, { key: 'service_changed', label: t('Changement') }, { key: 'actions', label: '', sortable: false },
])

const { loading, error, reload } = useLoader(async () => {
  const [r, d] = await Promise.all([api.get(props.host ? `services/${encodeURIComponent(props.host)}` : 'services'), devicesCached().catch(() => [])])
  // la réponse peut être [[...]] (un tableau par équipement)
  let list = pick(r, 'services')
  if (list.length && Array.isArray(list[0])) list = list.flat()
  rows.value = list; devList.value = d
})

async function saveSvc() {
  const e = edit.value
  try {
    if (e.service_id) {
      await api.patch(`services/${e.service_id}`, { service_type: e.service_type, service_ip: e.service_ip, service_desc: e.service_desc, service_param: e.service_param, service_ignore: e.service_ignore ? 1 : 0 })
    } else {
      const h = props.host || e.hostname
      if (!h || !e.service_type) throw new Error(t('Équipement et type requis'))
      await api.post(`services/${encodeURIComponent(h)}`, { type: e.service_type, ip: e.service_ip || undefined, desc: e.service_desc, param: e.service_param, ignore: e.service_ignore ? 1 : 0 })
    }
    toast(t('Service enregistré'), 'success'); edit.value = null; reload()
  } catch (err) { toastError(err) }
}
async function remove(row) {
  if (!confirmAction(t('Supprimer le service « {n} » ?', { n: row.service_desc || row.service_type }))) return
  try { await api.del(`services/${row.service_id}`); toast(t('Service supprimé'), 'success'); reload() } catch (e) { toastError(e) }
}
</script>
<style scoped>
.mini-stat { display: flex; align-items: center; gap: 10px; padding: 14px 18px; }
.mini-stat b { font-size: 22px; }
</style>
