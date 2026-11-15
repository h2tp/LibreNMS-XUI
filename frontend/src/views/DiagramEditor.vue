<template>
  <div class="deditor">
    <div class="page-head">
      <div style="min-width:0">
        <h1 class="row" style="gap:10px"><router-link to="/diagrams" class="muted" title="Tous les schémas"><ChevronLeft :size="22" /></router-link><span class="grad-text ellipsis">{{ diag?.name || 'Schéma' }}</span></h1>
        <div class="sub">
          <template v-if="diag">{{ diag.nodes.length }} élément(s) · {{ diag.links.length }} lien(s) · {{ ACCESS[diag.access] }}<template v-if="!diag.mine"> · par {{ diag.owner }}</template></template>
          · mis à jour {{ timeAgo(clock.last) }}
        </div>
      </div>
      <div class="right">
        <template v-if="editing">
          <span class="small muted row nowrap">
            <Loader2 v-if="saveState === 'saving'" class="spin" :size="14" /><CircleAlert v-else-if="saveState === 'error'" :size="14" color="var(--red)" /><CircleCheck v-else :size="14" color="var(--green)" />
            {{ { saving: 'Enregistrement…', error: 'Échec de l\'enregistrement', saved: 'Enregistré' }[saveState] }}
          </span>
          <button class="btn ghost icon" title="Annuler (Ctrl+Z)" :disabled="!undoStack.length" @click="undo"><Undo2 /></button>
          <button class="btn ghost icon" title="Rétablir (Ctrl+Y)" :disabled="!redoStack.length" @click="redo"><Redo2 /></button>
          <button class="btn" @click="openSettings"><Settings /> Paramètres</button>
          <button class="btn primary" @click="stopEdit"><Check /> Terminer</button>
        </template>
        <template v-else>
          <button v-if="diag" class="btn" @click="openSettings"><Settings /> Paramètres</button>
          <button v-if="diag?.can_edit" class="btn primary" @click="editing = true"><Pencil /> Modifier</button>
        </template>
      </div>
    </div>
    <div v-if="error" class="err mb">{{ error }}</div>

    <div v-if="diag" class="layout" :class="{ editing }">
      <aside v-if="editing" class="card side">
        <div class="seg" style="width:100%">
          <button :class="{ on: tool === 'select' }" @click="tool = 'select'"><MousePointer2 :size="14" /> Déplacer</button>
          <button :class="{ on: tool === 'link' }" @click="tool = 'link'"><Spline :size="14" /> Relier</button>
        </div>
        <div v-if="tool === 'link'" class="hint small">Cliquez sur un premier élément puis sur un second pour les relier ; choisissez ensuite les ports.</div>

        <!-- inspecteur -->
        <div v-if="selNode" class="insp">
          <div class="insp-title"><component :is="selNode.kind === 'device' ? Server : selNode.kind === 'cloud' ? Cloud : Type" :size="15" /> {{ selNodeName }}</div>
          <label class="field"><span>{{ selNode.kind === 'device' ? 'Libellé (vide : nom de l\'équipement)' : 'Texte' }}</span><input v-model="selNode.label" class="input" maxlength="60" @focus="push()" @input="changed()" /></label>
          <label class="field"><span>Taille</span><input v-model.number="selNode.size" type="range" min="0.6" max="2" step="0.1" @pointerdown="push()" @input="changed()" /></label>
          <template v-if="selNode.kind === 'device'">
            <div class="field"><span>Apparence</span>
              <div class="seg" style="width:100%">
                <button v-for="b in [['card', 'Carte'], ['icon', 'Carte + image'], ['image', 'Image seule']]" :key="b[0]"
                  :class="{ on: (selNode.image ? selNode.display || 'card' : 'card') === b[0] }" :disabled="b[0] !== 'card' && !selNode.image"
                  :title="b[0] !== 'card' && !selNode.image ? 'Choisissez d\'abord une image ci-dessous' : ''" @click="setDisplay(b[0])">{{ b[1] }}</button>
              </div>
            </div>
            <div class="field"><span>Image</span>
              <div class="gallery">
                <button class="gimg none" :class="{ on: !selNode.image }" title="Aucune image" @click="setImage(null)">—</button>
                <div v-for="im in images" :key="im.name" class="gwrap">
                  <button class="gimg" :class="{ on: selNode.image === im.name }" @click="setImage(im.name)"><img :src="diagApi.imgUrl(im.name)" alt="" loading="lazy" /></button>
                  <button class="gdel" title="Supprimer de la bibliothèque" @click.stop="deleteImage(im.name)">×</button>
                </div>
                <label class="gimg add" title="Importer une image (PNG, JPEG, WebP, GIF, 2 Mo max.)">
                  <Loader2 v-if="imgBusy" :size="15" class="spin" /><ImageUp v-else :size="15" />
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="uploadImage" />
                </label>
              </div>
              <span class="small faint">Bibliothèque partagée entre tous les schémas. Une image PNG à fond transparent rend le mieux.</span>
            </div>
          </template>
          <div class="row wrap" style="gap:6px">
            <router-link v-if="selDev" :to="`/device/${encodeURIComponent(selDev.hostname)}`" class="btn sm"><ExternalLink :size="13" /> Fiche</router-link>
            <button class="btn sm danger" @click="removeSelected"><Trash2 :size="13" /> Retirer</button>
          </div>
        </div>
        <div v-else-if="selLink" class="insp">
          <div class="insp-title"><Spline :size="15" /> Lien</div>
          <label class="field"><span>Port côté {{ nodeName(selLink.a) }}</span>
            <select v-model="selLink.port_a" class="input" @focus="push()" @change="changed()">
              <option :value="null">— non précisé —</option>
              <option v-for="p in portsOf(selLink.a)" :key="p.port_id" :value="+p.port_id">{{ portOpt(p) }}</option>
            </select></label>
          <label class="field"><span>Port côté {{ nodeName(selLink.b) }}</span>
            <select v-model="selLink.port_b" class="input" @focus="push()" @change="changed()">
              <option :value="null">— non précisé —</option>
              <option v-for="p in portsOf(selLink.b)" :key="p.port_id" :value="+p.port_id">{{ portOpt(p) }}</option>
            </select></label>
          <label class="field"><span>Étiquette</span><input v-model="selLink.label" class="input" maxlength="40" placeholder="Ex. fibre, VPN, uplink…" @focus="push()" @input="changed()" /></label>
          <div class="small faint">Faites glisser le lien pour le courber.</div>
          <div class="row wrap" style="gap:6px">
            <button v-if="selLink.bend" class="btn sm" @click="push(); selLink.bend = 0; changed()"><Minus :size="13" /> Redresser</button>
            <button class="btn sm danger" @click="removeSelected"><Trash2 :size="13" /> Supprimer</button>
          </div>
        </div>

        <div class="insp">
          <div class="insp-title"><Plus :size="15" /> Ajouter</div>
          <div class="row wrap" style="gap:6px">
            <button class="btn sm" @click="addFree('cloud')"><Cloud :size="13" /> Nuage</button>
            <button class="btn sm" @click="addFree('text')"><Type :size="13" /> Texte</button>
            <button class="btn sm" :title="`${missingLldp.length} lien(s) LLDP entre éléments du schéma`" :disabled="!missingLldp.length" @click="addLldp"><Network :size="13" /> Liens LLDP ({{ missingLldp.length }})</button>
          </div>
          <input v-model="q" class="input" placeholder="Rechercher un équipement…" />
          <div class="devlist">
            <div v-for="d in devList" :key="d.device_id" class="dev" :class="{ present: present.has(+d.device_id) }" draggable="true"
              :title="present.has(+d.device_id) ? 'Déjà dans le schéma — glisser pour l\'ajouter encore' : 'Glisser sur le schéma ou cliquer pour ajouter'"
              @dragstart="(e) => e.dataTransfer.setData('text/x-device', d.device_id)" @click="addDevice(d.device_id)">
              <span class="dot" :class="devStatus(d)"></span><span class="ellipsis grow">{{ devName(d) }}</span><span class="faint small">{{ d.type || d.os }}</span>
            </div>
          </div>
        </div>
      </aside>

      <div class="card canvas-card">
        <DiagramCanvas ref="canvas" v-model:selected="selected" :diagram="diag" :live="live" :editing="editing" :tool="tool"
          :bg-url="diag.bg ? diagApi.bgUrl(diag.id, diag.bg) : ''"
          @move="onMove" @moved="changed()" @connect="connect" @drop-device="(e) => addDevice(e.device_id, e.x, e.y)"
          @edit-node="(n) => (selected = { type: 'node', id: n.id })" @edit-link="(l) => (selected = { type: 'link', id: l.id })" />
        <div class="legend small muted">
          <span v-for="(s, i) in legend" :key="i"><i :style="{ background: s.color }"></i>{{ s.label }}</span>
          <span><i :style="{ background: scale.down }"></i>coupé</span>
          <span><i class="dash"></i>ports non renseignés</span>
          <span v-if="!editing" class="faint">Clic sur un équipement : sa fiche · molette : zoom · glisser : déplacer la vue</span>
        </div>
      </div>
    </div>
    <div v-else-if="!error" class="skeleton" style="height:70vh"></div>

    <Modal v-if="settingsOpen && diag" title="Paramètres du schéma" :icon="Settings" @close="settingsOpen = false">
      <div class="col" style="gap:16px">
        <label class="field"><span>Nom</span><input v-model="sform.name" class="input" maxlength="80" :disabled="!diag.can_edit" /></label>
        <div v-if="diag.mine" class="field"><span>Partage</span>
          <select v-model="sform.access" class="input">
            <option value="private">Privé — visible par vous seul</option>
            <option value="read">Partagé en lecture — visible par tous</option>
            <option value="edit">Partagé en écriture — modifiable par tous</option>
          </select></div>
        <div class="field"><span>Fond</span>
          <div class="seg">
            <button v-for="b in [['none', 'Uni'], ['grid', 'Grille'], ['image', 'Image']]" :key="b[0]" :class="{ on: sform.background === b[0] }" :disabled="!diag.can_edit" @click="sform.background = b[0]">{{ b[1] }}</button>
          </div>
        </div>
        <template v-if="sform.background === 'image' && diag.can_edit">
          <div class="row wrap" style="gap:8px">
            <label class="btn sm"><ImageUp :size="14" /> {{ diag.bg ? 'Remplacer l\'image' : 'Choisir une image' }}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden @change="uploadBg" /></label>
            <button v-if="diag.bg" class="btn sm danger" @click="removeBg"><Trash2 :size="13" /> Retirer</button>
            <span class="small faint">PNG, JPEG, WebP ou GIF, 8 Mo max. (plan, photo de baie…)</span>
          </div>
          <label v-if="diag.bg" class="field"><span>Opacité de l'image : {{ Math.round(sform.bgOpacity * 100) }} %</span><input v-model.number="sform.bgOpacity" type="range" min="0.1" max="1" step="0.05" /></label>
        </template>
        <label class="check"><input v-model="sform.showRates" type="checkbox" :disabled="!diag.can_edit" /> Afficher les débits sur les liens</label>
        <label class="check"><input v-model="sform.showPorts" type="checkbox" :disabled="!diag.can_edit" /> Afficher les noms de ports</label>
        <div class="hr"></div>
        <div class="field"><span>Couleur des liens selon</span>
          <div class="seg">
            <button v-for="b in [['util', 'Charge (%)'], ['rate', 'Débit']]" :key="b[0]" :class="{ on: sform.colorMode === b[0] }" :disabled="!diag.can_edit" @click="sform.colorMode = b[0]">{{ b[1] }}</button>
          </div>
        </div>
        <div class="steps">
          <div v-for="(st, i) in curSteps" :key="i" class="step row">
            <input v-model="st.color" type="color" class="swatch" :disabled="!diag.can_edit" />
            <span class="small muted">à partir de</span>
            <input v-model.number="st.min" type="number" class="input num" min="0" :step="sform.colorMode === 'rate' ? 'any' : 1" :disabled="!diag.can_edit || i === 0" />
            <span class="small muted">{{ sform.colorMode === 'rate' ? 'Mbit/s' : '%' }}</span>
            <span v-if="sform.colorMode === 'rate'" class="small faint">{{ fmtBits(st.min * 1e6) }}</span>
            <button v-if="diag.can_edit && i > 0" class="btn ghost sm icon" title="Supprimer ce palier" @click="curSteps.splice(i, 1)"><Minus :size="13" /></button>
          </div>
          <div class="step row">
            <input v-model="sform.downColor" type="color" class="swatch" :disabled="!diag.can_edit" />
            <span class="small muted">lien coupé</span>
          </div>
          <div v-if="diag.can_edit" class="row wrap" style="gap:8px">
            <button class="btn sm" :disabled="curSteps.length >= 10" @click="addStep"><Plus :size="13" /> Ajouter un palier</button>
            <button class="btn sm ghost" @click="resetSteps">Couleurs par défaut</button>
          </div>
          <span class="small faint">{{ sform.colorMode === 'rate' ? 'Débit le plus élevé des deux sens (1 Gbit/s = 1000 Mbit/s).' : 'Charge la plus élevée des deux extrémités, rapportée à la vitesse du port.' }}</span>
        </div>
        <div class="hr"></div>
        <div class="row wrap">
          <button class="btn sm" @click="exportSvg"><Download :size="13" /> Exporter en image (SVG)</button>
          <button v-if="diag.mine" class="btn sm danger" @click="removeDiagram"><Trash2 :size="13" /> Supprimer ce schéma</button>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="settingsOpen = false">Fermer</button>
        <button v-if="diag.can_edit" class="btn primary" :disabled="!sform.name.trim()" @click="saveSettings"><Check /> Enregistrer</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronLeft, Pencil, Check, Settings, Loader2, CircleCheck, CircleAlert, Undo2, Redo2, MousePointer2, Spline, Plus, Cloud, Type,
  Network, Server, Trash2, ExternalLink, Minus, ImageUp, Download,
} from 'lucide-vue-next'
import DiagramCanvas from '../components/DiagramCanvas.vue'
import Modal from '../components/Modal.vue'
import { diagApi } from '../api'
import { useDiagramLive, lldpLinks, lldpLinksBetween, uid, colorScale, DEFAULT_UTIL_STEPS, DEFAULT_RATE_STEPS, DEFAULT_DOWN_COLOR } from '../diagram/core'
import { clock } from '../refresh'
import { devName, devStatus, fmtBits, fmtSpeed, timeAgo, toast, toastError, confirmAction } from '../utils'

