// Traduction de l'interface : le texte français sert de clé.
//   t('Équipements')                 → « Devices » en anglais
//   t('{n} équipement(s)', { n: 3 }) → paramètres entre accolades
// Un texte absent du dictionnaire reste affiché en français (aucun texte vide).
// Changer de langue recharge la page : les constantes calculées au chargement des modules
// (menus, catalogues de widgets…) sont ainsi toutes dans la bonne langue.
import en from './i18n/en.js'

const DICTS = { en }
export const LANGS = [{ v: 'fr', l: 'Français' }, { v: 'en', l: 'English' }]

function detect() {
  try {
    const saved = localStorage.getItem('xui.lang')
    if (saved) { const v = JSON.parse(saved); if (v === 'fr' || v === 'en') return v }
  } catch { /* stockage indisponible */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'fr'
  return /^fr\b/i.test(nav) ? 'fr' : 'en'
}

export const lang = detect()
export const locale = lang === 'en' ? 'en-GB' : 'fr-FR'
if (typeof document !== 'undefined') document.documentElement.lang = lang

const dict = DICTS[lang] || null

export function t(fr, params) {
  let s = (dict && dict[fr]) || fr
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m))
  return s
}

export function setLang(v) {
  if (v === lang) return
  try { localStorage.setItem('xui.lang', JSON.stringify(v)) } catch { /* noop */ }
  location.reload()
}
