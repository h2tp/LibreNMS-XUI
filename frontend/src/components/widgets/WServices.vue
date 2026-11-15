<template>
  <div v-if="error" class="err small">{{ error }}</div>
  <div v-else-if="!loaded" class="col" style="gap:10px"><div v-for="i in 3" :key="i" class="skeleton" style="height:40px"></div></div>
  <div v-else-if="!all.length" class="empty small">
    <HeartPulse /><div>{{ t('Aucun service configuré dans LibreNMS.') }}</div>
    <router-link to="/services" class="btn sm mt">{{ t('Ajouter des services') }}</router-link>
  </div>
  <div v-else class="col" style="gap:12px">
    <div class="summary small">
      <span class="badge ok">{{ c.ok }} OK</span>
      <span v-if="c.warn" class="badge warning">{{ c.warn }} avertissement(s)</span>
      <span v-if="c.crit" class="badge critical">{{ c.crit }} critique(s)</span>
      <span v-if="c.unk" class="badge">{{ c.unk }} inconnu(s)</span>
      <span v-if="c.ign" class="faint">{{ t('{n} ignoré(s)', { n: c.ign }) }}</span>
    </div>

    <div v-if="!list.length" class="empty small"><CircleCheck color="var(--green)" style="opacity:1" /><div>{{ config.onlyProblems ? t('Aucun service en défaut') : t('Aucun service ne correspond aux filtres') }}</div></div>

    <div v-else-if="mode === 'list'" class="col" style="gap:6px">
      <router-link v-for="s in list" :key="s.service_id" :to="link(s)" class="svc" :class="s.st" :title="s.service_message">
        <span class="dot" :class="DOT[s.st]"></span>
        <div class="grow" style="min-width:0">
          <div class="row" style="gap:8px;min-width:0">
            <b class="ellipsis">{{ s.label }}</b>
            <span class="badge sm">{{ s.service_type }}</span>
            <span v-if="!config.device" class="muted small ellipsis">{{ devName(devById[s.device_id]) }}</span>
          </div>
          <div class="small muted ellipsis mono msg">{{ s.service_message || '—' }}</div>
        </div>
        <span class="small muted nowrap" :title="s.service_changed ? fmtDate(s.service_changed * 1000) : ''">{{ s.service_changed ? timeAgo(s.service_changed * 1000) : '' }}</span>
      </router-link>
    </div>

    <div v-else-if="mode === 'tiles'" class="tiles">
      <router-link v-for="s in list" :key="s.service_id" :to="link(s)" class="tile" :class="s.st" :title="`${devName(devById[s.device_id])} · ${s.label}\n${s.service_message || ''}`">
        <span class="ellipsis"><b>{{ s.service_type }}</b> {{ s.service_desc || '' }}</span>
        <span class="ellipsis small">{{ devName(devById[s.device_id]) }}</span>
      </router-link>
    </div>

    <EChart v-else :option="donut" :height="`${Math.max(140, size.h - 40)}px`" />

    <router-link v-if="more" to="/services" class="small" style="text-align:center">+ {{ more }} autre(s) →</router-link>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { HeartPulse, CircleCheck } from 'lucide-vue-next'
import EChart from '../EChart.vue'
import { D, devicesFor } from '../../dashboard/data'
import { useLoader } from '../../refresh'
import { donutOption } from '../../charts'
import { devName, fmtDate, timeAgo } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const all = ref([]); const devById = ref({}); const loaded = ref(false); const error = ref(null)
const mode = computed(() => props.config.mode || 'list')
const ST = { 0: 'ok', 1: 'warn', 2: 'crit' }
const DOT = { ok: 'up', warn: 'warning', crit: 'down', unk: 'disabled', ign: 'disabled' }
const RANK = { crit: 0, warn: 1, unk: 2, ok: 3, ign: 4 }

const scoped = computed(() => {
  const ty = String(props.config.type || '').trim().toLowerCase()
  return all.value.filter((s) => devById.value[s.device_id]
    && (!props.config.device || devById.value[s.device_id].hostname === props.config.device)
    && (!ty || String(s.service_type).toLowerCase().includes(ty)))
    .map((s) => ({
      ...s, label: s.service_name || s.service_desc || s.service_type,
      st: +s.service_ignore || +s.service_disabled ? 'ign' : ST[+s.service_status] || 'unk',
    }))
})
const c = computed(() => {
  const r = { ok: 0, warn: 0, crit: 0, unk: 0, ign: 0 }
  scoped.value.forEach((s) => r[s.st]++)
  return r
})
const filtered = computed(() => scoped.value
  .filter((s) => (props.config.showIgnored || s.st !== 'ign') && (!props.config.onlyProblems || ['warn', 'crit', 'unk'].includes(s.st)))
  .sort((a, b) => RANK[a.st] - RANK[b.st] || devName(devById.value[a.device_id]).localeCompare(devName(devById.value[b.device_id])) || a.label.localeCompare(b.label)))
const list = computed(() => filtered.value.slice(0, props.config.limit || 15))
const more = computed(() => (mode.value === 'summary' ? 0 : filtered.value.length - list.value.length))
const donut = computed(() => {
  const items = [
    { name: 'OK', value: c.value.ok, color: '#22c55e' }, { name: t('Avertissement'), value: c.value.warn, color: '#fb923c' },
    { name: t('Critique'), value: c.value.crit, color: '#f43f5e' }, { name: t('Inconnu'), value: c.value.unk, color: '#64748b' },
  ].filter((x) => x.value)
  const n = c.value.ok + c.value.warn + c.value.crit + c.value.unk
  return donutOption(items, { title: n ? `${Math.round((c.value.ok / n) * 100)}%` : '—', sub: t('services OK') })
})
const link = (s) => { const d = devById.value[s.device_id]; return d ? `/device/${encodeURIComponent(d.hostname)}/services` : '/services' }

useLoader(async () => {
  try {
    const [s, d] = await Promise.all([D.services(), devicesFor(props.config)])
    all.value = s
    devById.value = Object.fromEntries(d.map((x) => [x.device_id, x]))
    error.value = null
  } catch (e) { error.value = e.message } finally { loaded.value = true }
})
</script>

<style scoped>
.summary { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.svc { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--panel-2); border-left: 3px solid var(--green); color: var(--text); min-width: 0; }
.svc:hover { text-decoration: none; filter: brightness(1.1); }
.svc.warn { border-left-color: var(--orange); } .svc.crit { border-left-color: var(--red); } .svc.unk, .svc.ign { border-left-color: #64748b; }
.msg { font-size: 11.5px; margin-top: 2px; }
.badge.sm { font-size: 10.5px; padding: 1px 6px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
.tile { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 7px 10px; border-radius: 8px; font-size: 12px; color: #fff; background: #16a34a; }
.tile:hover { text-decoration: none; filter: brightness(1.12); }
.tile.warn { background: #ea580c; } .tile.crit { background: #e11d48; } .tile.unk, .tile.ign { background: #64748b; }
</style>
