<template>
  <div class="avbar">
    <div class="card-title"><CircleCheck :size="17" /> {{ t('Disponibilité ({n} jours)', { n: days }) }}</div>
    <div v-if="loading && !outages" class="skeleton" style="height:34px"></div>
    <template v-else>
      <div class="segs" @mouseleave="hover = null">
        <span v-for="(d, i) in bars" :key="i" class="seg" :class="[d.cls, { on: hover === i }]" @mouseenter="hover = i"></span>
      </div>
      <div class="legend small">
        <span>{{ t('il y a {n} jours', { n: days }) }}</span>
        <span v-if="hd" class="mid">
          <b>{{ hd.label }}</b> ·
          <template v-if="hd.cls === 'none'">{{ t('non supervisé') }}</template>
          <template v-else>{{ fmtPct(hd.pct) }} %<template v-if="hd.down"> · {{ t('indisponible {d}', { d: fmtDur(hd.down) }) }} · {{ t('{n} coupure(s)', { n: hd.count }) }}</template></template>
        </span>
        <span v-else class="mid"><b>{{ total === null ? '—' : fmtPct(total) + ' %' }}</b> {{ t('de disponibilité') }}</span>
        <span>{{ t('Aujourd\'hui') }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { CircleCheck } from 'lucide-vue-next'
import { safeList, L } from '../api'
import { useLoader } from '../refresh'
import { toDate, fmtUptime } from '../utils'
import { t, locale } from '../i18n'

const props = defineProps({ device: Object, days: { type: Number, default: 90 } })
const outages = ref(null)
const hover = ref(null)
const DAY = 86400000

const { loading } = useLoader(async () => {
  outages.value = await safeList(`devices/${L.enc(props.device.hostname)}/outages`, null, 'outages')
})

// Un segment par jour (minuit local) : temps d'indisponibilité cumulé des coupures qui le chevauchent.
const bars = computed(() => {
  const now = Date.now()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const since = toDate(props.device.inserted)?.getTime() || 0
  const outs = (outages.value || []).filter((o) => o.going_down).map((o) => [+o.going_down * 1000, o.up_again ? +o.up_again * 1000 : now])
  const res = []
  for (let i = props.days - 1; i >= 0; i--) {
    const d0 = new Date(today); d0.setDate(d0.getDate() - i)
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1)
    const start = Math.max(d0.getTime(), since); const end = Math.min(d1.getTime(), now)
    const label = d0.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    if (end <= start) { res.push({ label, cls: 'none', span: 0, down: 0 }); continue }
    let down = 0; let count = 0
    for (const [a, b] of outs) {
      const ov = Math.min(b, end) - Math.max(a, start)
      if (ov > 0) { down += ov; count++ }
    }
    down = Math.min(down, end - start)
    const pct = 100 * (1 - down / (end - start))
    res.push({ label, span: end - start, down: down / 1000, count, pct, cls: !down ? 'ok' : pct >= 90 ? 'warn' : 'crit' })
  }
  return res
})
const total = computed(() => {
  const span = bars.value.reduce((s, b) => s + b.span, 0)
  return span ? 100 * (1 - bars.value.reduce((s, b) => s + b.down * 1000, 0) / span) : null
})
const hd = computed(() => (hover.value === null ? null : bars.value[hover.value]))
const fmtPct = (v) => (v >= 100 ? '100' : v.toFixed(3))
const fmtDur = (s) => (s < 60 ? `${Math.round(s)} s` : fmtUptime(s))
</script>

<style scoped>
.segs { display: flex; gap: 3px; height: 34px; }
.seg { flex: 1 1 0; min-width: 0; border-radius: 3px; background: var(--green); transition: transform .12s, filter .12s; cursor: default; }
.seg.warn { background: var(--orange); }
.seg.crit { background: var(--red); }
.seg.none { background: color-mix(in srgb, var(--gray) 30%, transparent); }
.seg.on { transform: scaleY(1.12); filter: brightness(1.15); }
.legend { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; margin-top: 6px; color: var(--faint); }
.mid { text-align: center; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mid b { color: var(--text); }
@media (max-width: 640px) { .segs { gap: 1px; } .seg { border-radius: 1px; } }
</style>
