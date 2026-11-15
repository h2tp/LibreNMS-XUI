<template>
  <!-- anneau, camembert, demi-anneau (ECharts) -->
  <div v-if="['donut', 'pie', 'half'].includes(mode)" class="col" style="height:100%;gap:4px">
    <EChart :option="option" :height="`${Math.max(120, size.h - 34)}px`" @click="(p) => p.data?.key && $router.push(`/devices?status=${p.data.key}`)" />
    <div class="legend-row">
      <span v-for="s in shownItems" :key="s.key" class="row small"><i class="sw" :style="{ background: s.color }"></i>{{ s.name }} <b>{{ s.value }}</b></span>
    </div>
  </div>

  <!-- barre empilée -->
  <div v-else-if="mode === 'bar'" class="sbar-w">
    <div class="avail-big"><b>{{ availTxt }}</b><span class="muted small">{{ t('disponibles') }} · {{ t('{n} équipement(s)', { n: total }) }}</span></div>
    <div class="sbar">
      <i v-for="s in shownItems.filter((x) => x.value)" :key="s.key" :style="{ flexGrow: s.value, background: s.color }" :title="`${s.name} : ${s.value}`"
        @click="go(s.key)"><span v-if="pct(s.value) >= 8">{{ s.value }}</span></i>
    </div>
    <div class="sleg">
      <span v-for="s in shownItems" :key="s.key" class="row small" @click="go(s.key)"><i class="sw" :style="{ background: s.color }"></i>{{ s.name }} <b>{{ s.value }}</b><span class="faint">{{ pct(s.value) }} %</span></span>
    </div>
  </div>

  <!-- chiffres -->
  <div v-else-if="mode === 'tiles'" class="tiles" :style="{ gridTemplateColumns: `repeat(${tileCols}, minmax(0, 1fr))` }">
    <div v-for="s in shownItems" :key="s.key" class="tile" :class="{ alert: s.key === 'down' && s.value }" :style="{ '--c': s.color }" @click="go(s.key)">
      <b>{{ s.value }}</b><span class="t-lbl">{{ s.name }}</span><span class="faint small">{{ pct(s.value) }} %</span>
    </div>
  </div>

  <!-- répartition par emplacement / type / OS -->
  <div v-else class="cats">
    <div v-if="!cats.length" class="empty small">{{ t('Aucun équipement') }}</div>
    <div v-for="c in cats" :key="c.key" class="cat">
      <div class="cat-head small">
        <b class="ellipsis">{{ c.label }}</b>
        <span v-if="c.down" class="badge critical">{{ t('{n} hors ligne', { n: c.down }) }}</span>
        <span class="faint nowrap" style="margin-left:auto">{{ c.up }} / {{ c.total }}</span>
      </div>
      <div class="mini">
        <i v-for="s in c.parts" :key="s.key" :style="{ flexGrow: s.value, background: s.color }" :title="`${c.label} · ${s.name} : ${s.value}`"></i>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import EChart from '../EChart.vue'
import { devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devStatus } from '../../utils'
import { donutOption } from '../../charts'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const devices = ref([])
const mode = computed(() => props.config.mode || 'donut')
const go = (key) => router.push(`/devices?status=${key}`)

const COLORS = { up: '#22c55e', down: '#f43f5e', disabled: '#64748b', ignored: '#facc15' }
const NAMES = { up: t('En ligne'), down: t('Hors ligne'), disabled: t('Désactivés'), ignored: t('Ignorés') }
const countOf = (list) => {
  const c = { up: 0, down: 0, disabled: 0, ignored: 0 }
  list.forEach((d) => c[devStatus(d)]++)
  return c
}
const counts = computed(() => countOf(devices.value))
const total = computed(() => devices.value.length)
const items = computed(() => Object.keys(COLORS).map((key) => ({ key, name: NAMES[key], value: counts.value[key], color: COLORS[key] })))
const shownItems = computed(() => (props.config.hideEmpty ? items.value.filter((s) => s.value > 0) : items.value))
const pct = (v) => (total.value ? Math.round((v / total.value) * 1000) / 10 : 0)
// disponibilité = en ligne / (total − désactivés)
const availTxt = computed(() => (total.value ? `${Math.round((counts.value.up / Math.max(1, total.value - counts.value.disabled)) * 100)} %` : '—'))

const option = computed(() => {
  const base = donutOption(shownItems.value, { title: availTxt.value.replace(' ', ''), sub: t('disponibles') })
  const s = base.series[0]
  if (mode.value === 'pie') {
    base.title = { show: false }
    Object.assign(s, { radius: ['0%', '80%'], padAngle: 1, itemStyle: { borderRadius: 4 }, label: { show: true, position: 'inside', formatter: '{d}%', color: '#fff', fontWeight: 700 } })
  } else if (mode.value === 'half') {
    Object.assign(s, { radius: ['78%', '108%'], center: ['50%', '78%'], startAngle: 180, endAngle: 360 })
    base.title.top = '52%'
  }
  return base
})

const tileCols = computed(() => Math.max(1, Math.min(shownItems.value.length, Math.floor((props.size?.w || 400) / 110))))

// répartition par catégorie : groupes avec des équipements hors ligne d'abord, puis les plus gros
const GROUP_KEY = { location: (d) => d.location, type: (d) => d.type, os: (d) => d.os }
const cats = computed(() => {
  const key = GROUP_KEY[props.config.groupBy] || GROUP_KEY.location
  const m = new Map()
  for (const d of devices.value) { const k = key(d) || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(d) }
  return [...m.entries()].map(([k, list]) => {
    const c = countOf(list)
    return {
      key: k || '—', label: k || t('Non défini'), total: list.length, up: c.up, down: c.down,
      parts: Object.keys(COLORS).filter((s) => c[s]).map((s) => ({ key: s, name: NAMES[s], value: c[s], color: COLORS[s] })),
    }
  }).sort((a, b) => (b.down > 0) - (a.down > 0) || b.total - a.total || a.label.localeCompare(b.label))
})

useLoader(async () => { devices.value = await devicesFor(props.config) })
</script>

<style scoped>
.legend-row { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }

/* barre empilée */
.sbar-w { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
.avail-big { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.avail-big b { font-size: 34px; font-weight: 700; letter-spacing: -.03em; color: var(--green); }
.sbar { display: flex; height: 22px; border-radius: 7px; overflow: hidden; gap: 2px; }
.sbar i { display: flex; align-items: center; justify-content: center; min-width: 4px; color: #fff; font-style: normal; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.sleg { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.sleg > span { gap: 6px; cursor: pointer; }

/* chiffres */
.tiles { height: 100%; display: grid; gap: 8px; align-content: center; }
.tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 10px; cursor: pointer; min-width: 0;
  background: color-mix(in srgb, var(--c) 13%, var(--panel-2)); border: 1px solid color-mix(in srgb, var(--c) 35%, var(--border)); border-left: 4px solid var(--c); }
.tile b { font-size: 26px; font-weight: 700; line-height: 1.1; color: var(--c); font-variant-numeric: tabular-nums; }
.t-lbl { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile.alert { animation: pulse 2s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent); } }

/* par catégorie */
.cats { display: flex; flex-direction: column; gap: 9px; }
.cat-head { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 3px; }
.mini { display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 1px; background: var(--panel-2); }
.mini i { min-width: 3px; }
</style>
