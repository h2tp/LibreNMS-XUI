<template>
  <div v-if="!loaded" class="col" style="gap:10px"><div class="skeleton" style="height:220px"></div></div>
  <div v-else-if="!nasList.length" class="empty small"><HardDriveDownload /><div>Aucun NAS{{ config.device || config.group ? ' pour ce filtre' : ' (équipement de type « stockage »)' }}</div></div>
  <div v-else class="col" style="gap:14px">
    <div v-for="n in nasList" :key="n.device_id" class="nas" :class="n.st">
      <router-link :to="`/device/${encodeURIComponent(n.hostname)}`" class="head">
        <span class="dot" :class="n.down ? 'down' : n.st === 'ok' ? 'up' : n.st === 'warn' ? 'warning' : 'down'"></span>
        <img v-if="n.icon" :src="n.icon" class="osi" @error="(e) => (e.target.style.display = 'none')" />
        <div class="grow" style="min-width:0">
          <b class="ellipsis" style="display:block">{{ n.name }}</b>
          <span class="small muted ellipsis" style="display:block">{{ n.model }}</span>
        </div>
        <span v-if="n.upgrade" class="badge info" title="Une mise à jour du système est disponible"><ArrowUpCircle :size="11" /> MAJ dispo</span>
        <span class="badge" :class="BADGE[n.st]">{{ n.headline }}</span>
      </router-link>

      <!-- volumes et RAID -->
      <div v-if="n.volumes.length || n.raids.length" class="col" style="gap:8px">
        <div v-for="v in n.volumes" :key="v.key" class="vol" :title="`${v.descr}\n${fmtBytes(v.used)} utilisés sur ${fmtBytes(v.size)}`">
          <div class="row small" style="gap:8px;min-width:0">
            <Database :size="14" class="faint" style="flex:none" />
            <b class="ellipsis">{{ v.name }}</b>
            <span v-if="v.raid" class="chip" :class="v.raid.st">{{ v.raid.label }}</span>
            <span class="grow"></span>
            <span class="muted nowrap">{{ fmtBytes(v.free) }} libres / {{ fmtBytes(v.size) }}</span>
            <b class="nowrap pct" :class="v.st">{{ v.perc }} %</b>
          </div>
          <div class="bar"><i :style="{ width: Math.max(1, v.perc) + '%', background: COL[v.st] }"></i></div>
        </div>
        <div v-if="n.otherRaids.length" class="row wrap small" style="gap:6px">
          <span v-for="r in n.otherRaids" :key="r.sensor_id" class="chip" :class="r.st">{{ r.sensor_descr }} : <b>{{ r.label }}</b></span>
        </div>
      </div>

      <!-- disques -->
      <table v-if="config.disks !== false && n.disks.length" class="dsk">
        <thead><tr><th>Disque</th><th>État</th><th>Santé</th><th>Temp.</th><th title="Secteurs défectueux">Secteurs déf.</th></tr></thead>
        <tbody>
          <tr v-for="d in n.disks" :key="d.key" :class="d.st">
            <td><div class="dn"><HardDrive :size="13" class="faint" /><b>{{ d.id }}</b><span class="muted small ellipsis">{{ d.model }}</span></div></td>
            <td><span v-if="d.status" :class="d.status.st">{{ d.status.label }}</span><span v-else class="faint">—</span></td>
            <td><span v-if="d.health" :class="d.health.st">{{ d.health.label }}</span><span v-else class="faint">—</span></td>
            <td class="nowrap" :class="d.tempSt">{{ d.temp !== null ? `${d.temp} °C` : '—' }}</td>
            <td :class="d.bad > 0 ? 'crit' : ''">{{ d.bad ?? '—' }}</td>
          </tr>
        </tbody>
      </table>

      <!-- système -->
      <div class="sys small">
        <span v-if="n.cpu !== null">CPU <b :class="lvl(n.cpu)">{{ n.cpu }} %</b></span>
        <span v-if="n.mem !== null">RAM <b :class="lvl(n.mem)">{{ n.mem }} %</b></span>
        <span v-if="n.sysTemp !== null"><Thermometer :size="12" /> <b :class="n.sysTempSt">{{ n.sysTemp }} °C</b></span>
        <span v-for="s in n.sysStates" :key="s.sensor_id" class="chip" :class="s.st">{{ s.short }} : <b>{{ s.label }}</b></span>
        <span v-if="n.uptime && !n.down" class="muted"><Clock :size="12" /> {{ fmtUptime(n.uptime) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { HardDriveDownload, HardDrive, Database, Thermometer, Clock, ArrowUpCircle } from 'lucide-vue-next'
import { D, devicesFor } from '../../dashboard/data'
import { interpretState } from '../../dashboard/states'
import { usefulVolumes, volumeName } from '../../dashboard/volumes'
import { useLoader } from '../../refresh'
import { devName, fmtBytes, fmtUptime, osIcon } from '../../utils'

const props = defineProps({ config: Object, size: Object })
const devices = ref([]); const sensors = ref([]); const storage = ref([]); const cpu = ref([]); const mem = ref([]); const loaded = ref(false)
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const BADGE = { ok: 'ok', warn: 'warning', crit: 'critical' }
const RANK = { crit: 0, warn: 1, unk: 2, ok: 3 }
const NAS_OS = /^(dsm|qnap|truenas|freenas|asustor|terramaster|readynas|netapp|nas4free|xigmanas|wd-?nas|drobo|buffalo)/i
const n0 = (v) => +v || 0
const lvl = (v) => (v >= 90 ? 'crit' : v >= 75 ? 'warn' : '')
const worst = (a, b) => (RANK[a] <= RANK[b] ? a : b)
const st3 = (st) => (st === 'unk' ? 'ok' : st)

const nasList = computed(() => {
  const warn = +(props.config.warn ?? 80); const crit = +(props.config.crit ?? 90)
  return devices.value.filter((d) => !+d.disabled && (d.type === 'storage' || NAS_OS.test(d.os || ''))
    && (!props.config.device || d.hostname === props.config.device)).map((d) => {
    const id = +d.device_id
    const sens = sensors.value.filter((s) => +s.device_id === id && !+s.sensor_deleted)
    const states = sens.filter((s) => s.sensor_class === 'state').map((s) => { const [label, st] = interpretState(s); return { ...s, label, st } })
    const isDisk = (s) => /disk|hdd|drive|disque|ssd|nvme/i.test(`${s.sensor_type} ${s.sensor_descr} ${s.group || ''}`)
    const isRaid = (s) => /raid|pool|volume/i.test(`${s.sensor_type} ${s.sensor_descr} ${s.group || ''}`)

    // disques : capteurs regroupés par libellé (« Disk 1 ST4000… » est commun à l'état, la santé, la température…)
    const dm = {}
    for (const s of sens.filter((x) => isDisk(x) && !isRaid(x))) {
      const k = s.sensor_descr
      const e = (dm[k] ||= { key: k, status: null, health: null, temp: null, bad: null, limit: null })
      if (s.sensor_class === 'state') {
        const t = states.find((x) => x.sensor_id === s.sensor_id)
        if (/health/i.test(s.sensor_type)) e.health = t; else e.status = t
      } else if (s.sensor_class === 'temperature') { e.temp = Math.round(n0(s.sensor_current)); e.limit = s.sensor_limit != null ? +s.sensor_limit : null }
      else if (s.sensor_class === 'count' && /bad|sector|secteur|realloc/i.test(`${s.group || ''} ${s.sensor_descr} ${s.sensor_type}`)) e.bad = n0(s.sensor_current)
    }
    const disks = Object.values(dm).map((e) => {
      const m = /^(\S+\s*\d+)\s*(.*)$/.exec(e.key) || [null, e.key, '']
      const tempSt = e.temp === null ? '' : e.limit !== null && e.temp >= e.limit ? 'crit' : e.temp >= 50 ? 'warn' : ''
      const st = [st3(e.status?.st || 'ok'), st3(e.health?.st || 'ok'), e.bad > 0 ? 'warn' : 'ok', tempSt || 'ok'].reduce(worst, 'ok')
      return { ...e, id: m[1], model: m[2], tempSt, st }
    }).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

    // RAID / volumes : on rapproche « Volume 1 » (état RAID) de « /volume1 » (occupation)
    const raids = states.filter((s) => isRaid(s) && !isDisk(s))
    const used = new Set()
    const volumes = usefulVolumes(storage.value.filter((v) => +v.device_id === id)).map((v) => {
      const perc = v.perc != null ? n0(v.perc) : Math.round((n0(v.used) / n0(v.size)) * 100)
      const key = String(v.descr).toLowerCase().replace(/[^a-z0-9]/g, '')
      const raid = raids.find((r) => String(r.sensor_descr).toLowerCase().replace(/[^a-z0-9]/g, '') === key.replace(/^volume/, 'volume'))
      if (raid) used.add(raid.sensor_id)
      return { key: v.storage_id, descr: v.descr, name: volumeName(v.descr), perc, used: n0(v.used), free: n0(v.free), size: n0(v.size),
        st: perc >= crit ? 'crit' : perc >= warn ? 'warn' : 'ok', raid: raid ? { label: raid.label, st: st3(raid.st) } : null }
    }).sort((a, b) => b.size - a.size)
    const otherRaids = raids.filter((r) => !used.has(r.sensor_id)).map((r) => ({ ...r, st: st3(r.st) }))

    const upgradeS = states.find((s) => /upgrade/i.test(s.sensor_type))
    const sysStates = states.filter((s) => !isDisk(s) && !isRaid(s) && s !== upgradeS)
      .map((s) => ({ ...s, st: st3(s.st), short: s.sensor_descr.replace(/^FAN\s*-\s*/i, 'Ventil. ').replace(/^System$/i, 'Système').replace(/^Power$/i, 'Alimentation') }))
    const sysT = sens.find((s) => s.sensor_class === 'temperature' && !isDisk(s))
    const procs = cpu.value.filter((c) => +c.device_id === id && c.usage != null)
    const sys = mem.value.find((m) => +m.device_id === id && m.cls === 'system')
    const down = +d.status === 0
    const sysTemp = sysT ? Math.round(n0(sysT.sensor_current)) : null
    const sysTempSt = sysT && sysT.sensor_limit != null && sysTemp >= +sysT.sensor_limit ? 'crit' : ''
    let st = [...sysStates.map((s) => s.st), ...otherRaids.map((r) => r.st), ...volumes.map((v) => v.st), ...volumes.map((v) => v.raid?.st || 'ok'), ...disks.map((x) => x.st), sysTempSt || 'ok'].reduce(worst, 'ok')
    if (down) st = 'crit'
    const firstBad = [...volumes.filter((v) => v.raid && v.raid.st !== 'ok').map((v) => `${v.name} : ${v.raid.label}`),
      ...otherRaids.filter((r) => r.st !== 'ok').map((r) => `${r.sensor_descr} : ${r.label}`),
      ...disks.filter((x) => x.st !== 'ok').map((x) => `${x.id} : ${x.health?.st !== 'ok' && x.health ? x.health.label : x.status?.st !== 'ok' && x.status ? x.status.label : x.bad > 0 ? 'secteurs défectueux' : 'chaud'}`),
      ...volumes.filter((v) => v.st !== 'ok').map((v) => `${v.name} plein à ${v.perc} %`)][0]
    return {
      device_id: id, hostname: d.hostname, name: devName(d), icon: osIcon(d), down, st,
      model: [d.hardware, d.version].filter(Boolean).join(' · '), uptime: n0(d.uptime),
      headline: down ? 'Injoignable' : firstBad || (st === 'ok' ? 'Tout va bien' : 'À surveiller'),
      upgrade: upgradeS && upgradeS.st === 'warn', volumes, otherRaids, disks, sysStates,
      cpu: !down && procs.length ? Math.round(procs.reduce((s, c) => s + n0(c.usage), 0) / procs.length) : null,
      mem: !down && sys ? Math.round(n0(sys.perc)) : null, sysTemp, sysTempSt,
    }
  }).sort((a, b) => RANK[a.st] - RANK[b.st] || a.name.localeCompare(b.name))
})

useLoader(async () => {
  D.cpu().then((x) => (cpu.value = x)).catch(() => {})
  D.memory().then((x) => (mem.value = x)).catch(() => {})
  D.storage().then((x) => (storage.value = x)).catch(() => {})
  const [d, s] = await Promise.all([devicesFor(props.config), D.sensors()])
  devices.value = d; sensors.value = s
  loaded.value = true
})
</script>

<style scoped>
.nas { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); }
.nas.warn { border-top-color: var(--orange); } .nas.crit { border-top-color: var(--red); }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--text); }
.head:hover { text-decoration: none; }
.osi { width: 24px; height: 24px; flex: none; }
.vol { display: flex; flex-direction: column; gap: 6px; }
.pct { min-width: 42px; text-align: right; font-variant-numeric: tabular-nums; }
.pct.warn, .dsk td.warn, .dsk td .warn { color: var(--orange); }
.pct.crit, .dsk td.crit, .dsk td .crit { color: var(--red); }
.chip { font-size: 11px; padding: 2px 8px; border-radius: 20px; background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--muted); white-space: nowrap; }
.chip b { color: var(--green); font-weight: 600; }
.chip.ok { color: var(--green); }
.chip.warn { background: color-mix(in srgb, var(--orange) 16%, transparent); color: var(--orange); } .chip.warn b { color: var(--orange); }
.chip.crit { background: color-mix(in srgb, var(--red) 16%, transparent); color: var(--red); } .chip.crit b { color: var(--red); }
.dsk { width: 100%; border-collapse: collapse; font-size: 12px; }
.dsk th { text-align: left; font-weight: 500; color: var(--muted); font-size: 11px; padding: 3px 6px; border-bottom: 1px solid var(--border); }
.dsk td { padding: 5px 6px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.dsk td .ok { color: var(--green); }
.dsk tr.crit td:first-child { box-shadow: inset 3px 0 var(--red); } .dsk tr.warn td:first-child { box-shadow: inset 3px 0 var(--orange); }
.dn { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sys { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding-top: 8px; border-top: 1px solid var(--border); color: var(--muted); }
.sys > span { display: inline-flex; align-items: center; gap: 4px; }
.sys b { color: var(--text); } .sys b.warn { color: var(--orange); } .sys b.crit { color: var(--red); }
</style>
