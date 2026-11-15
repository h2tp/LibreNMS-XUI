<template>
  <div v-if="!loaded" class="col" style="gap:10px"><div v-for="i in 2" :key="i" class="skeleton" style="height:120px"></div></div>
  <div v-else-if="!list.length" class="empty small">
    <ServerCog /><div>{{ servers.length ? t('Aucun serveur au-delà des seuils ✨') : t('Aucun serveur trouvé') }}</div>
  </div>

  <table v-else-if="mode === 'table'" class="srv-tbl">
    <thead><tr><th>{{ t('Serveur') }}</th><th>CPU</th><th>RAM</th><th>{{ t('Disque le + plein') }}</th><th>{{ t('Trafic') }}</th><th>{{ t('Uptime') }}</th><th></th></tr></thead>
    <tbody>
      <tr v-for="s in list" :key="s.device_id" @click="go(s)">
        <td><div class="nm"><span class="dot" :class="s.down ? 'down' : 'up'"></span><img v-if="s.icon" :src="s.icon" class="osi" /><b class="ellipsis">{{ s.name }}</b></div></td>
        <td><Meter :v="s.cpu" :st="s.cpuSt" /></td>
        <td><Meter :v="s.mem" :st="s.memSt" /></td>
        <td><Meter :v="s.disks[0]?.perc ?? null" :st="s.disks[0]?.st" :label="s.disks[0]?.name" /></td>
        <td class="nowrap small">↓ {{ fmtBits(s.rin) }} · ↑ {{ fmtBits(s.rout) }}</td>
        <td class="nowrap small muted">{{ s.down ? t('hors ligne') : s.uptime ? fmtUptime(s.uptime) : '—' }}</td>
        <td><span v-if="s.alerts" class="badge critical">{{ s.alerts }}</span></td>
      </tr>
    </tbody>
  </table>

  <div v-else class="cards">
    <router-link v-for="s in list" :key="s.device_id" :to="`/device/${encodeURIComponent(s.hostname)}`" class="srv" :class="s.st">
      <div class="head">
        <span class="dot" :class="s.down ? 'down' : 'up'"></span>
        <img v-if="s.icon" :src="s.icon" class="osi" @error="(e) => (e.target.style.display = 'none')" />
        <div class="grow" style="min-width:0">
          <b class="ellipsis" style="display:block">{{ s.name }}</b>
          <span class="small muted ellipsis" style="display:block">{{ s.os }}</span>
        </div>
        <span v-if="s.alerts" class="badge critical" :title="`${s.alerts} alerte(s) active(s)`"><Bell :size="11" /> {{ s.alerts }}</span>
      </div>

      <div v-if="s.down" class="small" style="color:var(--red)">{{ t('Hors ligne') }}{{ s.lastSeen ? ` · ${t('dernier relevé {d}', { d: s.lastSeen })}` : '' }}<span v-if="s.disks.length" class="faint"> {{ t('— disques : dernières valeurs connues') }}</span></div>

      <div class="meters" :class="{ stale: s.down }">
        <div v-if="!s.down" class="m"><span>CPU <i v-if="s.cores > 1" class="faint">{{ t('{n} cœurs', { n: s.cores }) }}</i></span><Meter :v="s.cpu" :st="s.cpuSt" /></div>
        <div v-if="!s.down" class="m"><span>RAM <i v-if="s.memTotal" class="faint">{{ fmtBytes(s.memTotal) }}</i></span><Meter :v="s.mem" :st="s.memSt" /></div>
        <div v-if="s.swap !== null" class="m"><span>{{ t('Swap') }}</span><Meter :v="s.swap" :st="s.swap >= 90 ? 'crit' : s.swap >= 50 ? 'warn' : 'ok'" /></div>
        <div v-for="d in s.disks" :key="d.key" class="m"><span class="ellipsis" :title="d.descr">{{ d.name }} <i class="faint">{{ fmtBytes(d.free) }} libres</i></span><Meter :v="d.perc" :st="d.st" /></div>
      </div>

      <div class="foot small muted">
        <span class="nowrap"><ArrowDown :size="12" color="var(--accent)" /> {{ fmtBits(s.rin) }} <ArrowUp :size="12" color="#a78bfa" /> {{ fmtBits(s.rout) }}</span>
        <span v-if="s.temp !== null" class="nowrap"><Thermometer :size="12" /> {{ s.temp }} °C</span>
        <span v-if="s.uptime && !s.down" class="nowrap"><Clock :size="12" /> {{ fmtUptime(s.uptime) }}</span>
      </div>
    </router-link>
  </div>
