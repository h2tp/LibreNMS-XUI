<template>
  <div class="pc" :class="{ narrow }">
    <div v-if="!port" class="empty small">{{ loaded ? t('Port introuvable') : t('Chargement…') }}</div>

    <!-- anneaux d'utilisation -->
    <div v-else-if="mode === 'rings'" class="rings">
      <div v-for="d in dirs" :key="d.k" class="ring-col go" :title="portTip" @click="open">
        <Ring :value="d.pct ?? 0" :size="ringSize" :stroke="Math.max(6, ringSize / 10)" :text="d.val" :label="d.unit" :colors="[d.color, d.color]" />
        <div class="lbl"><component :is="d.icon" :size="14" :style="{ color: d.color }" /> {{ d.label }}<span v-if="d.pct !== null" class="faint"> · {{ fmtP(d.pct) }} %</span></div>
      </div>
    </div>

    <!-- ligne compacte -->
    <div v-else-if="mode === 'line'" class="line">
      <div v-for="d in dirs" :key="d.k" class="l-item go" :style="{ '--c': d.color }" :title="portTip" @click="open">
        <component :is="d.icon" :size="Math.min(28, valSize * .7)" class="l-ico" />
        <b :style="{ fontSize: `${valSize}px` }">{{ d.val }}</b><span class="unit">{{ d.unit }}</span>
      </div>
    </div>

    <!-- tuiles (par défaut) -->
    <div v-else class="tiles">
      <div v-for="d in dirs" :key="d.k" class="tile go" :style="{ '--c': d.color }" :title="portTip" @click="open">
        <svg v-if="d.spark" class="spark" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path :d="d.spark.area" class="sp-area" /><path :d="d.spark.line" class="sp-line" />
        </svg>
        <div class="t-top"><span class="t-ico"><component :is="d.icon" :size="16" /></span><span class="t-lbl">{{ d.label }}</span></div>
        <div class="t-val"><b :style="{ fontSize: `${valSize}px` }">{{ d.val }}</b><span class="unit">{{ d.unit }}</span></div>
        <div v-if="d.pct !== null" class="t-bar"><i :style="{ width: `${Math.min(100, Math.max(d.pct ? 1.5 : 0, d.pct))}%` }"></i></div>
        <div class="t-foot small faint">
          <span v-if="d.pct !== null">{{ fmtP(d.pct) }} %</span>
          <span v-if="d.peak !== null" style="margin-left:auto">{{ t('max {v}', { v: fmt(d.peak).join(' ') }) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, ArrowDownToLine, ArrowUpFromLine } from 'lucide-vue-next'
import Ring from '../Ring.vue'
import { D } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { session, rrd } from '../../api'
import { fmtBits, fmtBytes } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const router = useRouter()
// clic sur une valeur : page du port
const open = () => port.value && router.push(`/port/${port.value.port_id}`)
const portTip = computed(() => (port.value ? t('Ouvrir le port {p}', { p: [port.value.ifName, port.value.ifAlias].filter((x, i, a) => x && a.indexOf(x) === i).join(' — ') }) : ''))
const port = ref(null); const loaded = ref(false)
const hist = ref(null) // { in: [], out: [] } en octets/s
const mode = computed(() => props.config.mode || 'tiles')
const narrow = computed(() => (props.size?.w || 400) < 300)

const speed = computed(() => +port.value?.ifSpeed || 0)
const fmtP = (p) => (p >= 10 ? Math.round(p) : Math.round(p * 10) / 10)
// valeur + unité séparées, en bits/s ou en octets/s
function fmt(bytesPerSec) {
  if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return ['—', '']
  const s = props.config.unit === 'bytes' ? `${fmtBytes(bytesPerSec, 1, 1000)}/s` : fmtBits(bytesPerSec * 8)
  const i = s.indexOf(' ')
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]
}

function spark(arr) {
  const v = (arr || []).map((x) => (x === null || isNaN(x) ? null : +x))
  const pts = v.map((x, i) => [i, x]).filter(([, x]) => x !== null)
  if (pts.length < 2) return null
  const max = Math.max(...pts.map(([, x]) => x)) || 1
  const n = v.length - 1 || 1
  const xy = pts.map(([i, x]) => `${((i / n) * 100).toFixed(2)},${(40 - (x / max) * 36).toFixed(2)}`)
  return { line: `M${xy.join('L')}`, area: `M${xy[0].split(',')[0]},40L${xy.join('L')}L${xy[xy.length - 1].split(',')[0]},40Z` }
}

