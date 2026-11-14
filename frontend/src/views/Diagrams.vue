<template>
  <div>
    <div class="page-head">
      <div><h1>Schémas</h1><div class="sub">Schémas réseau dessinés à la main, avec l'état et le trafic en direct</div></div>
      <div class="right"><button class="btn primary" @click="openCreate"><Plus /> Nouveau schéma</button></div>
    </div>
    <div v-if="error" class="err mb">{{ error }}</div>
    <div v-if="loading && !items.length" class="grid g3"><div v-for="i in 3" :key="i" class="skeleton" style="height:130px"></div></div>
    <div v-else-if="!items.length" class="card empty big">
      <Workflow /><div>Aucun schéma pour l'instant.</div>
      <div class="small muted" style="max-width:440px">Partez de la topologie détectée automatiquement (LLDP), puis complétez à la main : équipements, liens et ports, image de fond (plan, baie).</div>
      <button class="btn primary mt" @click="openCreate"><Plus /> Créer mon premier schéma</button>
    </div>
    <div v-else class="grid g3">
      <router-link v-for="d in items" :key="d.id" :to="`/diagrams/${d.id}`" class="card dcard">
        <div class="row" style="gap:10px">
          <div class="dico"><Workflow :size="20" /></div>
          <div class="grow" style="min-width:0">
            <b class="ellipsis" style="display:block">{{ d.name }}</b>
            <span class="small muted">{{ d.nodes }} élément(s) · {{ d.links }} lien(s){{ d.has_bg ? ' · image de fond' : '' }}</span>
          </div>
        </div>
        <div class="row small muted" style="gap:8px">
          <span class="badge">{{ ACCESS[d.access] }}</span>
          <span v-if="!d.mine">par {{ d.owner }}</span>
          <span class="grow"></span>
          <span>modifié {{ timeAgo((d.updated || 0) * 1000) }}</span>
        </div>
      </router-link>
    </div>

    <Modal v-if="createOpen" title="Nouveau schéma" :icon="Plus" @close="createOpen = false">
      <div class="col" style="gap:16px">
        <label class="field"><span>Nom</span><input v-model="form.name" class="input" maxlength="80" placeholder="Ex. Réseau maison, Baie du garage…" @keyup.enter="create" /></label>
        <div class="field">
          <span>Point de départ</span>
          <label class="check"><input v-model="form.from" type="radio" value="lldp" /> Topologie détectée (équipements reliés par LLDP / CDP et leurs liens)</label>
          <label class="check"><input v-model="form.from" type="radio" value="all" /> Tous les équipements, rangés par type (liens LLDP inclus)</label>
          <label class="check"><input v-model="form.from" type="radio" value="empty" /> Schéma vide</label>
        </div>
        <div class="field">
          <span>Partage</span>
          <select v-model="form.access" class="input">
            <option value="private">Privé — visible par vous seul</option>
            <option value="read">Partagé en lecture — visible par tous</option>
            <option value="edit">Partagé en écriture — modifiable par tous</option>
          </select>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="createOpen = false">Annuler</button>
        <button class="btn primary" :disabled="!form.name.trim() || busy" @click="create"><Loader2 v-if="busy" class="spin" /><Check v-else /> Créer</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Workflow, Plus, Check, Loader2 } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import { diagApi } from '../api'
import { D } from '../dashboard/data'
import { lldpLinks, topoLayout, lldpLinksBetween, uid } from '../diagram/core'
import { useLoader } from '../refresh'
import { timeAgo, toastError } from '../utils'

const ACCESS = { private: 'Privé', read: 'Partagé (lecture)', edit: 'Partagé (écriture)' }
const router = useRouter()
const items = ref([])
const createOpen = ref(false)
const busy = ref(false)
const form = reactive({ name: '', from: 'lldp', access: 'private' })
const { loading, error } = useLoader(async () => { items.value = (await diagApi.list()).items }, { auto: false })

function openCreate() { Object.assign(form, { name: '', from: 'lldp', access: 'private' }); createOpen.value = true }

async function create() {
  if (!form.name.trim()) return
  busy.value = true
  try {
    let nodes = []; let links = []
    if (form.from !== 'empty') {
      const [devs, lk] = await Promise.all([D.devices(), lldpLinks()])
      const linked = new Set(lk.flatMap((l) => [+l.local_device_id, +l.remote_device_id]).filter(Boolean))
      const chosen = devs.filter((d) => !+d.disabled && (form.from === 'all' || linked.has(+d.device_id)))
      const pos = topoLayout(chosen, lk)
      nodes = chosen.map((d) => ({ id: uid(), kind: 'device', device_id: +d.device_id, x: pos[d.device_id].x, y: pos[d.device_id].y }))
      links = lldpLinksBetween(lk, nodes).map((l) => ({ id: uid(), ...l }))
    }
    const d = await diagApi.create({ name: form.name.trim(), access: form.access, nodes, links, view: { background: 'grid', showRates: true, showPorts: true } })
    router.push(`/diagrams/${d.id}`)
  } catch (e) { toastError(e) } finally { busy.value = false }
}
</script>

<style scoped>
.big { padding: 60px 20px; }
.dcard { display: flex; flex-direction: column; gap: 14px; color: var(--text); transition: transform .15s, border-color .15s; }
.dcard:hover { text-decoration: none; transform: translateY(-2px); border-color: var(--accent); }
.dico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
</style>
