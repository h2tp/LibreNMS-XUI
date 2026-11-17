<template>
  <div class="card rt">
    <div class="card-title"><Radio :size="17" :class="{ live: running && !err }" /> {{ t('Temps réel') }}
      <span class="sub">{{ t('SNMP toutes les {n} s', { n: prefs.rtInterval }) }}</span>
      <div class="right">
        <div class="seg" :title="t('Intervalle d\'interrogation')">
          <button v-for="i in INTERVALS" :key="i" :class="{ on: prefs.rtInterval === i }" @click="setIv(i)">{{ i }} s</button>
        </div>
        <div class="seg" :title="t('Fenêtre affichée')">
          <button v-for="w in WINDOWS" :key="w.v" :class="{ on: prefs.rtWindow === w.v }" @click="setWindow(w.v)">{{ w.l }}</button>
        </div>
        <button class="btn sm" :title="running ? t('Pause') : t('Reprendre')" @click="toggle"><component :is="running ? Pause : Play" /> {{ running ? t('Pause') : t('Reprendre') }}</button>
        <button class="btn sm icon" :title="t('Effacer')" @click="clear"><Eraser /></button>
        <button class="btn ghost sm icon" :title="t('Fermer')" @click="$emit('close')"><X /></button>
      </div>
    </div>

    <div class="rt-stats">
      <div v-for="d in stats" :key="d.k" class="rt-stat" :style="{ '--c': d.color }">
        <span class="muted small">{{ d.label }}</span>
        <b>{{ fmtBits(d.cur) }}</b>
        <div class="bar"><i :style="{ width: `${Math.min(100, d.pct)}%` }"></i></div>
        <span class="small faint">{{ speed ? `${d.pct.toFixed(1)} % · ` : '' }}{{ t('moy. {a} · max {m}', { a: fmtBits(d.avg), m: fmtBits(d.max) }) }}</span>
      </div>
    </div>

    <div v-if="err" class="rt-err small"><TriangleAlert :size="15" /> {{ err }}
      <button v-if="!running" class="btn sm" @click="start">{{ t('Réessayer') }}</button>
    </div>
    <EChart v-if="points.length > 1" :option="option" height="300px" />
    <div v-else-if="!err" class="rt-wait small muted"><LoaderCircle :size="16" class="spin" /> {{ t('Mesure en cours…') }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Radio, Pause, Play, Eraser, X, TriangleAlert, LoaderCircle } from 'lucide-vue-next'
import EChart from './EChart.vue'
import { realtimeApi } from '../api'
import { timeOption, IN_COLOR, OUT_COLOR } from '../charts'
import { fmtBits, prefs, save } from '../utils'
import { t } from '../i18n'

const props = defineProps({ portId: [Number, String] })
defineEmits(['close'])

const INTERVALS = [1, 2, 5, 10]
const WINDOWS = [{ v: 60, l: '1 min' }, { v: 300, l: '5 min' }, { v: 900, l: '15 min' }]
const IN = IN_COLOR; const OUT = OUT_COLOR

const points = ref([]) // [{ ts (ms), in (bits/s), out (bits/s) }]
const speed = ref(0)
const err = ref('')
const running = ref(false)
let last = null; let timer = null; let fails = 0; let alive = true

function rate(cur, prev, dt, bits) {
  let d = cur - prev
  if (d < 0) {
    if (bits === 32) d += 2 ** 32 // compteur 32 bits repassé par zéro
    else return null // remise à zéro du compteur (redémarrage…)
  }
  return (d * 8) / dt
}