const ACCESS = { private: 'Privé', read: 'Partagé (lecture)', edit: 'Partagé (écriture)' }
const route = useRoute(); const router = useRouter()
const live = useDiagramLive()
const diag = ref(null); const error = ref(null)
const editing = ref(false); const tool = ref('select'); const selected = ref(null)

// --------------------------------------------------------------- images d'équipements
const images = ref([])
const imgBusy = ref(false)
async function loadImages() { try { images.value = await diagApi.images() } catch { images.value = [] } }
watch(() => editing.value, (v) => { if (v) loadImages() }, { immediate: true })
function setImage(name) {
  push()
  selNode.value.image = name
  if (!name) selNode.value.display = 'card'
  else if (!selNode.value.display || selNode.value.display === 'card') selNode.value.display = 'image'
  changed()
}
function setDisplay(mode) { push(); selNode.value.display = mode; changed() }
async function uploadImage(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  imgBusy.value = true
  try {
    const r = await diagApi.uploadImage(f)
    await loadImages()
    if (selNode.value) setImage(r.name)
  } catch (err) { toastError(err) } finally { imgBusy.value = false }
}
async function deleteImage(name) {
  if (!confirmAction('Supprimer cette image de la bibliothèque ?')) return
  try { await diagApi.removeImage(name); await loadImages(); toast('Image supprimée', 'success') } catch (err) { toastError(err) }
}

