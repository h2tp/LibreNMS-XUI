<template>
  <div>
    <div class="page-head">
      <div style="min-width:0">
        <h1 class="row" style="gap:10px">
          <span class="grad-text ellipsis">{{ dash?.name || t('Tableau de bord') }}</span>
          <button v-if="dash && !editing" class="btn ghost sm icon" :title="isDefault ? t('Tableau par défaut') : t('Définir comme tableau par défaut')" @click="makeDefault">
            <Star :size="17" :fill="isDefault ? 'var(--yellow)' : 'none'" :color="isDefault ? 'var(--yellow)' : 'currentColor'" />
          </button>
        </h1>
        <div class="sub">
          {{ system?.local_ver ? `LibreNMS ${system.local_ver}` : t('LibreNMS') }}
          <template v-if="dash">
            · <span :title="ACCESS[dash.access].desc"><component :is="ACCESS[dash.access].icon" :size="13" style="vertical-align:-2px" /> {{ ACCESS[dash.access].l }}</span>
            <template v-if="!dash.mine"> · {{ t('par {u}', { u: dash.owner }) }}</template>
          </template>
          · {{ t('mis à jour {t}', { t: timeAgo(clock.last) }) }}
        </div>
      </div>

      <div class="right">
        <template v-if="!editing">
          <select v-if="list.length > 1" class="input" :value="dash?.id" style="max-width:240px" @change="(e) => open(e.target.value)">
            <optgroup v-if="mineList.length" :label="t('Mes tableaux de bord')">
              <option v-for="d in mineList" :key="d.id" :value="d.id">{{ d.id === defaultId ? '★ ' : '' }}{{ d.name }}</option>
            </optgroup>
            <optgroup v-if="sharedList.length" :label="t('Partagés avec moi')">
              <option v-for="d in sharedList" :key="d.id" :value="d.id">{{ d.id === defaultId ? '★ ' : '' }}{{ d.name }} — {{ d.owner }}</option>
            </optgroup>
          </select>
          <button class="btn" :title="t('Nouveau tableau de bord')" @click="openCreate()"><Plus /> {{ t('Nouveau') }}</button>
          <button v-if="dash" class="btn ghost icon" :title="t('Dupliquer ce tableau de bord')" @click="openCreate('copy')"><Copy /></button>
          <button v-if="dash?.can_edit && !mobile" class="btn primary" @click="startEdit"><Pencil /> {{ t('Personnaliser') }}</button>
        </template>
        <template v-else>
          <span class="small muted row nowrap">
            <Loader2 v-if="saveState === 'saving'" class="spin" :size="14" />
            <CircleAlert v-else-if="saveState === 'error'" :size="14" color="var(--red)" />
            <CircleCheck v-else :size="14" color="var(--green)" />
            {{ { saving: t('Enregistrement…'), error: t('Échec de l\'enregistrement'), saved: t('Enregistré') }[saveState] }}
          </span>
          <button class="btn" @click="settingsOpen = true"><Settings /> {{ t('Paramètres') }}</button>
          <button class="btn" @click="galleryOpen = true"><Plus /> {{ t('Ajouter un widget') }}</button>
          <button class="btn primary" @click="stopEdit"><Check /> {{ t('Terminer') }}</button>
        </template>
      </div>
    </div>

    <div v-if="error" class="err mb">{{ error }}</div>
    <div v-if="editing" class="edit-hint mb small"><Move :size="15" /> {{ t('Faites glisser un widget par sa barre de titre, redimensionnez-le par son coin inférieur droit. Les modifications sont enregistrées automatiquement.') }}</div>

    <div v-if="loading && !dash" class="grid g3"><div v-for="i in 6" :key="i" class="skeleton" style="height:220px"></div></div>

    <div v-else-if="dash && !dash.widgets.length" class="card empty big-empty">
      <LayoutDashboard />
      <div>{{ t('Ce tableau de bord est vide.') }}</div>
      <div v-if="dash.can_edit" class="row mt" style="justify-content:center">
        <button class="btn primary" @click="startEdit(); galleryOpen = true"><Plus /> {{ t('Ajouter un widget') }}</button>
        <button class="btn" @click="loadStarter"><Sparkles /> {{ t('Partir du modèle par défaut') }}</button>
      </div>
    </div>

    <div v-else-if="dash && mobile" class="col" style="gap:16px">
      <!-- widgets sans cadre (compteurs) : hauteur selon leur contenu, les tuiles passant sur plusieurs lignes -->
      <div v-for="w in sorted" :key="w.i" :style="WIDGETS[w.type]?.frameless ? {} : { height: `${Math.min(w.h, 14) * ROW + (Math.min(w.h, 14) - 1) * GAP}px` }">
        <WidgetFrame :widget="w" :can-edit="dash.can_edit" @configure="configure(w)" />
      </div>
    </div>

    <GridLayout v-else-if="dash" v-model:layout="dash.widgets" :col-num="12" :row-height="ROW" :margin="[GAP, GAP]"
      :is-draggable="editing" :is-resizable="editing" vertical-compact use-css-transforms class="dgrid" :class="{ editing }"
      @layout-updated="onLayout">
      <GridItem v-for="w in dash.widgets" :key="w.i" :i="w.i" :x="w.x" :y="w.y" :w="w.w" :h="w.h"
        :min-w="2" :min-h="WIDGETS[w.type]?.minH || 3" drag-allow-from=".w-drag" drag-ignore-from=".w-nodrag">
        <WidgetFrame :widget="w" :editing="editing" :can-edit="dash.can_edit"
          @configure="configure(w)" @duplicate="duplicate(w)" @remove="removeWidget(w)" />
      </GridItem>
    </GridLayout>

    <!-- Galerie de widgets -->
    <Modal v-if="galleryOpen" :title="t('Ajouter un widget')" :icon="Plus" wide @close="galleryOpen = false">
      <div class="gallery">
        <button v-for="(def, type) in WIDGETS" :key="type" class="gitem" :disabled="!available(type)" @click="pick(type)">
          <div class="gico"><component :is="def.icon" :size="20" /></div>
          <div style="min-width:0">
            <b>{{ def.label }}</b>
            <div class="small muted">{{ available(type) ? def.desc : t('Nécessite l\'accès aux fichiers RRD.') }}</div>
          </div>
        </button>
      </div>
    </Modal>

    <WidgetConfig v-if="cfgEdit" :type="cfgEdit.type" :config="cfgEdit.config" :is-new="cfgEdit.isNew" @close="cfgEdit = null" @save="saveConfig" />

    <!-- Paramètres du tableau -->
    <Modal v-if="settingsOpen && dash" :title="t('Paramètres du tableau de bord')" :icon="Settings" @close="settingsOpen = false">
      <div class="col" style="gap:16px">
        <label class="field"><span>{{ t('Nom') }}</span><input v-model="form.name" class="input" maxlength="80" @keyup.enter="saveSettings" /></label>
        <div v-if="dash.mine" class="field">
          <span>{{ t('Partage') }}</span>
          <label v-for="(a, k) in ACCESS" :key="k" class="check access">
            <input v-model="form.access" type="radio" :value="k" />
            <component :is="a.icon" :size="15" /><span><b>{{ a.l }}</b> <span class="muted small">— {{ a.desc }}</span></span>
          </label>
        </div>
        <div v-else class="small muted">{{ t('Tableau de {u} : seul son propriétaire peut changer le partage ou le supprimer.', { u: dash.owner }) }}</div>
        <div class="hr"></div>
        <div class="row wrap">
          <button class="btn sm" @click="exportJson"><Download /> {{ t('Exporter (JSON)') }}</button>
          <button v-if="dash.mine" class="btn sm danger" @click="removeDash"><Trash2 /> {{ t('Supprimer ce tableau') }}</button>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="settingsOpen = false">{{ t('Annuler') }}</button>
        <button class="btn primary" :disabled="!form.name.trim()" @click="saveSettings"><Check /> {{ t('Enregistrer') }}</button>
      </template>
    </Modal>

    <!-- Nouveau tableau -->
    <Modal v-if="createOpen" :title="t('Nouveau tableau de bord')" :icon="Plus" @close="createOpen = false">
      <div class="col" style="gap:16px">
        <label class="field"><span>{{ t('Nom') }}</span><input v-model="form.name" class="input" maxlength="80" :placeholder="t('Ex. Cœur de réseau, Salle serveurs…')" @keyup.enter="create" /></label>
        <div class="field">
          <span>{{ t('Point de départ') }}</span>
          <label class="check"><input v-model="form.from" type="radio" value="empty" /> {{ t('Tableau vide') }}</label>
          <label class="check"><input v-model="form.from" type="radio" value="starter" /> {{ t('Modèle par défaut (vue d\'ensemble)') }}</label>
          <label v-if="dash" class="check"><input v-model="form.from" type="radio" value="copy" /> Copie de « {{ dash.name }} »</label>
          <label class="check"><input v-model="form.from" type="radio" value="import" /> {{ t('Importer un fichier JSON') }}</label>
          <input v-if="form.from === 'import'" type="file" accept="application/json,.json" class="input" @change="readImport" />
        </div>
        <div class="field">
          <span>{{ t('Partage') }}</span>
          <select v-model="form.access" class="input">
            <option v-for="(a, k) in ACCESS" :key="k" :value="k">{{ a.l }} — {{ a.desc }}</option>
          </select>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="createOpen = false">{{ t('Annuler') }}</button>
        <button class="btn primary" :disabled="!form.name.trim() || (form.from === 'import' && !form.imported)" @click="create"><Check /> {{ t('Créer') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GridLayout, GridItem } from 'grid-layout-plus'
import {
  Plus, Pencil, Check, Copy, Settings, Star, Trash2, Download, Move, Loader2, CircleCheck, CircleAlert,
  LayoutDashboard, Sparkles, Lock, Eye, Users,
} from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import WidgetFrame from '../components/WidgetFrame.vue'
import WidgetConfig from '../components/WidgetConfig.vue'
import { dashApi } from '../api'
import { D } from '../dashboard/data'
import { WIDGETS, available, defaultConfig, missingConfig, starterWidgets, newId } from '../dashboard/widgets'
import { clock } from '../refresh'
import { timeAgo, toast, toastError, confirmAction } from '../utils'
import { t } from '../i18n'

const ROW = 30
const GAP = 16
const ACCESS = {
  private: { l: t('Privé'), desc: t('visible par vous seul'), icon: Lock },
  read: { l: t('Partagé en lecture'), desc: t('visible par tous, modifiable par vous'), icon: Eye },
  edit: { l: t('Partagé en écriture'), desc: t('visible et modifiable par tous'), icon: Users },
}

const route = useRoute()
const router = useRouter()
const list = ref([])
const defaultId = ref(null)
const dash = ref(null)
const system = ref(null)
const loading = ref(false)
const error = ref(null)
const editing = ref(false)
const saveState = ref('saved')
const galleryOpen = ref(false)
const settingsOpen = ref(false)
const createOpen = ref(false)
const cfgEdit = ref(null)
const form = reactive({ name: '', access: 'private', from: 'empty', imported: null })
const mobile = ref(window.innerWidth < 760)

const mineList = computed(() => list.value.filter((d) => d.mine))
const sharedList = computed(() => list.value.filter((d) => !d.mine))
const isDefault = computed(() => dash.value && dash.value.id === defaultId.value)
const sorted = computed(() => [...(dash.value?.widgets || [])].sort((a, b) => a.y - b.y || a.x - b.x))

// ---------------------------------------------------------------- chargement
async function refreshList() {
  const r = await dashApi.list()
  list.value = r.items; defaultId.value = r.default
  return r
}

async function open(id, replace = false) {
  if (!id) return
  // Le changement de route déclenche le chargement (watch ci-dessous, ou nouvelle instance).
  if (id !== route.params.id) return replace ? router.replace(`/dashboard/${id}`) : router.push(`/dashboard/${id}`)
  await load(id)
}

async function load(id) {
  loading.value = true; error.value = null
  try {
    const d = await dashApi.get(id)
    d.widgets = d.widgets.filter((w) => w && w.type)
    dash.value = d
  } catch (e) {
    error.value = e.message
    if (e.status === 404 && defaultId.value && id !== defaultId.value) router.replace('/')
  } finally { loading.value = false }
}

async function init() {
  loading.value = true
  try {
    let r = await refreshList()
    if (!r.items.length) {
      await dashApi.create({ name: 'Vue d\'ensemble', widgets: starterWidgets() })
      r = await refreshList()
    }
    await load(route.params.id || r.default)
  } catch (e) { error.value = e.message } finally { loading.value = false }
  D.system().then((s) => (system.value = s)).catch(() => {})
}

watch(() => route.params.id, (id, old) => {
  if (id === old || (dash.value && (id || defaultId.value) === dash.value.id)) return
  stopEdit(); load(id || defaultId.value)
})

// ---------------------------------------------------------------- enregistrement
let timer = null
let pending = null
function cleanWidgets() {
  return dash.value.widgets.map(({ i, type, x, y, w, h, config }) => ({ i, type, x, y, w, h, config }))
}
function scheduleSave(delay = 700) {
  if (!dash.value?.can_edit) return
  saveState.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(flush, delay)
}
async function flush() {
  clearTimeout(timer); timer = null
  if (!dash.value) return
  const id = dash.value.id
  const body = { widgets: cleanWidgets() }
  pending = dashApi.update(id, body)
  try {
    await pending
    saveState.value = 'saved'
  } catch (e) { saveState.value = 'error'; toastError(e) } finally { pending = null }
}
function onLayout() { if (editing.value) scheduleSave() }

function startEdit() { if (dash.value?.can_edit) { editing.value = true; saveState.value = 'saved' } }
async function stopEdit() {
  if (!editing.value) return
  editing.value = false
  if (timer) await flush()
  refreshList().catch(() => {})
}

// ---------------------------------------------------------------- widgets
function bottom() { return Math.max(0, ...(dash.value.widgets.map((w) => w.y + w.h))) }

function pick(type) {
  galleryOpen.value = false
  const config = defaultConfig(type)
  if (WIDGETS[type].fields.some((f) => f.required) || ['notes'].includes(type)) cfgEdit.value = { type, config, isNew: true }
  else addWidget(type, config)
}
function addWidget(type, config) {
  const def = WIDGETS[type]
  dash.value.widgets.push({ i: newId(), type, x: 0, y: bottom(), w: def.w, h: def.h, config })
  scheduleSave(200)
  setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 150)
}
function configure(w) { cfgEdit.value = { type: w.type, config: w.config || {}, widget: w } }
function saveConfig(config) {
  const c = cfgEdit.value
  cfgEdit.value = null
  if (c.isNew) return addWidget(c.type, config)
  c.widget.config = config
  scheduleSave(200)
}
function duplicate(w) {
  dash.value.widgets.push({ i: newId(), type: w.type, x: w.x, y: w.y + w.h, w: w.w, h: w.h, config: JSON.parse(JSON.stringify(w.config || {})) })
  scheduleSave(200)
}
function removeWidget(w) {
  dash.value.widgets = dash.value.widgets.filter((x) => x.i !== w.i)
  scheduleSave(200)
}
function loadStarter() {
  dash.value.widgets = starterWidgets()
  scheduleSave(100)
}

