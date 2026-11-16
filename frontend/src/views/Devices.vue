<template>
  <div>
    <div class="page-head">
      <div><h1>{{ t('Équipements') }}</h1><div class="sub">{{ t('{a} / {b} équipements', { a: filtered.length, b: devices.length }) }}</div></div>
      <div class="right">
        <div class="seg">
          <button :class="{ on: prefs.devView === 'cards' }" @click="setView('cards')"><LayoutGrid /> {{ t('Cartes') }}</button>
          <button :class="{ on: prefs.devView === 'table' }" @click="setView('table')"><List /> {{ t('Tableau') }}</button>
        </div>
        <button v-if="!session.read_only" class="btn primary" @click="addOpen = true"><Plus /> {{ t('Ajouter') }}</button>
      </div>
    </div>

    <div class="card mb filters">
      <div class="row wrap">
        <div class="row search-in grow"><Search :size="15" class="faint" /><input v-model="q" class="input" :placeholder="t('Nom, IP, OS, matériel, numéro de série…')" /></div>
        <div class="seg">
          <button v-for="s in statuses" :key="s.v" :class="{ on: status === s.v }" @click="status = s.v">
            <span v-if="s.v !== 'all'" class="dot" :class="s.v"></span>{{ s.l }} <span class="faint">{{ statusCount(s.v) }}</span>
          </button>
        </div>
        <select v-for="f in FILTERS" :key="f.k" v-model="sel[f.k]" class="input" :class="{ active: sel[f.k] }" :title="f.l">
          <option value="">{{ f.all }}</option>
          <option v-if="sel[f.k] && !options[f.k].some((o) => o.v === sel[f.k])" :value="sel[f.k]">{{ sel[f.k] }} (0)</option>
          <option v-for="o in options[f.k]" :key="o.v" :value="o.v">{{ o.v }} ({{ o.n }})</option>
        </select>
        <select v-model="group" class="input" :class="{ active: group }"><option value="">{{ t('Tous les groupes') }}</option><option v-for="g in groups" :key="g.id" :value="g.name">{{ g.name }}</option></select>
        <button v-if="anyFilter" class="btn" @click="resetFilters"><X :size="14" /> {{ t('Réinitialiser') }}</button>
      </div>
    </div>

    <div v-if="error" class="err mb">{{ error }}</div>
    <div v-if="loading && !devices.length" class="grid gauto"><div v-for="i in 8" :key="i" class="skeleton" style="height:190px"></div></div>

    <transition-group v-else-if="prefs.devView === 'cards'" name="list" tag="div" class="grid gauto">
      <div v-for="d in paged" :key="d.device_id" class="card hover dev-card" :class="devStatus(d)" @click="open(d)">
        <div class="row">
          <img v-if="osIcon(d)" :src="osIcon(d)" class="os-icon" loading="lazy" @error="(e) => (e.target.style.visibility = 'hidden')" />
          <div class="col grow" style="gap:1px;min-width:0">
            <b class="ellipsis" style="font-size:15px">{{ devName(d) }}</b>
            <span class="small muted ellipsis mono">{{ d.hostname }}{{ d.ip && d.ip !== d.hostname ? ' · ' + d.ip : '' }}</span>
          </div>
          <span class="badge" :class="devStatus(d)"><span class="dot" :class="devStatus(d)"></span>{{ statusLabel[devStatus(d)] }}</span>
        </div>
        <div class="kv small mt" style="margin-top:14px">
          <dt>{{ t('Système') }}</dt><dd class="ellipsis">{{ d.os }} {{ d.version }}</dd>
          <dt>{{ t('Matériel') }}</dt><dd class="ellipsis">{{ d.hardware || '—' }}</dd>
          <dt>{{ t('Emplacement') }}</dt><dd class="ellipsis">{{ d.location || '—' }}</dd>
          <dt>{{ t('Uptime') }}</dt><dd>{{ fmtUptime(d.uptime) }}</dd>
        </div>
        <div class="row small muted dev-foot">
          <span class="row" style="gap:4px" :title="t('Latence ICMP')"><Timer :size="13" />{{ d.last_ping_timetaken ? (+d.last_ping_timetaken).toFixed(1) + ' ms' : '—' }}</span>
          <span class="row" style="gap:4px" :title="t('Dernier polling')"><RefreshCw :size="13" />{{ timeAgo(d.last_polled) }}</span>
          <span class="grow"></span>
          <span class="badge">{{ d.type || 'n/a' }}</span>
        </div>
      </div>
    </transition-group>

    <div v-else class="card">
      <DataTable :rows="filtered" :columns="cols" :searchable="false" row-key="device_id" :row-click="open" filename="equipements.csv" :page-size="100">
        <template #c-hostname="{ row }"><DeviceCell :device="row" /></template>
        <template #c-status="{ row }"><span class="badge" :class="devStatus(row)">{{ statusLabel[devStatus(row)] }}</span></template>
        <template #c-uptime="{ row }">{{ fmtUptime(row.uptime) }}</template>
        <template #c-last_polled="{ row }"><span class="nowrap">{{ timeAgo(row.last_polled) }}</span></template>
        <template #c-last_ping_timetaken="{ row }">{{ row.last_ping_timetaken ? (+row.last_ping_timetaken).toFixed(1) + ' ms' : '—' }}</template>
      </DataTable>
    </div>

    <div v-if="prefs.devView === 'cards' && filtered.length > shown" class="row mt" style="justify-content:center">
      <button class="btn" @click="shown += 60">Afficher plus ({{ filtered.length - shown }} restants)</button>
    </div>
    <div v-if="!loading && !filtered.length && devices.length" class="empty"><SearchX /><div>{{ t('Aucun équipement ne correspond aux filtres') }}</div></div>

    <AddDevice v-if="addOpen" @close="addOpen = false" @added="reload()" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutGrid, List, Plus, Search, SearchX, Timer, RefreshCw, X } from 'lucide-vue-next'
