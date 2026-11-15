<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Groupes') }}</h1><div class="sub">{{ t('Groupes d\'équipements et de ports') }}</div></div>
      <div class="right"><button v-if="!session.read_only && tab === 'devices'" class="btn primary" @click="openEdit(null)"><Plus /> {{ t('Nouveau groupe') }}</button></div></div>
    <div class="tabs">
      <button :class="{ on: tab === 'devices' }" @click="$router.replace('/groups')"><Server /> {{ t('Groupes d\'équipements') }}</button>
      <button :class="{ on: tab === 'ports' }" @click="$router.replace('/groups/ports')"><Network /> {{ t('Groupes de ports') }}</button>
    </div>

    <template v-if="tab === 'devices'">
      <div v-if="loading && !groups.length" class="grid gauto"><div v-for="i in 6" :key="i" class="skeleton" style="height:150px"></div></div>
      <div v-else-if="!groups.length" class="card empty"><Boxes /><div>{{ t('Aucun groupe') }}</div></div>
      <div class="grid gauto stagger">
        <div v-for="g in groups" :key="g.id" class="card hover" @click="sel = sel === g.id ? null : g.id" :style="sel === g.id ? 'border-color:var(--accent)' : ''">
          <div class="row"><div class="gico"><Boxes :size="20" /></div>
            <div class="col grow" style="gap:2px;min-width:0"><b class="ellipsis">{{ g.name }}</b><span class="small muted ellipsis">{{ g.desc || '—' }}</span></div>
            <span class="badge" :class="g.type === 'dynamic' ? 'accent' : ''">{{ g.type === 'dynamic' ? 'dynamique' : 'statique' }}</span></div>
          <div class="row mt" style="margin-top:14px">
            <div class="col" style="gap:0"><b style="font-size:22px">{{ members[g.name]?.length ?? '…' }}</b><span class="small muted">{{ t('équipements') }}</span></div>
            <div class="grow"></div>
            <span v-if="members[g.name]" class="badge" :class="downIn(g) ? 'down' : 'up'">{{ downIn(g) ? `${downIn(g)} hors ligne` : t('tous en ligne') }}</span>
          </div>
          <div class="row mt" style="margin-top:12px" @click.stop>
            <router-link class="btn sm" :to="`/devices?group=${encodeURIComponent(g.name)}`"><Eye /> {{ t('Voir') }}</router-link>
            <template v-if="!session.read_only"><button class="btn sm" @click="openEdit(g)"><Pencil /></button><button class="btn sm danger" @click="remove(g)"><Trash2 /></button></template>
          </div>
        </div>
      </div>
      <div v-if="sel" class="card mt">
        <div class="card-title">Membres de {{ groups.find((g) => g.id === sel)?.name }}</div>
        <div class="grid gauto-s"><DeviceCell v-for="d in members[groups.find((g) => g.id === sel)?.name] || []" :key="d.device_id" :device="devById[d.device_id] || d" /></div>
      </div>
    </template>
    <div v-else class="card"><ApiTable path="port_groups" list-key="groups" :columns="[{ key: 'id', label: 'ID' }, { key: 'name', label: t('Nom') }, { key: 'desc', label: t('Description') }]" filename="portgroups.csv" /></div>

    <Modal v-if="edit" :title="edit.id ? t('Modifier le groupe') : t('Nouveau groupe')" :icon="Boxes" wide @close="edit = null">
      <div class="form-grid">
        <label class="field"><span>{{ t('Nom *') }}</span><input v-model="edit.name" class="input" /></label>
        <label class="field"><span>{{ t('Type') }}</span><select v-model="edit.type" class="input"><option value="static">{{ t('Statique') }}</option><option value="dynamic">{{ t('Dynamique (règles)') }}</option></select></label>
        <label class="field full"><span>{{ t('Description') }}</span><input v-model="edit.desc" class="input" /></label>
        <label v-if="edit.type === 'static'" class="field full"><span>{{ t('Équipements') }}</span>
          <select v-model="edit.devices" multiple class="input" size="10"><option v-for="d in devList" :key="d.device_id" :value="+d.device_id">{{ devName(d) }} — {{ d.hostname }}</option></select></label>
        <label v-else class="field full"><span>{{ t('Règles (JSON QueryBuilder)') }}</span><textarea v-model="edit.rules" class="input" rows="8"></textarea>
          <span class="small faint">Ex. {"condition":"AND","rules":[{"id":"devices.os","field":"devices.os","type":"string","input":"text","operator":"equal","value":"linux"}],"valid":true}</span></label>
      </div>
      <template #foot><button class="btn" @click="edit = null">{{ t('Annuler') }}</button><button class="btn primary" @click="save"><Save /> {{ t('Enregistrer') }}</button></template>
    </Modal>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Server, Network, Boxes, Eye, Pencil, Trash2, Save } from 'lucide-vue-next'
import ApiTable from '../components/ApiTable.vue'
import DeviceCell from '../components/DeviceCell.vue'
import Modal from '../components/Modal.vue'
import { session, api, pick, safeList, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, devStatus, toast, toastError, confirmAction } from '../utils'
import { t } from '../i18n'

const route = useRoute()
const tab = computed(() => route.params.tab || 'devices')
const groups = ref([])
const members = ref({})
const devList = ref([])
const devById = computed(() => Object.fromEntries(devList.value.map((d) => [d.device_id, d])))
const sel = ref(null)
const edit = ref(null)
const downIn = (g) => (members.value[g.name] || []).filter((m) => devStatus(devById.value[m.device_id]) === 'down').length

const { loading, reload } = useLoader(async () => {
  const [g, d] = await Promise.all([api.get('devicegroups').then((r) => pick(r, 'groups')), devicesCached()])
  groups.value = g; devList.value = d
  const res = await Promise.all(g.map((x) => safeList(`devicegroups/${encodeURIComponent(x.name)}`, null, 'devices')))
  members.value = Object.fromEntries(g.map((x, i) => [x.name, res[i]]))
})
function openEdit(g) {
  edit.value = g
    ? { id: g.id, origName: g.name, name: g.name, desc: g.desc || '', type: g.type, rules: g.rules ? (typeof g.rules === 'string' ? g.rules : JSON.stringify(g.rules, null, 2)) : '', devices: (members.value[g.name] || []).map((m) => +m.device_id) }
    : { name: '', desc: '', type: 'static', rules: '', devices: [] }
}
async function save() {
  const e = edit.value
  const body = { name: e.name, desc: e.desc, type: e.type }
  if (e.type === 'static') body.devices = e.devices
  else { try { body.rules = JSON.parse(e.rules) } catch { return toastError(t('JSON des règles invalide')) } }
  try {
    if (e.id) await api.patch(`devicegroups/${encodeURIComponent(e.origName)}`, body)
    else await api.post('devicegroups', body)
    toast(t('Groupe enregistré'), 'success'); edit.value = null; reload()
  } catch (err) { toastError(err) }
}
async function remove(g) {
  if (!confirmAction(t('Supprimer le groupe « {n} » ?', { n: g.name }))) return
  try { await api.del(`devicegroups/${encodeURIComponent(g.name)}`); toast(t('Groupe supprimé'), 'success'); reload() } catch (e) { toastError(e) }
}
</script>
<style scoped>
.gico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(34, 211, 238, .12); color: var(--accent); }
</style>
