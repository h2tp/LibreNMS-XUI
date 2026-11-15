<template>
  <div class="reditor">
    <div class="page-head">
      <div style="min-width:0">
        <h1 class="row" style="gap:10px"><router-link to="/racks" class="muted" :title="t('Toutes les salles')"><ChevronLeft :size="22" /></router-link><span class="grad-text ellipsis">{{ room?.name || t('Baies') }}</span></h1>
        <div class="sub">
          <template v-if="room">{{ t('{r} baie(s) · {i} élément(s)', { r: room.racks.length, i: room.items.length }) }} · {{ ACCESS[room.access] }}<template v-if="room.location"> · {{ room.location }}</template><template v-if="!room.mine"> · {{ t('par {u}', { u: room.owner }) }}</template></template>
          · {{ t('mis à jour {t}', { t: timeAgo(clock.last) }) }}
        </div>
      </div>
      <div class="right">
        <div class="zoomctl row">
          <button class="btn ghost sm icon" :title="t('Zoom −')" @click="setZoom(-0.1)"><ZoomOut :size="15" /></button>
          <span class="small muted mono">{{ Math.round(zoom * 100) }} %</span>
          <button class="btn ghost sm icon" :title="t('Zoom +')" @click="setZoom(0.1)"><ZoomIn :size="15" /></button>
        </div>
        <template v-if="editing">
          <span class="small muted row nowrap">
            <Loader2 v-if="saveState === 'saving'" class="spin" :size="14" /><CircleAlert v-else-if="saveState === 'error'" :size="14" color="var(--red)" /><CircleCheck v-else :size="14" color="var(--green)" />
            {{ { saving: t('Enregistrement…'), error: t('Échec de l\'enregistrement'), saved: t('Enregistré') }[saveState] }}
          </span>
          <button class="btn" @click="openSettings"><Settings /> {{ t('Paramètres') }}</button>
          <button class="btn primary" @click="stopEdit"><Check /> {{ t('Terminer') }}</button>
        </template>
        <template v-else>
          <button v-if="room" class="btn" @click="openSettings"><Settings /> {{ t('Paramètres') }}</button>
          <button v-if="room?.can_edit" class="btn primary" @click="editing = true"><Pencil /> {{ t('Modifier') }}</button>
        </template>
      </div>
    </div>
    <div v-if="error" class="err mb">{{ error }}</div>

    <div v-if="room" class="layout" :class="{ editing }">
      <aside v-if="editing" class="card side">
        <!-- inspecteur : élément sélectionné -->
        <div v-if="selItem" class="insp">
          <div class="insp-title"><component :is="selItem.kind === 'device' ? Server : Box" :size="15" /> {{ itemName(selItem) }}</div>
          <div class="small faint">{{ KIND_LABEL[selItem.kind] }} · {{ t('U {a} à {b}', { a: selItem.u, b: selItem.u + selItem.h - 1 }) }} · {{ rackName(selItem.rack) }}</div>
          <label class="field"><span>{{ selItem.kind === 'device' ? t('Libellé (vide : nom de l\'équipement)') : t('Libellé') }}</span><input v-model="selItem.label" class="input" maxlength="60" @input="changed()" /></label>
          <div class="row" style="gap:10px">
            <label class="field grow"><span>{{ t('Hauteur') }}</span>
              <select :value="selItem.h" class="input" @change="setHeight(+$event.target.value)"><option v-for="h in 12" :key="h" :value="h">{{ h }} U</option></select></label>
            <label v-if="selItem.kind !== 'device' && !['shelf', 'blank', 'cablemgmt'].includes(selItem.kind)" class="field grow"><span>{{ t('Prises / ports') }}</span>
              <input v-model.number="selItem.ports" class="input" type="number" min="0" max="96" @change="selItem.ports = Math.max(0, Math.min(96, selItem.ports || 0)); changed()" /></label>
          </div>
          <div class="field"><span>{{ t('Apparence') }}</span>
            <div class="seg" style="width:100%">
              <button :class="{ on: selItem.display !== 'image' || !selItem.image }" @click="selItem.display = 'face'; changed()">{{ t('Façade dessinée') }}</button>
              <button :class="{ on: selItem.display === 'image' && selItem.image }" :disabled="!selItem.image" :title="!selItem.image ? t('Choisissez d\'abord une image ci-dessous') : ''" @click="selItem.display = 'image'; changed()">{{ t('Image') }}</button>
            </div>
          </div>
          <div class="field"><span>{{ t('Image') }}</span>
            <div class="gallery">
              <button class="gimg none" :class="{ on: !selItem.image }" :title="t('Aucune image')" @click="setImage(null)">—</button>
              <button v-for="im in images" :key="im.name" class="gimg" :class="{ on: selItem.image === im.name }" @click="setImage(im.name)"><img :src="diagApi.imgUrl(im.name)" alt="" loading="lazy" /></button>
              <label class="gimg add" :title="t('Importer une image (PNG, JPEG, WebP, GIF, 2 Mo max.)')">
                <Loader2 v-if="imgBusy" :size="15" class="spin" /><ImageUp v-else :size="15" />
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="uploadImage" />
              </label>
            </div>
            <span class="small faint">{{ t('Une photo de façade recadrée rend le mieux (bibliothèque partagée avec les schémas).') }}</span>
          </div>
          <div class="row wrap" style="gap:6px">
            <router-link v-if="selDev" :to="`/device/${encodeURIComponent(selDev.hostname)}`" class="btn sm"><ExternalLink :size="13" /> {{ t('Fiche') }}</router-link>
            <button class="btn sm danger" @click="removeItem(selItem)"><Trash2 :size="13" /> {{ t('Retirer') }}</button>
          </div>
        </div>

        <!-- inspecteur : baie sélectionnée -->
        <div v-else-if="selRack" class="insp">
          <div class="insp-title"><Rows3 :size="15" /> {{ selRack.name || t('Baie') }}</div>
          <label class="field"><span>{{ t('Nom') }}</span><input v-model="selRack.name" class="input" maxlength="40" @input="changed()" /></label>
          <label class="field"><span>{{ t('Hauteur (U)') }}</span>
            <input :value="selRack.units" class="input" type="number" min="1" max="60" @change="setUnits(+$event.target.value, $event)" /></label>
          <div class="row wrap" style="gap:6px">
            <button class="btn sm" :disabled="rackIndex === 0" :title="t('Déplacer à gauche')" @click="moveRack(-1)"><ArrowLeft :size="13" /></button>
            <button class="btn sm" :disabled="rackIndex === room.racks.length - 1" :title="t('Déplacer à droite')" @click="moveRack(1)"><ArrowRight :size="13" /></button>
            <button class="btn sm danger" @click="removeRack(selRack)"><Trash2 :size="13" /> {{ t('Supprimer la baie') }}</button>
          </div>
        </div>
        <div v-else class="hint small">{{ t('Glissez un équipement ou un élément passif dans une baie. Cliquez sur un élément ou sur le titre d\'une baie pour le modifier ; glissez un élément pour le déplacer.') }}</div>

        <div class="insp">
          <div class="insp-title"><Plus :size="15" /> {{ t('Ajouter') }}</div>
          <button class="btn sm" style="align-self:flex-start" @click="addRack"><Rows3 :size="13" /> {{ t('Ajouter une baie') }}</button>
          <div class="passives">
            <div v-for="(p, i) in PASSIVE" :key="i" class="dev" draggable="true" :title="t('Glisser dans une baie ou cliquer pour ajouter')"
              @dragstart="startNew(p, $event)" @dragend="clearDrag" @click="addAuto(p)">
              <span class="pico" :class="p.kind"></span><span class="ellipsis grow">{{ p.l }}</span><span class="faint small">{{ p.h }}U</span>
            </div>
          </div>
          <input v-model="q" class="input" :placeholder="t('Rechercher un équipement…')" />
          <div class="devlist">
            <div v-for="d in devList" :key="d.device_id" class="dev" :class="{ present: placed.has(+d.device_id) }" :draggable="!placed.has(+d.device_id)"
              :title="placed.has(+d.device_id) ? t('Déjà placé dans cette salle') : t('Glisser dans une baie ou cliquer pour ajouter')"
              @dragstart="startNew({ kind: 'device', device_id: +d.device_id, h: 1 }, $event)" @dragend="clearDrag"
              @click="!placed.has(+d.device_id) && addAuto({ kind: 'device', device_id: +d.device_id, h: 1 })">
              <span class="dot" :class="devStatus(d)"></span><span class="ellipsis grow">{{ devName(d) }}</span><span class="faint small">{{ d.type || d.os }}</span>
            </div>
          </div>
        </div>
      </aside>

      <div class="card rack-card">
        <RackView :room="room" :dev-by-id="devById" :ports-by-dev="portsByDev" :editing="editing" :selected="selected" :zoom="zoom"
          @select="(s) => (selected = s)" @drop="onDrop" @invalid="toast(t('Pas assez de place à cet endroit'), 'error')" @open="openItem" />
        <div class="legend small muted">
          <span><i style="background:#22d3ee"></i>10 G+</span><span><i style="background:#22c55e"></i>1 G</span><span><i style="background:#facc15"></i>100 M</span><span><i style="background:#fb923c"></i>10 M</span>
          <span><i class="off"></i>{{ t('déconnecté') }}</span><span><i class="adm"></i>{{ t('désactivé') }}</span>
          <span v-if="!editing" class="faint">{{ t('Clic sur un équipement : sa fiche · clic sur un port : sa page') }}</span>
        </div>
      </div>
    </div>
    <div v-else-if="!error" class="skeleton" style="height:70vh"></div>

    <Modal v-if="settingsOpen && room" :title="t('Paramètres de la salle')" :icon="Settings" @close="settingsOpen = false">
      <div class="col" style="gap:16px">
        <label class="field"><span>{{ t('Nom') }}</span><input v-model="sform.name" class="input" maxlength="80" :disabled="!room.can_edit" /></label>
        <label class="field"><span>{{ t('Emplacement (optionnel)') }}</span><input v-model="sform.location" class="input" list="room-locs" maxlength="120" :disabled="!room.can_edit" /></label>
        <datalist id="room-locs"><option v-for="l in locations" :key="l" :value="l" /></datalist>
        <div v-if="room.mine" class="field"><span>{{ t('Partage') }}</span>
          <select v-model="sform.access" class="input">
            <option value="private">{{ t('Privé — visible par vous seul') }}</option>
            <option value="read">{{ t('Partagé en lecture — visible par tous') }}</option>
            <option value="edit">{{ t('Partagé en écriture — modifiable par tous') }}</option>
          </select></div>
        <div v-if="room.mine" class="hr"></div>
        <div v-if="room.mine" class="row wrap"><button class="btn sm danger" @click="removeRoom"><Trash2 :size="13" /> {{ t('Supprimer cette salle') }}</button></div>
      </div>
      <template #foot>
        <button class="btn" @click="settingsOpen = false">{{ t('Fermer') }}</button>
        <button v-if="room.can_edit" class="btn primary" :disabled="!sform.name.trim()" @click="saveSettings"><Check /> {{ t('Enregistrer') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronLeft, Pencil, Check, Settings, Loader2, CircleCheck, CircleAlert, Plus, Server, Box, Rows3, Trash2, ExternalLink,
  ImageUp, ZoomIn, ZoomOut, ArrowLeft, ArrowRight,
} from 'lucide-vue-next'
import RackView from '../components/RackView.vue'
import Modal from '../components/Modal.vue'
import { rackApi, diagApi } from '../api'
import { D } from '../dashboard/data'
import { uid } from '../diagram/core'
import { PASSIVE, KIND_LABEL, dragPayload, fits, firstFree, topUsed, physPorts } from '../rack/core'
import { clock, useLoader } from '../refresh'
import { devName, devStatus, timeAgo, toast, toastError, confirmAction, prefs, save } from '../utils'
import { t } from '../i18n'

const ACCESS = { private: t('Privé'), read: t('Partagé (lecture)'), edit: t('Partagé (écriture)') }
const route = useRoute(); const router = useRouter()
const room = ref(null); const error = ref(null)
const editing = ref(false); const selected = ref(null)
const zoom = ref(prefs.rackZoom || 1)
function setZoom(d) { zoom.value = Math.round(Math.max(0.5, Math.min(2.5, zoom.value + d)) * 10) / 10; prefs.rackZoom = zoom.value; save('rackZoom', zoom.value) }

// --------------------------------------------------------------- données en direct
const devices = ref([]); const ports = ref([])
const devById = computed(() => Object.fromEntries(devices.value.map((d) => [+d.device_id, d])))
const portsByDev = computed(() => {
  const ids = new Set((room.value?.items || []).filter((i) => i.device_id).map((i) => +i.device_id))
  return Object.fromEntries([...ids].map((id) => [id, physPorts(ports.value, id)]))
})
useLoader(async () => {
  const [d, p] = await Promise.all([D.devices(), D.ports()])
  devices.value = d; ports.value = p
})
const locations = computed(() => [...new Set(devices.value.map((d) => d.location).filter(Boolean))].sort())

async function load() {
  try {
    const d = await rackApi.get(route.params.id)
    d.racks ||= []; d.items ||= []
    room.value = d
    document.title = `${d.name} · ${t('Baies')} · LibreNMS XUI`
  } catch (e) { error.value = e.message }
}
onMounted(load)

// --------------------------------------------------------------- sélection
const selItem = computed(() => (selected.value?.type === 'item' ? room.value.items.find((i) => i.id === selected.value.id) : null))
const selRack = computed(() => (selected.value?.type === 'rack' ? room.value.racks.find((r) => r.id === selected.value.id) : null))
const rackIndex = computed(() => room.value.racks.findIndex((r) => r.id === selected.value?.id))
const selDev = computed(() => (selItem.value?.device_id ? devById.value[selItem.value.device_id] : null))
const rackName = (id) => room.value.racks.find((r) => r.id === id)?.name || t('Baie')
const itemName = (it) => it.label || (it.device_id && devById.value[it.device_id] ? devName(devById.value[it.device_id]) : KIND_LABEL[it.kind])
const placed = computed(() => new Set(room.value.items.filter((i) => i.device_id).map((i) => +i.device_id)))

const q = ref('')
const devList = computed(() => {
  const s = q.value.trim().toLowerCase()
  return devices.value.filter((d) => !s || `${devName(d)} ${d.hostname} ${d.hardware || ''} ${d.os || ''}`.toLowerCase().includes(s))
    .sort((a, b) => placed.value.has(+a.device_id) - placed.value.has(+b.device_id) || devName(a).localeCompare(devName(b)))
    .slice(0, 300)
})

// --------------------------------------------------------------- enregistrement
const saveState = ref('saved'); let timer = null
function changed(delay = 600) {
  if (!room.value?.can_edit) return
  saveState.value = 'saving'; clearTimeout(timer); timer = setTimeout(flush, delay)
}
async function flush() {
  clearTimeout(timer); timer = null
  try {
    await rackApi.update(room.value.id, { racks: room.value.racks, items: room.value.items })
    saveState.value = 'saved'
  } catch (e) { saveState.value = 'error'; toastError(e) }
}
async function stopEdit() { editing.value = false; selected.value = null; if (timer) await flush() }

// --------------------------------------------------------------- ajout / déplacement
function startNew(p, e) {
  dragPayload.value = { kind: p.kind, h: p.h, ports: p.ports || 0, device_id: p.device_id || null }
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', p.kind)
}
function clearDrag() { dragPayload.value = null }
function newItem(p, rack, u) {
  return { id: uid(), rack, u, h: p.h || 1, kind: p.kind, device_id: p.device_id || null, label: '', ports: p.ports || 0, image: null, display: 'face' }
}
function onDrop({ rack, u, payload }) {
  if (payload.move) {
    const it = room.value.items.find((i) => i.id === payload.move)
    if (!it) return
    it.rack = rack; it.u = u
    selected.value = { type: 'item', id: it.id }
  } else {
    if (payload.device_id && placed.value.has(+payload.device_id)) { toast(t('Déjà placé dans cette salle'), 'error'); return }
    const it = newItem(payload, rack, u)
    room.value.items.push(it)
    selected.value = { type: 'item', id: it.id }
  }
  changed(200)
}
// clic dans la barre latérale : premier emplacement libre (baie sélectionnée, sinon la première qui a la place)
function addAuto(p) {
  const pref = selRack.value || (selItem.value && room.value.racks.find((r) => r.id === selItem.value.rack))
  const racks = pref ? [pref, ...room.value.racks.filter((r) => r !== pref)] : room.value.racks
  for (const r of racks) {
    const u = firstFree(room.value.items, r, p.h || 1)
    if (u) { onDrop({ rack: r.id, u, payload: p }); return }
  }
  toast(room.value.racks.length ? t('Plus de place libre dans les baies') : t('Ajoutez d\'abord une baie'), 'error')
}
function setHeight(h) {
  const it = selItem.value; const r = room.value.racks.find((x) => x.id === it.rack)
  if (fits(room.value.items, r, it.u, h, it.id)) { it.h = h; changed(); return }
  // sinon on tente de garder le haut de l'élément en place
  const top = it.u + it.h - 1
  if (fits(room.value.items, r, top - h + 1, h, it.id)) { it.u = top - h + 1; it.h = h; changed(); return }
  toast(t('Pas assez de place pour cette hauteur'), 'error')
}
function removeItem(it) {
  room.value.items = room.value.items.filter((i) => i !== it)
  selected.value = null; changed(200)
}

// --------------------------------------------------------------- baies
function addRack() {
  const last = room.value.racks.at(-1)
  const r = { id: uid(), name: t('Baie {n}', { n: String.fromCharCode(65 + room.value.racks.length % 26) }), units: last?.units || 42 }
  room.value.racks.push(r)
  selected.value = { type: 'rack', id: r.id }
  changed(200)
}
function setUnits(v, e) {
  const r = selRack.value
  const min = Math.max(1, topUsed(room.value.items, r.id))
  if (!(v >= 1 && v <= 60)) { e.target.value = r.units; return }
  if (v < min) { toast(t('Des éléments occupent la baie jusqu\'au U {n}', { n: min }), 'error'); e.target.value = r.units; return }
  r.units = v; changed()
}
function moveRack(d) {
  const i = rackIndex.value; const list = room.value.racks
  ;[list[i], list[i + d]] = [list[i + d], list[i]]
  changed()
}
function removeRack(r) {
  const n = room.value.items.filter((i) => i.rack === r.id).length
  if (n && !confirmAction(t('Supprimer la baie « {r} » et ses {n} élément(s) ?', { r: r.name, n }))) return
  room.value.items = room.value.items.filter((i) => i.rack !== r.id)
  room.value.racks = room.value.racks.filter((x) => x !== r)
  selected.value = null; changed(200)
}

// --------------------------------------------------------------- images (bibliothèque partagée avec les schémas)
const images = ref([]); const imgBusy = ref(false)
async function loadImages() { try { images.value = await diagApi.images() } catch { images.value = [] } }
watch(editing, (v) => { if (v) loadImages() })
function setImage(name) {
  selItem.value.image = name
  selItem.value.display = name ? 'image' : 'face'
  changed()
}
async function uploadImage(e) {
  const f = e.target.files?.[0]; e.target.value = ''
  if (!f) return
  imgBusy.value = true
  try { const r = await diagApi.uploadImage(f); await loadImages(); if (selItem.value) setImage(r.name) } catch (err) { toastError(err) } finally { imgBusy.value = false }
}

// --------------------------------------------------------------- consultation
function openItem(it) {
  const d = it.device_id && devById.value[it.device_id]
  if (d) router.push(`/device/${encodeURIComponent(d.hostname)}`)
}

// --------------------------------------------------------------- paramètres
const settingsOpen = ref(false)
const sform = reactive({ name: '', location: '', access: 'private' })
function openSettings() { Object.assign(sform, { name: room.value.name, location: room.value.location || '', access: room.value.access }); settingsOpen.value = true }
async function saveSettings() {
  try {
    const body = { name: sform.name.trim(), location: sform.location.trim() }
    if (room.value.mine) body.access = sform.access
    const d = await rackApi.update(room.value.id, body)
    Object.assign(room.value, { name: d.name, location: d.location, access: d.access })
    settingsOpen.value = false
    toast(t('Paramètres enregistrés'), 'success')
  } catch (e) { toastError(e) }
}
async function removeRoom() {
  if (!confirmAction(t('Supprimer définitivement la salle « {n} » et toutes ses baies ?', { n: room.value.name }))) return
  try { clearTimeout(timer); timer = null; await rackApi.remove(room.value.id); toast(t('Salle supprimée'), 'success'); router.push('/racks') } catch (e) { toastError(e) }
}

// --------------------------------------------------------------- clavier, sortie de page
function onKey(e) {
  if (!editing.value || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
  if ((e.key === 'Delete' || e.key === 'Backspace') && selItem.value) { e.preventDefault(); removeItem(selItem.value) }
  else if (e.key === 'Escape') selected.value = null
}
function onLeave(e) { if (timer) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', onLeave) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave)
  if (timer) flush()
})
</script>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.layout.editing { grid-template-columns: 300px minmax(0, 1fr); align-items: start; }
.side { display: flex; flex-direction: column; gap: 14px; padding: 14px; position: sticky; top: 76px; max-height: calc(100vh - 100px); overflow-y: auto; }
.side .seg button { flex: 1; justify-content: center; }
.hint { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.insp { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.insp:first-child { border-top: 0; padding-top: 0; }
.insp-title { display: flex; align-items: center; gap: 8px; font-weight: 600; min-width: 0; }
.passives { display: flex; flex-direction: column; gap: 2px; }
.devlist { display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow-y: auto; }
.dev { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: grab; font-size: 13px; }
.dev:hover { background: var(--panel-2); }
.dev.present { opacity: .45; cursor: default; }
.pico { width: 22px; height: 9px; flex: none; border-radius: 2px; background: #334155; border: 1px solid #475569; }
.pico.patch { background: repeating-linear-gradient(90deg, #0b1018 0 3px, #475569 3px 4px); }
.pico.pdu { background: repeating-linear-gradient(90deg, #111 0 4px, #64748b 4px 6px); }
.pico.cablemgmt { background: repeating-linear-gradient(90deg, #0f141c 0 2px, #334155 2px 4px); }
.pico.shelf { background: transparent; border-width: 0 0 3px; border-radius: 0; }
.pico.custom { background: color-mix(in srgb, var(--accent) 40%, #1e293b); }
.rack-card { padding: 10px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.zoomctl { gap: 2px; padding: 2px 4px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-2); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 0 6px; font-size: 11.5px; }
.legend i { display: inline-block; width: 12px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.legend i.off { background: #0b1018; border: 1px solid #334155; }
.legend i.adm { background: repeating-linear-gradient(135deg, #1e293b 0 3px, #0b1018 3px 6px); border: 1px solid #334155; }
.gallery { display: flex; flex-wrap: wrap; gap: 6px; }
.gimg { width: 52px; height: 52px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); display: grid; place-items: center; padding: 3px; cursor: pointer; color: var(--muted); font: inherit; }
.gimg img { max-width: 100%; max-height: 100%; object-fit: contain; }
.gimg.on { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.gimg:hover { border-color: var(--accent); }
@media (max-width: 900px) { .layout.editing { grid-template-columns: 1fr; } .side { position: static; max-height: none; } }
</style>
