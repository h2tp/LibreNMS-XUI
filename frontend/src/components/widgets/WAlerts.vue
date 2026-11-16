<template>
  <div v-if="!shown.length" class="empty"><ShieldCheck color="var(--green)" style="opacity:1" /><div>{{ t('Aucune alerte active ✨') }}</div></div>
  <div v-else class="col" style="gap:8px">
    <router-link v-for="a in shown" :key="a.id" class="alert-row" :class="severityClass(a.sev)" :to="devById[a.device_id] ? `/device/${encodeURIComponent(devById[a.device_id].hostname)}/alerts` : '/alerts'">
      <span class="dot" :class="severityClass(a.sev)"></span>
      <div class="grow" style="min-width:0">
        <div class="ellipsis"><b>{{ a.rule }}</b><span v-if="targets[a.id]" class="muted"> · {{ targets[a.id] }}</span></div>
        <div class="small muted ellipsis">{{ devName(devById[a.device_id]) || a.hostname }} · {{ timeAgo(a.timestamp) }}</div>
      </div>
      <span class="badge" :class="severityClass(a.sev)">{{ a.sev || 'alerte' }}</span>
    </router-link>
    <router-link v-if="filtered.length > shown.length" to="/alerts" class="small" style="text-align:center">+ {{ filtered.length - shown.length }} autre(s) →</router-link>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { D, devicesFor } from '../../dashboard/data'
import { alertDetails, alertTargets } from '../../api'
import { useLoader } from '../../refresh'
import { devName, timeAgo, severityClass } from '../../utils'
import { t } from '../../i18n'

const props = defineProps({ config: Object, size: Object })
const devices = ref([]); const alerts = ref([]); const rules = ref({}); const targets = ref({})
const devById = computed(() => Object.fromEntries(devices.value.map((d) => [d.device_id, d])))
const filtered = computed(() => alerts.value
  .filter((a) => !props.config.group || devById.value[a.device_id])
  .map((a) => ({ ...a, rule: a.name || a.rule_name || rules.value[a.rule_id]?.name || t('Règle #{id}', { id: a.rule_id }), sev: a.severity || rules.value[a.rule_id]?.severity }))
  .filter((a) => !props.config.severity || severityClass(a.sev) === props.config.severity))
const shown = computed(() => filtered.value.slice(0, props.config.limit || 10))
useLoader(async () => {
  [devices.value, alerts.value, rules.value] = await Promise.all([devicesFor(props.config), D.alerts(), D.rules().catch(() => ({}))])
  Promise.all(shown.value.map((a) => alertDetails(a).then((d) => [a.id, alertTargets(d).join(', ')]).catch(() => [a.id, ''])))
    .then((l) => { targets.value = Object.fromEntries(l) })
})
</script>
<style scoped>
.alert-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--panel-2); border-left: 3px solid var(--orange); color: var(--text); }
.alert-row:hover { text-decoration: none; filter: brightness(1.1); }
.alert-row.critical { border-left-color: var(--red); }
.alert-row.info { border-left-color: var(--blue); }
</style>
