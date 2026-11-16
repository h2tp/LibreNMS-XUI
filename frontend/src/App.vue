<template>
  <div class="bg-orbs"><span></span><span></span><span></span></div>

  <div v-if="!session.loaded" class="boot"><Loader2 class="spin" :size="36" /></div>
  <Login v-else-if="!session.authenticated" />

  <!-- Mode kiosque : le tableau de bord seul, sur toute la largeur -->
  <div v-else-if="kiosk.on" class="kiosk" :class="{ idle }" @mousemove="poke" @touchstart.passive="poke">
    <main class="content wide">
      <router-view v-slot="{ Component, route }">
        <transition name="fade" mode="out-in">
          <component :is="Component" :key="route.fullPath.split('?')[0].split('/').slice(0, 2).join('/')" />
        </transition>
      </router-view>
    </main>
    <div class="kiosk-ctl">
      <button class="btn sm" :title="isFull ? t('Quitter le plein écran') : t('Plein écran')" @click="toggleFull">
        <Minimize v-if="isFull" /><Maximize v-else />
      </button>
      <button class="btn sm" :title="t('Quitter le mode kiosque (Échap)')" @click="exitKiosk"><LogOut /> {{ t('Quitter') }}</button>
    </div>
  </div>

  <div v-else class="layout">
    <transition name="fade"><div v-if="isMobile && prefs.sidebar" class="sb-backdrop" @click="closeSidebar"></div></transition>
    <aside class="sidebar" :class="{ collapsed: !prefs.sidebar, mobile: isMobile }">
      <div class="brand">
        <div class="brand-logo"><Activity :size="20" color="#fff" /></div>
        <div class="brand-text">{{ t('LibreNMS') }} <span class="grad-text">XUI</span><small>{{ t('Supervision réseau') }}</small></div>
        <button v-if="isMobile" class="btn ghost icon sb-close" :title="t('Fermer le menu')" @click="closeSidebar"><X /></button>
      </div>
      <nav class="nav">
        <template v-for="sec in nav" :key="sec.title">
          <div class="nav-title">{{ sec.title }}</div>
          <router-link v-for="it in sec.items" :key="it.to" :to="it.to" :title="it.label">
            <component :is="it.icon" /><span class="lbl">{{ it.label }}</span>
            <span v-if="it.to === '/alerts' && alertCount" class="count lbl">{{ alertCount }}</span>
          </router-link>
        </template>
      </nav>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="btn ghost icon" :title="t('Menu')" @click="toggleSidebar"><PanelLeft /></button>
        <div class="searchbox" @click="paletteOpen = true">
          <Search :size="16" /><span>{{ t('Rechercher équipement, port, IP…') }}</span><span class="kbd">{{ t('Ctrl K') }}</span>
        </div>
        <div class="grow"></div>
        <span v-if="session.read_only" class="badge warning" :title="t('Modifications désactivées')"><Lock :size="12" /> {{ t('Lecture seule') }}</span>
        <div class="row small muted nowrap refresh-ctl" :title="t('Rafraîchissement automatique')">
          <RefreshCw :size="15" :class="{ spin: spinning }" @click="manualRefresh" style="cursor:pointer" />
          <select v-model.number="prefs.refresh" class="input" style="padding:5px 8px" @change="save('refresh', prefs.refresh)">
            <option :value="0">{{ t('Manuel') }}</option><option :value="15">15 s</option><option :value="30">30 s</option>
            <option :value="60">1 min</option><option :value="300">5 min</option>
          </select>
        </div>
        <button class="btn ghost icon wide-btn" :class="{ on: prefs.wide }" :title="prefs.wide ? t('Largeur normale') : t('Pleine largeur')" @click="toggleWide">
          <FoldHorizontal v-if="prefs.wide" /><UnfoldHorizontal v-else />
        </button>
        <button class="btn ghost icon" :title="prefs.theme === 'dark' ? t('Thème clair') : t('Thème sombre')" @click="toggleTheme">
          <Sun v-if="prefs.theme === 'dark'" /><Moon v-else />
        </button>
        <a v-if="session.librenms_url" class="btn ghost icon" :href="session.librenms_url" target="_blank" :title="t('Ouvrir LibreNMS')"><ExternalLink /></a>
        <LangSwitch />
        <div v-if="session.auth_mode !== 'none'" class="row">
          <span class="user-chip" :title="session.role ? t('Rôle : {r}', { r: ({ admin: t('administrateur LibreNMS'), 'global-read': t('lecture globale LibreNMS'), local: t('compte local XUI') })[session.role] || session.role }) : ''"><UserRound :size="15" />{{ session.user }}</span>
          <button class="btn ghost icon" :title="t('Déconnexion')" @click="logout"><LogOut /></button>
        </div>
      </header>

      <main class="content" :class="{ wide: prefs.wide }">
        <router-view v-slot="{ Component, route }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="route.name === 'device' ? route.params.host : route.fullPath.split('?')[0].split('/').slice(0, 2).join('/')" />
          </transition>
        </router-view>
      </main>
    </div>

    <CommandPalette v-if="paletteOpen" @close="paletteOpen = false" />
  </div>

  <div class="toasts">
    <transition-group name="toast">
      <div v-for="ts in toasts" :key="ts.id" class="toast" :class="ts.type">
        <CircleCheck v-if="ts.type === 'success'" :size="18" color="var(--green)" />
        <CircleAlert v-else-if="ts.type === 'error'" :size="18" color="var(--red)" />
        <Info v-else :size="18" color="var(--accent)" />
        <span>{{ ts.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Activity, LayoutDashboard, Server, Network, Bell, ScrollText, Map, Share2, Boxes, MapPin, HeartPulse,
  Route, Database, Receipt, Settings2, Search, PanelLeft, Sun, Moon, ExternalLink, LogOut, UserRound, RefreshCw,
  Loader2, CircleCheck, CircleAlert, Info, Lock, Thermometer, Code2, X, Workflow, Rows3, FoldHorizontal, UnfoldHorizontal,
  Maximize, Minimize,
} from 'lucide-vue-next'
import { session, auth, api, pick } from './api'
import { prefs, save, toasts } from './utils'
import { clock, refreshNow } from './refresh'
import { kiosk, exitKiosk } from './kiosk'
import router from './router'
import Login from './views/Login.vue'
import CommandPalette from './components/CommandPalette.vue'
import LangSwitch from './components/LangSwitch.vue'
import { t } from './i18n'

const nav = [
  { title: t('Supervision'), items: [
    { to: '/', label: t('Tableau de bord'), icon: LayoutDashboard },
    { to: '/devices', label: t('Équipements'), icon: Server },
    { to: '/ports', label: t('Ports'), icon: Network },
    { to: '/health', label: t('Santé & capteurs'), icon: Thermometer },
    { to: '/alerts', label: t('Alertes'), icon: Bell },
    { to: '/logs', label: t('Journaux'), icon: ScrollText },
  ] },
  { title: t('Visualisation'), items: [
    { to: '/map', label: t('Carte'), icon: Map },
    { to: '/topology', label: t('Topologie'), icon: Share2 },
    { to: '/diagrams', label: t('Schémas'), icon: Workflow },
    { to: '/racks', label: t('Baies'), icon: Rows3 },
  ] },
  { title: t('Inventaire'), items: [
    { to: '/groups', label: t('Groupes'), icon: Boxes },
    { to: '/locations', label: t('Emplacements'), icon: MapPin },
    { to: '/services', label: t('Services'), icon: HeartPulse },
    { to: '/routing', label: t('Routage'), icon: Route },
    { to: '/resources', label: t('Ressources IP/MAC'), icon: Database },
    { to: '/bills', label: t('Facturation'), icon: Receipt },
  ] },
  { title: t('Administration'), items: [
    { to: '/system', label: t('Système'), icon: Settings2 },
    { to: '/explorer', label: t('Explorateur API'), icon: Code2 },
  ] },
]

const paletteOpen = ref(false)
const alertCount = ref(0)
const spinning = ref(false)

function applyTheme() { document.documentElement.dataset.theme = (kiosk.on && kiosk.theme) || prefs.theme }
watch(() => [kiosk.on, kiosk.theme], applyTheme)

// Kiosque : commandes et curseur masqués après quelques secondes sans mouvement.
const idle = ref(true)
const isFull = ref(!!document.fullscreenElement)
let idleTimer = null
function poke() { idle.value = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => (idle.value = true), 3000) }
function onFull() { isFull.value = !!document.fullscreenElement }
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
function toggleWide() { prefs.wide = !prefs.wide; save('wide', prefs.wide); window.dispatchEvent(new Event('resize')) }
function toggleTheme() { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; save('theme', prefs.theme); applyTheme() }
// Sur mobile, le menu est un panneau superposé : il se ferme par la croix, le fond, Échap ou en changeant de page.
const isMobile = ref(window.innerWidth < 900)
function toggleSidebar() { prefs.sidebar = !prefs.sidebar; if (!isMobile.value) save('sidebar', prefs.sidebar) }
function closeSidebar() { prefs.sidebar = false }
function onResize() {
  const m = window.innerWidth < 900
  if (m && !isMobile.value) prefs.sidebar = false
  isMobile.value = m
}
router.afterEach(() => { if (isMobile.value) prefs.sidebar = false })
function manualRefresh() { spinning.value = true; refreshNow(); setTimeout(() => (spinning.value = false), 800) }
async function logout() { await auth.logout().catch(() => {}); }

