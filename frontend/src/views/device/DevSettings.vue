<template>
  <div class="grid g2">
    <div class="card">
      <div class="card-title"><Pencil :size="17" /> {{ t('Propriétés') }}</div>
      <div class="form-grid">
        <label class="field"><span>{{ t('Nom affiché') }}</span><input v-model="f.display" class="input" /></label>
        <label class="field"><span>{{ t('Type') }}</span>
          <select v-model="f.type" class="input"><option v-for="tb in types" :key="tb" :value="tb">{{ tb }}</option></select></label>
        <label class="field"><span>{{ t('IP de remplacement') }}</span><input v-model="f.overwrite_ip" class="input mono" /></label>
        <label class="field"><span>{{ t('Groupe de pollers') }}</span>
          <select v-model.number="f.poller_group" class="input"><option :value="0">{{ t('Défaut') }}</option><option v-for="g in pollerGroups" :key="g.id" :value="+g.id">{{ g.group_name }}</option></select></label>
        <label class="field full"><span>{{ t('Emplacement') }}</span><input v-model="f.location" class="input" list="dev-locs" /><datalist id="dev-locs"><option v-for="l in locations" :key="l.id" :value="l.location" /></datalist></label>
        <label class="field full"><span>{{ t('Rôle / fonction') }}</span><input v-model="f.purpose" class="input" /></label>
        <label class="field full"><span>{{ t('Notes') }}</span><textarea v-model="f.notes" class="input" rows="3"></textarea></label>
        <label class="check"><input v-model="f.disabled" type="checkbox" /> {{ t('Désactiver le polling') }}</label>
        <label class="check"><input v-model="f.ignore" type="checkbox" /> {{ t('Ignorer les alertes') }}</label>
        <label class="check full"><input v-model="f.disable_notify" type="checkbox" /> {{ t('Désactiver les notifications') }}</label>
      </div>
      <div class="row mt"><div class="grow"></div><button class="btn primary" :disabled="busy" @click="saveProps"><Save /> {{ t('Enregistrer') }}</button></div>
    </div>

    <div class="col" style="gap:18px">
      <div class="card">
        <div class="card-title"><Wrench :size="17" /> {{ t('Maintenance') }}</div>
        <div class="form-grid">
          <label class="field"><span>{{ t('Titre') }}</span><input v-model="m.title" class="input" :placeholder="t('Intervention planifiée')" /></label>
          <label class="field"><span>{{ t('Durée (hh:mm)') }}</span><input v-model="m.duration" class="input mono" placeholder="02:00" /></label>
          <label class="field"><span>{{ t('Début (vide = maintenant)') }}</span><input v-model="m.start" type="datetime-local" class="input" /></label>
          <label class="field"><span>{{ t('Notes') }}</span><input v-model="m.notes" class="input" /></label>
        </div>
        <div class="row mt"><div class="grow"></div><button class="btn" :disabled="busy" @click="maintenance"><Wrench /> {{ t('Mettre en maintenance') }}</button></div>
      </div>

      <div class="card">
        <div class="card-title"><ArrowRightLeft :size="17" /> {{ t('Renommer') }}</div>
        <div class="row"><input v-model="newName" class="input grow mono" :placeholder="t('nouveau nom d\'hôte')" /><button class="btn" :disabled="!newName || busy" @click="rename">{{ t('Renommer') }}</button></div>
      </div>

      <div class="card">
        <div class="card-title"><Zap :size="17" /> {{ t('Actions') }}</div>
        <div class="row wrap">
          <button class="btn" @click="discover"><ScanSearch /> {{ t('Forcer la redécouverte') }}</button>
          <button class="btn danger" @click="remove"><Trash2 /> {{ t('Supprimer l\'équipement') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Pencil, Save, Wrench, ArrowRightLeft, Zap, ScanSearch, Trash2 } from 'lucide-vue-next'
import { api, safeList, L, invalidateDevices } from '../../api'
import { toast, toastError, confirmAction } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ device: Object })
const emit = defineEmits(['changed'])
const router = useRouter()
const d = props.device
const h = L.enc(d.hostname)
const types = ['server', 'network', 'firewall', 'wireless', 'storage', 'power', 'environment', 'loadbalancer', 'printer', 'appliance', 'collaboration', 'workstation', 'camera', 'management', 'other']
const f = reactive({ location: d.location || '', display: d.display || '', type: d.type || 'server', overwrite_ip: d.overwrite_ip || '', poller_group: +d.poller_group || 0, purpose: d.purpose || '', notes: d.notes || '', disabled: !!+d.disabled, ignore: !!+d.ignore, disable_notify: !!+d.disable_notify })
const m = reactive({ title: '', duration: '01:00', start: '', notes: '' })
const newName = ref('')
const busy = ref(false)
const pollerGroups = ref([])
const locations = ref([])
onMounted(async () => {
  pollerGroups.value = await safeList('poller_group', null, 'get_poller_group')
  locations.value = await safeList('resources/locations', null, 'locations')
})

async function run(fn, ok) {
  busy.value = true
  try { const r = await fn(); toast(r?.message || ok, 'success'); invalidateDevices(); emit('changed') } catch (e) { toastError(e) } finally { busy.value = false }
}
function saveProps() {
  const fields = []; const data = []
  for (const [k, v] of Object.entries(f)) {
    const val = typeof v === 'boolean' ? (v ? 1 : 0) : v
    const orig = typeof v === 'boolean' ? (+d[k] ? 1 : 0) : (d[k] ?? '')
    if (String(val) !== String(orig)) { fields.push(k); data.push(val) }
  }
  if (!fields.length) return toast(t('Aucune modification'))
  run(() => api.patch(`devices/${h}`, { field: fields, data }), t('Propriétés enregistrées'))
}
function maintenance() {
  const body = { title: m.title || 'Maintenance', duration: m.duration, notes: m.notes }
  if (m.start) body.start = m.start.replace('T', ' ') + ':00'
  run(() => api.post(`devices/${h}/maintenance`, body), t('Maintenance planifiée'))
}
async function rename() {
  if (!confirmAction(`Renommer ${d.hostname} en ${newName.value} ?`)) return
  busy.value = true
  try {
    await api.patch(`devices/${h}/rename/${L.enc(newName.value)}`)
    toast(t('Équipement renommé'), 'success'); invalidateDevices()
    router.replace(`/device/${L.enc(newName.value)}`)
  } catch (e) { toastError(e) } finally { busy.value = false }
}
function discover() { run(() => api.get(`devices/${h}/discover`), t('Redécouverte planifiée')) }
async function remove() {
  if (!confirmAction(t('Supprimer définitivement {h} et tout son historique ?', { h: d.hostname }))) return
  try { await api.del(`devices/${h}`); toast(t('Équipement supprimé'), 'success'); invalidateDevices(); router.push('/devices') } catch (e) { toastError(e) }
}
</script>
