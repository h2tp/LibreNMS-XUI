<template>
  <div>
    <div v-if="error && !device" class="err">{{ error }}</div>
    <div v-else-if="!device" class="col"><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:400px;margin-top:18px"></div></div>
    <template v-else>
      <div class="card dev-hero" :class="st">
        <div class="hero-glow"></div>
        <div class="row wrap" style="gap:18px;position:relative">
          <img v-if="osIcon(device)" :src="osIcon(device)" class="os-icon hero-icon" @error="(e) => (e.target.style.display = 'none')" />
          <div class="col" style="gap:4px;min-width:0">
            <div class="row wrap">
              <h1 class="hero-title">{{ devName(device) }}</h1>
              <span class="badge" :class="st"><span class="dot" :class="st"></span>{{ statusLabel[st] }}</span>
              <span v-if="maintenance" class="badge warning"><Wrench :size="12" /> {{ t('Maintenance') }}</span>
              <span v-if="device.status_reason && st === 'down'" class="badge down">{{ device.status_reason }}</span>
            </div>
            <div class="row wrap small muted" style="gap:14px">
              <span class="mono">{{ device.hostname }}</span>
              <span v-if="device.ip" class="mono">{{ device.ip }}</span>
              <span>{{ device.os }} {{ device.version }}</span>
              <span v-if="device.hardware">{{ device.hardware }}</span>
              <span v-if="device.location" class="row" style="gap:4px"><MapPin :size="13" />{{ device.location }}</span>
              <span class="row" style="gap:4px"><Clock :size="13" />{{ fmtUptime(device.uptime) }}</span>
            </div>
          </div>
          <div class="grow"></div>
          <div class="row wrap">
            <button class="btn" :title="t('Rafraîchir')" @click="reload()"><RefreshCw :class="{ spin: loading }" /></button>
            <template v-if="!session.read_only">
              <button class="btn" @click="rediscover"><ScanSearch /> {{ t('Redécouvrir') }}</button>
              <button class="btn" @click="tab = 'settings'"><Settings /> {{ t('Gérer') }}</button>
            </template>
            <a class="btn" :href="`${session.librenms_url}/device/device=${device.device_id}/`" target="_blank"><ExternalLink /> {{ t('LibreNMS') }}</a>
          </div>
        </div>
      </div>

      <div class="tabs mt">
        <button v-for="tb in tabs" :key="tb.id" :class="{ on: tab === tb.id }" @click="tab = tb.id"><component :is="tb.icon" />{{ tb.label }}</button>
      </div>

      <transition name="fade" mode="out-in">
        <keep-alive :max="4">
          <component :is="tabComp" :key="tab" :device="device" :files="files" @changed="reload()" />
        </keep-alive>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MapPin, Clock, RefreshCw, ScanSearch, Settings, ExternalLink, Wrench, LayoutDashboard, Network, HeartPulse, LineChart,
  Boxes, Share2, Route, Bell, ScrollText, Activity, Cog, Puzzle, FileCode2,
} from 'lucide-vue-next'
import { session, api, L, rrd } from '../api'
import { useLoader } from '../refresh'
import { devName, devStatus, statusLabel, osIcon, fmtUptime, toast, toastError } from '../utils'
import { t } from '../i18n'

const A = (f) => defineAsyncComponent(f)
const comps = {
  overview: A(() => import('./device/Overview.vue')),
  ports: A(() => import('./device/DevPorts.vue')),
  health: A(() => import('./device/DevHealth.vue')),
  graphs: A(() => import('./device/DevGraphs.vue')),
  inventory: A(() => import('./device/DevInventory.vue')),
  network: A(() => import('./device/DevNetwork.vue')),
  routing: A(() => import('./device/DevRouting.vue')),
  services: A(() => import('./device/DevServices.vue')),
  alerts: A(() => import('./device/DevAlerts.vue')),
  logs: A(() => import('./device/DevLogs.vue')),
  availability: A(() => import('./device/DevAvailability.vue')),
  components: A(() => import('./device/DevComponents.vue')),
  config: A(() => import('./device/DevConfig.vue')),
  settings: A(() => import('./device/DevSettings.vue')),
}
const tabs = computed(() => [
  { id: 'overview', label: t('Vue d\'ensemble'), icon: LayoutDashboard },
  { id: 'ports', label: t('Ports'), icon: Network },
  { id: 'health', label: t('Santé'), icon: HeartPulse },
  { id: 'graphs', label: t('Graphiques'), icon: LineChart },
  { id: 'inventory', label: t('Inventaire'), icon: Boxes },
  { id: 'network', label: t('Réseau'), icon: Share2 },
  { id: 'routing', label: t('Routage'), icon: Route },
  { id: 'services', label: t('Services'), icon: Activity },
  { id: 'alerts', label: t('Alertes'), icon: Bell },
  { id: 'logs', label: t('Journaux'), icon: ScrollText },
  { id: 'availability', label: t('Disponibilité'), icon: Clock },
  { id: 'components', label: t('Composants'), icon: Puzzle },
  { id: 'config', label: t('Configuration'), icon: FileCode2 },
  ...(session.read_only ? [] : [{ id: 'settings', label: t('Gestion'), icon: Cog }]),
])

const route = useRoute()
const router = useRouter()
const host = computed(() => route.params.host)
const tab = ref(route.params.tab || 'overview')
watch(tab, (t) => router.replace({ name: 'device', params: { host: host.value, tab: t === 'overview' ? undefined : t } }))
watch(() => route.params.tab, (t) => { if (route.name === 'device') tab.value = t || 'overview' })
const tabComp = computed(() => comps[tab.value] || comps.overview)

const device = ref(null)
const files = ref([])
const maintenance = ref(false)
const st = computed(() => devStatus(device.value))

const { loading, error, reload } = useLoader(async ({ silent }) => {
  const d = await L.device(host.value)
  if (!d) throw new Error(t('Équipement « {h} » introuvable', { h: host.value }))
  device.value = d
  if (!silent || !files.value.length) {
    if (session.rrd) files.value = (await rrd.list(d.hostname).catch(() => ({ files: [] }))).files.map((f) => f.name)
    api.get(`devices/${L.enc(d.hostname)}/maintenance`).then((r) => { maintenance.value = !!(r.is_under_maintenance ?? r.maintenance) }).catch(() => {})
  }
})

async function rediscover() {
  try { const r = await api.get(`devices/${L.enc(device.value.hostname)}/discover`); toast(r.message || t('Redécouverte planifiée'), 'success') } catch (e) { toastError(e) }
}
</script>

<style scoped>
.dev-hero { overflow: hidden; padding: 22px 24px; }
.hero-glow { position: absolute; inset: 0; background: radial-gradient(600px 200px at 0% 0%, rgba(34, 211, 238, .16), transparent 70%), radial-gradient(500px 200px at 100% 100%, rgba(139, 92, 246, .14), transparent 70%); pointer-events: none; }
.dev-hero.down .hero-glow { background: radial-gradient(600px 200px at 0% 0%, rgba(244, 63, 94, .22), transparent 70%); }
.hero-icon { width: 60px; height: 60px; padding: 8px; border-radius: 14px; }
.hero-title { margin: 0; font-size: 26px; letter-spacing: -.02em; }
</style>
