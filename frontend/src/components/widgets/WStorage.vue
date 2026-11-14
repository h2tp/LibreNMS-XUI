<template>
  <div v-if="error" class="err small">{{ error }}</div>
  <div v-else-if="loaded && !list.length" class="empty small"><HardDrive /><div>{{ all.length ? 'Aucun volume ne correspond aux filtres' : 'Aucun volume de stockage remonté' }}</div></div>
  <div v-else-if="!loaded" class="col" style="gap:10px"><div v-for="i in 4" :key="i" class="skeleton" style="height:38px"></div></div>
  <div v-else class="col" style="gap:12px">
    <div class="summary small">
      <span><b>{{ fmtBytes(total.used) }}</b> utilisés sur <b>{{ fmtBytes(total.size) }}</b> · {{ total.n }} volume(s)</span>
      <span v-if="total.crit" class="badge critical">{{ total.crit }} critique(s)</span>
      <span v-if="total.warn" class="badge warning">{{ total.warn }} à surveiller</span>
    </div>

    <div v-if="mode === 'list'" class="col" style="gap:6px">
      <router-link v-for="v in list" :key="v.key" :to="link(v)" class="vol" :title="tip(v)">
        <div class="row" style="gap:8px;min-width:0">
          <HardDrive :size="15" class="faint" style="flex:none" />
          <b class="ellipsis">{{ v.name }}</b>
          <span v-if="!config.device" class="muted small ellipsis grow">{{ devName(devById[v.device_id]) }}</span>
          <span v-else class="grow"></span>
          <span class="small nowrap muted">{{ fmtBytes(v.free) }} libres</span>
          <b class="pct nowrap" :class="v.st">{{ v.perc }} %</b>
        </div>
        <div class="bar"><i :style="{ width: Math.max(1, v.perc) + '%', background: COL[v.st] }"></i></div>
      </router-link>
    </div>

    <div v-else class="rings">
      <router-link v-for="v in list" :key="v.key" :to="link(v)" class="rcard" :title="tip(v)">
        <Ring :value="v.perc" :size="86" :stroke="9" :colors="RING[v.st]" />
        <b class="ellipsis" style="max-width:100%">{{ v.name }}</b>
        <span v-if="!config.device" class="muted small ellipsis" style="max-width:100%">{{ devName(devById[v.device_id]) }}</span>
        <span class="small muted nowrap">{{ fmtBytes(v.used) }} / {{ fmtBytes(v.size) }}</span>
      </router-link>
    </div>

    <div v-if="more" class="small muted" style="text-align:center">+ {{ more }} autre(s) volume(s) — augmentez le nombre d'éléments ou filtrez</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { HardDrive } from 'lucide-vue-next'
import Ring from '../Ring.vue'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, fmtBytes } from '../../utils'
import { volumeName, usefulVolumes } from '../../dashboard/volumes'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false); const error = ref(null)
const mode = computed(() => props.config.mode || 'list')
const COL = { ok: 'var(--green)', warn: 'var(--orange)', crit: 'var(--red)' }
const RING = { ok: ['#22c55e', '#4ade80'], warn: ['#fb923c', '#fdba74'], crit: ['#f43f5e', '#fb7185'] }

const cleanName = volumeName

const volumes = computed(() => {
  const warn = +props.config.warn || 80; const crit = +props.config.crit || 90
  let l = all.value.filter((v) => devById.value[v.device_id] && +v.size > 0)
  if (props.config.device) l = l.filter((v) => v.hostname === props.config.device)
  if (!props.config.showSystem) l = usefulVolumes(l)
  const q = (props.config.filter || '').trim().toLowerCase()
  if (q) l = l.filter((v) => `${v.descr} ${cleanName(v.descr)}`.toLowerCase().includes(q))
  return l.map((v) => {
    const perc = v.perc != null ? +v.perc : Math.round((+v.used / +v.size) * 100)
    return { ...v, key: `${v.device_id}:${v.storage_id}`, name: cleanName(v.descr), perc, st: perc >= crit ? 'crit' : perc >= warn ? 'warn' : 'ok' }
  })
})
const filtered = computed(() => {
  let l = volumes.value
  if (props.config.onlyAlarm) l = l.filter((v) => v.st !== 'ok')
  const by = {
    perc: (a, b) => b.perc - a.perc,
    free: (a, b) => a.free - b.free,
    size: (a, b) => b.size - a.size,
    name: (a, b) => devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id])) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  }[props.config.sort || 'perc']
  return [...l].sort(by)
})
const list = computed(() => filtered.value.slice(0, props.config.limit || 15))
const more = computed(() => filtered.value.length - list.value.length)
const total = computed(() => ({
  n: volumes.value.length,
  used: volumes.value.reduce((s, v) => s + (+v.used || 0), 0),
  size: volumes.value.reduce((s, v) => s + (+v.size || 0), 0),
  warn: volumes.value.filter((v) => v.st === 'warn').length,
  crit: volumes.value.filter((v) => v.st === 'crit').length,
}))
const link = (v) => `/device/${encodeURIComponent(v.hostname)}/health`
const tip = (v) => `${devName(devById.value[v.device_id])} · ${v.descr}\nUtilisé : ${fmtBytes(v.used)} (${v.perc} %)\nLibre : ${fmtBytes(v.free)}\nTaille : ${fmtBytes(v.size)}`

useLoader(async () => {
  try {
    const [s, d] = await Promise.all([D.storage(), devicesFor(props.config)])
    all.value = s
    devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
    error.value = null
  } catch (e) { error.value = e.message } finally { loaded.value = true }
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; color: var(--muted); }
.summary b { color: var(--text); }
.vol { display: flex; flex-direction: column; gap: 6px; padding: 7px 8px; border-radius: 10px; color: var(--text); min-width: 0; transition: background .2s; }
.vol:hover { background: var(--panel-2); text-decoration: none; }
.pct { min-width: 46px; text-align: right; font-variant-numeric: tabular-nums; }
.pct.warn { color: var(--orange); }
.pct.crit { color: var(--red); }
.rings { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.rcard { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); min-width: 0; text-align: center; transition: transform .15s; }
.rcard:hover { text-decoration: none; transform: translateY(-1px); }
</style>