import DataTable from '../components/DataTable.vue'
import DeviceCell from '../components/DeviceCell.vue'
import AddDevice from '../components/AddDevice.vue'
import { session, api, pick, safeList, devicesCached, invalidateDevices } from '../api'
import { useLoader } from '../refresh'
import { prefs, save, devName, devStatus, statusLabel, osIcon, fmtUptime, timeAgo } from '../utils'
import { t } from '../i18n'

const route = useRoute()
const router = useRouter()
const devices = ref([])
const groups = ref([])
const groupMembers = ref({})
const q = ref(route.query.q || '')
const status = ref(route.query.status || 'all')
// Filtres « à la LibreNMS » : chaque liste ne propose que les valeurs présentes parmi les
// équipements qui satisfont les autres filtres (avec le nombre d'équipements entre parenthèses).
const FILTERS = [
  { k: 'os', q: 'os', l: 'OS', all: t('Tous les OS') },
  { k: 'version', q: 'version', l: t('Version'), all: t('Toutes les versions') },
  { k: 'hardware', q: 'hardware', l: t('Plateforme'), all: t('Toutes les plateformes') },
  { k: 'features', q: 'features', l: t('Featureset'), all: t('Tous les featuresets') },
  { k: 'location', q: 'location', l: t('Emplacement'), all: t('Tous les emplacements') },
  { k: 'type', q: 'type', l: t('Type'), all: t('Tous les types') },
]
const sel = reactive(Object.fromEntries(FILTERS.map((f) => [f.k, String(route.query[f.q] || '')])))
const val = (d, k) => (d[k] == null ? '' : String(d[k]).trim())
const group = ref(route.query.group || '')
const addOpen = ref(false)
const shown = ref(60)

