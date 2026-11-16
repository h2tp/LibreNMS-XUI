<template>
  <div v-if="error" class="err small">{{ error }}</div>
  <div v-else-if="!loaded" class="col" style="gap:10px"><div v-for="i in 2" :key="i" class="skeleton" style="height:120px"></div></div>
  <div v-else-if="!switches.length && !config.embedded" class="empty small"><Network /><div>Aucun switch{{ config.device || config.group ? t(' pour ce filtre') : t(' détecté') }}</div></div>
  <div v-else-if="switches.length" class="col" style="gap:14px">
    <div v-for="sw in switches" :key="sw.device_id" class="sw" :class="{ down: sw.down, embedded: config.embedded }">
      <div v-if="config.embedded" class="head">
        <Network :size="17" /><b>{{ t('Façade') }}</b><span class="grow small muted mono ellipsis" style="min-width:0">{{ sw.ip }}</span>
        <span class="small muted nowrap"><b style="color:var(--text)">{{ sw.up }}</b> / {{ sw.ports.length }} ports actifs</span>
      </div>
      <div v-else class="head">
        <span class="dot" :class="sw.down ? 'down' : 'up'"></span>
        <router-link :to="`/device/${encodeURIComponent(sw.hostname)}`" class="grow" style="min-width:0;color:var(--text)">
          <b class="ellipsis" style="display:block">{{ sw.name }}</b>
          <span class="small muted ellipsis" style="display:block"><span v-if="sw.ip" class="mono">{{ sw.ip }}</span><template v-if="sw.ip && sw.model"> · </template>{{ sw.model }}</span>
        </router-link>
        <span class="small muted nowrap"><b style="color:var(--text)">{{ sw.up }}</b> / {{ sw.ports.length }} ports actifs</span>
      </div>

      <!-- une façade par membre de la stack, les unes sous les autres -->
      <div class="plates">
        <div v-for="pl in sw.plates" :key="pl.key" class="plate" :class="{ member: pl.label }">
          <span v-if="pl.label" class="mlabel small mono">{{ pl.label }}</span>
          <div class="rows" :style="{ gridTemplateColumns: `repeat(${pl.cols}, 30px)` }">
            <router-link v-for="p in pl.layout" :key="p.port_id" :to="`/port/${p.port_id}`" class="port" :class="p.cls"
              :style="{ gridRow: p.row, gridColumn: p.col, '--fill': p.color }" :title="p.tip">
              <span class="num">{{ p.label }}</span>
              <i v-if="p.util > 0" class="u" :style="{ height: Math.max(8, p.util) + '%' }"></i>
            </router-link>
          </div>
        </div>
      </div>

      <div v-if="config.kpis !== false" class="kpis">
        <div><span>{{ t('Trafic') }}</span><b class="tr"><span><ArrowDown :size="12" color="var(--accent)" />{{ fmtBits(sw.rin) }}</span><span><ArrowUp :size="12" color="#a78bfa" />{{ fmtBits(sw.rout) }}</span></b></div>
        <div v-if="sw.cpu !== null" :class="lvl(sw.cpu)"><span>CPU</span><b>{{ sw.cpu }} %</b></div>
        <div v-if="sw.mem !== null" :class="lvl(sw.mem)"><span>RAM</span><b>{{ sw.mem }} %</b></div>
        <div v-if="sw.temp !== null"><span>{{ t('Température') }}</span><b>{{ sw.temp }} °C</b></div>
        <div v-if="sw.poe"><span>{{ t('PoE') }}</span><b>{{ sw.poe.used }} / {{ sw.poe.total }} W</b></div>
        <div v-if="sw.uptime"><span>{{ t('Uptime') }}</span><b>{{ fmtUptime(sw.uptime) }}</b></div>
        <div v-if="sw.slow" class="warn"><span>{{ t('Ports lents') }}</span><b>{{ sw.slow }}</b></div>
        <div v-if="sw.errs" class="crit"><span>{{ t('Ports en erreur') }}</span><b>{{ sw.errs }}</b></div>
      </div>
    </div>

    <div class="legend small muted">
      <template v-if="config.color === 'util'">
        <span><i style="background:#22c55e"></i>&lt; 40 %</span><span><i style="background:#facc15"></i>40-70 %</span>
        <span><i style="background:#fb923c"></i>70-90 %</span><span><i style="background:#f43f5e"></i>&gt; 90 %</span>
      </template>
      <template v-else>
        <span><i style="background:#22d3ee"></i>10 G+</span><span><i style="background:#22c55e"></i>1 G</span><span><i style="background:#facc15"></i>100 M</span><span><i style="background:#fb923c"></i>10 M</span>
      </template>
      <span><i class="lg-down"></i>{{ t('déconnecté') }}</span><span><i class="lg-admin"></i>{{ t('désactivé') }}</span><span><i class="lg-err"></i>erreurs</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Network, ArrowDown, ArrowUp } from 'lucide-vue-next'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, fmtBits, fmtSpeed, fmtUptime, portUtil, utilColor } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const emit = defineEmits(['count'])