const canvas = ref(null)
const q = ref('')
const lldp = ref([])

async function load() {
  try {
    const d = await diagApi.get(route.params.id)
    d.view = { background: 'grid', showRates: true, showPorts: true, bgOpacity: 0.6, ...(d.view || {}) }
    diag.value = d
    document.title = `${d.name} · Schémas · LibreNMS XUI`
  } catch (e) { error.value = e.message }
  lldp.value = await lldpLinks().catch(() => [])
}
onMounted(load)

// --------------------------------------------------------------- sélection
const selNode = computed(() => selected.value?.type === 'node' ? diag.value.nodes.find((n) => n.id === selected.value.id) : null)
const selLink = computed(() => selected.value?.type === 'link' ? diag.value.links.find((l) => l.id === selected.value.id) : null)
const selDev = computed(() => selNode.value?.kind === 'device' ? live.devById.value[selNode.value.device_id] : null)
const selNodeName = computed(() => (selNode.value ? nodeName(selNode.value.id) : ''))
function nodeName(id) {
  const n = diag.value.nodes.find((x) => x.id === id)
  if (!n) return '?'
  const d = live.devById.value[n.device_id]
  return n.label || (d ? devName(d) : n.kind === 'cloud' ? 'Nuage' : 'Texte')
}
function portsOf(nodeId) {
  const n = diag.value.nodes.find((x) => x.id === nodeId)
  if (!n || n.kind !== 'device') return []
  return live.ports.value.filter((p) => +p.device_id === +n.device_id && !+p.deleted).sort((a, b) => (+a.ifIndex || 0) - (+b.ifIndex || 0))
}
const portOpt = (p) => `${p.ifOperStatus === 'up' ? '●' : '○'} ${p.ifName}${p.ifAlias && p.ifAlias !== p.ifName ? ' — ' + p.ifAlias : ''}${+p.ifSpeed ? ' (' + fmtSpeed(+p.ifSpeed) + ')' : ''}`

