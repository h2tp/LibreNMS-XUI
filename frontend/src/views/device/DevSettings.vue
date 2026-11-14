<template>
  <div class="grid g2">
    <div class="card">
      <div class="card-title"><Pencil :size="17" /> Propriétés</div>
      <div class="form-grid">
        <label class="field"><span>Nom affiché</span><input v-model="f.display" class="input" /></label>
        <label class="field"><span>Type</span>
          <select v-model="f.type" class="input"><option v-for="t in types" :key="t" :value="t">{{ t }}</option></select></label>
        <label class="field"><span>IP de remplacement</span><input v-model="f.overwrite_ip" class="input mono" /></label>
        <label class="field"><span>Groupe de pollers</span>
          <select v-model.number="f.poller_group" class="input"><option :value="0">Défaut</option><option v-for="g in pollerGroups" :key="g.id" :value="+g.id">{{ g.group_name }}</option></select></label>
        <label class="field full"><span>Emplacement</span><input v-model="f.location" class="input" list="dev-locs" /><datalist id="dev-locs"><option v-for="l in locations" :key="l.id" :value="l.location" /></datalist></label>
        <label class="field full"><span>Rôle / fonction</span><input v-model="f.purpose" class="input" /></label>
        <label class="field full"><span>Notes</span><textarea v-model="f.notes" class="input" rows="3"></textarea></label>
        <label class="check"><input v-model="f.disabled" type="checkbox" /> Désactiver le polling</label>
        <label class="check"><input v-model="f.ignore" type="checkbox" /> Ignorer les alertes</label>
        <label class="check full"><input v-model="f.disable_notify" type="checkbox" /> Désactiver les notifications</label>
      </div>
      <div class="row mt"><div class="grow"></div><button class="btn primary" :disabled="busy" @click="saveProps"><Save /> Enregistrer</button></div>
    </div>

    <div class="col" style="gap:18px">
      <div class="card">
        <div class="card-title"><Wrench :size="17" /> Maintenance</div>
        <div class="form-grid">
          <label class="field"><span>Titre</span><input v-model="m.title" class="input" placeholder="Intervention planifiée" /></label>
          <label class="field"><span>Durée (hh:mm)</span><input v-model="m.duration" class="input mono" placeholder="02:00" /></label>
          <label class="field"><span>Début (vide = maintenant)</span><input v-model="m.start" type="datetime-local" class="input" /></label>
          <label class="field"><span>Notes</span><input v-model="m.notes" class="input" /></label>
        </div>
        <div class="row mt"><div class="grow"></div><button class="btn" :disabled="busy" @click="maintenance"><Wrench /> Mettre en maintenance</button></div>
      </div>

      <div class="card">
        <div class="card-title"><ArrowRightLeft :size="17" /> Renommer</div>
        <div class="row"><input v-model="newName" class="input grow mono" placeholder="nouveau nom d'hôte" /><button class="btn" :disabled="!newName || busy" @click="rename">Renommer</button></div>
      </div>

      <div class="card">
        <div class="card-title"><Zap :size="17" /> Actions</div>
        <div class="row wrap">
          <button class="btn" @click="discover"><ScanSearch /> Forcer la redécouverte</button>
          <button class="btn danger" @click="remove"><Trash2 /> Supprimer l'équipement</button>
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
  if (!fields.length) return toast('Aucune modification')
  run(() => api.patch(`devices/${h}`, { field: fields, data }), 'Propriétés enregistrées')
}
function maintenance() {
  const body = { title: m.title || 'Maintenance', duration: m.duration, notes: m.notes }
  if (m.start) body.start = m.start.replace('T', ' ') + ':00'
  run(() => api.post(`devices/${h}/maintenance`, body), 'Maintenance planifiée')
}
async function rename() {
  if (!confirmAction(`Renommer ${d.hostname} en ${newName.value} ?`)) return
  busy.value = true
  try {
    await api.patch(`devices/${h}/rename/${L.enc(newName.value)}`)
    toast('Équipement renommé', 'success'); invalidateDevices()
    router.replace(`/device/${L.enc(newName.value)}`)
  } catch (e) { toastError(e) } finally { busy.value = false }
}
function discover() { run(() => api.get(`devices/${h}/discover`), 'Redécouverte planifiée') }
async function remove() {
  if (!confirmAction(`Supprimer définitivement ${d.hostname} et tout son historique ?`)) return
  try { await api.del(`devices/${h}`); toast('Équipement supprimé', 'success'); invalidateDevices(); router.push('/devices') } catch (e) { toastError(e) }
}
</script>
