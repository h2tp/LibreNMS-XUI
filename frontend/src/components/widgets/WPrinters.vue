<template>
  <div v-if="loaded && !cards.length" class="empty small">
    <Printer /><div>{{ anyPrinter ? 'Aucune imprimante en défaut ✨' : 'Aucune imprimante dans LibreNMS' }}</div>
  </div>
  <div v-else class="cards">
    <router-link v-for="c in cards" :key="c.device_id" :to="link(c)" class="prn" :class="c.st">
      <div class="head">
        <span class="dot" :class="c.st === 'ok' ? 'up' : c.st === 'warn' ? 'warning' : 'down'"></span>
        <div style="min-width:0" class="grow">
          <b class="ellipsis" style="display:block">{{ c.name }}</b>
          <span class="small muted ellipsis" style="display:block">{{ c.model }}</span>
        </div>
        <span class="badge" :class="BADGE[c.st]">{{ c.headline }}</span>
      </div>

      <div v-if="c.supplies.length" class="col" style="gap:8px">
        <div v-for="s in c.supplies" :key="s.key" class="sup" :title="s.tip">
          <div class="row small" style="gap:8px">
            <span class="sw" :style="{ background: s.color }"></span>
            <span class="grow ellipsis">{{ s.label }}</span>
            <b class="nowrap" :class="s.st">{{ s.text }}</b>
          </div>
          <div class="bar"><i :style="{ width: Math.max(1, s.value ?? 0) + '%', background: s.st === 'crit' ? 'var(--red)' : s.st === 'warn' ? 'var(--orange)' : s.color }"></i></div>
        </div>
      </div>
      <div v-else class="small faint">Niveaux des consommables non remontés</div>

      <div v-if="c.life !== null" class="pages small">
        <Files :size="14" class="faint" />
        <span><b>{{ fmtN(c.life) }}</b> pages au total</span>
        <span v-if="c.month !== null" class="muted">· {{ fmtN(c.month) }} sur 30 j</span>
      </div>
    </router-link>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Printer, Files } from 'lucide-vue-next'
import { session, rrd } from '../../api'
import { D, devicesFor, cached } from '../../dashboard/data'
import { interpretState } from '../../dashboard/states'
import { useLoader } from '../../refresh'
import { devName } from '../../utils'
import { locale } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const printers = ref([]); const sensors = ref([]); const devById = ref({}); const loaded = ref(false)
const months = ref({})
const BADGE = { ok: 'ok', warn: 'warning', crit: 'critical' }
const RANK = { crit: 0, warn: 1, ok: 2 }

// Types de consommables de la Printer-MIB (prtMarkerSuppliesType) ; « input » = bac papier
const TYPES = {
  toner: ['Toner', '#1e293b'], tonerCartridge: ['Cartouche de toner', '#1e293b'], ink: ['Encre', '#1e293b'], inkCartridge: ['Cartouche d\'encre', '#1e293b'],
  opc: ['Tambour', '#8b5cf6'], developer: ['Développeur', '#0ea5e9'], fuser: ['Unité de fusion', '#f97316'], fuserOil: ['Huile de fusion', '#f97316'],
  transferUnit: ['Unité de transfert', '#14b8a6'], wasteToner: ['Bac de toner usagé', '#64748b'], wasteInk: ['Bac d\'encre usagée', '#64748b'],
  cleanerUnit: ['Unité de nettoyage', '#64748b'], staples: ['Agrafes', '#94a3b8'], ribbonWax: ['Ruban', '#1e293b'], markerSupply: ['Consommable', '#64748b'],
  input: ['Bac papier', '#22c55e'],
}
const ORDER = ['toner', 'tonerCartridge', 'ink', 'inkCartridge', 'opc', 'developer', 'fuser', 'transferUnit', 'wasteToner', 'wasteInk', 'input']