async function loadAlerts() {
  if (!session.authenticated) return
  try { alertCount.value = pick(await api.get('alerts', { state: 1 }), 'alerts').length } catch { /* ignore */ }
}
watch(() => clock.tick, loadAlerts)
watch(() => session.authenticated, (v) => v && loadAlerts())

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen.value = !paletteOpen.value }
  if (kiosk.on) {
    // Échap quitte d'abord le plein écran (géré par le navigateur), puis le kiosque.
    if (e.key === 'Escape' && !document.fullscreenElement && !document.querySelector('.overlay')) exitKiosk()
    return
  }
  if (e.key === 'Escape') { paletteOpen.value = false; if (isMobile.value) prefs.sidebar = false }
}
onMounted(async () => {
  applyTheme()
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  document.addEventListener('fullscreenchange', onFull)
  try { await auth.config() } catch { session.loaded = true }
  if (window.innerWidth < 900) prefs.sidebar = false
  loadAlerts()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize)
  document.removeEventListener('fullscreenchange', onFull); clearTimeout(idleTimer)
})
</script>

<style>
.boot { height: 100vh; display: grid; place-items: center; color: var(--accent); }
.user-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 20px; background: var(--panel-2); border: 1px solid var(--border); font-size: 12.5px; font-weight: 500; }
@media (max-width: 900px) { .refresh-ctl, .user-chip { display: none !important; } }
@media (max-width: 1900px) { .wide-btn { display: none !important; } } /* sans effet sous 1800 px de contenu */
.wide-btn.on { color: var(--accent); }
.kiosk { min-height: 100vh; }
.kiosk .content { padding: 16px 20px; }
.kiosk.idle, .kiosk.idle * { cursor: none !important; }
.kiosk-ctl { position: fixed; right: 16px; bottom: 16px; z-index: 30; display: flex; gap: 8px; transition: opacity .3s; }
.kiosk-ctl .btn { background: var(--panel); backdrop-filter: blur(14px); box-shadow: var(--shadow); }
.kiosk.idle .kiosk-ctl { opacity: 0; pointer-events: none; }
</style>
