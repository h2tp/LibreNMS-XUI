<template>
  <div>
    <div class="page-head">
      <div><h1>Topologie réseau</h1><div class="sub">{{ nodes.length }} équipements · {{ edges.length }} liens (CDP/LLDP) · couleur = charge du lien</div></div>
      <div class="right">
        <select v-model="loc" class="input"><option value="">Tous les emplacements</option><option v-for="l in locs" :key="l">{{ l }}</option></select>
        <label class="check"><input v-model="external" type="checkbox" /> Voisins non supervisés</label>
        <label class="check"><input v-model="isolated" type="checkbox" /> Inclure les isolés</label>
        <label class="check"><input v-model="labels" type="checkbox" /> Libellés</label>
      </div>
    </div>
    <div class="card topo">
      <div v-if="loading && !links.length" class="skeleton" style="height:100%"></div>
      <div v-else-if="!edges.length" class="empty"><Share2 /><div>Aucun lien découvert (activez CDP/LLDP sur vos équipements)</div></div>
      <EChart v-else :option="option" height="100%" @click="onClick" />
      <div class="legend small">
        <span v-for="l in legend" :key="l.t" class="row" style="gap:6px"><i :style="{ background: l.c }"></i>{{ l.t }}</span>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Share2 } from 'lucide-vue-next'
import EChart from '../components/EChart.vue'
import { safeList, devicesCached } from '../api'
import { useLoader } from '../refresh'
import { devName, devStatus, fmtBits } from '../utils'
import { css } from '../charts'

const router = useRouter()
const devices = ref([])
const links = ref([])
const ports = ref({})
const loc = ref('')
const isolated = ref(false)
const labels = ref(true)
const external = ref(true)
const legend = [{ t: '0 %', c: '#64748b' }, { t: '< 25 %', c: '#22d3ee' }, { t: '< 50 %', c: '#22c55e' }, { t: '< 75 %', c: '#facc15' }, { t: '< 90 %', c: '#fb923c' }, { t: '≥ 90 %', c: '#f43f5e' }]
const util = (p) => (p && +p.ifSpeed ? (Math.max(+p.ifInOctets_rate || 0, +p.ifOutOctets_rate || 0) * 800) / p.ifSpeed : 0)
const ucolor = (u) => (u <= 0 ? '#64748b' : u < 25 ? '#22d3ee' : u < 50 ? '#22c55e' : u < 75 ? '#facc15' : u < 90 ? '#fb923c' : '#f43f5e')
const locs = computed(() => [...new Set(devices.value.map((d) => d.location).filter(Boolean))].sort())
const devById = computed(() => Object.fromEntries(devices.value.map((d) => [+d.device_id, d])))

