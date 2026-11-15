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
        <select v-model="os" class="input"><option value="">{{ t('Tous les OS') }}</option><option v-for="o in osList" :key="o" :value="o">{{ o }}</option></select>
        <select v-model="dtype" class="input"><option value="">{{ t('Tous les types') }}</option><option v-for="o in typeList" :key="o" :value="o">{{ o }}</option></select>
        <select v-model="loc" class="input"><option value="">{{ t('Tous les emplacements') }}</option><option v-for="o in locList" :key="o" :value="o">{{ o }}</option></select>
        <select v-model="group" class="input"><option value="">{{ t('Tous les groupes') }}</option><option v-for="g in groups" :key="g.id" :value="g.name">{{ g.name }}</option></select>
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
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutGrid, List, Plus, Search, SearchX, Timer, RefreshCw } from 'lucide-vue-next'
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
const os = ref(route.query.os || '')
const dtype = ref('')
const loc = ref(route.query.location || '')
const group = ref(route.query.group || '')
const addOpen = ref(false)
const shown = ref(60)

const statuses = [{ v: 'all', l: t('Tous') }, { v: 'up', l: t('En ligne') }, { v: 'down', l: t('Hors ligne') }, { v: 'disabled', l: t('Désactivés') }]
const uniq = (k) => computed(() => [...new Set(devices.value.map((d) => d[k]).filter(Boolean))].sort())
const osList = uniq('os'); const typeList = uniq('type'); const locList = uniq('location')

function statusCount(s) { return s === 'all' ? devices.value.length : devices.value.filter((d) => devStatus(d) === s).length }

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  const members = group.value ? groupMembers.value[group.value] : null
  return devices.value.filter((d) => {
    if (status.value !== 'all' && devStatus(d) !== status.value) return false
    if (os.value && d.os !== os.value) return false
    if (dtype.value && d.type !== dtype.value) return false
    if (loc.value && d.location !== loc.value) return false
    if (members && !members.has(+d.device_id)) return false
    if (s && ![d.hostname, d.sysName, d.display, d.ip, d.os, d.hardware, d.version, d.serial, d.location, d.sysDescr, d.purpose, d.notes]
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
watch([status, q, os, loc, group], () => {
  shown.value = 60
  router.replace({ query: { ...(q.value && { q: q.value }), ...(status.value !== 'all' && { status: status.value }), ...(os.value && { os: os.value }), ...(loc.value && { location: loc.value }), ...(group.value && { group: group.value }) } })
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
</style>