const statuses = [{ v: 'all', l: t('Tous') }, { v: 'up', l: t('En ligne') }, { v: 'down', l: t('Hors ligne') }, { v: 'disabled', l: t('Désactivés') }]
const anyFilter = computed(() => !!(q.value || status.value !== 'all' || group.value || FILTERS.some((f) => sel[f.k])))
function resetFilters() { q.value = ''; status.value = 'all'; group.value = ''; FILTERS.forEach((f) => { sel[f.k] = '' }) }
const matchSel = (d, skip) => FILTERS.every((f) => f.k === skip || !sel[f.k] || val(d, f.k) === sel[f.k])
const options = computed(() => Object.fromEntries(FILTERS.map((f) => {
  const n = new Map()
  for (const d of devices.value) {
    if (!matchSel(d, f.k)) continue
    const v = val(d, f.k)
    if (v) n.set(v, (n.get(v) || 0) + 1)
  }
  const list = [...n].map(([v, c]) => ({ v, n: c })).sort((a, b) => a.v.localeCompare(b.v, 'fr', { numeric: true }))
  return [f.k, list]
})))

function statusCount(s) { return s === 'all' ? devices.value.length : devices.value.filter((d) => devStatus(d) === s).length }

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  const members = group.value ? groupMembers.value[group.value] : null
  return devices.value.filter((d) => {
    if (status.value !== 'all' && devStatus(d) !== status.value) return false
    if (!matchSel(d)) return false
    if (members && !members.has(+d.device_id)) return false
    if (s && ![d.hostname, d.sysName, d.display, d.ip, d.os, d.hardware, d.version, d.serial, d.features, d.location, d.sysDescr, d.purpose, d.notes]
      .some((x) => x && String(x).toLowerCase().includes(s))) return false
    return true
  }).sort((a, b) => {
    const da = devStatus(a) === 'down'; const db = devStatus(b) === 'down'
    if (da !== db) return da ? -1 : 1
    return devName(a).localeCompare(devName(b), 'fr', { numeric: true })
  })
})
const paged = computed(() => filtered.value.slice(0, shown.value))

const cols = [
  { key: 'hostname', label: t('Équipement'), sortValue: devName },
  { key: 'status', label: t('État'), sortValue: devStatus },
  { key: 'ip', label: 'IP', class: 'mono' },
  { key: 'os', label: 'OS' },
  { key: 'version', label: t('Version') },
  { key: 'hardware', label: t('Matériel') },
  { key: 'features', label: t('Featureset') },
  { key: 'serial', label: t('N° série'), class: 'mono' },
  { key: 'location', label: t('Emplacement') },
  { key: 'uptime', label: t('Uptime') },
  { key: 'last_ping_timetaken', label: t('Latence') },
  { key: 'last_polled', label: t('Polling') },
]

function setView(v) { prefs.devView = v; save('devView', v) }
function open(d) { router.push(`/device/${encodeURIComponent(d.hostname)}`) }

watch(group, async (g) => {
  if (!g || groupMembers.value[g]) return
  const r = await safeList(`devicegroups/${encodeURIComponent(g)}`, null, 'devices')
  groupMembers.value = { ...groupMembers.value, [g]: new Set(r.map((x) => +x.device_id)) }
}, { immediate: true })
watch([status, q, group, () => FILTERS.map((f) => sel[f.k]).join('\u0001')], () => {
  shown.value = 60
  const query = { ...(q.value && { q: q.value }), ...(status.value !== 'all' && { status: status.value }), ...(group.value && { group: group.value }) }
  for (const f of FILTERS) if (sel[f.k]) query[f.q] = sel[f.k]
  router.replace({ query })
})

const { loading, error, reload } = useLoader(async ({ silent }) => {
  invalidateDevices()
  devices.value = await devicesCached()
  if (!silent) groups.value = await safeList('devicegroups', null, 'groups')
})
</script>

<style scoped>
.search-in { position: relative; min-width: 240px; }
.search-in svg { position: absolute; left: 11px; }
.search-in .input { padding-left: 34px; width: 100%; }
.dev-card { padding: 16px 18px; overflow: hidden; }
.dev-card::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--green); opacity: .8; }
.dev-card.down::after { background: var(--red); }
.dev-card.disabled::after, .dev-card.ignored::after { background: var(--gray); }
.dev-card.down { background: linear-gradient(135deg, rgba(244, 63, 94, .08), var(--panel) 50%); }
.dev-foot { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); gap: 14px; }
.filters .input:not(.search-in .input) { max-width: 200px; }
.filters select.input.active { border-color: var(--accent); }
</style>