const edges = computed(() => {
  const seen = new Map()
  links.value.forEach((l) => {
    const a = +l.local_device_id
    const b = +l.remote_device_id && devById.value[+l.remote_device_id] ? +l.remote_device_id : (external.value ? 'x:' + (l.remote_hostname || l.remote_port) : null)
    if (!a || !b || a === b || !devById.value[a]) return
    if (loc.value && devById.value[a].location !== loc.value && devById.value[b]?.location !== loc.value) return
    const k = [String(a), String(b)].sort().join('-')
    const p = ports.value[l.local_port_id]
    const u = util(p)
    const prev = seen.get(k)
    if (!prev || u > prev.u) seen.set(k, { source: String(a), target: String(b), u, p, l, n: (prev?.n || 0) + 1 })
    else prev.n++
  })
  return [...seen.values()]
})
const nodes = computed(() => {
  const deg = {}
  edges.value.forEach((e) => { deg[e.source] = (deg[e.source] || 0) + 1; deg[e.target] = (deg[e.target] || 0) + 1 })
  const ext = Object.keys(deg).filter((k) => k.startsWith('x:')).map((k) => ({ id: k, name: k.slice(2), deg: deg[k], ext: true, dev: { hostname: k.slice(2), os: 'non supervisé', type: '' } }))
  return devices.value.filter((d) => (isolated.value || deg[d.device_id]) && (!loc.value || d.location === loc.value || deg[d.device_id]))
    .map((d) => ({ id: String(d.device_id), name: devName(d), dev: d, deg: deg[d.device_id] || 0 })).concat(ext)
})
const nodeIds = computed(() => new Set(nodes.value.map((n) => n.id)))
const option = computed(() => ({
  tooltip: {
    backgroundColor: css('--panel-solid'), borderColor: css('--border'), textStyle: { color: css('--text') },
    formatter: (p) => p.dataType === 'edge'
      ? `<b>${p.data.label}</b><br/>${p.data.p ? `${fmtBits(p.data.p.ifInOctets_rate * 8)} ↓ / ${fmtBits(p.data.p.ifOutOctets_rate * 8)} ↑<br/>${p.data.u.toFixed(1)} %` : ''}${p.data.n > 1 ? `<br/>${p.data.n} liens` : ''}`
      : `<b>${p.data.name}</b><br/>${p.data.dev.hostname}<br/>${p.data.dev.os} ${p.data.dev.hardware || ''}<br/>${p.data.deg} lien(s)`,
  },
  series: [{
    type: 'graph', layout: 'force', roam: true, draggable: true, animationDuration: 2000, animationEasingUpdate: 'quinticInOut',
    force: { repulsion: 420, edgeLength: [80, 220], gravity: 0.06, friction: 0.15 },
    label: { show: labels.value, position: 'right', color: css('--text'), fontSize: 11 },
    emphasis: { focus: 'adjacency', lineStyle: { width: 5 } },
    data: nodes.value.map((n) => {
      if (n.ext) return { ...n, symbol: 'diamond', symbolSize: 14, itemStyle: { color: '#475569', borderColor: 'rgba(255,255,255,.4)', borderWidth: 1 } }
      const st = devStatus(n.dev)
      const c = st === 'down' ? '#f43f5e' : st === 'up' ? (n.dev.type === 'network' ? '#22d3ee' : n.dev.type === 'firewall' ? '#fb923c' : n.dev.type === 'wireless' ? '#f472b6' : '#a78bfa') : '#64748b'
      return { ...n, symbolSize: 14 + Math.min(30, n.deg * 3), itemStyle: { color: c, borderColor: 'rgba(255,255,255,.7)', borderWidth: 1.5, shadowBlur: st === 'down' ? 20 : 8, shadowColor: c } }
    }),
    links: edges.value.filter((e) => nodeIds.value.has(e.source) && nodeIds.value.has(e.target)).map((e) => ({
      source: e.source, target: e.target, u: e.u, p: e.p, n: e.n,
      label: `${devName(devById.value[e.source]) || e.source.slice(2)} ${e.l.local_port_id && ports.value[e.l.local_port_id] ? ports.value[e.l.local_port_id].ifName : ''} ↔ ${devById.value[e.target] ? devName(devById.value[e.target]) : e.target.slice(2)} ${e.l.remote_port || ''}`,
      lineStyle: { color: ucolor(e.u), width: 1.5 + Math.min(4, (e.p?.ifSpeed || 0) / 2.5e9), opacity: 0.85, curveness: 0.05 },
    })),
  }],
}))
function onClick(p) { if (p.dataType === 'node' && p.data.ext) return; if (p.dataType === 'node') router.push(`/device/${encodeURIComponent(p.data.dev.hostname)}`); else if (p.data?.p) router.push(`/port/${p.data.p.port_id}`) }

const { loading } = useLoader(async () => {
  const [d, l, p] = await Promise.all([
    devicesCached(), safeList('resources/links', null, 'links'),
    safeList('ports', { columns: 'port_id,ifName,ifSpeed,ifInOctets_rate,ifOutOctets_rate' }, 'ports'),
  ])
  devices.value = d; links.value = l; ports.value = Object.fromEntries(p.map((x) => [x.port_id, x]))
})
</script>
<style scoped>
.topo { height: calc(100vh - 190px); min-height: 500px; padding: 8px; }
.legend { position: absolute; left: 18px; bottom: 14px; display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); }
.legend i { width: 18px; height: 4px; border-radius: 2px; display: inline-block; }
</style>