// ---------------------------------------------------------------- tableaux
watch(settingsOpen, (v) => { if (v) Object.assign(form, { name: dash.value.name, access: dash.value.access }) })

async function saveSettings() {
  if (!form.name.trim()) return
  try {
    const body = { name: form.name.trim() }
    if (dash.value.mine) body.access = form.access
    const d = await dashApi.update(dash.value.id, body)
    Object.assign(dash.value, { name: d.name, access: d.access })
    settingsOpen.value = false
    await refreshList()
    toast(t('Paramètres enregistrés'), 'success')
  } catch (e) { toastError(e) }
}

async function removeDash() {
  if (!confirmAction(t('Supprimer définitivement le tableau de bord « {n} » ?', { n: dash.value.name }))) return
  try {
    await dashApi.remove(dash.value.id)
    settingsOpen.value = false; editing.value = false; clearTimeout(timer); timer = null
    const r = await refreshList()
    toast(t('Tableau de bord supprimé'), 'success')
    if (!r.items.length) { dash.value = null; init(); return }
    dash.value = null
    open(r.default, true)
  } catch (e) { toastError(e) }
}

async function makeDefault() {
  try { await dashApi.setDefault(dash.value.id); defaultId.value = dash.value.id; toast(t('Tableau de bord par défaut'), 'success') } catch (e) { toastError(e) }
}