</template>

<script setup>
import { ref, computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { ServerCog, Bell, ArrowDown, ArrowUp, Thermometer, Clock } from 'lucide-vue-next'
import { D, devicesFor, isPhysical } from '../../dashboard/data'
import { usefulVolumes, volumeName } from '../../dashboard/volumes'
import { useLoader } from '../../refresh'
import { devName, fmtBits, fmtBytes, fmtUptime, osIcon, timeAgo } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const devices = ref([]); const ports = ref([]); const alerts = ref([]); const sensors = ref([])
const cpu = ref([]); const mem = ref([]); const storage = ref([]); const loaded = ref(false)
const mode = computed(() => props.config.mode || 'cards')
const n = (v) => +v || 0
const RANK = { crit: 0, warn: 1, ok: 2 }
const AUX = ['virtual', 'buffers', 'cached', 'shared', 'swap']

// petite jauge horizontale avec pourcentage
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const Meter = (p) => h('div', { class: 'meter', title: p.label || '' }, p.v === null || p.v === undefined
  ? [h('span', { class: 'faint small' }, '—')]
  : [h('div', { class: 'bar' }, [h('i', { style: { width: `${Math.max(1, p.v)}%`, background: COL[p.st || 'ok'] } })]), h('b', { class: p.st }, `${Math.round(p.v)} %`)])
Meter.props = ['v', 'st', 'label']

const servers = computed(() => {
  const warn = +(props.config.warn ?? 80); const crit = +(props.config.crit ?? 90)
  const lvl = (v) => (v === null ? 'ok' : v >= crit ? 'crit' : v >= warn ? 'warn' : 'ok')
  const byDev = (arr) => { const m = {}; for (const x of arr) (m[x.device_id] ||= []).push(x); return m }
  const cpuBy = byDev(cpu.value); const memBy = byDev(mem.value); const stoBy = byDev(storage.value); const portBy = byDev(ports.value)
  const nDisks = props.config.disks ?? 3
  return devices.value.filter((d) => !+d.disabled && (!props.config.device || d.hostname === props.config.device)
    && (d.type === 'server' || (props.config.allTypes && (cpuBy[d.device_id] || memBy[d.device_id])))).map((d) => {
    const id = d.device_id
    const procs = (cpuBy[id] || []).filter((p) => p.usage != null)
    const pools = memBy[id] || []
    const sys = pools.find((p) => p.cls === 'system') || pools.find((p) => !AUX.includes(p.cls))
    const swapP = pools.find((p) => p.cls === 'swap')
    const cpuV = procs.length ? procs.reduce((s, p) => s + n(p.usage), 0) / procs.length : null
    const memV = sys ? n(sys.perc) : null
    const disks = usefulVolumes(stoBy[id] || []).map((v) => {
      const perc = v.perc != null ? n(v.perc) : Math.round((n(v.used) / n(v.size)) * 100)
      return { key: v.storage_id, descr: v.descr, name: volumeName(v.descr), perc, free: n(v.free), st: lvl(perc) }
    }).sort((a, b) => b.perc - a.perc).slice(0, nDisks)
    const phys = (portBy[id] || []).filter((p) => !+p.deleted && isPhysical(p))
    const temps = sensors.value.filter((s) => +s.device_id === +id && s.sensor_class === 'temperature' && !+s.sensor_deleted).map((s) => n(s.sensor_current)).filter((v) => v > 0)
    const nAlerts = alerts.value.filter((a) => +a.device_id === +id).length
    const down = +d.status === 0
    // hors ligne : CPU / RAM ne sont que les dernières valeurs relevées, on ne les affiche pas
    const cpuNow = down ? null : cpuV; const memNow = down ? null : memV
    const cpuSt = lvl(cpuNow); const memSt = lvl(memNow)
    const st = down ? 'crit' : [cpuSt, memSt, ...disks.map((x) => x.st), nAlerts ? 'warn' : 'ok'].reduce((a, b) => (RANK[a] <= RANK[b] ? a : b), 'ok')
    return {
      device_id: id, hostname: d.hostname, name: devName(d), icon: osIcon(d), down, st,
      os: [d.os === 'linux' ? (d.version || 'Linux') : d.os, d.hardware].filter(Boolean).join(' · ') || d.os,
      uptime: n(d.uptime), lastSeen: d.last_polled ? timeAgo(d.last_polled) : '',
      cpu: cpuNow, cores: procs.length, cpuSt, mem: memNow, memSt, memTotal: sys ? n(sys.total) : 0,
      swap: !down && swapP && n(swapP.total) > 0 ? n(swapP.perc) : null, disks,
      rin: phys.reduce((s, p) => s + n(p.ifInOctets_rate) * 8, 0), rout: phys.reduce((s, p) => s + n(p.ifOutOctets_rate) * 8, 0),
      temp: temps.length ? Math.round(Math.max(...temps)) : null, alerts: nAlerts,
      score: Math.max(cpuNow ?? 0, memNow ?? 0, ...disks.map((x) => x.perc)),
    }
  })
})
const list = computed(() => {
  let l = servers.value
  if (props.config.onlyAlarm) l = l.filter((s) => s.st !== 'ok')
  return [...l].sort(props.config.sort === 'name' ? (a, b) => a.name.localeCompare(b.name)
    : (a, b) => b.down - a.down || RANK[a.st] - RANK[b.st] || b.score - a.score)
})
function go(s) { router.push(`/device/${encodeURIComponent(s.hostname)}`) }

useLoader(async () => {
  // CPU / RAM / disques : agrégations plus lentes à froid, elles complètent l'affichage à leur arrivée
  D.cpu().then((x) => (cpu.value = x)).catch(() => {})
  D.memory().then((x) => (mem.value = x)).catch(() => {})
  D.storage().then((x) => (storage.value = x)).catch(() => {})
  const [d, p, a, s] = await Promise.all([devicesFor(props.config), D.ports(), D.alerts().catch(() => []), D.sensors().catch(() => [])])
  devices.value = d; ports.value = p; alerts.value = a; sensors.value = s
  loaded.value = true
})
</script>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.srv { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); color: var(--text); min-width: 0; }
.srv:hover { text-decoration: none; filter: brightness(1.08); }
.srv.warn { border-top-color: var(--orange); }
.srv.crit { border-top-color: var(--red); }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.osi { width: 22px; height: 22px; flex: none; }
.meters { display: flex; flex-direction: column; gap: 6px; }
.meters.stale { opacity: .55; }
.m { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); align-items: center; gap: 10px; font-size: 12px; }
.m > span { color: var(--muted); min-width: 0; }
.m i { font-style: normal; font-size: 11px; }
.foot { display: flex; flex-wrap: wrap; gap: 4px 14px; padding-top: 8px; border-top: 1px solid var(--border); }
.foot span { display: inline-flex; align-items: center; gap: 4px; }
:deep(.meter) { display: flex; align-items: center; gap: 8px; min-width: 0; }
:deep(.meter .bar) { flex: 1; min-width: 40px; }
:deep(.meter b) { min-width: 38px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
:deep(.meter b.warn) { color: var(--orange); } :deep(.meter b.crit) { color: var(--red); }
.srv-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.srv-tbl th { text-align: left; font-weight: 500; color: var(--muted); font-size: 11.5px; padding: 4px 8px; border-bottom: 1px solid var(--border); }
.srv-tbl td { padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.srv-tbl tbody tr { cursor: pointer; } .srv-tbl tbody tr:hover { background: var(--panel-2); }
.srv-tbl td:nth-child(2), .srv-tbl td:nth-child(3), .srv-tbl td:nth-child(4) { min-width: 120px; }
.nm { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nm .osi { width: 18px; height: 18px; }
</style>
