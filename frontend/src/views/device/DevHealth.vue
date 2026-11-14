<template>
  <div>
    <div v-if="loading && !types.length" class="grid gauto"><div v-for="i in 6" :key="i" class="skeleton" style="height:120px"></div></div>
    <div v-else-if="!types.length" class="card empty"><HeartPulse /><div>Aucune donnée de santé pour cet équipement</div></div>

    <div v-if="procs.length || mempools.length || storage.length" class="grid g2 mb usage-grid" :class="{ compact }">
      <div v-if="procs.length" class="card procs">
        <div class="card-title"><Cpu :size="17" /> Processeurs <span class="sub">{{ procs.length }}</span></div>
        <div class="proc-grid">
          <div v-for="p in procs" :key="p._id" class="proc" :class="{ sel: open === 'p' + p._id }" @click="toggle('p' + p._id)">
            <Ring :value="+p.processor_usage || 0" :size="76" :stroke="8" />
            <span class="small muted ellipsis" style="max-width:110px" :title="p.tip">{{ p.label }}</span>
          </div>
        </div>
        <HealthChart v-if="open && open.startsWith('p')" :device="device" :files="files" type="device_processor" :row="procs.find((x) => 'p' + x._id === open)" />
      </div>

      <div v-if="mempools.length" class="card">
        <div class="card-title"><MemoryStick :size="17" /> Mémoire</div>
        <div v-for="m in mempools" :key="m._id" class="usage" @click="toggle('m' + m._id)">
          <div class="row small"><b>{{ m.mempool_descr || m.desc }}</b><span class="grow"></span><span class="muted">{{ fmtBytes(m.mempool_used) }} / {{ fmtBytes(m.mempool_total) }}</span><b>{{ fmtPct(m.mempool_perc) }}</b></div>
          <div class="bar big"><i :style="{ width: (+m.mempool_perc || 0) + '%', background: utilColor(+m.mempool_perc) }"></i></div>
          <HealthChart v-if="open === 'm' + m._id" :device="device" :files="files" type="device_mempool" :row="m" />
        </div>
      </div>
      <div v-if="storage.length" class="card">
        <div class="card-title"><HardDrive :size="17" /> Stockage</div>
        <div v-for="s in storage" :key="s._id" class="usage" @click="toggle('s' + s._id)">
          <div class="row small"><b class="ellipsis">{{ s.storage_descr || s.desc }}</b><span class="grow"></span><span class="muted nowrap">{{ fmtBytes(s.storage_used) }} / {{ fmtBytes(s.storage_size) }}</span><b>{{ fmtPct(s.storage_perc) }}</b></div>
          <div class="bar big"><i :style="{ width: (+s.storage_perc || 0) + '%', background: utilColor(+s.storage_perc) }"></i></div>
          <HealthChart v-if="open === 's' + s._id" :device="device" :files="files" type="device_storage" :row="s" />
        </div>
      </div>
    </div>

    <div v-for="g in sensorGroups" :key="g.type" class="card mb">
      <div class="card-title"><component :is="iconFor(g.cls)" :size="17" /> {{ SENSOR_LABELS[g.cls] || g.desc || g.cls }} <span class="sub">{{ g.rows.length }}</span></div>
      <div class="grid gauto-s">
        <div v-for="s in g.rows" :key="s._id" class="sensor" :class="[sensorState(s), { sel: open === g.type + s._id }]" @click="toggle(g.type + s._id)">
          <div class="small muted ellipsis" :title="s.sensor_descr || s.desc">{{ s.sensor_descr || s.desc }}</div>
          <div class="sval">{{ fmtVal(s.sensor_current) }}<small> {{ sensorUnit(g.cls) }}</small></div>
          <div v-if="s.sensor_limit || s.sensor_limit_low" class="small faint">
            <span v-if="s.sensor_limit_low">min {{ fmtVal(s.sensor_limit_low) }}</span> <span v-if="s.sensor_limit">max {{ fmtVal(s.sensor_limit) }}</span>
          </div>
          <div v-if="s.sensor_limit && s.sensor_current !== undefined" class="bar"><i :style="{ width: limitPct(s) + '%', background: sensorState(s) === 'critical' ? 'var(--red)' : 'var(--accent)' }"></i></div>
        </div>
      </div>
      <HealthChart v-if="open && open.startsWith(g.type)" :device="device" :files="files" :type="g.type" :row="g.rows.find((x) => g.type + x._id === open)" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { HeartPulse, Cpu, MemoryStick, HardDrive, Thermometer, Zap, Fan, Droplets, Gauge, Waves, Battery, Activity } from 'lucide-vue-next'