// --------------------------------------------------------------- historique
const undoStack = ref([]); const redoStack = ref([])
const snap = () => JSON.stringify({ nodes: diag.value.nodes, links: diag.value.links })
function push() { undoStack.value.push(snap()); if (undoStack.value.length > 60) undoStack.value.shift(); redoStack.value = [] }
function restore(s) { const o = JSON.parse(s); diag.value.nodes = o.nodes; diag.value.links = o.links; selected.value = null; scheduleSave() }
function undo() { if (!undoStack.value.length) return; redoStack.value.push(snap()); restore(undoStack.value.pop()) }
function redo() { if (!redoStack.value.length) return; undoStack.value.push(snap()); restore(redoStack.value.pop()) }

// --------------------------------------------------------------- enregistrement
const saveState = ref('saved'); let timer = null
function changed() { scheduleSave() }
function scheduleSave(delay = 700) {
  if (!diag.value?.can_edit) return
  saveState.value = 'saving'; clearTimeout(timer); timer = setTimeout(flush, delay)
}
async function flush() {
  clearTimeout(timer); timer = null
  try {
    await diagApi.update(diag.value.id, { nodes: diag.value.nodes, links: diag.value.links, view: diag.value.view })
    saveState.value = 'saved'
  } catch (e) { saveState.value = 'error'; toastError(e) }
}
async function stopEdit() { editing.value = false; tool.value = 'select'; selected.value = null; if (timer) await flush() }

