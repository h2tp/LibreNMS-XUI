<template>
  <div>
    <div class="page-head">
      <div><h1>{{ t('Baies') }}</h1><div class="sub">{{ t('Baies de brassage : placement des équipements en U, façades avec l\'état des ports en direct') }}</div></div>
      <div class="right"><button class="btn primary" @click="openCreate"><Plus /> {{ t('Nouvelle salle') }}</button></div>
    </div>
    <div v-if="error" class="err mb">{{ error }}</div>
    <div v-if="loading && !items.length" class="grid g3"><div v-for="i in 3" :key="i" class="skeleton" style="height:130px"></div></div>
    <div v-else-if="!items.length" class="card empty big">
      <Rows3 /><div>{{ t('Aucune baie pour l\'instant.') }}</div>
      <div class="small muted" style="max-width:460px">{{ t('Créez une salle (local technique, garage, bureau…), ajoutez-y une ou plusieurs baies, puis glissez-y vos équipements LibreNMS et vos éléments passifs : panneaux de brassage, PDU, étagères…') }}</div>
      <button class="btn primary mt" @click="openCreate"><Plus /> {{ t('Créer ma première salle') }}</button>
    </div>
    <div v-else class="grid g3">
      <router-link v-for="d in items" :key="d.id" :to="`/racks/${d.id}`" class="card dcard">
        <div class="row" style="gap:10px">
          <div class="dico"><Rows3 :size="20" /></div>
          <div class="grow" style="min-width:0">
            <b class="ellipsis" style="display:block">{{ d.name }}</b>
            <span class="small muted">{{ t('{r} baie(s) · {u} U · {i} élément(s)', { r: d.racks, u: d.units, i: d.items }) }}</span>
            <span v-if="d.location" class="small faint ellipsis" style="display:block">{{ d.location }}</span>
          </div>
        </div>
        <div class="row small muted" style="gap:8px">
          <span class="badge">{{ ACCESS[d.access] }}</span>
          <span v-if="!d.mine">{{ t('par {u}', { u: d.owner }) }}</span>
          <span class="grow"></span>
          <span>{{ t('modifié {t}', { t: timeAgo((d.updated || 0) * 1000) }) }}</span>
        </div>
      </router-link>
    </div>

    <Modal v-if="createOpen" :title="t('Nouvelle salle')" :icon="Plus" @close="createOpen = false">
      <div class="col" style="gap:16px">
        <label class="field"><span>{{ t('Nom') }}</span><input v-model="form.name" class="input" maxlength="80" :placeholder="t('Ex. Local technique, Garage, Bureau…')" @keyup.enter="create" /></label>
        <div class="row" style="gap:12px">
          <label class="field grow"><span>{{ t('Nombre de baies') }}</span><input v-model.number="form.count" class="input" type="number" min="1" max="20" /></label>
          <label class="field grow"><span>{{ t('Hauteur de chaque baie') }}</span>
            <select v-model.number="form.units" class="input"><option v-for="u in HEIGHTS" :key="u" :value="u">{{ u }} U</option></select></label>
        </div>
        <label class="field"><span>{{ t('Emplacement (optionnel)') }}</span><input v-model="form.location" class="input" list="rack-locs" maxlength="120" /></label>
        <datalist id="rack-locs"><option v-for="l in locations" :key="l" :value="l" /></datalist>
        <div class="field">
          <span>{{ t('Partage') }}</span>
          <select v-model="form.access" class="input">
            <option value="private">{{ t('Privé — visible par vous seul') }}</option>
            <option value="read">{{ t('Partagé en lecture — visible par tous') }}</option>
            <option value="edit">{{ t('Partagé en écriture — modifiable par tous') }}</option>
          </select>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="createOpen = false">{{ t('Annuler') }}</button>
        <button class="btn primary" :disabled="!form.name.trim() || busy" @click="create"><Loader2 v-if="busy" class="spin" /><Check v-else /> {{ t('Créer') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Rows3, Plus, Check, Loader2 } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import { rackApi } from '../api'
import { D } from '../dashboard/data'
import { uid } from '../diagram/core'
import { useLoader } from '../refresh'
import { timeAgo, toastError } from '../utils'
import { t } from '../i18n'

const HEIGHTS = [4, 6, 9, 12, 15, 18, 22, 24, 27, 32, 37, 42, 47, 48]
const ACCESS = { private: t('Privé'), read: t('Partagé (lecture)'), edit: t('Partagé (écriture)') }
const router = useRouter()
const items = ref([])
const devices = ref([])
const createOpen = ref(false)
const busy = ref(false)
const form = reactive({ name: '', count: 1, units: 42, location: '', access: 'private' })
const locations = computed(() => [...new Set(devices.value.map((d) => d.location).filter(Boolean))].sort())
const { loading, error } = useLoader(async () => {
  items.value = (await rackApi.list()).items
  devices.value = await D.devices().catch(() => [])
}, { auto: false })

function openCreate() { Object.assign(form, { name: '', count: 1, units: 42, location: '', access: 'private' }); createOpen.value = true }

async function create() {
  if (!form.name.trim()) return
  busy.value = true
  try {
    const n = Math.max(1, Math.min(20, form.count || 1))
    const racks = Array.from({ length: n }, (_, i) => ({ id: uid(), name: n > 1 ? t('Baie {n}', { n: String.fromCharCode(65 + i) }) : t('Baie'), units: form.units }))
    const d = await rackApi.create({ name: form.name.trim(), access: form.access, location: form.location, racks, items: [] })
    router.push(`/racks/${d.id}`)
  } catch (e) { toastError(e) } finally { busy.value = false }
}
</script>

<style scoped>
.big { padding: 60px 20px; }
.dcard { display: flex; flex-direction: column; gap: 14px; color: var(--text); transition: transform .15s, border-color .15s; }
.dcard:hover { text-decoration: none; transform: translateY(-2px); border-color: var(--accent); }
.dico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
</style>