import Ring from '../../components/Ring.vue'
import HealthChart from '../../components/HealthChart.vue'
import { useLoader } from '../../refresh'
import { loadHealth, sensorClassOf } from '../../health'
import { SENSOR_LABELS, sensorUnit } from '../../rrdmeta'
import { fmtBytes, utilColor } from '../../utils'

// compact (vue d'ensemble) : processeurs et mémoire côte à côte
const props = defineProps({ device: Object, files: Array, compact: Boolean })
const types = ref([])
const data = ref({})
const open = ref(null)
const toggle = (k) => (open.value = open.value === k ? null : k)

// LibreNMS donne souvent la même description à tous les cœurs (« Processor » via HOST-RESOURCES) :
// on les numérote alors dans l'ordre de leur index SNMP (« CPU 1 », « CPU 2 »…)
const procs = computed(() => {
  const list = [...(data.value.device_processor || [])].sort((a, b) => (+a.processor_index || 0) - (+b.processor_index || 0) || a._id - b._id)
  const descr = (p) => String(p.processor_descr || p.desc || 'Processeur').trim()
  const count = {}; for (const p of list) count[descr(p)] = (count[descr(p)] || 0) + 1
  const rank = {}
  return list.map((p) => {
    const d = descr(p)
    if (count[d] < 2) return { ...p, label: d, tip: d }
    const n = (rank[d] = (rank[d] || 0) + 1)
    const label = /^(processor|cpu|processeur)$/i.test(d) ? `CPU ${n}` : `${d} #${n}`
    return { ...p, label, tip: `${label} — ${d} (index ${p.processor_index ?? '?'})` }
  })
})
const mempools = computed(() => data.value.device_mempool || [])
const storage = computed(() => data.value.device_storage || [])
const sensorGroups = computed(() => types.value.filter((t) => !['device_processor', 'device_mempool', 'device_storage'].includes(t.name) && data.value[t.name]?.length)
  .map((t) => ({ type: t.name, desc: t.desc, cls: sensorClassOf(t.name), rows: data.value[t.name] })))

function fmtPct(v) { return v === undefined || v === null ? '—' : `${Math.round(+v)} %` }
function fmtVal(v) { if (v === undefined || v === null || v === '') return '—'; const x = +v; return Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 100) / 100 }
function sensorState(s) {
  const v = +s.sensor_current
  if (s.sensor_limit && v >= +s.sensor_limit) return 'critical'
  if (s.sensor_limit_low && v <= +s.sensor_limit_low) return 'critical'
  if (s.sensor_limit_warn && v >= +s.sensor_limit_warn) return 'warning'
  return 'ok'
}
function limitPct(s) {
  const lo = +(s.sensor_limit_low || 0); const hi = +s.sensor_limit
  return Math.max(2, Math.min(100, ((+s.sensor_current - lo) / ((hi - lo) || 1)) * 100))
}
function iconFor(c) { return { temperature: Thermometer, voltage: Zap, current: Zap, power: Zap, fanspeed: Fan, humidity: Droplets, dbm: Waves, charge: Battery, runtime: Battery, load: Gauge }[c] || Activity }

const { loading } = useLoader(async () => {
  const r = await loadHealth(props.device.hostname)
  types.value = r.types; data.value = r.data
}, { auto: false })
</script>

<style scoped>
.usage-grid:not(.compact) > .procs { grid-column: 1 / -1; }
.usage-grid.compact > .card:last-child:nth-child(odd) { grid-column: 1 / -1; }
.proc-grid { display: flex; flex-wrap: wrap; gap: 14px; }
.proc { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px; border-radius: 12px; cursor: pointer; transition: background .2s; }
.proc:hover, .proc.sel { background: var(--panel-2); }
.usage { padding: 10px 8px; border-radius: 10px; cursor: pointer; display: flex; flex-direction: column; gap: 7px; transition: background .2s; }
.usage:hover { background: var(--panel-2); }
.bar.big { height: 9px; }
.sensor { padding: 14px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); cursor: pointer; display: flex; flex-direction: column; gap: 6px; transition: all .2s; }
.sensor:hover, .sensor.sel { border-color: var(--accent); transform: translateY(-2px); }
.sensor.critical { border-color: rgba(244, 63, 94, .5); background: rgba(244, 63, 94, .08); }
.sensor.warning { border-color: rgba(251, 146, 60, .5); }
.sval { font-size: 24px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.sval small { font-size: 13px; color: var(--muted); font-weight: 500; }
</style>
