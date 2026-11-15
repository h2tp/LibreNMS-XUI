<template>
  <!-- cartes (affichage d'origine) -->
  <div v-if="mode === 'cards'" class="stats" :style="grid">
    <StatCard v-for="e in entries" :key="e.k" :icon="e.icon" :label="e.label" :value="e.value" :suffix="e.suffix" :color="e.color" :to="e.to">
      <template #badge><span v-if="e.k === 'down' && e.value" class="dot down"></span></template>
    </StatCard>
  </div>

  <!-- tuiles teintées / grands chiffres -->
  <div v-else-if="mode === 'tinted' || mode === 'big'" class="stats" :style="grid">
    <div v-for="e in entries" :key="e.k" class="card tile" :class="[mode, { alert: e.alert }]" :style="{ '--c': e.color }" @click="go(e)">
      <div v-if="showIcons && mode === 'tinted'" class="t-ico"><component :is="e.icon" :size="18" /></div>
      <div class="t-val"><CountUp :value="e.value" /><span v-if="e.suffix" class="t-suf"> {{ e.suffix }}</span></div>
      <div class="t-lbl">{{ e.label }}</div>
    </div>
  </div>

  <!-- jauges -->
  <div v-else-if="mode === 'rings'" class="stats" :style="grid">
    <div v-for="e in entries" :key="e.k" class="card ring-tile" @click="go(e)">
      <Ring v-if="e.ratio !== null" :value="e.ratio * 100" :size="ringSize" :stroke="Math.max(6, ringSize / 11)" :text="String(e.value)"
        :colors="[e.color, e.color]" />
      <div v-else class="ring-alt" :style="{ width: `${ringSize}px`, height: `${ringSize}px`, '--c': e.color }">
        <b :style="{ fontSize: `${ringSize / 4.2}px` }">{{ e.value }}</b><span v-if="e.suffix" class="muted small">{{ e.suffix }}</span>
      </div>
      <div class="t-lbl">{{ e.label }}<span v-if="e.ratio !== null" class="faint"> · {{ Math.round(e.ratio * 100) }} %</span></div>
    </div>
  </div>

  <!-- bandeau compact -->
  <div v-else-if="mode === 'compact'" class="card strip">
    <div v-for="e in entries" :key="e.k" class="s-item" :class="{ alert: e.alert }" :style="{ '--c': e.color }" @click="go(e)">
      <component :is="e.icon" v-if="showIcons" :size="18" class="s-ico" />
      <b class="s-val">{{ e.value }}<span v-if="e.suffix" class="t-suf"> {{ e.suffix }}</span></b>
      <span class="s-lbl">{{ e.label }}</span>
    </div>
  </div>

  <!-- liste -->
  <div v-else class="card list">
    <div v-for="e in entries" :key="e.k" class="l-row" :class="{ alert: e.alert }" :style="{ '--c': e.color }" @click="go(e)">
      <component :is="e.icon" v-if="showIcons" :size="16" class="s-ico" />
      <span class="l-lbl">{{ e.label }}</span>
      <span v-if="e.ratio !== null" class="l-bar"><i :style="{ width: `${Math.max(2, e.ratio * 100)}%` }"></i></span>
      <b class="l-val">{{ e.value }}<span v-if="e.suffix" class="t-suf"> {{ e.suffix }}</span></b>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Server, CircleCheck, CircleX, Network, Bell, ArrowDownUp } from 'lucide-vue-next'
import StatCard from '../StatCard.vue'
import CountUp from '../CountUp.vue'
import Ring from '../Ring.vue'
import { D, devicesFor, isPhysical } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devStatus, fmtBits } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
const devices = ref([]); const ports = ref([]); const alerts = ref([])
const mode = computed(() => props.config.mode || 'cards')
const showIcons = computed(() => props.config.icons !== false)
const items = computed(() => props.config.items?.length ? props.config.items : ['devices'])

// colonnes : autant que la largeur le permet (une tuile ≥ 150-170 px, une jauge ≥ 130 px)
const minW = computed(() => (mode.value === 'rings' ? 130 : props.size?.w < 500 ? 150 : 170))
const cols = computed(() => Math.max(1, Math.min(items.value.length, Math.floor(((props.size?.w || 1200) + 16) / minW.value))))
const grid = computed(() => ({ gridTemplateColumns: `repeat(${cols.value}, minmax(0, 1fr))` }))
const ringSize = computed(() => {
  const rows = Math.ceil(items.value.length / cols.value)
  const h = ((props.size?.h || 160) - (rows - 1) * 16) / rows - 46
  const w = ((props.size?.w || 600) - (cols.value - 1) * 16) / cols.value - 30
  return Math.round(Math.max(56, Math.min(130, h, w)))
})

