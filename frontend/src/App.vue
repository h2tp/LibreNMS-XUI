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

  <div v-else class="layout" :class="{ 'menu-top': topMenu }">
    <transition name="fade"><div v-if="isMobile && prefs.sidebar" class="sb-backdrop" @click="closeSidebar"></div></transition>
    <aside v-if="!topMenu || isMobile" class="sidebar" :class="{ collapsed: !prefs.sidebar, mobile: isMobile }">
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
        <button v-if="!topMenu || isMobile" class="btn ghost icon" :title="t('Menu')" @click="toggleSidebar"><PanelLeft /></button>
        <template v-if="topMenu && !isMobile">
          <router-link to="/" class="brand top-brand" :title="t('Tableau de bord')">
            <div class="brand-logo"><Activity :size="17" color="#fff" /></div>
            <span class="brand-text">{{ t('LibreNMS') }} <span class="grad-text">XUI</span></span>
          </router-link>
          <nav class="topnav">
            <div v-for="sec in nav" :key="sec.title" class="tn-sec" :class="{ active: secActive(sec) }">
              <button class="tn-btn" type="button">
                <component :is="sec.icon" :size="16" /><span>{{ sec.title }}</span>
                <span v-if="alertCount && sec.items.some((i) => i.to === '/alerts')" class="count">{{ alertCount }}</span>
                <ChevronDown :size="14" class="chev" />
              </button>
              <div class="tn-menu">
                <router-link v-for="it in sec.items" :key="it.to" :to="it.to" @click="blurMenu">
                  <component :is="it.icon" /><span>{{ it.label }}</span>
                  <span v-if="it.to === '/alerts' && alertCount" class="count">{{ alertCount }}</span>
                </router-link>
              </div>
            </div>
          </nav>
        </template>
        <div class="searchbox" :class="{ compact: topMenu && !isMobile }" @click="paletteOpen = true">
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
        <button v-if="!isMobile" class="btn ghost icon" :title="topMenu ? t('Menu latéral') : t('Menu en haut')" @click="toggleMenu">
          <PanelLeft v-if="topMenu" /><PanelTop v-else />
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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Activity, LayoutDashboard, Server, Network, Bell, ScrollText, Map, Share2, Boxes, MapPin, HeartPulse,
  Route, Database, Receipt, Settings2, Search, PanelLeft, Sun, Moon, ExternalLink, LogOut, UserRound, RefreshCw,
  Loader2, CircleCheck, CircleAlert, Info, Lock, Thermometer, Code2, X, Workflow, Rows3, FoldHorizontal, UnfoldHorizontal,
  Maximize, Minimize, PanelTop, ChevronDown, MonitorDot,
} from 'lucide-vue-next'
import { session, auth, api, pick } from './api'
import { prefs, save, toasts } from './utils'
import { clock, refreshNow } from './refresh'
import { kiosk, exitKiosk } from './kiosk'
import router from './router'
import { useRoute } from 'vue-router'
import Login from './views/Login.vue'
import CommandPalette from './components/CommandPalette.vue'
import LangSwitch from './components/LangSwitch.vue'
import { t } from './i18n'

const nav = [
  { title: t('Supervision'), icon: MonitorDot, items: [
    { to: '/', label: t('Tableau de bord'), icon: LayoutDashboard },
    { to: '/devices', label: t('Équipements'), icon: Server },
    { to: '/ports', label: t('Ports'), icon: Network },
    { to: '/health', label: t('Santé & capteurs'), icon: Thermometer },
    { to: '/alerts', label: t('Alertes'), icon: Bell },
    { to: '/logs', label: t('Journaux'), icon: ScrollText },
  ] },
  { title: t('Visualisation'), icon: Map, items: [
    { to: '/map', label: t('Carte'), icon: Map },
    { to: '/topology', label: t('Topologie'), icon: Share2 },
    { to: '/diagrams', label: t('Schémas'), icon: Workflow },
    { to: '/racks', label: t('Baies'), icon: Rows3 },
  ] },
  { title: t('Inventaire'), icon: Boxes, items: [
    { to: '/groups', label: t('Groupes'), icon: Boxes },
    { to: '/locations', label: t('Emplacements'), icon: MapPin },
    { to: '/services', label: t('Services'), icon: HeartPulse },
    { to: '/routing', label: t('Routage'), icon: Route },
    { to: '/resources', label: t('Ressources IP/MAC'), icon: Database },
    { to: '/bills', label: t('Facturation'), icon: Receipt },
  ] },
  { title: t('Administration'), icon: Settings2, items: [
    { to: '/system', label: t('Système'), icon: Settings2 },
    { to: '/explorer', label: t('Explorateur API'), icon: Code2 },
  ] },
]

