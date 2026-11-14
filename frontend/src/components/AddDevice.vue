<template>
  <Modal title="Ajouter un équipement" :icon="Plus" wide @close="$emit('close')">
    <form class="form-grid" @submit.prevent="submit">
      <label class="field"><span>Nom d'hôte ou IP *</span><input v-model="f.hostname" class="input" required autofocus /></label>
      <label class="field"><span>Nom affiché</span><input v-model="f.display" class="input" placeholder="optionnel" /></label>
      <div class="field full"><span>Mode</span>
        <div class="seg"><button type="button" :class="{ on: !f.snmp_disable }" @click="f.snmp_disable = false">SNMP</button><button type="button" :class="{ on: f.snmp_disable }" @click="f.snmp_disable = true">Ping uniquement (ICMP)</button></div>
      </div>
      <template v-if="!f.snmp_disable">
        <label class="field"><span>Version SNMP</span><select v-model="f.snmpver" class="input"><option>v2c</option><option>v1</option><option>v3</option></select></label>
        <div class="row"><label class="field grow"><span>Port</span><input v-model.number="f.port" type="number" class="input" /></label>
          <label class="field grow"><span>Transport</span><select v-model="f.transport" class="input"><option>udp</option><option>tcp</option><option>udp6</option><option>tcp6</option></select></label></div>
        <label v-if="f.snmpver !== 'v3'" class="field full"><span>Communauté</span><input v-model="f.community" class="input mono" placeholder="public" /></label>
        <template v-else>
          <label class="field"><span>Niveau</span><select v-model="f.authlevel" class="input"><option value="noAuthNoPriv">noAuthNoPriv</option><option value="authNoPriv">authNoPriv</option><option value="authPriv">authPriv</option></select></label>
          <label class="field"><span>Utilisateur</span><input v-model="f.authname" class="input" /></label>
          <template v-if="f.authlevel !== 'noAuthNoPriv'">
            <label class="field"><span>Algorithme d'authentification</span><select v-model="f.authalgo" class="input"><option>SHA</option><option>MD5</option><option>SHA-224</option><option>SHA-256</option><option>SHA-384</option><option>SHA-512</option></select></label>
            <label class="field"><span>Mot de passe d'authentification</span><input v-model="f.authpass" type="password" class="input" /></label>
          </template>
          <template v-if="f.authlevel === 'authPriv'">
            <label class="field"><span>Algorithme de chiffrement</span><select v-model="f.cryptoalgo" class="input"><option>AES</option><option>DES</option><option>AES-192</option><option>AES-256</option><option>AES-256-C</option></select></label>
            <label class="field"><span>Mot de passe de chiffrement</span><input v-model="f.cryptopass" type="password" class="input" /></label>
          </template>
        </template>
        <label class="check full"><input v-model="f.ping_fallback" type="checkbox" /> Basculer en ping seul si SNMP ne répond pas</label>
      </template>
      <template v-else>
        <label class="field"><span>OS</span><input v-model="f.os" class="input" placeholder="ping" /></label>
        <label class="field"><span>Matériel</span><input v-model="f.hardware" class="input" /></label>
        <label class="field"><span>sysName</span><input v-model="f.sysName" class="input" /></label>
      </template>
      <label class="field"><span>IP de remplacement (overwrite_ip)</span><input v-model="f.overwrite_ip" class="input" placeholder="optionnel" /></label>
      <label class="field"><span>Groupe de pollers</span><select v-model.number="f.poller_group" class="input"><option :value="0">Défaut</option><option v-for="g in pollerGroups" :key="g.id" :value="g.id">{{ g.group_name }}</option></select></label>
      <label class="field"><span>Emplacement</span><input v-model="f.location" class="input" list="locs" /><datalist id="locs"><option v-for="l in locations" :key="l.id" :value="l.location" /></datalist></label>
      <label class="check full"><input v-model="f.force_add" type="checkbox" /> Forcer l'ajout (ignorer les tests de joignabilité)</label>
      <div v-if="err" class="err full">{{ err }}</div>
    </form>
    <template #foot>
      <button class="btn" @click="$emit('close')">Annuler</button>
      <button class="btn primary" :disabled="busy || !f.hostname" @click="submit"><Loader2 v-if="busy" class="spin" /><Plus v-else /> Ajouter</button>
    </template>
  </Modal>
</template>
<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Loader2 } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { api, safeList, invalidateDevices } from '../api'
import { toast } from '../utils'

const emit = defineEmits(['close', 'added'])
const router = useRouter()
const f = reactive({ hostname: '', display: '', snmpver: 'v2c', port: 161, transport: 'udp', community: '', authlevel: 'authPriv', authname: '', authalgo: 'SHA', authpass: '', cryptoalgo: 'AES', cryptopass: '', snmp_disable: false, ping_fallback: false, force_add: false, os: 'ping', hardware: '', sysName: '', overwrite_ip: '', poller_group: 0, location: '' })
const busy = ref(false)
const err = ref('')
const pollerGroups = ref([])
const locations = ref([])
onMounted(async () => {
  pollerGroups.value = await safeList('poller_group', null, 'get_poller_group')
  locations.value = await safeList('resources/locations', null, 'locations')
})

async function submit() {
  busy.value = true; err.value = ''
  const body = { hostname: f.hostname.trim(), force_add: f.force_add, poller_group: f.poller_group }
  for (const k of ['display', 'overwrite_ip', 'location']) if (f[k]) body[k] = f[k]
  if (f.snmp_disable) Object.assign(body, { snmp_disable: true, os: f.os || 'ping', hardware: f.hardware, sysName: f.sysName })
  else {
    Object.assign(body, { version: f.snmpver, port: f.port, transport: f.transport, ping_fallback: f.ping_fallback })
    if (f.snmpver === 'v3') Object.assign(body, { authlevel: f.authlevel, authname: f.authname, authalgo: f.authalgo, authpass: f.authpass, cryptoalgo: f.cryptoalgo, cryptopass: f.cryptopass })
    else if (f.community) body.community = f.community
  }
  try {
    const r = await api.post('devices', body)
    toast(r.message || 'Équipement ajouté', 'success')
    invalidateDevices()
    emit('added'); emit('close')
    router.push(`/device/${encodeURIComponent(body.hostname)}`)
  } catch (e) { err.value = e.message } finally { busy.value = false }
}
</script>