// --------------------------------------------------------------- édition
let dragging = false
function onMove(e) {
  if (!dragging) { push(); dragging = true }
  if (e.link) { const l = diag.value.links.find((x) => x.id === e.link); if (l) l.bend = e.bend }
  else { const n = diag.value.nodes.find((x) => x.id === e.id); if (n) { n.x = e.x; n.y = e.y } }
}
function onMovedEnd() { dragging = false }
watch(selected, onMovedEnd)
document.addEventListener('pointerup', onMovedEnd)

const present = computed(() => new Set((diag.value?.nodes || []).filter((n) => n.kind === 'device').map((n) => +n.device_id)))
const devList = computed(() => {
  const s = q.value.trim().toLowerCase()
  return [...live.devices.value].filter((d) => !+d.disabled && (!s || `${devName(d)} ${d.hostname} ${d.ip || ''} ${d.type || ''}`.toLowerCase().includes(s)))
    .sort((a, b) => present.value.has(+a.device_id) - present.value.has(+b.device_id) || devName(a).localeCompare(devName(b)))
})
function addNode(n) {
  push()
  diag.value.nodes.push(n)
  selected.value = { type: 'node', id: n.id }
  scheduleSave(200)
}
// place libre la plus proche du centre de la vue (spirale), pour ne pas masquer un élément existant
function freeSpot() {
  const c = canvas.value.center()
  const busy = (x, y) => diag.value.nodes.some((n) => Math.abs(n.x - x) < 190 && Math.abs(n.y - y) < 80)
  for (let r = 0; r < 40; r++) {
    for (let i = 0; i < Math.max(1, r * 6); i++) {
      const a = (i / Math.max(1, r * 6)) * Math.PI * 2
      const x = Math.round((c.x + Math.cos(a) * r * 60) / 10) * 10; const y = Math.round((c.y + Math.sin(a) * r * 40) / 10) * 10
      if (!busy(x, y)) return { x, y }
    }
  }
  return { x: Math.round(c.x / 10) * 10, y: Math.round(c.y / 10) * 10 }
}
function addDevice(device_id, x, y) {
  const pos = x === undefined ? freeSpot() : { x, y }
  addNode({ id: uid(), kind: 'device', device_id: +device_id, x: pos.x, y: pos.y, label: '', size: 1 })
}
function addFree(kind) {
  const pos = freeSpot()
  addNode({ id: uid(), kind, device_id: null, x: pos.x, y: pos.y, label: kind === 'cloud' ? 'Internet' : 'Texte', size: 1 })
}
function connect({ a, b }) {
  const A = diag.value.nodes.find((n) => n.id === a); const B = diag.value.nodes.find((n) => n.id === b)
  // ports pré-remplis si LLDP connaît ce lien
  const hit = lldp.value.find((l) => +l.local_device_id === +A.device_id && +l.remote_device_id === +B.device_id)
  const rev = lldp.value.find((l) => +l.local_device_id === +B.device_id && +l.remote_device_id === +A.device_id)
  push()
  const link = { id: uid(), a, b, port_a: hit ? +hit.local_port_id : rev ? +rev.remote_port_id : null, port_b: hit ? +hit.remote_port_id : rev ? +rev.local_port_id : null, label: '', bend: 0 }
  diag.value.links.push(link)
  selected.value = { type: 'link', id: link.id }
  tool.value = 'select'
  scheduleSave(200)
  if (!hit && !rev && (A.kind === 'device' || B.kind === 'device')) toast('Lien créé : choisissez les ports dans le panneau pour afficher l\'état et le trafic', 'info')
}
const missingLldp = computed(() => {
  if (!diag.value) return []
  const has = new Set(diag.value.links.map((l) => [l.port_a, l.port_b].sort().join('-')))
  return lldpLinksBetween(lldp.value, diag.value.nodes).filter((l) => !has.has([l.port_a, l.port_b].sort().join('-')))
})
function addLldp() {
  push()
  for (const l of missingLldp.value) diag.value.links.push({ id: uid(), ...l, label: '', bend: 0 })
  toast(`${missingLldp.value.length} lien(s) ajouté(s)`, 'success')
  scheduleSave(200)
}
function removeSelected() {
  if (!selected.value) return
  push()
  if (selected.value.type === 'node') {
    const id = selected.value.id
    diag.value.nodes = diag.value.nodes.filter((n) => n.id !== id)
    diag.value.links = diag.value.links.filter((l) => l.a !== id && l.b !== id)
  } else diag.value.links = diag.value.links.filter((l) => l.id !== selected.value.id)
  selected.value = null
  scheduleSave(200)
}