function openCreate(from = 'empty') {
  Object.assign(form, { name: from === 'copy' && dash.value ? `${dash.value.name} (copie)` : '', access: 'private', from, imported: null })
  createOpen.value = true
}

function readImport(e) {
  const f = e.target.files?.[0]
  form.imported = null
  if (!f) return
  f.text().then((t) => {
    const j = JSON.parse(t)
    if (!Array.isArray(j.widgets)) throw new Error('Fichier invalide : liste « widgets » absente')
    form.imported = j.widgets
    if (!form.name && j.name) form.name = j.name
  }).catch((err) => toastError(err))
}

async function create() {
  if (!form.name.trim()) return
  let widgets = []
  if (form.from === 'starter') widgets = starterWidgets()
  else if (form.from === 'copy' && dash.value) widgets = cleanWidgets().map((w) => ({ ...w, i: newId() }))
  else if (form.from === 'import') widgets = (form.imported || []).filter((w) => WIDGETS[w.type]).map((w) => ({ ...w, i: newId() }))
  try {
    await stopEdit()
    const d = await dashApi.create({ name: form.name.trim(), access: form.access, widgets })
    createOpen.value = false
    await refreshList()
    await open(d.id)
    if (!widgets.length) startEdit()
    toast(t('Tableau de bord créé'), 'success')
  } catch (e) { toastError(e) }
}

