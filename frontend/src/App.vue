<template>
  <div class="bg-orbs"><span></span><span></span><span></span></div>

  <div v-if="!session.loaded" class="boot"><Loader2 class="spin" :size="36" /></div>
  <Login v-else-if="!session.authenticated" />

  <div v-else class="layout">
    <transition name="fade"><div v-if="isMobile && prefs.sidebar" class="sb-backdrop" @click="closeSidebar"></div></transition>
    <aside class="sidebar" :class="{ collapsed: !prefs.sidebar, mobile: isMobile }">
      <div class="brand">
        <div class="brand-logo"><Activity :size="20" color="#fff" /></div>
        <div class="brand-text">LibreNMS <span class="grad-text">XUI</span><small>Supervision réseau</small></div>
        <button v-if="isMobile" class="btn ghost icon sb-close" title="Fermer le menu" @click="closeSidebar"><X /></button>
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
        <button class="btn ghost icon" title="Menu" @click="toggleSidebar"><PanelLeft /></button>
        <div class="searchbox" @click="paletteOpen = true">
          <Search :size="16" /><span>Rechercher équipement, port, IP…</span><span class="kbd">Ctrl K</span>
        </div>
        <div class="grow"></div>
        <span v-if="session.read_only" class="badge warning" title="Modifications désactivées"><Lock :size="12" /> Lecture seule</span>
        <div class="row small muted nowrap refresh-ctl" title="Rafraîchissement automatique">
          <RefreshCw :size="15" :class="{ spin: spinning }" @click="manualRefresh" style="cursor:pointer" />
          <select v-model.number="prefs.refresh" class="input" style="padding:5px 8px" @change="save('refresh', prefs.refresh)">
            <option :value="0">Manuel</option><option :value="15">15 s</option><option :value="30">30 s</option>
            <option :value="60">1 min</option><option :value="300">5 min</option>
          </select>
        </div>
        <button class="btn ghost icon" :title="prefs.theme === 'dark' ? 'Thème clair' : 'Thème sombre'" @click="toggleTheme">
          <Sun v-if="prefs.theme === 'dark'" /><Moon v-else />
        </button>
        <a v-if="session.librenms_url" class="btn ghost icon" :href="session.librenms_url" target="_blank" title="Ouvrir LibreNMS"><ExternalLink /></a>
        <div v-if="session.auth_mode !== 'none'" class="row">
          <span class="user-chip" :title="session.role ? `Rôle : ${({ admin: 'administrateur LibreNMS', 'global-read': 'lecture globale LibreNMS', local: 'compte local XUI' })[session.role] || session.role}` : ''"><UserRound :size="15" />{{ session.user }}</span>
          <button class="btn ghost icon" title="Déconnexion" @click="logout"><LogOut /></button>
        </div>
      </header>

      <main class="content">
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
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
        <CircleCheck v-if="t.type === 'success'" :size="18" color="var(--green)" />
        <CircleAlert v-else-if="t.type === 'error'" :size="18" color="var(--red)" />
        <Info v-else :size="18" color="var(--accent)" />
        <span>{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Activity, LayoutDashboard, Server, Network, Bell, ScrollText, Map, Share2, Boxes, MapPin, HeartPulse,
  Route, Database, Receipt, Settings2, Search, PanelLeft, Sun, Moon, ExternalLink, LogOut, UserRound, RefreshCw,
  Loader2, CircleCheck, CircleAlert, Info, Lock, Thermometer, Code2, X, Workflow,
} from 'lucide-vue-next'
import { session, auth, api, pick } from './api'
import { prefs, save, toasts } from './utils'
import { clock, refreshNow } from './refresh'
import router from './router'
import Login from './views/Login.vue'
import CommandPalette from './components/CommandPalette.vue'

const nav = [
  { title: 'Supervision', items: [
    { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
    { to: '/devices', label: 'Équipements', icon: Server },
    { to: '/ports', label: 'Ports', icon: Network },
    { to: '/health', label: 'Santé & capteurs', icon: Thermometer },
    { to: '/alerts', label: 'Alertes', icon: Bell },
    { to: '/logs', label: 'Journaux', icon: ScrollText },
  ] },
  { title: 'Visualisation', items: [
    { to: '/map', label: 'Carte', icon: Map },
    { to: '/topology', label: 'Topologie', icon: Share2 },
    { to: '/diagrams', label: 'Schémas', icon: Workflow },
  ] },
  { title: 'Inventaire', items: [
    { to: '/groups', label: 'Groupes', icon: Boxes },
    { to: '/locations', label: 'Emplacements', icon: MapPin },
    { to: '/services', label: 'Services', icon: HeartPulse },
    { to: '/routing', label: 'Routage', icon: Route },
    { to: '/resources', label: 'Ressources IP/MAC', icon: Database },
    { to: '/bills', label: 'Facturation', icon: Receipt },
  ] },
  { title: 'Administration', items: [
    { to: '/system', label: 'Système', icon: Settings2 },
    { to: '/explorer', label: 'Explorateur API', icon: Code2 },
  ] },
]

const paletteOpen = ref(false)
const alertCount = ref(0)
const spinning = ref(false)

function applyTheme() { document.documentElement.dataset.theme = prefs.theme }
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
  if (e.key === 'Escape') { paletteOpen.value = false; if (isMobile.value) prefs.sidebar = false }
}
onMounted(async () => {
  applyTheme()
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  try { await auth.config() } catch { session.loaded = true }
  if (window.innerWidth < 900) prefs.sidebar = false
  loadAlerts()
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) })
</script>

<style>
.boot { height: 100vh; display: grid; place-items: center; color: var(--accent); }
.user-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 20px; background: var(--panel-2); border: 1px solid var(--border); font-size: 12.5px; font-weight: 500; }
@media (max-width: 900px) { .refresh-ctl, .user-chip { display: none !important; } }
</style>
