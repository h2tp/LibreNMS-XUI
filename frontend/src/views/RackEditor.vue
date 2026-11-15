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
        <div class="seg cview" :title="t('Affichage des câbles')">
          <button v-for="b in [['real', t('Couleur')], ['state', t('État')], ['hidden', t('Masqués')]]" :key="b[0]" :class="{ on: cableView === b[0] }" @click="setCableView(b[0])"><Cable v-if="b[0] === 'real'" :size="13" />{{ b[1] }}</button>
        </div>
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
          <button class="btn ghost icon" :title="t('Annuler (Ctrl+Z)')" :disabled="!undoStack.length" @click="undo"><Undo2 /></button>
          <button class="btn ghost icon" :title="t('Rétablir (Ctrl+Y)')" :disabled="!redoStack.length" @click="redo"><Redo2 /></button>
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
        <div class="seg" style="width:100%">
          <button :class="{ on: tool === 'place' }" @click="setTool('place')"><Move :size="14" /> {{ t('Placer') }}</button>
          <button :class="{ on: tool === 'cable' }" @click="setTool('cable')"><Cable :size="14" /> {{ t('Câbler') }}</button>
        </div>
        <div v-if="tool === 'cable'" class="hint small">{{ cableFrom ? t('Cliquez maintenant sur la seconde prise (Échap pour annuler).') : t('Cliquez sur une prise, puis sur une autre pour les relier. Une prise déjà câblée sélectionne son câble.') }}</div>

        <!-- inspecteur : câble sélectionné -->
        <div v-if="selCable" class="insp">
          <div class="insp-title"><Cable :size="15" /> {{ t('Câble') }}</div>
          <div class="ends small">
            <div><span class="faint">A</span> {{ epName(selCable.a) }}</div>
            <div><span class="faint">B</span> {{ epName(selCable.b) }}</div>
          </div>
          <div class="field"><span>{{ t('Couleur') }}</span>
            <div class="row wrap" style="gap:5px">
              <button v-for="c in CABLE_COLORS" :key="c" class="cswatch" :class="{ on: selCable.color === c }" :style="{ background: c }" :title="c" @click="selCable.color = c; rememberColor(c); changed()"></button>
              <input v-model="selCable.color" type="color" class="cpick" @change="rememberColor(selCable.color); changed()" />
            </div>
          </div>
          <div class="row" style="gap:10px">
            <label class="field grow"><span>{{ t('Type') }}</span>
              <select v-model="selCable.type" class="input" @change="onTypeChange"><option v-for="(l, v) in CABLE_TYPES" :key="v" :value="v">{{ l }}</option></select></label>
            <label class="field grow"><span>{{ t('Longueur') }}</span><input v-model="selCable.length" class="input" maxlength="20" placeholder="1 m" @input="typed()" /></label>
          </div>
          <div class="small faint">{{ t('Glissez le câble pour le déplacer, ou ses extrémités pour le rebrancher ; double-clic : forme automatique.') }}</div>
          <label class="field"><span>{{ t('Étiquette') }}</span><input v-model="selCable.label" class="input" maxlength="40" :placeholder="t('Ex. C-042, bureau 3…')" @input="typed()" /></label>
          <div class="row wrap" style="gap:6px">
            <button v-if="selCable.bend" class="btn sm" @click="onStraighten(selCable)">{{ t('Forme automatique') }}</button>
            <button class="btn sm danger" @click="removeCable(selCable)"><Trash2 :size="13" /> {{ t('Supprimer le câble') }}</button>
          </div>
        </div>

        <!-- inspecteur : élément sélectionné -->
        <div v-else-if="selItem" class="insp">
          <div class="insp-title"><component :is="selItem.kind === 'device' ? Server : Box" :size="15" /> {{ itemName(selItem) }}</div>
          <div class="small faint">{{ KIND_LABEL[selItem.kind] }} · {{ t('U {a} à {b}', { a: selItem.u, b: selItem.u + selItem.h - 1 }) }} · {{ rackName(selItem.rack) }}</div>
          <label class="field"><span>{{ selItem.kind === 'device' ? t('Libellé (vide : nom de l\'équipement)') : t('Libellé') }}</span><input v-model="selItem.label" class="input" maxlength="60" @input="typed()" /></label>
          <div class="row" style="gap:10px">
            <label class="field grow"><span>{{ t('Hauteur') }}</span>
              <select :value="selItem.h" class="input" @change="setHeight(+$event.target.value)"><option v-for="h in 12" :key="h" :value="h">{{ h }} U</option></select></label>
            <label v-if="selItem.kind !== 'device' && !['shelf', 'blank', 'cablemgmt'].includes(selItem.kind)" class="field grow"><span>{{ t('Prises / ports') }}</span>
              <input v-model.number="selItem.ports" class="input" type="number" min="0" max="96" @change="selItem.ports = Math.max(0, Math.min(96, selItem.ports || 0)); changed()" /></label>
          </div>
          <label v-if="selItem.kind === 'custom'" class="field"><span>{{ t('Ports réseau virtuels') }}</span>
            <select :value="selItem.vports || 0" class="input" @change="setVports($event.target.value)"><option v-for="n in 9" :key="n" :value="n - 1">{{ n - 1 }}</option></select>
            <span class="small faint">{{ t('Ports réseau pour câbler un élément absent de LibreNMS (pas d\'état en direct).') }}</span></label>
          <label v-if="selItem.kind === 'device'" class="field"><span>{{ t('Ports réseau virtuels') }}</span>
            <select :value="selItem.vports ?? ''" class="input" @change="setVports($event.target.value)">
              <option value="">{{ t('Automatique ({n})', { n: autoV(selItem) }) }}</option><option v-for="n in 9" :key="n" :value="n - 1">{{ n - 1 }}</option>
            </select>
            <span class="small faint">{{ t('Pour câbler un équipement sans port physique (supervisé par ping) : l\'état suit sa joignabilité.') }}</span></label>
          <label v-if="['device', 'custom', 'pdu'].includes(selItem.kind)" class="field"><span>{{ t('Prises d\'alimentation (entrées secteur)') }}</span>
            <select :value="psuOf(selItem)" class="input" @change="setPsu(+$event.target.value)"><option v-for="n in 5" :key="n" :value="n - 1">{{ n - 1 }}</option></select></label>
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
          <label class="field"><span>{{ t('Nom') }}</span><input v-model="selRack.name" class="input" maxlength="40" @input="typed()" /></label>
          <label class="field"><span>{{ t('Hauteur (U)') }}</span>
            <input :value="selRack.units" class="input" type="number" min="1" max="60" @change="setUnits(+$event.target.value, $event)" /></label>
          <div class="row wrap" style="gap:6px">
            <button class="btn sm" :disabled="rackIndex === 0" :title="t('Déplacer à gauche')" @click="moveRack(-1)"><ArrowLeft :size="13" /></button>
            <button class="btn sm" :disabled="rackIndex === room.racks.length - 1" :title="t('Déplacer à droite')" @click="moveRack(1)"><ArrowRight :size="13" /></button>
            <button class="btn sm danger" @click="removeRack(selRack)"><Trash2 :size="13" /> {{ t('Supprimer la baie') }}</button>
          </div>
        </div>
        <div v-else-if="tool === 'place'" class="hint small">{{ t('Glissez un équipement ou un élément passif dans une baie. Cliquez sur un élément ou sur le titre d\'une baie pour le modifier ; glissez un élément pour le déplacer.') }}</div>

        <div v-if="tool === 'place'" class="insp">
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

      <div ref="cardEl" class="card rack-card">
        <RackView :room="room" :dev-by-id="devById" :ports-by-dev="portsByDev" :port-by-id="portById" :editing="editing" :selected="selected" :zoom="zoom"
          :cable-mode="editing && tool === 'cable'" :cable-from="cableFrom" :cable-view="cableView"
          @select="(s) => (selected = s)" @drop="onDrop" @invalid="toast(t('Pas assez de place à cet endroit'), 'error')" @open="openItem"
          @socket="onSocket" @cable="onCableClick" @hover="onHover" @unhover="onUnhover"
          @bend="onBend" @straighten="onStraighten" @replug="onReplug" />
        <LinkHover v-if="hover && hoverInfo" :link="hoverInfo" :x="hover.x" :y="hover.y" :pinned="hover.pinned" @close="hover = null" />
        <div class="legend small muted">
          <span><i style="background:#22d3ee"></i>10 G+</span><span><i style="background:#22c55e"></i>1 G</span><span><i style="background:#facc15"></i>100 M</span><span><i style="background:#fb923c"></i>10 M</span>
          <span><i class="off"></i>{{ t('déconnecté') }}</span><span><i class="adm"></i>{{ t('désactivé') }}</span>
          <span v-if="!editing" class="faint">{{ t('Clic sur un équipement : sa fiche · clic sur un port : sa page') }}</span>
        </div>
        <ScaleLegend v-if="cableView === 'state' && room.cables.length" :view="room.view" :label="t('Câbles :')">
          <span class="faint">{{ t('gris : câble passif') }}</span>
          <button v-if="room.can_edit" class="btn ghost sm lg-edit" @click="openSettings"><Settings :size="12" /> {{ t('Modifier la légende') }}</button>
        </ScaleLegend>
      </div>
    </div>
    <div v-if="room && room.cables.length" class="card mt">
      <div class="card-title"><Cable :size="17" /> {{ t('Câbles') }} <span class="sub">{{ room.cables.length }}</span></div>
      <DataTable :rows="cableRows" :columns="cableCols" row-key="id" :filename="`cables-${room.name}.csv`" :page-size="25"
        :row-click="(r) => { if (editing) { tool = 'cable'; selected = { type: 'cable', id: r.id } } }">
        <template #c-color="{ row }"><span class="cdot" :style="{ background: row.color }"></span></template>
        <template #c-state="{ row }"><span class="badge" :class="row.stateCls">{{ row.state }}</span></template>
      </DataTable>
    </div>
    <div v-else-if="!error && !room" class="skeleton" style="height:70vh"></div>

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
        <div class="hr"></div>
        <ColorScaleEditor :form="sform" :disabled="!room.can_edit" :title="t('Couleur des câbles (affichage « État ») selon')" />
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
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronLeft, Pencil, Check, Settings, Loader2, CircleCheck, CircleAlert, Plus, Server, Box, Rows3, Trash2, ExternalLink,
  ImageUp, ZoomIn, ZoomOut, ArrowLeft, ArrowRight, Cable, Move, Undo2, Redo2,
} from 'lucide-vue-next'
import RackView from '../components/RackView.vue'
import LinkHover from '../components/LinkHover.vue'
import DataTable from '../components/DataTable.vue'
import Modal from '../components/Modal.vue'
import { rackApi, diagApi } from '../api'
import { D } from '../dashboard/data'
import { uid } from '../diagram/core'
import { PASSIVE, KIND_LABEL, CABLE_TYPES, cableHelpers, dragPayload, fits, firstFree, topUsed, physPorts } from '../rack/core'
import { clock, useLoader } from '../refresh'
import { devName, devStatus, timeAgo, toast, toastError, confirmAction, prefs, save, fmtBits, fmtSpeed } from '../utils'
import { scaleForm, scaleFields } from '../diagram/core'
import ColorScaleEditor from '../components/ColorScaleEditor.vue'
import ScaleLegend from '../components/ScaleLegend.vue'
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
const portById = computed(() => Object.fromEntries(ports.value.map((p) => [+p.port_id, p])))
const locations = computed(() => [...new Set(devices.value.map((d) => d.location).filter(Boolean))].sort())