async function tick() {
  if (!alive || !running.value) return
  const t0 = Date.now()
  try {
    const r = await realtimeApi.port(props.portId)
    speed.value = r.speed || 0
    if (last && r.ts > last.ts) {
      const dt = r.ts - last.ts
      const vin = rate(r.in, last.in, dt, r.bits); const vout = rate(r.out, last.out, dt, r.bits)
      if (vin !== null && vout !== null) {
        points.value.push({ ts: r.ts * 1000, in: vin, out: vout })
        const from = r.ts * 1000 - prefs.rtWindow * 1000
        while (points.value.length && points.value[0].ts < from) points.value.shift()
        points.value = [...points.value]
      }
    }
    last = r; err.value = ''; fails = 0
  } catch (e) {
    err.value = e?.message || String(e)
    // trois échecs de suite : arrêt (équipement injoignable, SNMP refusé…)
    if (++fails >= 3) { running.value = false; return }
  }
  if (alive && running.value) timer = setTimeout(tick, Math.max(200, prefs.rtInterval * 1000 - (Date.now() - t0)))
}

function start() { if (running.value) return; running.value = true; fails = 0; last = null; tick() }
function stop() { running.value = false; clearTimeout(timer) }
function toggle() { running.value ? stop() : start() }
function clear() { points.value = []; last = null }
function setIv(i) { prefs.rtInterval = i; save('rtInterval', i); if (running.value) { clearTimeout(timer); last = null; tick() } }
function setWindow(w) { prefs.rtWindow = w; save('rtWindow', w) }

// onglet masqué : pas d'interrogation SNMP inutile
let pausedByHide = false
function onVis() {
  if (document.hidden && running.value) { pausedByHide = true; stop() } else if (!document.hidden && pausedByHide) { pausedByHide = false; start() }
}
onMounted(() => { document.addEventListener('visibilitychange', onVis); start() })
onBeforeUnmount(() => { alive = false; stop(); document.removeEventListener('visibilitychange', onVis) })

const stats = computed(() => {
  const p = points.value
  const mk = (k, label, color) => {
    const vals = p.map((x) => x[k])
    const cur = vals.length ? vals[vals.length - 1] : 0
    return {
      k, label, color, cur,
      avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      max: vals.length ? Math.max(...vals) : 0,
      pct: speed.value ? (cur / speed.value) * 100 : 0,
    }
  }
  return [mk('in', t('Entrant'), IN), mk('out', t('Sortant'), OUT)]
})

const option = computed(() => {
  const o = timeOption([
    { name: t('Entrant'), color: IN, data: points.value.map((x) => [x.ts, x.in]) },
    { name: t('Sortant'), color: OUT, negate: true, data: points.value.map((x) => [x.ts, x.out]) },
  ], { unit: 'bits', zoom: false })
  o.animation = false
  const now = points.value.length ? points.value[points.value.length - 1].ts : Date.now()
  o.xAxis.min = now - prefs.rtWindow * 1000; o.xAxis.max = now
  o.series.forEach((s) => { s.smooth = false; s.sampling = undefined })
  return o
})
</script>

<style scoped>
.rt .card-title .right { flex-wrap: wrap; }
.live { color: var(--green); animation: blink 1.6s infinite; }
@keyframes blink { 50% { opacity: .35; } }
.rt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px; }
.rt-stat { display: flex; flex-direction: column; gap: 4px; padding: 10px 14px; border-radius: 10px; background: color-mix(in srgb, var(--c) 7%, var(--panel-2)); border: 1px solid color-mix(in srgb, var(--c) 22%, var(--border)); }
.rt-stat b { font-size: 24px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--c); }
.rt-stat .bar { height: 5px; border-radius: 3px; background: var(--panel-solid, var(--panel)); overflow: hidden; }
.rt-stat .bar i { display: block; height: 100%; background: var(--c); transition: width .4s; }
.rt-err { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 9px; margin-bottom: 10px; color: var(--red); background: color-mix(in srgb, var(--red) 8%, var(--panel-2)); border: 1px solid color-mix(in srgb, var(--red) 30%, var(--border)); }
.rt-err .btn { margin-left: auto; }
.rt-wait { height: 300px; display: flex; align-items: center; justify-content: center; gap: 10px; }
</style>