function onKey(e) {
  if (!editing.value || /input|select|textarea/i.test(e.target.tagName)) return
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected.value) { e.preventDefault(); removeSelected() }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
  else if (e.key === 'Escape') { tool.value = 'select'; selected.value = null }
}
function onLeave(e) { if (timer) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', onLeave) })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave)
  document.removeEventListener('pointerup', onMovedEnd)
  if (timer) flush()
})

// --------------------------------------------------------------- paramètres
const settingsOpen = ref(false)
const sform = reactive({
  name: '', access: 'private', background: 'grid', bgOpacity: 0.6, showRates: true, showPorts: true,
  colorMode: 'util', utilSteps: [], rateSteps: [], downColor: DEFAULT_DOWN_COLOR,
})
const copySteps = (l) => l.map((s) => ({ ...s }))
function openSettings() {
  const v = diag.value.view || {}
  Object.assign(sform, {
    name: diag.value.name, access: diag.value.access, ...v,
    colorMode: colorScale(v).mode, downColor: colorScale(v).down,
    utilSteps: copySteps(colorScale({ ...v, colorMode: 'util' }).steps), rateSteps: copySteps(colorScale({ ...v, colorMode: 'rate' }).steps),
  })
  settingsOpen.value = true
}
const curSteps = computed(() => (sform.colorMode === 'rate' ? sform.rateSteps : sform.utilSteps))
function addStep() {
  const last = curSteps.value.at(-1)
  curSteps.value.push({ min: last ? (sform.colorMode === 'rate' ? last.min * 10 || 1 : Math.min(100, last.min + 10)) : 0, color: '#a855f7' })
}
function resetSteps() {
  const def = copySteps(sform.colorMode === 'rate' ? DEFAULT_RATE_STEPS : DEFAULT_UTIL_STEPS)
  if (sform.colorMode === 'rate') sform.rateSteps = def; else sform.utilSteps = def
  sform.downColor = DEFAULT_DOWN_COLOR
}
// légende sous le schéma, d'après l'échelle enregistrée
const scale = computed(() => colorScale(diag.value?.view))
const legend = computed(() => {
  const { mode, steps } = scale.value
  const f = (v) => (mode === 'rate' ? fmtBits(v * 1e6, 1) : `${v} %`)
  return steps.map((s, i) => ({
    color: s.color,
    label: i === steps.length - 1 ? `≥ ${f(s.min)}` : i === 0 ? `< ${f(steps[1].min)}` : `${f(s.min)} – ${f(steps[i + 1].min)}`,
  }))
})
async function saveSettings() {
  try {
    const clean = (l) => l.map((s, i) => ({ min: i === 0 ? 0 : Math.max(0, +s.min || 0), color: s.color })).sort((a, b) => a.min - b.min)
    const view = {
      ...diag.value.view, background: sform.background, bgOpacity: sform.bgOpacity, showRates: sform.showRates, showPorts: sform.showPorts,
      colorMode: sform.colorMode, utilSteps: clean(sform.utilSteps), rateSteps: clean(sform.rateSteps), downColor: sform.downColor,
    }
    const body = { name: sform.name.trim(), view }
    if (diag.value.mine) body.access = sform.access
    const d = await diagApi.update(diag.value.id, body)
    Object.assign(diag.value, { name: d.name, access: d.access, view })
    settingsOpen.value = false
    toast('Paramètres enregistrés', 'success')
  } catch (e) { toastError(e) }
}
async function uploadBg(e) {
  const f = e.target.files?.[0]
  if (!f) return
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f) })
    const r = await diagApi.setBackground(diag.value.id, f)
    diag.value.bg = r.bg
    diag.value.view = { ...diag.value.view, background: 'image', bgW: img.naturalWidth, bgH: img.naturalHeight }
    sform.background = 'image'
    await diagApi.update(diag.value.id, { view: diag.value.view })
    setTimeout(() => canvas.value?.fit(), 50)
    toast('Image de fond enregistrée', 'success')
  } catch (err) { toastError(err) }
}
async function removeBg() {
  try { await diagApi.removeBackground(diag.value.id); diag.value.bg = null; toast('Image retirée', 'success') } catch (e) { toastError(e) }
}
async function removeDiagram() {
  if (!confirmAction(`Supprimer définitivement le schéma « ${diag.value.name} » ?`)) return
  try { clearTimeout(timer); timer = null; await diagApi.remove(diag.value.id); toast('Schéma supprimé', 'success'); router.push('/diagrams') } catch (e) { toastError(e) }
}
function exportSvg() {
  const el = document.querySelector('.canvas-card svg')
  if (!el) return
  const clone = el.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  // couleurs résolues (les variables CSS ne survivent pas hors de la page)
  const cs = getComputedStyle(document.documentElement)
  let txt = new XMLSerializer().serializeToString(clone)
  txt = txt.replace(/var\((--[\w-]+)\)/g, (m, v) => cs.getPropertyValue(v).trim() || m)
  const style = `<style>${[...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText) } catch { return [] } }).filter((t) => /\.(node|link|plabel|rate|gridline|free|cloud|abadge|atxt|ico)/.test(t)).join('\n')}</style>`
  txt = txt.replace(/(<svg[^>]*>)/, `$1${style.replace(/var\((--[\w-]+)\)/g, (m, v) => cs.getPropertyValue(v).trim() || m)}`)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }))
  a.download = `schema-${diag.value.name.replace(/[^\w-]+/g, '_')}.svg`
  a.click()
}
</script>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; height: calc(100vh - 180px); min-height: 480px; }
.layout.editing { grid-template-columns: 290px minmax(0, 1fr); }
.side { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding: 14px; }
.side .seg button { flex: 1; justify-content: center; }
.hint { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); }
.insp { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.insp:first-of-type { border-top: 0; padding-top: 0; }
.insp-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.devlist { display: flex; flex-direction: column; gap: 2px; max-height: 340px; overflow-y: auto; }
.dev { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: grab; font-size: 13px; }
.dev:hover { background: var(--panel-2); }
.dev.present { opacity: .5; }
.canvas-card { padding: 8px; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 0 6px; font-size: 11.5px; }
.legend i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-right: 5px; vertical-align: 2px; }
.gallery { display: flex; flex-wrap: wrap; gap: 6px; }
.gwrap { position: relative; }
.gimg { width: 52px; height: 52px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); display: grid; place-items: center; padding: 3px; cursor: pointer; color: var(--muted); font: inherit; }
.gimg img { max-width: 100%; max-height: 100%; object-fit: contain; }
.gimg.on { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.gimg:hover { border-color: var(--accent); }
.gdel { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; border: 0; background: #f43f5e; color: #fff; font-size: 12px; line-height: 1; cursor: pointer; display: none; }
.gwrap:hover .gdel { display: block; }
.steps { display: flex; flex-direction: column; gap: 8px; }
.step { gap: 8px; align-items: center; }
.swatch { width: 34px; height: 28px; padding: 2px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); cursor: pointer; }
.input.num { width: 96px; }
.legend i.dash { background: repeating-linear-gradient(90deg, #64748b 0 2px, transparent 2px 5px); }
@media (max-width: 900px) { .layout.editing { grid-template-columns: 1fr; height: auto; } .layout.editing .canvas-card { height: 70vh; } .layout { height: 70vh; } }
</style>