const ports = ref([]); const devById = ref({}); const cpu = ref([]); const mem = ref([]); const sensors = ref([]); const loaded = ref(false)
const n = (v) => +v || 0
const PHYS = /^(ethernetCsmacd|gigabitEthernet|fastEther|fastEtherFX|iso88023Csmacd|ethernet3Mbit)$/i

function speedColor(s) {
  if (s >= 1e10) return '#22d3ee'
  if (s >= 1e9) return '#22c55e'
  if (s >= 1e8) return '#facc15'
  return '#fb923c'
}
const UTIL = { 'var(--red)': '#f43f5e', 'var(--orange)': '#fb923c', 'var(--yellow)': '#facc15', 'var(--green)': '#22c55e' }
const lvl = (v) => (v >= 90 ? 'crit' : v >= 75 ? 'warn' : '')
const shortName = (p) => (/(\d+)$/.exec(p.ifName || '') || [])[1] || p.ifName

// numéro de membre de stack (ou de module) : premier nombre suivi de « / » ou « : » dans ifName
const MAX_MEMBERS = 16
function memberOf(p) {
  const m = /(\d+)[/:]/.exec(p.ifName || '')
  return m ? +m[1] : null
}

// façade : une rangée jusqu'à 12 ports, sinon impairs en haut / pairs en bas comme sur un vrai switch
function plateOf(list) {
  const two = list.length > 12
  const cols = two ? Math.ceil(list.length / 2) : list.length
  const layout = list.map((p, i) => {
    const admin = p.ifAdminStatus === 'down'
    const up = !admin && p.ifOperStatus === 'up'
    const errs = n(p.ifInErrors_delta) + n(p.ifOutErrors_delta) > 0
    const util = up ? Math.round(portUtil(p)) : 0
    const color = !up ? '' : props.config.color === 'util' ? UTIL[utilColor(util)] : speedColor(n(p.ifSpeed))
    return {
      ...p, util, color, label: shortName(p),
      row: two ? (i % 2) + 1 : 1, col: two ? Math.floor(i / 2) + 1 : i + 1,
      cls: [admin ? 'admin' : up ? 'up' : 'off', errs ? 'err' : ''],
      tip: [`${p.ifName}${p.ifAlias && p.ifAlias !== p.ifName ? ' — ' + p.ifAlias : ''}`,
        admin ? t('Désactivé') : up ? t('Connecté à {s}', { s: fmtSpeed(n(p.ifSpeed)) }) : t('Déconnecté'),
        up ? `↓ ${fmtBits(n(p.ifInOctets_rate) * 8)} · ↑ ${fmtBits(n(p.ifOutOctets_rate) * 8)} · ${util} %` : '',
        errs ? t('Erreurs au dernier relevé') : ''].filter(Boolean).join('\n'),
    }
  })
  return { cols, layout }
}

const switches = computed(() => {
  const byDev = {}
  for (const p of ports.value) if (devById.value[p.device_id] && !+p.deleted && PHYS.test(p.ifType || '')) (byDev[p.device_id] ||= []).push(p)
  return Object.entries(byDev).filter(([id, l]) => {
    const d = devById.value[id]
    return d.type === 'network' && l.length >= 4 && (!props.config.device || d.hostname === props.config.device)
  }).map(([id, l]) => {
    const d = devById.value[id]
    const list = [...l].sort((a, b) => n(a.ifIndex) - n(b.ifIndex))
    // stack : un groupe de ports par membre, déduit du nom (Gi2/0/1, ge-1/0/3, 2/A1…)
    const groups = new Map()
    for (const p of list) {
      const m = memberOf(p)
      if (!groups.has(m)) groups.set(m, [])
      groups.get(m).push(p)
    }
    // ports de gestion : sans numéro de membre (EMP-CMMA-CHAS1 sur OmniSwitch) ou Gi0/0 isolé sur une stack Cisco
    // numérotée à partir de 1 → façade « Gestion » à part, en fin de liste
    const mgmt = [...(groups.get(null) || []), ...(groups.size >= 2 && groups.get(0)?.length <= 2 ? groups.get(0) : [])]
    const members = [...groups].filter(([m]) => m !== null && !(m === 0 && mgmt.includes(groups.get(0)[0])))
    const stacked = members.length > 1 && members.length <= MAX_MEMBERS
    const plates = stacked
      ? members.sort((a, b) => a[0] - b[0]).map(([m, pl]) => ({ key: m, label: t('Membre {n}', { n: m }), ...plateOf(pl) }))
      : [{ key: 'all', label: '', ...plateOf(list) }]
    if (stacked && mgmt.length) plates.push({ key: 'mgmt', label: t('Gestion'), ...plateOf(mgmt) })
    const layout = plates.flatMap((pl) => pl.layout)

    const upList = layout.filter((p) => p.cls[0] === 'up')
    const procs = cpu.value.filter((c) => +c.device_id === +id && c.usage != null)
    const sys = mem.value.find((m) => +m.device_id === +id && m.cls === 'system') || mem.value.find((m) => +m.device_id === +id && !['virtual', 'buffers', 'cached', 'shared', 'swap'].includes(m.cls))
    const sens = sensors.value.filter((s) => +s.device_id === +id && !+s.sensor_deleted)
    const temps = sens.filter((s) => s.sensor_class === 'temperature').map((s) => +s.sensor_current).filter((v) => v > 0)
    const poeT = sens.find((s) => s.sensor_class === 'power' && /poe/i.test(s.sensor_descr) && /total|budget|avail|max/i.test(s.sensor_descr))
    const poeU = sens.find((s) => s.sensor_class === 'power' && /poe/i.test(s.sensor_descr) && /used|consum|draw/i.test(s.sensor_descr))
    return {
      device_id: +id, hostname: d.hostname, name: devName(d), ip: d.overwrite_ip || d.ip || (/^[\d.]+$|:/.test(d.hostname) ? d.hostname : ''), model: [d.hardware, d.version].filter(Boolean).join(' · '), down: +d.status === 0, uptime: n(d.uptime),
      ports: list, layout, plates, up: upList.length,
      rin: upList.reduce((s, p) => s + n(p.ifInOctets_rate) * 8, 0), rout: upList.reduce((s, p) => s + n(p.ifOutOctets_rate) * 8, 0),
      cpu: procs.length ? Math.round(procs.reduce((s, c) => s + +c.usage, 0) / procs.length) : null,
      mem: sys ? Math.round(+sys.perc) : null,
      temp: temps.length ? Math.round(Math.max(...temps)) : null,
      poe: poeT && poeU ? { used: Math.round(+poeU.sensor_current), total: Math.round(+poeT.sensor_current) } : null,
      // port connecté sous sa vitesse nominale probable (ex. 100 Mb/s sur un port gigabit) : câble ou équipement à vérifier
      slow: upList.filter((p) => n(p.ifSpeed) > 0 && n(p.ifSpeed) < 1e9 && list.some((q) => n(q.ifSpeed) >= 1e9)).length,
      errs: layout.filter((p) => p.cls[1] === 'err').length,
    }
  }).sort((a, b) => b.down - a.down || a.name.localeCompare(b.name))
})

