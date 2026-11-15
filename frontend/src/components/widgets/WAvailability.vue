<template>
  <div>
    <div class="row small muted mb2">
      <span class="row"><span class="dot up"></span>{{ c.up }}</span>
      <span class="row"><span class="dot down"></span>{{ c.down }}</span>
      <span v-if="c.disabled + c.ignored" class="row"><span class="dot disabled"></span>{{ c.disabled + c.ignored }}</span>
      <span v-if="config.color === 'latency'" class="lat-legend">
        <i v-for="l in LAT" :key="l.max" :style="{ background: l.color }" :title="l.max === Infinity ? `≥ ${LAT.at(-2).max} ms` : `< ${l.max} ms`"></i>
        <span class="faint">{{ t('latence') }}</span>
      </span>
    </div>

    <!-- synthèse : barre proportionnelle + équipements hors ligne -->
    <template v-if="mode === 'summary'">
      <div class="sumbar">
        <i v-for="s in sumParts" :key="s.k" :class="s.k" :style="{ flexGrow: s.n }" :title="`${s.l} : ${s.n}`"><span v-if="s.pct >= 8">{{ s.n }}</span></i>
      </div>
      <div class="row small muted sumlbl">
        <span v-for="s in sumParts" :key="s.k">{{ s.l }} <b>{{ s.pct }} %</b></span>
      </div>
      <div v-if="!downList.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>{{ t('Tous les équipements sont en ligne') }}</div></div>
      <div v-else class="list">
        <router-link v-for="d in downList" :key="d.device_id" :to="devLink(d)" class="lrow">
          <span class="dot down"></span><b class="ellipsis">{{ devName(d) }}</b><span class="mono faint ellipsis">{{ d.ip || d.hostname }}</span>
          <span class="small muted ellipsis grow-r">{{ d.status_reason || t('Hors ligne') }}</span>
        </router-link>
      </div>
    </template>

    <div v-else-if="!shown.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>{{ devices.length ? t('Tous les équipements sont en ligne') : t('Aucun équipement') }}</div></div>

    <template v-else>
      <section v-for="g in groups" :key="g.key" class="grp">
        <div v-if="config.groupBy" class="ghead small">
          <b class="ellipsis">{{ g.label }}</b><span class="faint">{{ g.items.length }}</span>
          <span v-if="g.down" class="badge critical">{{ t('{n} hors ligne', { n: g.down }) }}</span>
        </div>

        <!-- liste -->
        <div v-if="mode === 'list'" class="list">
          <router-link v-for="d in g.items" :key="d.device_id" :to="devLink(d)" class="lrow">
            <span class="dot" :class="devStatus(d)"></span><b class="ellipsis">{{ devName(d) }}</b>
            <span class="mono faint ellipsis">{{ d.ip || d.hostname }}</span>
            <span class="small muted ellipsis">{{ d.type || d.os }}</span>
            <span class="small mono nowrap r" :style="{ color: devStatus(d) === 'up' ? latColor(d) : '' }">{{ devStatus(d) === 'up' ? latTxt(d) : '' }}</span>
            <span class="small muted nowrap r">{{ devStatus(d) === 'up' ? fmtUptime(d.uptime) : statusLabel[devStatus(d)] }}</span>
          </router-link>
        </div>

        <!-- cartes détaillées -->
        <div v-else-if="mode === 'cards'" class="cards">
          <router-link v-for="d in g.items" :key="d.device_id" :to="devLink(d)" class="card-d" :class="devStatus(d)" :style="{ '--c': tileColor(d) }" :title="tip(d)">
            <div class="row" style="gap:7px;min-width:0">
              <img v-if="osIcon(d)" :src="osIcon(d)" alt="" class="os" /><b class="ellipsis">{{ devName(d) }}</b>
            </div>
            <span class="mono small ellipsis sub">{{ d.ip || d.hostname }}</span>
            <span class="small ellipsis sub">
              <template v-if="devStatus(d) === 'up'">{{ latTxt(d) }} · {{ fmtUptime(d.uptime) }}</template>
              <template v-else>{{ d.status_reason || statusLabel[devStatus(d)] }}</template>
            </span>
          </router-link>
        </div>

        <!-- tuiles, carrés compacts, hexagones -->
        <div v-else class="avail" :class="mode">
          <router-link v-for="d in g.items" :key="d.device_id" :to="devLink(d)" class="tile" :class="devStatus(d)" :style="{ '--c': tileColor(d) }" :title="tip(d)">
            <span v-if="mode === 'tiles'" class="ellipsis">{{ devName(d) }}</span>
          </router-link>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, devStatus, statusLabel, fmtUptime, osIcon } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const devices = ref([])
