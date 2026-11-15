<template>
  <div>
    <div class="card-title">
      <ArrowDownUp :size="17" /> {{ t('Trafic global') }} <span class="sub">Overall Traffic · {{ nPorts }} port(s)</span>
      <div class="right"><RangePicker v-model="range" /></div>
    </div>
    <template v-if="session.rrd">
      <div v-if="error" class="err small">{{ error }}</div>
      <div v-else-if="!series" class="skeleton" :style="{ height }"></div>
      <div v-else-if="!series.length" class="empty small">{{ t('Aucune donnée de trafic pour cet équipement') }}</div>
      <template v-else>
        <EChart :option="option" :height="height" />
        <div class="stats-row">
          <div v-for="(s, i) in series" :key="s.name" class="st">
            <span class="sw" :style="{ background: s.color }"></span><b>{{ s.name }}</b>
            <span class="muted">act.</span> {{ fmtBits(st[i].last) }}
            <span class="muted">moy.</span> {{ fmtBits(st[i].avg) }}
            <span class="muted">max</span> {{ fmtBits(st[i].max) }}
          </div>
        </div>
      </template>
    </template>
    <ApiGraph v-else :path="`devices/${encodeURIComponent(device.hostname)}/device_bits`" :range="range" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ArrowDownUp } from 'lucide-vue-next'
import EChart from './EChart.vue'
import ApiGraph from './ApiGraph.vue'
import RangePicker from './RangePicker.vue'
import { session, api, pick, rrd } from '../api'
import { clock } from '../refresh'
import { timeOption } from '../charts'
import { stats } from '../rrdmeta'
import { fmtBits, prefs } from '../utils'
import { t } from '../i18n'

const props = defineProps({ device: Object, files: Array, height: { type: String, default: '240px' } })
const range = ref(prefs.range)
const series = ref(null)
const error = ref(null)
const nPorts = ref(0)

// Mêmes exclusions que le graphique « Overall Traffic » (device_bits) de LibreNMS,
// valeurs par défaut de device_traffic_iftype et device_traffic_descr.
const IFTYPE = [/loopback/i, /tunnel/i, /virtual/i, /mpls/i, /ieee8023adLag/i, /l2vlan/i, /ppp/i]
const DESCR = [/loopback/i, /vlan/i, /tunnel/i, /bond/i, /null/i, /dummy/i]
function counted(p, os) {
  const types = os === 'asa' ? IFTYPE.filter((r) => !/virtual|l2vlan/.test(r.source)) : IFTYPE
  if (types.some((r) => r.test(p.ifType || ''))) return false
  return !DESCR.some((r) => r.test(p.ifDescr || '') || r.test(p.ifName || ''))
}

let ids = null
async function load() {
  if (!session.rrd) return
  try {
    if (!ids) {
      const r = await api.get(`devices/${encodeURIComponent(props.device.hostname)}/ports`, { columns: 'port_id,ifType,ifDescr,ifName,disabled,deleted' })
      ids = pick(r, 'ports').filter((p) => !+p.disabled && !+p.deleted && counted(p, props.device.os))
        .map((p) => p.port_id).filter((id) => !props.files || props.files.includes(`port-id${id}.rrd`))
      nPorts.value = ids.length
    }
    if (!ids.length) { series.value = []; return }
    const items = ids.slice(0, 200).map((id) => ({ host: props.device.hostname, name: `port-id${id}.rrd`, ds: 'INOCTETS,OUTOCTETS', start: range.value, rows: 500 }))
    const res = (await rrd.batch(items)).results
    const acc = new Map()
    for (const d of res) {
      if (!d || d.error || !d.series) continue
      d.timestamps.forEach((t, j) => {
        const a = acc.get(t) || [null, null]
        const i = d.series.INOCTETS?.[j]; const o = d.series.OUTOCTETS?.[j]
        if (i != null) a[0] = (a[0] || 0) + i * 8
        if (o != null) a[1] = (a[1] || 0) + o * 8
        acc.set(t, a)
      })
    }
    const ts = [...acc.keys()].sort((a, b) => a - b)
    series.value = ts.length ? [
      { name: t('Entrant'), color: '#22c55e', data: ts.map((t) => [t * 1000, acc.get(t)[0]]) },
      { name: t('Sortant'), color: '#6366f1', negate: true, data: ts.map((t) => [t * 1000, acc.get(t)[1]]) },
    ] : []
    error.value = null
  } catch (e) { error.value = e.message }
}
const option = computed(() => series.value && timeOption(series.value, { unit: 'bits', zoom: true }))
const st = computed(() => (series.value || []).map((s) => stats(s.data)))
onMounted(load)
watch(range, () => { series.value = null; load() })
watch(() => clock.tick, load)
</script>

<style scoped>
.stats-row { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12px; margin-top: 8px; font-variant-numeric: tabular-nums; }
.st { display: flex; gap: 6px; align-items: center; }
.sw { width: 10px; height: 10px; border-radius: 3px; }
</style>