const ids = computed(() => new Set(devices.value.map((d) => +d.device_id)))
const counts = computed(() => {
  const c = { up: 0, down: 0, disabled: 0, ignored: 0 }
  devices.value.forEach((d) => c[devStatus(d)]++)
  return c
})
const myPorts = computed(() => ports.value.filter((p) => ids.value.has(+p.device_id) && !+p.deleted && !+p.disabled))
const portCounts = computed(() => ({ total: myPorts.value.length, up: myPorts.value.filter((p) => p.ifOperStatus === 'up').length }))
const traffic = computed(() => {
  const b = myPorts.value.filter(isPhysical).reduce((s, p) => s + (+p.ifInOctets_rate || 0) * 8, 0)
  const [v, u] = fmtBits(b).split(' ')
  return { v: parseFloat(v) || 0, u }
})

// une entrée par compteur : valeur, proportion éventuelle (jauges, barres), couleur, lien
const entries = computed(() => {
  const n = devices.value.length
  const all = {
    devices: { icon: Server, label: t('Équipements'), value: n, color: '#22d3ee', to: '/devices', ratio: null },
    up: { icon: CircleCheck, label: t('En ligne'), value: counts.value.up, color: '#22c55e', to: '/devices?status=up', ratio: n ? counts.value.up / n : 0 },
    down: { icon: CircleX, label: t('Hors ligne'), value: counts.value.down, color: '#f43f5e', to: '/devices?status=down', ratio: n ? counts.value.down / n : 0, alert: counts.value.down > 0 },
    ports: { icon: Network, label: t('Ports actifs'), value: portCounts.value.up, suffix: `/ ${portCounts.value.total}`, color: '#a78bfa', to: '/ports', ratio: portCounts.value.total ? portCounts.value.up / portCounts.value.total : 0 },
    alerts: { icon: Bell, label: t('Alertes actives'), value: alerts.value.length, color: '#fb923c', to: '/alerts', ratio: null, alert: alerts.value.length > 0 },
    traffic: { icon: ArrowDownUp, label: t('Trafic total'), value: traffic.value.v, suffix: traffic.value.u, color: '#34d399', to: '/ports', ratio: null },
  }
  return items.value.filter((k) => all[k]).map((k) => ({ k, ...all[k] }))
})
const go = (e) => e.to && router.push(e.to)

const need = (k) => items.value.includes(k)
useLoader(async () => {
  const [d, p, a] = await Promise.all([
    devicesFor(props.config),
    need('ports') || need('traffic') ? D.ports() : [],
    need('alerts') ? D.alerts() : [],
  ])
  devices.value = d; ports.value = p
  const set = new Set(d.map((x) => +x.device_id))
  alerts.value = props.config.group ? a.filter((x) => set.has(+x.device_id)) : a
})
</script>

<style scoped>
.stats { display: grid; gap: 16px; height: 100%; }
.stats :deep(.stat) { height: 100%; }
.t-suf { font-size: .5em; font-weight: 500; color: var(--muted); }

/* tuiles teintées, grands chiffres */
.tile { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; cursor: pointer; transition: transform .15s, border-color .15s; min-width: 0; }
.tile:hover { transform: translateY(-2px); }
.tile.tinted { background: color-mix(in srgb, var(--c) 13%, var(--panel-solid)); border-color: color-mix(in srgb, var(--c) 35%, var(--border)); }
.tile.tinted .t-val { color: var(--c); }
.t-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); margin-bottom: 2px; }
.t-val { font-size: 30px; font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1.1; white-space: nowrap; }
.t-lbl { color: var(--muted); font-weight: 500; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile.big { align-items: center; text-align: center; overflow: hidden; }
.tile.big .t-val { font-size: clamp(34px, 4.2vw, 64px); color: var(--text); }
.tile.big .t-lbl { font-size: 13.5px; text-transform: uppercase; letter-spacing: .06em; }
.tile.big::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--c); }
.tile.alert { border-color: var(--c); animation: pulse 2s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 30%, transparent); } }

/* jauges */
.ring-tile { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; min-width: 0; }
.ring-alt { display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 50%; border: 3px dashed color-mix(in srgb, var(--c) 45%, transparent); color: var(--c); }
.ring-alt b { line-height: 1; font-variant-numeric: tabular-nums; }

/* bandeau compact */
.strip { height: 100%; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 26px; padding: 10px 18px; }
.s-item { display: flex; align-items: baseline; gap: 7px; cursor: pointer; white-space: nowrap; }
.s-item:hover .s-lbl { color: var(--text); }
.s-ico { color: var(--c); align-self: center; flex: none; }
.s-val { font-size: 20px; font-variant-numeric: tabular-nums; }
.s-item.alert .s-val { color: var(--c); }
.s-lbl { color: var(--muted); font-size: 12.5px; }

/* liste */
.list { height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 8px 14px; overflow: auto; }
.l-row { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid var(--border); cursor: pointer; min-width: 0; }
.l-row:last-child { border-bottom: 0; }
.l-row:hover .l-lbl { color: var(--text); }
.l-lbl { color: var(--muted); font-size: 13px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.l-bar { width: 70px; height: 6px; border-radius: 3px; background: var(--panel-2); overflow: hidden; flex: none; }
.l-bar i { display: block; height: 100%; background: var(--c); border-radius: 3px; }
.l-val { font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.l-row.alert .l-val { color: var(--c); }
</style>
