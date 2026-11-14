<template>
  <div v-if="loaded && !states.length && !speeds" class="empty small"><Fan /><div>Aucun capteur de ventilateur{{ config.device || config.group ? ' pour ce filtre' : '' }}</div></div>
  <div v-else class="col" style="gap:14px">
    <div v-if="states.length" class="fans">
      <router-link v-for="s in states" :key="s.sensor_id" :to="link(s)" class="fan" :class="s.st" :title="`${devName(devById[s.device_id])} · ${s.sensor_descr}\nValeur brute : ${s.sensor_current} (${s.sensor_type})`">
        <Fan :size="26" class="ico" :class="{ spin: s.st === 'ok' && !reduced }" />
        <div style="min-width:0">
          <div class="ellipsis small muted">{{ devName(devById[s.device_id]) }}</div>
          <div class="ellipsis descr">{{ s.sensor_descr }}</div>
          <div class="lbl">{{ s.label }}</div>
        </div>
      </router-link>
    </div>
    <div v-if="speeds" :style="{ height: `${speedH}px` }">
      <div v-if="states.length" class="small muted" style="margin-bottom:8px">Vitesses</div>
      <WSensors :config="speedCfg" :size="{ w: size.w, h: speedH - (states.length ? 26 : 0) }" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Fan } from 'lucide-vue-next'
import WSensors from './WSensors.vue'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { devName, reducedMotion as reduced } from '../../utils'
import { interpretState } from '../../dashboard/states'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false)

const isFan = (s) => /fan|ventil|cooling/i.test(`${s.sensor_descr} ${s.sensor_type}`)

const interpret = (s) => interpretState(s, props.config.okValue)

const mine = computed(() => all.value.filter((s) => !+s.sensor_deleted && devById.value[s.device_id]
  && (!props.config.device || devById.value[s.device_id].hostname === props.config.device)))
const states = computed(() => {
  const rank = { crit: 0, warn: 1, unk: 2, ok: 3 }
  return mine.value.filter((s) => s.sensor_class === 'state' && isFan(s))
    .map((s) => { const [label, st] = interpret(s); return { ...s, label, st } })
    .filter((s) => !props.config.onlyAlarm || s.st !== 'ok')
    .sort((a, b) => rank[a.st] - rank[b.st] || devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id])) || String(a.sensor_descr).localeCompare(String(b.sensor_descr)))
})
const speeds = computed(() => mine.value.filter((s) => s.sensor_class === 'fanspeed').length)
const speedCfg = computed(() => ({ ...props.config, cls: 'fanspeed', mode: props.config.mode || 'tiles', sort: 'desc', limit: props.config.limit || 24 }))
const statesH = computed(() => {
  if (!states.value.length) return 0
  const cols = Math.max(1, Math.floor((props.size.w + 10) / 190))
  return Math.ceil(states.value.length / cols) * 78 + 14
})
const speedH = computed(() => Math.max(160, props.size.h - statesH.value))
const link = (s) => `/device/${encodeURIComponent(devById.value[s.device_id]?.hostname || '')}/health`

useLoader(async () => {
  const [s, d] = await Promise.all([D.sensors(), devicesFor(props.config)])
  all.value = s
  devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
  loaded.value = true
})
</script>

<style scoped>
.fans { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.fan { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); border-left: 3px solid var(--green); color: var(--text); min-width: 0; transition: transform .15s; }
.fan:hover { text-decoration: none; transform: translateY(-1px); }
.fan .ico { flex: none; color: var(--green); }
.fan.ok .ico.spin { animation: spin 2.4s linear infinite; }
.fan.warn { border-left-color: var(--orange); } .fan.warn .ico, .fan.warn .lbl { color: var(--orange); }
.fan.crit { border-left-color: var(--red); background: color-mix(in srgb, var(--red) 10%, var(--panel-2)); } .fan.crit .ico, .fan.crit .lbl { color: var(--red); }
.fan.unk { border-left-color: #64748b; } .fan.unk .ico { color: #64748b; }
.descr { font-size: 12.5px; font-weight: 500; }
.lbl { font-size: 14px; font-weight: 700; color: var(--green); }
.fan.unk .lbl { color: var(--muted); }
</style>
