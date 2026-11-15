<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Explorateur API') }}</h1><div class="sub">{{ t('Interrogez directement n\'importe quel endpoint de l\'API LibreNMS v0') }}</div></div></div>
    <div class="card mb">
      <form class="row wrap" @submit.prevent="run">
        <select v-model="method" class="input" :disabled="session.read_only"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
        <div class="row grow pathbox"><span class="mono faint">/api/v0/</span><input v-model="path" class="input grow mono" list="routes" placeholder="devices?type=down" /></div>
        <datalist id="routes"><option v-for="r in routes" :key="r" :value="r" /></datalist>
        <button class="btn primary" :disabled="busy"><Loader2 v-if="busy" class="spin" /><Play v-else /> {{ t('Exécuter') }}</button>
      </form>
      <textarea v-if="method !== 'GET'" v-model="body" class="input mt" rows="5" style="width:100%" :placeholder="bodyPh"></textarea>
      <div class="chip-list mt"><button v-for="ex in examples" :key="ex" class="btn sm ghost mono" @click="path = ex; method = 'GET'; run()">{{ ex }}</button></div>
    </div>
    <div v-if="err" class="err mb">{{ err }}</div>
    <div v-if="result !== null" class="card">
      <div class="card-title"><Braces :size="17" /> {{ t('Résultat') }} <span class="sub">{{ ms }} ms</span>
        <div class="right" v-if="table.length"><div class="seg"><button :class="{ on: view === 'table' }" @click="view = 'table'">{{ t('Tableau') }}</button><button :class="{ on: view === 'json' }" @click="view = 'json'">JSON</button></div></div></div>
      <DataTable v-if="view === 'table' && table.length" :rows="table" filename="api.csv" />
      <pre v-else class="code">{{ typeof result === 'string' ? result : JSON.stringify(result, null, 2) }}</pre>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue'
import { Play, Loader2, Braces } from 'lucide-vue-next'
import DataTable from '../components/DataTable.vue'
import { session, api, pick } from '../api'
import { t } from '../i18n'
const bodyPh = t('{ "json": "corps de la requête" }')
const method = ref('GET')
const path = ref('')
const body = ref('')
const result = ref(null)
const err = ref('')
const busy = ref(false)
const ms = ref(0)
const view = ref('table')
const routes = ref([])
const examples = ['system', 'devices', 'ports', 'alerts?state=1', 'rules', 'logs/eventlog?limit=50', 'resources/locations', 'resources/links', 'bgp', 'services', 'devicegroups', 'inventory']
const table = computed(() => (result.value && typeof result.value === 'object' ? pick(result.value).filter((x) => x && typeof x === 'object') : []))
async function run() {
  busy.value = true; err.value = ''; const t0 = performance.now()
  try {
    const [p, qs] = path.value.split('?')
    const params = Object.fromEntries(new URLSearchParams(qs || ''))
    let b
    if (method.value !== 'GET' && body.value.trim()) b = JSON.parse(body.value)
    result.value = method.value === 'GET' ? await api.get(p.replace(/^\/+/, ''), params)
      : await { POST: api.post, PUT: api.put, PATCH: api.patch, DELETE: api.del }[method.value](p.replace(/^\/+/, ''), b)
  } catch (e) { err.value = e.message; result.value = null } finally { busy.value = false; ms.value = Math.round(performance.now() - t0) }
}
onMounted(async () => {
  try { const r = await api.get(''); routes.value = Object.values(r).filter((x) => typeof x === 'string').map((u) => u.replace(/^.*\/api\/v0\/?/, '')) } catch { /* */ }
})
</script>
<style scoped>
.pathbox { position: relative; } .pathbox span { position: absolute; left: 12px; font-size: 12px; } .pathbox .input { padding-left: 72px; }
</style>