const route = useRoute()
// Menu en haut : rubriques en menus déroulants (survol ou clic), comme la barre de LibreNMS
const topMenu = computed(() => prefs.menu === 'top')
function toggleMenu() { prefs.menu = topMenu.value ? 'side' : 'top'; save('menu', prefs.menu); window.dispatchEvent(new Event('resize')) }
const secActive = (sec) => sec.items.some((i) => (i.to === '/' ? route.path === '/' || route.path.startsWith('/dashboard') : route.path.startsWith(i.to)))
function blurMenu() { document.activeElement?.blur?.() }

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
/* menu en haut */
.top-brand { padding: 0; gap: 9px; font-size: 15px; color: var(--text); flex: none; }
.top-brand:hover { text-decoration: none; }
.top-brand .brand-logo { width: 30px; height: 30px; border-radius: 9px; }
.topnav { display: flex; align-items: center; gap: 2px; margin-left: 10px; }
.tn-sec { position: relative; }
.tn-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border: 0; border-radius: 10px; background: none; color: var(--muted);
  font: inherit; font-weight: 500; white-space: nowrap; cursor: pointer; transition: background .15s, color .15s; }
.tn-btn .chev { opacity: .6; transition: transform .15s; }
.tn-sec:hover .tn-btn, .tn-sec:focus-within .tn-btn { background: var(--panel-2); color: var(--text); }
.tn-sec:hover .chev, .tn-sec:focus-within .chev { transform: rotate(180deg); }
.tn-sec.active .tn-btn { color: var(--text); background: linear-gradient(90deg, rgba(34, 211, 238, .14), rgba(139, 92, 246, .06)); }
.tn-btn .count, .tn-menu .count { font-size: 11px; padding: 0 6px; border-radius: 20px; background: var(--red); color: #fff; font-weight: 600; }
.tn-menu { position: absolute; top: 100%; left: 0; z-index: 50; min-width: 220px; padding: 6px; margin-top: 4px; border-radius: 12px;
  background: var(--panel-solid); border: 1px solid var(--border); box-shadow: var(--shadow);
  opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .15s, transform .15s, visibility .15s; }
.tn-menu::before { content: ''; position: absolute; left: 0; right: 0; top: -8px; height: 8px; } /* garde le survol entre bouton et menu */
.tn-sec:hover .tn-menu, .tn-sec:focus-within .tn-menu { opacity: 1; visibility: visible; transform: none; }
.tn-menu a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: var(--muted); font-weight: 500; white-space: nowrap; }
.tn-menu a svg { width: 17px; height: 17px; flex: none; }
.tn-menu a:hover { background: var(--panel-2); color: var(--text); text-decoration: none; }
.tn-menu a.router-link-exact-active, .tn-menu a.router-link-active:not([href="/"]) { color: var(--text); background: rgba(34, 211, 238, .12); }
.tn-menu a .count { margin-left: auto; }
/* recherche : se réduit (texte tronqué, puis icône seule) au lieu de faire déborder la barre */
.topnav, .top-brand { flex: none; }
.menu-top .topbar > :not(.searchbox):not(.grow) { flex-shrink: 0; }
.searchbox.compact { flex: 0 1 260px; min-width: 40px; width: auto; overflow: hidden; padding: 8px 11px; }
.searchbox.compact > span:not(.kbd) { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.searchbox.compact > svg, .searchbox.compact .kbd { flex: none; }
@media (max-width: 1500px) { .searchbox.compact .kbd { display: none; } }
@media (max-width: 1350px) { .topnav .tn-btn > span:not(.count) { display: none; } .top-brand .brand-text { display: none; } }
.kiosk { min-height: 100vh; }
.kiosk .content { padding: 16px 20px; }
.kiosk.idle, .kiosk.idle * { cursor: none !important; }
.kiosk-ctl { position: fixed; right: 16px; bottom: 16px; z-index: 30; display: flex; gap: 8px; transition: opacity .3s; }
.kiosk-ctl .btn { background: var(--panel); backdrop-filter: blur(14px); box-shadow: var(--shadow); }
.kiosk.idle .kiosk-ctl { opacity: 0; pointer-events: none; }
</style>