// sens : par défaut entrant = « reçu » par l'interface ; « inverser » pour un lien WAN vu depuis l'autre côté
const dirs = computed(() => {
  const p = port.value || {}
  const swap = !!props.config.swap
  const dl = props.config.labels === 'dlul'
  const raw = [
    { k: 'in', bytes: +p.ifInOctets_rate || 0, hist: hist.value?.in },
    { k: 'out', bytes: +p.ifOutOctets_rate || 0, hist: hist.value?.out },
  ]
  if (swap) raw.reverse()
  const meta = [
    { label: dl ? t('Descendant') : t('Entrant'), icon: dl ? ArrowDownToLine : ArrowDown, color: '#22c55e' },
    { label: dl ? t('Montant') : t('Sortant'), icon: dl ? ArrowUpFromLine : ArrowUp, color: '#3b82f6' },
  ]
  return raw.map((r, i) => {
    const [val, unit] = fmt(r.bytes)
    const valid = (r.hist || []).filter((x) => x !== null && !isNaN(x))
    return {
      k: r.k, ...meta[i], val, unit,
      pct: speed.value ? ((r.bytes * 8) / speed.value) * 100 : null,
      peak: valid.length ? Math.max(...valid) : null,
      spark: props.config.spark !== false ? spark(r.hist) : null,
    }
  })
})

// taille du chiffre selon la place disponible
const valSize = computed(() => {
  const w = props.size?.w || 400; const h = props.size?.h || 150
  // largeur occupée par le texte « 954 Mbps » ≈ 0,6 em par chiffre + l'unité
  const chars = Math.max(...dirs.value.map((d) => d.val.length), 3)
  if (mode.value === 'line') return Math.round(Math.max(18, Math.min(44, (w / 2 - 70) / (chars * 0.6), h / 2.2)))
  const tileW = (narrow.value ? w : (w - 10) / 2) - 28
  const tileH = narrow.value ? (h - 10) / 2 : h
  return Math.round(Math.max(18, Math.min(60, (tileW - 44) / (chars * 0.6), tileH / 3.2)))
})
const ringSize = computed(() => {
  const w = props.size?.w || 400; const h = props.size?.h || 160
  return Math.round(Math.max(64, Math.min(150, (w - 40) / 2, h - 34)))
})

useLoader(async () => {
  const ports = await D.ports()
  port.value = ports.find((x) => +x.port_id === +props.config.port) || null
  loaded.value = true
  if (props.config.spark === false || mode.value !== 'tiles' || !session.rrd || !props.config.device) { hist.value = null; return }
  try {
    const r = await rrd.data(props.config.device, `port-id${props.config.port}.rrd`, { start: props.config.range || '-6h', ds: 'INOCTETS,OUTOCTETS', rows: 120 })
    hist.value = { in: r.series?.INOCTETS || [], out: r.series?.OUTOCTETS || [] }
  } catch { hist.value = null }
})
</script>

<style scoped>
.pc { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.unit { font-size: 13px; color: var(--muted); font-weight: 500; margin-left: 5px; }

/* tuiles */
.tiles { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.narrow .tiles { grid-template-columns: 1fr; }
.tile { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 12px 14px; border-radius: 11px; min-width: 0;
  background: color-mix(in srgb, var(--c) 8%, var(--panel-2)); border: 1px solid color-mix(in srgb, var(--c) 25%, var(--border)); }
.spark { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 60%; pointer-events: none; }
.sp-area { fill: color-mix(in srgb, var(--c) 14%, transparent); }
.sp-line { fill: none; stroke: color-mix(in srgb, var(--c) 55%, transparent); stroke-width: 1.4; vector-effect: non-scaling-stroke; }
.t-top, .t-val, .t-bar, .t-foot { position: relative; }
.t-top { display: flex; align-items: center; gap: 8px; }
.t-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); flex: none; }
.t-lbl { color: var(--muted); font-size: 12.5px; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-val { display: flex; align-items: baseline; white-space: nowrap; }
.t-val b { line-height: 1; font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; color: var(--c); }
.t-bar { height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--c) 12%, var(--panel-solid, var(--panel))); overflow: hidden; }
.t-bar i { display: block; height: 100%; background: var(--c); border-radius: 3px; transition: width .8s; }
.t-foot { display: flex; gap: 8px; }

/* ligne */
.line { flex: 1; display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 8px 24px; }
.l-item { display: flex; align-items: baseline; white-space: nowrap; }
.l-ico { color: var(--c); align-self: center; margin-right: 6px; }
.l-item b { font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; line-height: 1; }

/* anneaux */
.rings { flex: 1; display: flex; align-items: center; justify-content: space-around; gap: 10px; min-height: 0; }
.ring-col { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
.lbl { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--muted); white-space: nowrap; }
.go { cursor: pointer; }
.tile.go { transition: border-color .15s, transform .15s; }
.tile.go:hover { border-color: color-mix(in srgb, var(--c) 60%, var(--border)); transform: translateY(-1px); }
.l-item.go:hover b, .ring-col.go:hover .lbl { color: var(--c, var(--text)); }
</style>