function exportJson() {
  const data = { name: dash.value.name, widgets: cleanWidgets(), exported: new Date().toISOString(), app: 'librenms-xui' }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  a.download = `tableau-${dash.value.name.replace(/[^\w-]+/g, '_')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------------------------------------------------------------- cycle de vie
function onResize() { mobile.value = window.innerWidth < 760; if (mobile.value) stopEdit() }
function onLeave(e) { if (timer || pending) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => { init(); window.addEventListener('resize', onResize); window.addEventListener('beforeunload', onLeave) })
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize); window.removeEventListener('beforeunload', onLeave)
  if (timer) flush()
})
</script>

<style scoped>
.dgrid { margin: -16px; min-height: 200px; }
.dgrid.editing { background-image: radial-gradient(color-mix(in srgb, var(--accent) 22%, transparent) 1px, transparent 1px); background-size: 24px 24px; border-radius: 16px; }
.dgrid :deep(.vgl-item--placeholder) { background: var(--accent); opacity: .18; border-radius: 16px; }
.dgrid :deep(.vgl-item__resizer) { z-index: 5; }
/* pendant l'édition, les iframes ne doivent pas capturer la souris (glisser / redimensionner) */
.dgrid.editing :deep(iframe) { pointer-events: none; }
.dgrid :deep(.vgl-item--resizing), .dgrid :deep(.vgl-item--dragging) { z-index: 10; opacity: .92; }
.edit-hint { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); color: var(--text); }
.big-empty { padding: 60px 20px; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.gitem { display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit; cursor: pointer; transition: border-color .15s, transform .15s; }
.gitem:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-1px); }
.gitem:disabled { opacity: .45; cursor: not-allowed; }
.gico { flex: none; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.access { padding: 6px 0; align-items: flex-start; }
</style>