const anyPrinter = computed(() => printers.value.length > 0)
const cards = computed(() => {
  const low = +(props.config.low ?? 15)
  return printers.value.filter((p) => devById.value[p.device_id] && (!props.config.device || p.hostname === props.config.device)).map((p) => {
    const d = devById.value[p.device_id]
    const sens = sensors.value.filter((s) => +s.device_id === +p.device_id && !+s.sensor_deleted)
    const states = sens.filter((s) => s.sensor_class === 'state').map((s) => { const [label, st] = interpretState(s); return { ...s, label, st } })
    const sameType = (t) => p.supplies.filter((x) => x.type === t).length
    const supplies = p.supplies.filter((x) => props.config.paper !== false || x.type !== 'input')
      .sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99) || a.index - b.index)
      .map((x) => {
        const [lbl, color] = TYPES[x.type] || [x.type, '#64748b']
        const label = sameType(x.type) > 1 ? `${lbl} ${x.index}` : lbl
        const waste = /^waste/.test(x.type)
        const v = x.value
        // un bac de récupération est « plein » quand le niveau restant est bas, comme les autres consommables
        const st = v === null ? 'ok' : v <= Math.max(1, low / 3) ? 'crit' : v <= low ? 'warn' : 'ok'
        const approx = v === 50 && (x.type === 'input' || d.os === 'brother')
        const text = v === null ? '—' : x.type === 'input' && v === 50 ? 'papier présent' : `${approx ? '≈ ' : ''}${Math.round(v)} %`
        const tip = approx ? `${label} : l'imprimante indique seulement qu'il en reste (LibreNMS affiche alors 50 %).` : `${label} : ${text}${waste ? ' de capacité restante' : ''}`
        return { key: `${x.type}-${x.index}`, label, color: color === '#1e293b' ? 'var(--text)' : color, value: v, st: x.type === 'input' ? (v === 0 ? 'crit' : 'ok') : st, text, tip }
      })
    // compteur total de pages : « LifeCount » (Printer-MIB) ou libellé constructeur (« Total pages »…), hors compteur depuis la mise sous tension
    const counts = sens.filter((s) => s.sensor_class === 'count' && !/power|since|depuis/i.test(`${s.sensor_type} ${s.sensor_descr}`))
    const life = counts.find((s) => /life|total/i.test(`${s.sensor_type} ${s.sensor_descr}`)) || counts.find((s) => /page|sheet|impression/i.test(s.sensor_descr || ''))
    let st = [...states.map((s) => s.st).filter((x) => x !== 'unk'), ...supplies.map((s) => s.st)].reduce((a, b) => (RANK[a] <= RANK[b] ? a : b), 'ok')
    if (+d.status === 0) st = 'crit'
    const err = states.find((s) => s.sensor_type === 'hrPrinterDetectedErrorState' && s.st !== 'ok')
    const lowSup = supplies.find((s) => s.st !== 'ok')
    const headline = +d.status === 0 ? 'Injoignable' : err ? err.label : states.find((s) => s.st === 'crit')?.label
      || (lowSup ? (lowSup.st === 'crit' ? `${lowSup.label} vide` : `${lowSup.label} bas`) : 'Prête')
    return {
      device_id: p.device_id, hostname: p.hostname, name: devName(d), model: [d.hardware, d.serial ? `n° ${d.serial}` : ''].filter(Boolean).join(' · '),
      supplies, st, headline, life: life ? +life.sensor_current : null, lifeSensor: life, month: months.value[p.device_id] ?? null,
    }
  }).filter((c) => !props.config.onlyAlarm || c.st !== 'ok').sort((a, b) => RANK[a.st] - RANK[b.st] || a.name.localeCompare(b.name))
})

const fmtN = (v) => Math.round(v).toLocaleString(locale)
const link = (c) => `/device/${encodeURIComponent(c.hostname)}/health`

// Pages imprimées sur 30 jours = écart du compteur total dans son RRD
async function loadMonths() {
  if (!session.rrd) return
  for (const c of cards.value) {
    if (!c.lifeSensor) continue
    const s = c.lifeSensor
    const file = `sensor-count-${s.sensor_type}-${s.sensor_index}.rrd`
    try {
      const r = await cached(`pages:${c.hostname}:${file}`, () => rrd.data(c.hostname, file, { start: '-30d', rows: 60 }), 600000)
      const v = Object.values(r.series)[0].filter((x) => x !== null)
      if (v.length > 1) months.value = { ...months.value, [c.device_id]: Math.max(0, v[v.length - 1] - v[0]) }
    } catch { /* fichier absent */ }
  }
}

useLoader(async () => {
  const [p, s, d] = await Promise.all([D.printers(), D.sensors(), devicesFor(props.config)])
  printers.value = p; sensors.value = s
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
  loadMonths()
})
</script>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.prn { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--panel-2); border: 1px solid var(--border); border-top: 3px solid var(--green); color: var(--text); min-width: 0; }
.prn:hover { text-decoration: none; filter: brightness(1.08); }
.prn.warn { border-top-color: var(--orange); }
.prn.crit { border-top-color: var(--red); background: color-mix(in srgb, var(--red) 8%, var(--panel-2)); }
.head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.sup .sw { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.sup b { font-variant-numeric: tabular-nums; }
.sup b.warn { color: var(--orange); } .sup b.crit { color: var(--red); }
.pages { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--border); }
</style>