async function load() {
  try {
    const d = await rackApi.get(route.params.id)
    d.racks ||= []; d.items ||= []; d.cables ||= []
    room.value = d
    base = snap(); undoStack.value = []; redoStack.value = []
    // arrivée depuis le widget : baie demandée sélectionnée et amenée à l'écran
    const want = route.query.rack
    if (want && d.racks.some((r) => r.id === want)) {
      selected.value = { type: 'rack', id: want }
      nextTick(() => document.querySelector(`[data-rack="${CSS.escape(want)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
    }
    document.title = `${d.name} · ${t('Baies')} · LibreNMS XUI`
  } catch (e) { error.value = e.message }
}
onMounted(load)

// --------------------------------------------------------------- sélection
const selCable = computed(() => (selected.value?.type === 'cable' ? room.value.cables.find((c) => c.id === selected.value.id) : null))
const selItem = computed(() => (selected.value?.type === 'item' ? room.value.items.find((i) => i.id === selected.value.id) : null))
const selRack = computed(() => (selected.value?.type === 'rack' ? room.value.racks.find((r) => r.id === selected.value.id) : null))
const rackIndex = computed(() => room.value.racks.findIndex((r) => r.id === selected.value?.id))
const selDev = computed(() => (selItem.value?.device_id ? devById.value[selItem.value.device_id] : null))
const rackName = (id) => room.value.racks.find((r) => r.id === id)?.name || t('Baie')
const { itemName, epName, cableInfo } = cableHelpers(room, devById, portById)
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
function changed(delay = 600, coalesce = false) {
  if (!room.value?.can_edit) return
  record(coalesce)
  saveState.value = 'saving'; clearTimeout(timer); timer = setTimeout(flush, delay)
}
const typed = () => changed(600, true)

// --------------------------------------------------------------- historique (annuler / rétablir)
// Chaque modification passe par changed() : l'état précédent (base) est alors empilé.
// Les frappes successives dans un champ texte (< 1,2 s d'écart) ne font qu'une étape.
const undoStack = ref([]); const redoStack = ref([])
let base = null; let lastTyped = 0
const snap = () => JSON.stringify({ racks: room.value.racks, items: room.value.items, cables: room.value.cables })
function record(coalesce) {
  const cur = snap()
  if (base === null || cur === base) { base = cur; return }
  const now = Date.now()
  if (!(coalesce && now - lastTyped < 1200 && undoStack.value.length)) {
    undoStack.value.push(base)
    if (undoStack.value.length > 80) undoStack.value.shift()
  }
  lastTyped = coalesce ? now : 0
  redoStack.value = []
  base = cur
}
function restore(state) {
  const o = JSON.parse(state)
  room.value.racks = o.racks; room.value.items = o.items; room.value.cables = o.cables
  base = state; lastTyped = 0
  // la sélection peut désigner un élément qui n'existe plus
  const sel = selected.value
  if (sel && !(sel.type === 'item' ? o.items : sel.type === 'rack' ? o.racks : o.cables).some((x) => x.id === sel.id)) selected.value = null
  cableFrom.value = null
  saveState.value = 'saving'; clearTimeout(timer); timer = setTimeout(flush, 400)
}
function undo() { if (!undoStack.value.length) return; redoStack.value.push(snap()); restore(undoStack.value.pop()) }
function redo() { if (!redoStack.value.length) return; undoStack.value.push(snap()); restore(redoStack.value.pop()) }
async function flush() {
  clearTimeout(timer); timer = null
  try {
    await rackApi.update(room.value.id, { racks: room.value.racks, items: room.value.items, cables: room.value.cables })
    saveState.value = 'saved'
  } catch (e) { saveState.value = 'error'; toastError(e) }
}
async function stopEdit() { editing.value = false; selected.value = null; tool.value = 'place'; cableFrom.value = null; if (timer) await flush() }

// --------------------------------------------------------------- ajout / déplacement
function startNew(p, e) {
  dragPayload.value = { kind: p.kind, h: p.h, ports: p.ports || 0, device_id: p.device_id || null }
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', p.kind)
}
function clearDrag() { dragPayload.value = null }
function newItem(p, rack, u) {
  return { id: uid(), rack, u, h: p.h || 1, kind: p.kind, device_id: p.device_id || null, label: '', ports: p.ports || 0, psu: p.kind === 'device' ? 1 : 0, image: null, display: 'face' }
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
  room.value.cables = room.value.cables.filter((c) => c.a.item !== it.id && c.b.item !== it.id)
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
  const gone = new Set(room.value.items.filter((i) => i.rack === r.id).map((i) => i.id))
  room.value.cables = room.value.cables.filter((c) => !gone.has(c.a.item) && !gone.has(c.b.item))
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

// --------------------------------------------------------------- câbles
const CABLE_COLORS = ['#3b82f6', '#22c55e', '#facc15', '#f97316', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#e2e8f0', '#94a3b8', '#1f2937']
const tool = ref('place')
const cableFrom = ref(null)
const lastColor = ref('#3b82f6'); const lastType = ref('copper'); const lastPowerColor = ref('#94a3b8')
const autoV = (it) => ((portsByDev.value[it.device_id] || []).length ? 0 : 1)
function setVports(v) {
  const it = selItem.value
  const n = v === '' ? autoV(it) : +v
  room.value.cables = room.value.cables.filter((c) => ![c.a, c.b].some((e) => e.item === it.id && String(e.port).startsWith('v') && +String(e.port).slice(1) > n))
  it.vports = v === '' ? null : +v; changed()
}
const psuOf = (it) => it.psu ?? (it.kind === 'device' ? 1 : 0)
function setPsu(n) {
  const it = selItem.value
  // les câbles branchés sur des entrées supprimées disparaissent
  room.value.cables = room.value.cables.filter((c) => ![c.a, c.b].some((e) => e.item === it.id && e.port < 0 && -e.port > n))
  it.psu = n; changed()
}
// nature d'une extrémité : entrée d'alimentation, prise électrique (PDU…), ou port réseau
function epKind(e) {
  if (e.port < 0) return 'inlet'
  if (String(e.port).startsWith('v')) return 'net'
  const it = room.value.items.find((i) => i.id === e.item)
  return it?.kind === 'pdu' ? 'outlet' : it?.kind === 'device' || it?.kind === 'patch' ? 'net' : 'any'
}
const cableView = ref(prefs.cableView || 'real')
function setCableView(v) { cableView.value = v; prefs.cableView = v; save('cableView', v) }
function setTool(v) { tool.value = v; cableFrom.value = null; if (v === 'cable' && cableView.value === 'hidden') setCableView('real') }
const epKey = (e) => `${e.item}:${e.port}`
function cableAt(e) { const k = epKey(e); return room.value.cables.find((c) => epKey(c.a) === k || epKey(c.b) === k) }
function onSocket(e) {
  const existing = cableAt(e)
  if (!cableFrom.value) {
    if (existing) { selected.value = { type: 'cable', id: existing.id }; return }
    cableFrom.value = e; selected.value = null; return
  }
  if (epKey(cableFrom.value) === epKey(e)) { cableFrom.value = null; return }
  if (existing) { toast(t('Cette prise est déjà câblée'), 'error'); return }
  const kinds = [epKind(cableFrom.value), epKind(e)]
  if (kinds.includes('inlet') && kinds.includes('net')) { toast(t('Une entrée d\'alimentation se relie à une prise électrique (PDU, élément libre), pas à un port réseau'), 'error'); return }
  const power = kinds.includes('inlet') || kinds.includes('outlet')
  const c = { id: uid(), a: cableFrom.value, b: e, color: power ? lastPowerColor.value : lastColor.value, type: power ? 'power' : lastType.value, label: '', length: '' }
  room.value.cables.push(c)
  cableFrom.value = null
  selected.value = { type: 'cable', id: c.id }
  changed(200)
}
function onTypeChange() { if (selCable.value.type !== 'power') lastType.value = selCable.value.type; changed() }
function rememberColor(c) { if (selCable.value?.type === 'power') lastPowerColor.value = c; else lastColor.value = c }
// déplacer un câble : forme (point de passage) ou rebranchement d'une extrémité
function onBend({ id, bend }) {
  const c = room.value.cables.find((x) => x.id === id)
  if (!c) return
  hover.value = null
  c.bend = bend; selected.value = { type: 'cable', id }
  changed(600, true)
}
function onStraighten(c) { if (c.bend) { c.bend = null; changed() } }
function onReplug({ cable, end, ep }) {
  const c = room.value.cables.find((x) => x.id === cable.id)
  const other = end === 'a' ? c.b : c.a
  if (epKey(ep) === epKey(c[end])) return
  if (epKey(ep) === epKey(other)) { toast(t('Les deux extrémités ne peuvent pas être sur la même prise'), 'error'); return }
  if (cableAt(ep)) { toast(t('Cette prise est déjà câblée'), 'error'); return }
  const kinds = [epKind(other), epKind(ep)]
  if (kinds.includes('inlet') && kinds.includes('net')) { toast(t('Une entrée d\'alimentation se relie à une prise électrique (PDU, élément libre), pas à un port réseau'), 'error'); return }
  c[end] = { item: ep.item, port: ep.port }
  c.bend = null // la forme précédente n'a plus de sens avec une nouvelle extrémité
  changed()
}
function removeCable(c) { room.value.cables = room.value.cables.filter((x) => x !== c); selected.value = null; changed(200) }

// infos d'un câble pour la fenêtre de trafic (même présentation que les liens des schémas)
const cardEl = ref(null)
const hover = ref(null) // { id, x, y, pinned }
const hoverInfo = computed(() => { const c = hover.value && room.value.cables.find((x) => x.id === hover.value.id); return c ? cableInfo(c) : null })
function popupAt(c, ev, pinned) {
  const r = cardEl.value.getBoundingClientRect()
  const W = 324; const H = pinned ? 260 : 200; const px = ev.clientX - r.left; const py = ev.clientY - r.top
  hover.value = { id: c.id, x: px + 16 + W > r.width ? Math.max(4, px - 16 - W) : px + 16, y: Math.max(4, Math.min(py + 16, r.height - H - 4)), pinned }
}
function onHover({ cable, event }) { if (!hover.value?.pinned && !(editing.value && tool.value === 'cable')) popupAt(cable, event, false) }
function onUnhover() { if (!hover.value?.pinned) hover.value = null }
function onCableClick({ cable, event }) {
  if (editing.value) { tool.value = 'cable'; selected.value = { type: 'cable', id: cable.id }; hover.value = null; return }
  popupAt(cable, event, true)
}
const cableCols = [
  { key: 'color', label: '', sortable: false, width: '28px' }, { key: 'aName', label: 'A' }, { key: 'bName', label: 'B' },
  { key: 'typeL', label: t('Type') }, { key: 'label', label: t('Étiquette') }, { key: 'length', label: t('Longueur') }, { key: 'state', label: t('État') },
]
const cableRows = computed(() => room.value.cables.map((c) => {
  const i = cableInfo(c)
  return {
    id: c.id, color: c.color, aName: epName(c.a), bName: epName(c.b), typeL: CABLE_TYPES[c.type], label: c.label, length: c.length,
    state: !i.st.known ? t('passif') : i.st.down ? t('coupé') : i.st.virtual ? t('joignable') : `${fmtSpeed(i.st.speed)} · ${Math.round(i.st.util)} %`,
    stateCls: !i.st.known ? '' : i.st.down ? 'critical' : 'ok',
  }
}))

// --------------------------------------------------------------- consultation
function openItem(it) {
  const d = it.device_id && devById.value[it.device_id]
  if (d) router.push(`/device/${encodeURIComponent(d.hostname)}`)
}

// --------------------------------------------------------------- paramètres
const settingsOpen = ref(false)
const sform = reactive({ name: '', location: '', access: 'private', colorMode: 'util', utilSteps: [], rateSteps: [], downColor: '' })
function openSettings() {
  Object.assign(sform, { name: room.value.name, location: room.value.location || '', access: room.value.access, ...scaleForm(room.value.view || {}) })
  settingsOpen.value = true
}
async function saveSettings() {
  try {
    const body = { name: sform.name.trim(), location: sform.location.trim(), view: scaleFields(sform) }
    if (room.value.mine) body.access = sform.access
    const d = await rackApi.update(room.value.id, body)
    Object.assign(room.value, { name: d.name, location: d.location, access: d.access, view: d.view })
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
  if (e.key === 'Escape' && hover.value?.pinned) { hover.value = null; return }
  if (!editing.value || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selCable.value) { e.preventDefault(); removeCable(selCable.value) }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selItem.value) { e.preventDefault(); removeItem(selItem.value) }
  else if (e.key === 'Escape') { if (cableFrom.value) cableFrom.value = null; else selected.value = null }
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
.rack-card { position: relative; padding: 10px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.lg-edit { padding: 2px 8px; font-size: 11px; }
.cview button { padding: 5px 10px; font-size: 12px; }
.ends { display: flex; flex-direction: column; gap: 3px; padding: 8px 10px; border-radius: 8px; background: var(--panel-2); }
.ends .faint { display: inline-block; width: 14px; font-weight: 700; }
.cswatch { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--border); cursor: pointer; padding: 0; }
.cswatch.on { border-color: var(--text); box-shadow: 0 0 0 2px var(--accent); }
.cpick { width: 30px; height: 24px; padding: 1px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel-2); cursor: pointer; }
.cdot { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, .3); vertical-align: -2px; }
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
