<template>
  <div>
    <div class="row wrap mb">
      <div class="seg">
        <button :class="{ on: mode === 'rrd' }" :disabled="!session.rrd" @click="mode = 'rrd'"><Sparkles /> {{ t('Interactifs') }}</button>
        <button :class="{ on: mode === 'png' }" @click="mode = 'png'"><Image /> {{ t('Graphiques LibreNMS') }}</button>
      </div>
      <RangePicker v-model="range" />
      <div class="grow"></div>
      <div v-if="mode === 'rrd'" class="row search-in"><Search :size="15" class="faint" /><input v-model="q" class="input" :placeholder="t('Filtrer les graphiques…')" /></div>
    </div>

    <template v-if="mode === 'rrd'">
      <div v-if="!files.length" class="card empty"><LineChart /><div>{{ t('Aucun fichier RRD trouvé pour cet équipement') }}</div></div>
      <div class="cat-nav row wrap mb">
        <button v-for="c in cats" :key="c.id" class="btn sm" :class="{ primary: cat === c.id }" @click="cat = c.id">{{ c.label }} <span class="faint">{{ c.n }}</span></button>
      </div>
      <div class="grid g2">
        <div v-for="f in shown" :key="f.name" class="card">
          <RrdChart :host="device.hostname" :file="f.name" :range="range" hide-range :title="f.title" height="230px" />
        </div>
      </div>
      <div v-if="list.length > limit" class="row mt" style="justify-content:center"><button class="btn" @click="limit += 20">Afficher plus ({{ list.length - limit }})</button></div>
    </template>

    <template v-else>
      <div v-if="pngLoading" class="grid g2"><div v-for="i in 4" :key="i" class="skeleton" style="height:240px"></div></div>
      <div class="grid g2">
        <div v-for="g in pngGraphs" :key="g.name" class="card">
          <div class="card-title">{{ g.desc }}</div>
          <ApiGraph :path="`devices/${enc(device.hostname)}/${g.name}`" :range="range" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Sparkles, Image, Search, LineChart } from 'lucide-vue-next'
import RrdChart from '../../components/RrdChart.vue'
import ApiGraph from '../../components/ApiGraph.vue'
import RangePicker from '../../components/RangePicker.vue'
import { session, safeList, L } from '../../api'
import { describe, CATEGORIES } from '../../rrdmeta'
import { prefs } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ device: Object, files: Array })
const enc = L.enc
const mode = ref(session.rrd ? 'rrd' : 'png')
const range = ref(prefs.range)
const q = ref('')
const cat = ref('system')
const limit = ref(20)
const portNames = ref({})

const described = computed(() => (props.files || []).map((name) => {
  const d = describe(name)
  if (d.portId && portNames.value[d.portId]) d.title = `Trafic ${portNames.value[d.portId]}`
  return { name, ...d }
}))
const cats = computed(() => CATEGORIES.map(([id, label]) => ({ id, label, n: described.value.filter((f) => f.cat === id).length })).filter((c) => c.n))
const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return described.value.filter((f) => (s ? (f.title + f.name).toLowerCase().includes(s) : f.cat === cat.value))
})
const shown = computed(() => list.value.slice(0, limit.value))
watch([cat, q], () => (limit.value = 20))
watch(cats, (c) => { if (c.length && !c.find((x) => x.id === cat.value)) cat.value = c[0].id }, { immediate: true })

const pngGraphs = ref([])
const pngLoading = ref(false)
watch(mode, async (m) => {
  if (m !== 'png' || pngGraphs.value.length) return
  pngLoading.value = true
  pngGraphs.value = await safeList(`devices/${enc(props.device.hostname)}/graphs`, null, 'graphs')
  pngLoading.value = false
}, { immediate: true })

onMounted(async () => {
  const p = await safeList(`devices/${enc(props.device.hostname)}/ports`, { columns: 'port_id,ifName,ifAlias' }, 'ports')
  portNames.value = Object.fromEntries(p.map((x) => [x.port_id, `${x.ifName}${x.ifAlias ? ' · ' + x.ifAlias : ''}`]))
})
</script>
<style scoped>
.search-in { position: relative; } .search-in svg { position: absolute; left: 11px; } .search-in .input { padding-left: 34px; width: 240px; }
</style>
