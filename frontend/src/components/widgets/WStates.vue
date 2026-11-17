<template>
  <div v-if="loaded && !cards.length" class="empty small"><ListChecks /><div>{{ t('Aucun capteur d\'état') }}{{ filtered ? t(' pour ce filtre') : '' }}</div></div>

  <!-- tableau croisé : une ligne par équipement, une colonne par capteur -->
  <div v-else-if="mode === 'matrix'" class="matrix-wrap">
    <table class="matrix">
      <thead><tr><th>{{ t('Équipement') }}</th><th v-for="c in columns" :key="c" :title="c">{{ short(c) }}</th></tr></thead>
      <tbody>
        <tr v-for="c in cards" :key="c.dev.device_id">
          <td><router-link :to="link(c.dev)" class="dev"><span class="dot" :class="c.dev.status ? c.worst : 'crit'"></span><span class="ellipsis">{{ name(c.dev) }}</span></router-link></td>
          <td v-for="col in columns" :key="col">
            <span v-if="c.by[col]" class="pill" :class="c.by[col].st" :title="tip(c.by[col])">{{ c.by[col].label }}</span>
            <span v-else class="faint">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- liste : une ligne par capteur, anomalies en tête -->
  <div v-else-if="mode === 'list'" class="list">
    <router-link v-for="s in flat" :key="s.sensor_id" :to="link(s.dev)" class="list-row" :title="tip(s)">
      <span class="dot" :class="s.st === 'crit' || s.st === 'warn' ? s.st : s.dev.status ? 'ok' : 'crit'"></span>
      <b class="ellipsis dev-n">{{ name(s.dev) }}</b>
      <span class="ellipsis muted grow">{{ s.sensor_descr }}</span>
      <span class="pill" :class="s.st">{{ s.label }}</span>
    </router-link>
  </div>

  <!-- tuiles compactes (écran mural) : nom de l'équipement et ses états abrégés -->
  <div v-else-if="mode === 'tiles'" class="tiles">
    <router-link v-for="c in cards" :key="c.dev.device_id" :to="link(c.dev)" class="tile" :class="c.dev.status ? c.worst : 'crit'">
      <b class="ellipsis">{{ name(c.dev) }}</b>
      <div class="chips">
        <span v-for="s in c.rows" :key="s.sensor_id" class="chip" :class="s.st" :title="tip(s)"><small>{{ short(s.sensor_descr) }}</small> {{ s.label }}</span>
      </div>
    </router-link>
  </div>

  <!-- cartes (défaut) -->
  <div v-else class="cards">
    <div v-for="c in cards" :key="c.dev.device_id" class="card-st" :class="c.dev.status ? c.worst : 'crit'">
      <router-link :to="link(c.dev)" class="head">
        <span class="dot" :class="c.dev.status ? c.worst : 'crit'"></span>
        <b class="ellipsis">{{ name(c.dev) }}</b>
        <span v-if="!c.dev.status" class="badge critical">{{ t('Hors ligne') }}</span>
      </router-link>
      <div v-for="s in c.rows" :key="s.sensor_id" class="row-st" :title="tip(s)">
        <span class="ellipsis muted">{{ s.sensor_descr }}</span>
        <span class="pill" :class="s.st">{{ s.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ListChecks } from 'lucide-vue-next'
import { D, devicesFor } from '../../dashboard/data'
import { stateTrApi } from '../../api'
import { useLoader } from '../../refresh'
import { devName } from '../../utils'
import { stateLabel } from '../../dashboard/states'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devs = ref([]); const tr = ref(null); const loaded = ref(false)
// ordre d'affichage des capteurs ; seuls crit / warn colorent l'équipement (passif ou inconnu = normal)
const RANK = { crit: 0, warn: 1, unk: 2, stby: 3, ok: 4 }
const bad = (st) => st === 'crit' || st === 'warn'

const mode = computed(() => props.config.mode || 'cards')
// sélection explicite [{ h: hostname, n: nom affiché }] ; ancienne config : un seul équipement (device)
const picks = computed(() => (props.config.devices?.length ? props.config.devices : props.config.device ? [{ h: props.config.device, n: '' }] : []))
const order = computed(() => Object.fromEntries(picks.value.map((x, i) => [x.h, i])))
const alias = computed(() => Object.fromEntries(picks.value.filter((x) => x.n).map((x) => [x.h, x.n])))
const name = (d) => alias.value[d.hostname] || devName(d)
const filtered = computed(() => !!(picks.value.length || props.config.group || props.config.devtype || props.config.filter || only.value))
const re = computed(() => {
  const f = String(props.config.filter || '').trim()
  if (!f) return null
  try { return new RegExp(f, 'i') } catch { return new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
})
// capteurs cochés (par description) ; vide = tous
const only = computed(() => (props.config.sensors?.length ? new Set(props.config.sensors) : null))
// « High Availability Local Status » -> « HA Local », « Panorama Server 1 » -> « Panorama 1 »
const short = (d) => String(d || '').replace(/high availability/i, 'HA').replace(/\s+(status|state)$/i, '').replace(/\bserver\s+/i, '').trim()
const tip = (s) => `${s.sensor_descr}\n${t('valeur {v}', { v: s.sensor_current })} (${s.sensor_type})`

const cards = computed(() => {
  const byDev = {}
  for (const d of devs.value) {
    if (+d.disabled) continue
    if (picks.value.length) { if (!(d.hostname in order.value)) continue }
    else if (props.config.devtype && d.type !== props.config.devtype) continue
    byDev[d.device_id] = { dev: d, rows: [] }
  }
  for (const s of all.value) {
    const c = byDev[s.device_id]
    if (!c || s.sensor_class !== 'state' || +s.sensor_deleted) continue
    if (only.value && !only.value.has(s.sensor_descr)) continue
    if (re.value && !re.value.test(`${s.sensor_descr} ${s.sensor_type}`)) continue
    const [label, st] = stateLabel(s, tr.value) || [t('État {v}', { v: s.sensor_current }), 'unk']
    c.rows.push({ ...s, label, st, dev: c.dev })
  }
  return Object.values(byDev)
    .map((c) => {
      const rows = c.rows.sort((a, b) => String(a.sensor_descr).localeCompare(String(b.sensor_descr), undefined, { numeric: true }))
      const worst = rows.find((r) => r.st === 'crit') ? 'crit' : rows.find((r) => r.st === 'warn') ? 'warn' : 'ok'
      return { ...c, rows, worst, by: Object.fromEntries(rows.map((r) => [r.sensor_descr, r])) }
    })
    .filter((c) => c.rows.length && (!props.config.onlyAlarm || !c.dev.status || c.worst !== 'ok'))
    .sort(picks.value.length
      ? (a, b) => order.value[a.dev.hostname] - order.value[b.dev.hostname]  // ordre choisi
      : (a, b) => (+!!a.dev.status - +!!b.dev.status) || RANK[a.worst] - RANK[b.worst] || name(a.dev).localeCompare(name(b.dev)))
})

const columns = computed(() => [...new Set(cards.value.flatMap((c) => c.rows.map((r) => r.sensor_descr)))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))

const flat = computed(() => cards.value.flatMap((c) => c.rows)
  .filter((s) => !props.config.onlyAlarm || bad(s.st) || !s.dev.status)
  .sort((a, b) => (bad(a.st) ? 0 : 1) - (bad(b.st) ? 0 : 1) || RANK[a.st] - RANK[b.st] || (picks.value.length ? order.value[a.dev.hostname] - order.value[b.dev.hostname] : name(a.dev).localeCompare(name(b.dev))) || String(a.sensor_descr).localeCompare(String(b.sensor_descr))))

const link = (d) => `/device/${encodeURIComponent(d.hostname)}/health`

useLoader(async () => {
  // équipements choisis un par un : le filtre de groupe ne s'applique pas
  const [s, d, x] = await Promise.all([D.sensors(), picks.value.length ? D.devices() : devicesFor(props.config), stateTrApi.get()])
  all.value = s; devs.value = d; tr.value = x
  loaded.value = true
})
</script>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.card-st { padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); border-left: 3px solid var(--green); display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.card-st.warn, .tile.warn { border-left-color: var(--orange); }
.card-st.crit, .tile.crit { border-left-color: var(--red); background: color-mix(in srgb, var(--red) 8%, var(--panel-2)); }
.head { display: flex; align-items: center; gap: 8px; color: var(--text); min-width: 0; margin-bottom: 2px; }
.head:hover, .dev:hover { text-decoration: none; color: var(--accent); }
.dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
.dot.warn { background: var(--orange); } .dot.crit { background: var(--red); }
.row-st { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; min-width: 0; }

/* pastilles : vert normal, jaune passif, orange avertissement, rouge critique, gris neutre */
.pill, .chip { flex: none; font-weight: 700; font-size: 12px; padding: 2px 9px; border-radius: 999px; white-space: nowrap; color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent); }
.pill.stby, .chip.stby { color: color-mix(in srgb, var(--yellow) 75%, var(--text)); background: color-mix(in srgb, var(--yellow) 18%, transparent); }
.pill.warn, .chip.warn { color: var(--orange); background: color-mix(in srgb, var(--orange) 14%, transparent); }
.pill.crit, .chip.crit { color: var(--red); background: color-mix(in srgb, var(--red) 14%, transparent); }
.pill.unk, .chip.unk { color: var(--muted); background: color-mix(in srgb, var(--gray) 18%, transparent); }

.matrix-wrap { overflow: auto; height: 100%; }
.matrix { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.matrix th { position: sticky; top: 0; background: var(--panel-solid); text-align: left; font-weight: 600; color: var(--muted); padding: 6px 8px; white-space: nowrap; border-bottom: 1px solid var(--border); }
.matrix td { padding: 6px 8px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.matrix tr:hover td { background: var(--panel-2); }
.dev { display: flex; align-items: center; gap: 8px; color: var(--text); max-width: 240px; font-weight: 600; }

.list { display: flex; flex-direction: column; gap: 2px; }
.list-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; color: var(--text); font-size: 12.5px; min-width: 0; }
.list-row:hover { text-decoration: none; background: var(--panel-2); }
.dev-n { flex: 0 1 200px; }
.grow { flex: 1; }

.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.tile { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); border-left: 3px solid var(--green); color: var(--text); min-width: 0; }
.tile:hover { text-decoration: none; border-color: var(--accent); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11px; padding: 1px 7px; }
.chip small { font-weight: 500; opacity: .75; }
</style>
