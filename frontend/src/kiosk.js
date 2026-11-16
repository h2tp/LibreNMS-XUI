// Mode kiosque : tableau de bord seul, sans menu ni barre du haut, pour un écran mural.
// Tout est porté par l'URL (marque-page ou démarrage automatique d'un navigateur) :
//   /dashboard/<id>?kiosk                     tableau seul
//   &rotate=60                                rotation entre tableaux toutes les 60 s
//   &boards=<id1>,<id2>                       tableaux de la rotation (défaut : tous ceux visibles)
//   &refresh=30                               rafraîchissement en secondes (sans toucher aux préférences)
//   &theme=dark|light                         thème imposé
//   &header=0                                 masque le bandeau (nom, horloge)
// Échap ou le bouton « Quitter » (visible au mouvement de la souris) ramène à l'interface normale.
import { reactive, computed, watch } from 'vue'
import router from './router'
import { prefs } from './utils'

const route = router.currentRoute
const q = computed(() => route.value.query)

export const kiosk = reactive({
  on: computed(() => q.value.kiosk !== undefined),
  rotate: computed(() => Math.max(0, parseInt(q.value.rotate, 10) || 0)),
  boards: computed(() => String(q.value.boards || '').split(',').map((s) => s.trim()).filter(Boolean)),
  header: computed(() => q.value.header !== '0'),
  refresh: computed(() => { const v = parseInt(q.value.refresh, 10); return v > 0 ? Math.max(5, v) : null }),
  theme: computed(() => (['dark', 'light'].includes(q.value.theme) ? q.value.theme : null)),
})

/** Paramètres de requête à conserver d'un tableau à l'autre pendant la rotation. */
export function kioskQuery() {
  const { kiosk: k, rotate, boards, header, refresh, theme } = q.value
  return Object.fromEntries(Object.entries({ kiosk: k ?? '', rotate, boards, header, refresh, theme }).filter(([, v]) => v !== undefined))
}

/** URL d'un tableau en mode kiosque. */
export function kioskUrl(id, opts = {}) {
  const p = new URLSearchParams()
  if (opts.rotate > 0) p.set('rotate', opts.rotate)
  if (opts.rotate > 0 && opts.boards?.length) p.set('boards', opts.boards.join(','))
  if (opts.refresh > 0) p.set('refresh', opts.refresh)
  if (opts.theme) p.set('theme', opts.theme)
  if (opts.header === false) p.set('header', '0')
  const rest = p.toString()
  return `/dashboard/${encodeURIComponent(id)}?kiosk${rest ? '&' + rest : ''}`
}

export async function enterKiosk(path, fullscreen = true) {
  await router.push(path)
  if (fullscreen && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {})
  }
}

export function exitKiosk() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  router.push({ path: route.value.path })
}

// En kiosque, on reste sur les tableaux de bord : un clic dans un widget n'emmène pas ailleurs.
router.beforeEach((to, from) => {
  if (from.query.kiosk !== undefined && to.query.kiosk === undefined && to.path !== from.path) return false
})

// Rafraîchissement imposé par l'URL, sans enregistrer la préférence ; restauré en sortant.
let savedRefresh = null
watch(() => [kiosk.on, kiosk.refresh], ([on, r]) => {
  if (on && r) {
    if (savedRefresh === null) savedRefresh = prefs.refresh
    prefs.refresh = r
  } else if (savedRefresh !== null) {
    prefs.refresh = savedRefresh
    savedRefresh = null
  }
})

// L'écran ne doit pas se mettre en veille (navigateurs compatibles, HTTPS ou localhost).
let lock = null
async function wake() {
  if (!kiosk.on || document.hidden || lock || !navigator.wakeLock) return
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => (lock = null)) } catch { /* refusé */ }
}
watch(() => kiosk.on, (on) => { if (on) wake(); else if (lock) lock.release().catch(() => {}) }, { immediate: true })
document.addEventListener('visibilitychange', wake)