const mode = computed(() => props.config.mode || 'tiles')
const order = { down: 0, up: 1, ignored: 2, disabled: 3 }
const devLink = (d) => `/device/${encodeURIComponent(d.hostname)}`

// couleur selon la latence (équipements en ligne) ; hors ligne / désactivé : couleurs d'état
const LAT = [
  { max: 10, color: '#16a34a' }, { max: 30, color: '#65a30d' }, { max: 80, color: '#ca8a04' }, { max: 150, color: '#ea580c' }, { max: Infinity, color: '#b91c1c' },
]
const lat = (d) => (d.last_ping_timetaken === null || d.last_ping_timetaken === undefined || d.last_ping_timetaken === '' ? null : +d.last_ping_timetaken)
const latColor = (d) => { const v = lat(d); return v === null ? '' : LAT.find((l) => v < l.max).color }
const latTxt = (d) => { const v = lat(d); return v === null ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)} ms` }
const STATUS_COL = { up: '#16a34a', down: '#e11d48', disabled: '#64748b', ignored: '#64748b' }
function tileColor(d) {
  const st = devStatus(d)
  if (st === 'up' && props.config.color === 'latency') return latColor(d) || STATUS_COL.up
  return STATUS_COL[st] || STATUS_COL.disabled
}
const tip = (d) => [`${devName(d)} — ${statusLabel[devStatus(d)]}`, d.ip || d.hostname, devStatus(d) === 'up' ? `${t('Latence')} ${latTxt(d)} · ${t('Uptime')} ${fmtUptime(d.uptime)}` : d.status_reason, d.location].filter(Boolean).join('\n')

const shown = computed(() => devices.value
  .filter((d) => !props.config.hideUp || devStatus(d) !== 'up')
  .sort((a, b) => order[devStatus(a)] - order[devStatus(b)] || devName(a).localeCompare(devName(b))))

// regroupement : emplacement, type ou OS ; les groupes avec des équipements hors ligne d'abord
const GROUP_KEY = { location: (d) => d.location, type: (d) => d.type, os: (d) => d.os }
const groups = computed(() => {
  const by = props.config.groupBy
  if (!by || !GROUP_KEY[by]) return [{ key: '*', label: '', items: shown.value, down: 0 }]
  const m = new Map()
  for (const d of shown.value) {
    const k = GROUP_KEY[by](d) || ''
    if (!m.has(k)) m.set(k, { key: k || '—', label: k || t('Non défini'), items: [], down: 0 })
    const g = m.get(k); g.items.push(d); if (devStatus(d) === 'down') g.down++
  }
  return [...m.values()].sort((a, b) => (b.down > 0) - (a.down > 0) || (a.label === t('Non défini')) - (b.label === t('Non défini')) || a.label.localeCompare(b.label))
})

const c = computed(() => {
  const r = { up: 0, down: 0, disabled: 0, ignored: 0 }
  devices.value.forEach((d) => r[devStatus(d)]++)
  return r
})
const sumParts = computed(() => {
  const tot = devices.value.length || 1
  return [['up', t('En ligne'), c.value.up], ['down', t('Hors ligne'), c.value.down], ['disabled', t('Désactivés'), c.value.disabled + c.value.ignored]]
    .filter(([, , n]) => n > 0).map(([k, l, n]) => ({ k, l, n, pct: Math.round((n / tot) * 1000) / 10 }))
})
const downList = computed(() => shown.value.filter((d) => devStatus(d) === 'down'))

useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>

<style scoped>
.mb2 { margin-bottom: 10px; gap: 14px; flex-wrap: wrap; }
.lat-legend { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; }
.lat-legend i { width: 12px; height: 8px; border-radius: 2px; }
.lat-legend .faint { margin-left: 5px; }
.grp + .grp { margin-top: 12px; }
.ghead { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border); min-width: 0; }

/* tuiles, carrés, hexagones */
.avail { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.avail.compact { grid-template-columns: repeat(auto-fill, 20px); gap: 4px; }
.avail.hex { grid-template-columns: repeat(auto-fill, 26px); gap: 3px 2px; }
.tile { display: flex; align-items: center; min-width: 0; padding: 6px 9px; border-radius: 8px; font-size: 12px; font-weight: 600; color: #fff; background: var(--c, #16a34a); transition: transform .15s, filter .15s; }
.tile:hover { text-decoration: none; transform: translateY(-1px); filter: brightness(1.15); }
/* tuiles avec nom : teinte douce de la couleur d'état plutôt qu'un aplat ; hors ligne plus marqué */
.tiles .tile { color: var(--text); font-weight: 600; background: color-mix(in srgb, var(--c) 16%, var(--panel-2));
  border: 1px solid color-mix(in srgb, var(--c) 40%, var(--border)); border-left: 4px solid var(--c); padding: 5px 8px; }
.tiles .tile:hover { filter: none; background: color-mix(in srgb, var(--c) 26%, var(--panel-2)); }
.tiles .tile.down { background: color-mix(in srgb, var(--c) 34%, var(--panel-2)); border-color: var(--c); }
.tiles .tile.disabled, .tiles .tile.ignored { color: var(--muted); }
.compact .tile { width: 20px; height: 20px; padding: 0; border-radius: 5px; }
.hex .tile { width: 26px; height: 30px; padding: 0; border-radius: 0; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
.tile.down { animation: pulse 2s infinite; }
@keyframes pulse { 50% { filter: brightness(1.3); } }

/* cartes détaillées */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.card-d { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 8px 10px; border-radius: 10px; color: var(--text);
  background: color-mix(in srgb, var(--c) 12%, var(--panel-2)); border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border)); border-left: 4px solid var(--c); transition: transform .15s; }
.card-d:hover { text-decoration: none; transform: translateY(-1px); }
.card-d.down { animation: pulse 2s infinite; }
.card-d .os { width: 16px; height: 16px; flex: none; }
.card-d .sub { color: var(--muted); }

/* liste */
.list { display: flex; flex-direction: column; }
.lrow { display: grid; grid-template-columns: 10px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, .8fr) 64px 80px; gap: 10px; align-items: center;
  padding: 6px 4px; border-bottom: 1px solid var(--border); color: var(--text); font-size: 12.5px; }
.lrow:hover { text-decoration: none; background: var(--panel-2); }
.lrow .r { text-align: right; }
.list .lrow:has(.grow-r) { grid-template-columns: 10px minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.4fr); }

/* synthèse */
.sumbar { display: flex; height: 26px; border-radius: 8px; overflow: hidden; gap: 2px; }
.sumbar i { display: flex; align-items: center; justify-content: center; min-width: 4px; color: #fff; font-style: normal; font-size: 12px; font-weight: 700; }
.sumbar i.up { background: #16a34a; } .sumbar i.down { background: #e11d48; } .sumbar i.disabled { background: #64748b; }
.sumlbl { gap: 14px; margin: 6px 0 10px; flex-wrap: wrap; }
</style>