watch(() => (loaded.value ? switches.value.length : null), (c) => c !== null && emit('count', c), { immediate: true })

const { error } = useLoader(async () => {
  // la façade n'attend que les ports ; CPU / RAM (agrégations plus lentes à froid) complètent ensuite
  D.cpu().then((c) => (cpu.value = c)).catch(() => {})
  D.memory().then((m) => (mem.value = m)).catch(() => {})
  const [p, d, s] = await Promise.all([D.ports(), devicesFor(props.config), D.sensors().catch(() => [])])
  ports.value = p; sensors.value = s
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
})
</script>

<style scoped>
.sw { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--border); }
.sw.down { border-color: var(--red); }
.sw.embedded { padding: 0; background: none; border: 0; }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.head a:hover { text-decoration: none; }
.plates { display: flex; flex-direction: column; gap: 6px; }
.plate { overflow-x: auto; padding: 10px; border-radius: 10px; background: linear-gradient(180deg, #1f2937, #111827); border: 1px solid #374151; }
[data-theme='light'] .plate { background: linear-gradient(180deg, #e5e7eb, #cbd5e1); border-color: #94a3b8; }
.plate.member { display: flex; align-items: center; gap: 10px; }
.mlabel { flex: none; width: 64px; color: #94a3b8; font-weight: 700; }
[data-theme='light'] .mlabel { color: #475569; }
.rows { display: grid; gap: 6px; width: max-content; }
.port { position: relative; width: 30px; height: 26px; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #0b1220; border: 2px solid #475569; color: #94a3b8; font-size: 10.5px; font-weight: 700; transition: transform .12s; }
.port:hover { transform: translateY(-1px); text-decoration: none; }
.port.up { border-color: var(--fill); color: #fff; background: color-mix(in srgb, var(--fill) 30%, #0b1220); }
.port.admin { background: repeating-linear-gradient(135deg, #1e293b 0 4px, #0b1220 4px 8px); border-color: #334155; color: #64748b; }
.port.err { box-shadow: 0 0 0 2px #f43f5e; }
.port .num { position: relative; z-index: 1; }
.port .u { position: absolute; left: 0; right: 0; bottom: 0; background: var(--fill); opacity: .55; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px 14px; }
.kpis div { display: flex; flex-direction: column; min-width: 0; }
.kpis span { font-size: 11px; color: var(--muted); }
.kpis b { font-size: 13.5px; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.kpis b.tr { flex-direction: column; align-items: flex-start; gap: 1px; }
.kpis b.tr span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; font-size: 12.5px; }
.kpis .warn b { color: var(--orange); } .kpis .crit b { color: var(--red); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.legend .lg-down { background: #0b1220; border: 2px solid #475569; }
.legend .lg-admin { background: repeating-linear-gradient(135deg, #64748b 0 2px, transparent 2px 4px); }
.legend .lg-err { background: transparent; box-shadow: 0 0 0 2px #f43f5e inset; }
</style>
