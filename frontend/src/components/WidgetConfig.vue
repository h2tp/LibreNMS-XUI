<template>
  <Modal :title="`${isNew ? t('Ajouter') : t('Configurer')} · ${def.label}`" :icon="def.icon" @close="$emit('close')">
    <div class="form-grid">
      <label class="field full">
        <span>{{ t('Titre') }}</span>
        <input v-model="cfg.title" class="input" :placeholder="autoTitle || def.label" maxlength="80" />
      </label>

      <template v-for="f in def.fields" :key="f.key">
        <label v-if="f.type === 'bool'" class="check full"><input v-model="cfg[f.key]" type="checkbox" /> {{ f.label }}</label>

        <div v-else-if="f.type === 'multi'" class="field full">
          <span>{{ f.label }}</span>
          <div class="row wrap" style="gap:8px 16px">
            <label v-for="o in f.options" :key="o.v" class="check"><input v-model="cfg[f.key]" type="checkbox" :value="o.v" /> {{ o.l }}</label>
          </div>
        </div>

        <div v-else-if="f.type === 'devices'" class="field full">
          <span>{{ f.label }}</span>
          <div v-if="cfg[f.key].length" class="dsel">
            <div v-for="(x, i) in cfg[f.key]" :key="x.h" class="dsel-row">
              <span class="ellipsis dsel-host" :title="x.h">{{ devLabel(x.h) }}</span>
              <input v-model="x.n" class="input" :placeholder="t('Nom affiché (facultatif)')" maxlength="60" />
              <button class="btn icon sm" :disabled="i === 0" :title="t('Monter')" @click="move(f.key, i, -1)"><ChevronUp :size="14" /></button>
              <button class="btn icon sm" :disabled="i === cfg[f.key].length - 1" :title="t('Descendre')" @click="move(f.key, i, 1)"><ChevronDown :size="14" /></button>
              <button class="btn icon sm" :title="t('Retirer')" @click="cfg[f.key].splice(i, 1)"><X :size="14" /></button>
            </div>
          </div>
          <input v-model="pickFilter" class="input" :placeholder="t('Filtrer les équipements…')" />
          <select class="input" size="6" @change="(e) => { addPick(f.key, e.target.value); e.target.value = '' }">
            <option v-for="d in pickOptions(f)" :key="d.device_id" :value="d.hostname">{{ devName(d) }}{{ devName(d) !== d.hostname ? ` (${d.hostname})` : '' }}</option>
          </select>
          <small v-if="f.help" class="faint">{{ f.help }}</small>
        </div>

        <div v-else-if="f.type === 'statesensors'" class="field full">
          <span>{{ f.label }}<template v-if="cfg[f.key].length"> ({{ cfg[f.key].length }})</template></span>
          <div class="row" style="gap:6px">
            <input v-model="sensFilter" class="input grow" :placeholder="t('Filtrer les capteurs…')" />
            <button v-if="cfg[f.key].length" class="btn sm" @click="cfg[f.key] = []">{{ t('Tout décocher') }}</button>
          </div>
          <div class="ssel">
            <label v-for="o in stateOptions(f)" :key="o.d" class="check" :title="o.d">
              <input v-model="cfg[f.key]" type="checkbox" :value="o.d" /> <span class="ellipsis">{{ o.d }}</span><span class="faint small">×{{ o.n }}</span>
            </label>
            <div v-if="!stateOptions(f).length" class="small faint">{{ t('Aucun capteur d\'état') }}</div>
          </div>
          <small v-if="f.help" class="faint">{{ f.help }}</small>
        </div>

        <label v-else class="field" :class="{ full: ['textarea', 'device', 'rrd', 'port', 'graph'].includes(f.type) }">
          <span>{{ f.label }}<b v-if="f.required" style="color:var(--red)"> *</b></span>

          <textarea v-if="f.type === 'textarea'" v-model="cfg[f.key]" class="input" rows="9" maxlength="8000" style="resize:vertical;font-family:var(--mono);font-size:12.5px"></textarea>
          <input v-else-if="f.type === 'number'" v-model.number="cfg[f.key]" type="number" class="input" :min="f.min" :max="f.max" />
          <select v-else-if="f.type === 'select'" v-model="cfg[f.key]" class="input">
            <option v-for="o in f.options" :key="o.v" :value="o.v">{{ o.l }}</option>
          </select>
          <select v-else-if="f.type === 'range'" v-model="cfg[f.key]" class="input">
            <option v-for="r in RANGES" :key="r.v" :value="r.v">{{ r.l }}</option>
          </select>
          <select v-else-if="f.type === 'group'" v-model="cfg[f.key]" class="input">
            <option value="">{{ t('Tous les équipements') }}</option>
            <option v-for="g in groups" :key="g.id || g.name" :value="g.name">{{ g.name }}</option>
          </select>

          <select v-else-if="f.type === 'diagram'" v-model="cfg[f.key]" class="input">
            <option value="" disabled>{{ t('— choisir un schéma —') }}</option>
            <option v-for="d in diagrams" :key="d.id" :value="d.id">{{ d.name }}{{ d.mine ? '' : ` (${d.owner})` }}</option>
          </select>
          <select v-else-if="f.type === 'rack'" v-model="cfg[f.key]" class="input">
            <option value="" disabled>{{ t('— choisir une baie —') }}</option>
            <optgroup v-for="r in rooms" :key="r.id" :label="`${r.name}${r.mine ? '' : ` (${r.owner})`}`">
              <option :value="r.id">{{ t('{n} — toutes les baies', { n: r.name }) }}</option>
              <option v-for="k in r.racks" :key="k.id" :value="`${r.id}:${k.id}`">{{ k.name || t('Baie') }} ({{ k.units }}U)</option>
            </optgroup>
          </select>
          <template v-else-if="f.type === 'device'">
            <input v-model="devFilter" class="input" :placeholder="t('Filtrer les équipements…')" style="margin-bottom:6px" />
            <select v-model="cfg[f.key]" class="input" :size="Math.min(7, Math.max(3, devOptions.length + (f.required ? 0 : 1)))">
              <option v-if="!f.required" value="">{{ t('— Tous les équipements —') }}</option>
              <option v-for="d in devOptions" :key="d.device_id" :value="d.hostname">{{ devName(d) }}{{ devName(d) !== d.hostname ? ` (${d.hostname})` : '' }}</option>
            </select>
          </template>

          <template v-else-if="f.type === 'rrd'">
            <div v-if="!cfg[f.depends]" class="small faint">{{ t('Choisissez d\'abord un équipement.') }}</div>
            <template v-else>
              <input v-model="rrdFilter" class="input" :placeholder="t('Filtrer les métriques…')" style="margin-bottom:6px" />
              <select v-model="cfg[f.key]" class="input" size="8">
                <optgroup v-for="g in rrdGroups" :key="g.id" :label="g.label">
                  <option v-for="o in g.items" :key="o.name" :value="o.name">{{ o.title }}</option>
                </optgroup>
              </select>
              <div v-if="lists.loading" class="small faint">{{ t('Chargement…') }}</div>
            </template>
          </template>

          <template v-else-if="f.type === 'port'">
            <div v-if="!cfg[f.depends]" class="small faint">{{ t('Choisissez d\'abord un équipement.') }}</div>
            <select v-else v-model="cfg[f.key]" class="input" size="8" @change="setPortName">
              <option v-for="p in lists.ports" :key="p.port_id" :value="+p.port_id">{{ p.ifOperStatus === 'up' ? '●' : '○' }} {{ p.ifName }}{{ p.ifAlias && p.ifAlias !== p.ifName ? ` — ${p.ifAlias}` : '' }}</option>
            </select>
          </template>

          <template v-else-if="f.type === 'graph'">
            <div v-if="!cfg[f.depends]" class="small faint">{{ t('Choisissez d\'abord un équipement.') }}</div>
            <select v-else v-model="cfg[f.key]" class="input" size="8">
              <option v-for="g in lists.graphs" :key="g.name" :value="g.name">{{ g.desc || g.name }}</option>
            </select>
          </template>

          <input v-else v-model="cfg[f.key]" class="input" />
          <small v-if="f.help" class="faint">{{ f.help }}</small>
        </label>
      </template>
    </div>
    <template #foot>
      <button class="btn" @click="$emit('close')">{{ t('Annuler') }}</button>
      <button class="btn primary" :disabled="missing" @click="save"><Check /> {{ isNew ? t('Ajouter') : t('Enregistrer') }}</button>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { Check, ChevronUp, ChevronDown, X } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { WIDGETS, missingConfig } from '../dashboard/widgets'
