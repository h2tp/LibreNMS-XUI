<template>
  <Modal :title="`${isNew ? 'Ajouter' : 'Configurer'} · ${def.label}`" :icon="def.icon" @close="$emit('close')">
    <div class="form-grid">
      <label class="field full">
        <span>Titre</span>
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
            <option value="">Tous les équipements</option>
            <option v-for="g in groups" :key="g.id || g.name" :value="g.name">{{ g.name }}</option>
          </select>

          <select v-else-if="f.type === 'diagram'" v-model="cfg[f.key]" class="input">
            <option value="" disabled>— choisir un schéma —</option>
            <option v-for="d in diagrams" :key="d.id" :value="d.id">{{ d.name }}{{ d.mine ? '' : ` (${d.owner})` }}</option>
          </select>
          <template v-else-if="f.type === 'device'">
            <input v-model="devFilter" class="input" placeholder="Filtrer les équipements…" style="margin-bottom:6px" />
            <select v-model="cfg[f.key]" class="input" :size="Math.min(7, Math.max(3, devOptions.length + (f.required ? 0 : 1)))">
              <option v-if="!f.required" value="">— Tous les équipements —</option>
              <option v-for="d in devOptions" :key="d.device_id" :value="d.hostname">{{ devName(d) }}{{ devName(d) !== d.hostname ? ` (${d.hostname})` : '' }}</option>
            </select>
          </template>

          <template v-else-if="f.type === 'rrd'">
            <div v-if="!cfg[f.depends]" class="small faint">Choisissez d'abord un équipement.</div>
            <template v-else>
              <input v-model="rrdFilter" class="input" placeholder="Filtrer les métriques…" style="margin-bottom:6px" />
              <select v-model="cfg[f.key]" class="input" size="8">
                <optgroup v-for="g in rrdGroups" :key="g.id" :label="g.label">
                  <option v-for="o in g.items" :key="o.name" :value="o.name">{{ o.title }}</option>
                </optgroup>
              </select>
              <div v-if="lists.loading" class="small faint">Chargement…</div>
            </template>
          </template>

          <template v-else-if="f.type === 'port'">
            <div v-if="!cfg[f.depends]" class="small faint">Choisissez d'abord un équipement.</div>
            <select v-else v-model="cfg[f.key]" class="input" size="8" @change="setPortName">
              <option v-for="p in lists.ports" :key="p.port_id" :value="+p.port_id">{{ p.ifOperStatus === 'up' ? '●' : '○' }} {{ p.ifName }}{{ p.ifAlias && p.ifAlias !== p.ifName ? ` — ${p.ifAlias}` : '' }}</option>
            </select>
          </template>

          <template v-else-if="f.type === 'graph'">
            <div v-if="!cfg[f.depends]" class="small faint">Choisissez d'abord un équipement.</div>
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
      <button class="btn" @click="$emit('close')">Annuler</button>
      <button class="btn primary" :disabled="missing" @click="save"><Check /> {{ isNew ? 'Ajouter' : 'Enregistrer' }}</button>
    </template>
  </Modal>
</template>

<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { Check } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { WIDGETS, missingConfig } from '../dashboard/widgets'
import { D } from '../dashboard/data'
import { api, pick, safeList, rrd, diagApi } from '../api'
import { describe, CATEGORIES, SENSOR_LABELS } from '../rrdmeta'
import { RANGES, devName } from '../utils'

const props = defineProps({ type: String, config: Object, isNew: Boolean })
const emit = defineEmits(['save', 'close'])
const def = WIDGETS[props.type]
const cfg = reactive(JSON.parse(JSON.stringify(props.config || {})))
for (const f of def.fields) if (f.type === 'multi' && !Array.isArray(cfg[f.key])) cfg[f.key] = []

const devices = ref([])
const diagrams = ref([])
const groups = ref([])
const devFilter = ref('')
const rrdFilter = ref('')
const lists = reactive({ files: [], ports: [], graphs: [], loading: false })

const devOptions = computed(() => {
  const q = devFilter.value.trim().toLowerCase()
  const all = [...devices.value].sort((a, b) => devName(a).localeCompare(devName(b)))
  return q ? all.filter((d) => `${devName(d)} ${d.hostname} ${d.ip || ''}`.toLowerCase().includes(q) || d.hostname === cfg.device) : all
})
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
  if (props.type === 'port' && cfg.portName) return `Trafic ${cfg.portName}`
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
  if (needs('device')) devices.value = await D.devices().catch(() => [])
  if (needs('group')) groups.value = await D.groups().catch(() => [])
  if (needs('diagram')) diagrams.value = (await diagApi.list().catch(() => ({ items: [] }))).items
  if (cfg.device) loadDeps(cfg.device, true)
})
watch(() => cfg.device, (h) => loadDeps(h, false))

function save() {
  if (missing.value) return
  const out = { ...cfg }
  if (!out.title?.trim()) delete out.title
  if (autoTitle.value) out.autoTitle = autoTitle.value
  emit('save', out)
}
</script>