import { D } from '../dashboard/data'
import { api, pick, safeList, rrd, diagApi, rackApi } from '../api'
import { describe, CATEGORIES, SENSOR_LABELS } from '../rrdmeta'
import { RANGES, devName } from '../utils'
import { t } from '../i18n'

const props = defineProps({ type: String, config: Object, isNew: Boolean })
const emit = defineEmits(['save', 'close'])
const def = WIDGETS[props.type]
const cfg = reactive(JSON.parse(JSON.stringify(props.config || {})))
for (const f of def.fields) if (['multi', 'devices', 'statesensors'].includes(f.type) && !Array.isArray(cfg[f.key])) cfg[f.key] = []

const devices = ref([])
const diagrams = ref([])
const rooms = ref([])
const groups = ref([])
const devFilter = ref('')
const rrdFilter = ref('')
const lists = reactive({ files: [], ports: [], graphs: [], loading: false })

const devOptions = computed(() => {
  const q = devFilter.value.trim().toLowerCase()
  const all = [...devices.value].sort((a, b) => devName(a).localeCompare(devName(b)))
  return q ? all.filter((d) => `${devName(d)} ${d.hostname} ${d.ip || ''}`.toLowerCase().includes(q) || d.hostname === cfg.device) : all
})
// champ « devices » : sélection explicite, ordonnée, avec un nom d'affichage par équipement ([{ h, n }])
const pickFilter = ref('')
function pickOptions(f) {
  const q = pickFilter.value.trim().toLowerCase()
  const chosen = new Set(cfg[f.key].map((x) => x.h))
  const type = f.typeKey ? cfg[f.typeKey] : ''
  return [...devices.value].filter((d) => !chosen.has(d.hostname) && (!type || d.type === type)
    && (!q || `${devName(d)} ${d.hostname} ${d.ip || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => devName(a).localeCompare(devName(b)))
}
function addPick(key, h) { if (h && !cfg[key].some((x) => x.h === h)) cfg[key].push({ h, n: '' }) }
function move(key, i, d) { const l = cfg[key]; [l[i], l[i + d]] = [l[i + d], l[i]] }
// champ « statesensors » : capteurs d'état cochés, par description (commune à plusieurs équipements)
const stateSensors = ref([])
const sensFilter = ref('')
function stateOptions(f) {
  const picked = new Set((cfg.devices || []).map((x) => x.h))
  const ids = new Set(devices.value.filter((d) => picked.size ? picked.has(d.hostname) : !cfg.devtype || d.type === cfg.devtype).map((d) => +d.device_id))
  const count = new Map(cfg[f.key].map((d) => [d, 0]))  // garde les capteurs déjà cochés même s'ils ne sont plus proposés
  for (const s of stateSensors.value) if (ids.has(+s.device_id)) count.set(s.sensor_descr, (count.get(s.sensor_descr) || 0) + 1)
  const q = sensFilter.value.trim().toLowerCase()
  return [...count].map(([d, n]) => ({ d, n }))
    .filter((o) => !q || o.d.toLowerCase().includes(q) || cfg[f.key].includes(o.d))
    .sort((a, b) => a.d.localeCompare(b.d, undefined, { numeric: true }))
}
function devLabel(h) { const d = devices.value.find((x) => x.hostname === h); return d ? devName(d) : h }
const rrdGroups = computed(() => {
  const q = rrdFilter.value.trim().toLowerCase()
  const items = lists.files.map((name) => ({ name, ...describe(name) }))
    .filter((f) => !q || `${f.title} ${f.name}`.toLowerCase().includes(q) || f.name === cfg.file)
  return CATEGORIES.map(([id, label]) => ({ id, label, items: items.filter((f) => f.cat === id).sort((a, b) => a.title.localeCompare(b.title)) })).filter((g) => g.items.length)
})
const missing = computed(() => missingConfig(props.type, cfg) || (props.type === 'iframe' && !/^https?:\/\/[^\s/]+/i.test(cfg.url || '')))
const autoTitle = computed(() => {
  if (props.type === 'rrd' && cfg.file) return describe(cfg.file).title
  if (props.type === 'sensors' && cfg.cls && cfg.cls !== 'temperature') return SENSOR_LABELS[cfg.cls] || cfg.cls
  if (props.type === 'iframe' && cfg.url) { try { return new URL(cfg.url).host } catch { return '' } }
  if (props.type === 'diagram' && cfg.diagram) return diagrams.value.find((d) => d.id === cfg.diagram)?.name || ''
  if (props.type === 'rack' && cfg.rack) {
    const [rid, kid] = cfg.rack.split(':'); const r = rooms.value.find((x) => x.id === rid)
    return r ? (kid ? r.racks.find((k) => k.id === kid)?.name || r.name : r.name) : ''
  }
  if (props.type === 'port' && cfg.portName) return t('Trafic {p}', { p: cfg.portName })
  if (props.type === 'port-counter' && cfg.portName) return cfg.portName
  if (props.type === 'graph' && cfg.graph) return lists.graphs.find((g) => g.name === cfg.graph)?.desc
  return ''
})

const needs = (t) => def.fields.some((f) => f.type === t)
async function loadDeps(host, first) {
  if (!first) { if (needs('rrd')) cfg.file = ''; if (needs('port')) { cfg.port = ''; cfg.portName = '' } if (needs('graph')) cfg.graph = '' }
  lists.files = []; lists.ports = []; lists.graphs = []
  if (!host) return
  lists.loading = true
  try {
    if (needs('rrd')) lists.files = (await rrd.list(host).catch(() => ({ files: [] }))).files.map((f) => f.name)
    if (needs('port')) lists.ports = pick(await api.get(`devices/${encodeURIComponent(host)}/ports`, { columns: 'port_id,ifName,ifAlias,ifOperStatus' }).catch(() => ({})), 'ports')
      .sort((a, b) => String(a.ifName).localeCompare(String(b.ifName), undefined, { numeric: true }))
    if (needs('graph')) lists.graphs = await safeList(`devices/${encodeURIComponent(host)}/graphs`, null, 'graphs')
  } finally { lists.loading = false }
}
function setPortName() { cfg.portName = lists.ports.find((p) => +p.port_id === +cfg.port)?.ifName || '' }

onMounted(async () => {
  if (needs('device') || needs('devices') || needs('statesensors')) devices.value = await D.devices().catch(() => [])
  if (needs('statesensors')) stateSensors.value = (await D.sensors().catch(() => [])).filter((s) => s.sensor_class === 'state' && !+s.sensor_deleted && s.sensor_descr)
  if (needs('group')) groups.value = await D.groups().catch(() => [])
  if (needs('diagram')) diagrams.value = (await diagApi.list().catch(() => ({ items: [] }))).items
  if (needs('rack')) {
    const list = (await rackApi.list().catch(() => ({ items: [] }))).items
    rooms.value = await Promise.all(list.map((r) => rackApi.get(r.id).catch(() => ({ ...r, racks: [] }))))
  }
  if (cfg.device) loadDeps(cfg.device, true)
})
watch(() => cfg.device, (h) => loadDeps(h, false))

function save() {
  if (missing.value) return
  const out = { ...cfg }
  for (const f of def.fields) if (f.type === 'devices') out[f.key] = cfg[f.key].map((x) => ({ h: x.h, n: String(x.n || '').trim() }))
  if (!out.title?.trim()) delete out.title
  if (autoTitle.value) out.autoTitle = autoTitle.value
  emit('save', out)
}
</script>

<style scoped>
.dsel { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
.dsel-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto auto auto; gap: 6px; align-items: center; }
.ssel { display: flex; flex-direction: column; gap: 4px; max-height: 190px; overflow: auto; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; }
.ssel .check { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
.dsel-host { font-size: 13px; font-weight: 600; }
@media (max-width: 560px) { .dsel-row { grid-template-columns: minmax(0, 1fr) auto auto auto; } .dsel-row .input { grid-column: 1 / -1; grid-row: 2; } }
</style>
