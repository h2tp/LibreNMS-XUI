import { reactive } from 'vue'
import { session } from './api'
import { t, locale, lang } from './i18n'

export function fmtBits(v, digits = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  const u = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  let i = 0; let x = Math.abs(+v)
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++ }
  return `${(v < 0 ? -x : x).toFixed(x >= 100 || i === 0 ? 0 : digits)} ${u[i]}`
}
export function fmtBytes(v, digits = 1, base = 1024) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  const u = lang === 'en'
    ? (base === 1024 ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'])
    : (base === 1024 ? ['o', 'Kio', 'Mio', 'Gio', 'Tio', 'Pio'] : ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'])
  let i = 0; let x = Math.abs(+v)
  while (x >= base && i < u.length - 1) { x /= base; i++ }
  return `${x.toFixed(i === 0 ? 0 : digits)} ${u[i]}`
}
export function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '—'
  const x = +v
  const a = Math.abs(x)
  if (a >= 1e9) return (x / 1e9).toFixed(digits) + ' G'
  if (a >= 1e6) return (x / 1e6).toFixed(digits) + ' M'
  if (a >= 1e4) return (x / 1e3).toFixed(digits) + ' k'
  return Number.isInteger(x) ? String(x) : x.toFixed(a < 1 ? 3 : digits)
}
export function fmtSpeed(bps) {
  if (!bps) return '—'
  return fmtBits(bps, 0).replace('bps', 'b')
}
export function fmtUptime(sec) {
  sec = +sec
  if (!sec) return '—'
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60)
  if (d) return `${d} ${t('j')} ${h} h`
  if (h) return `${h} h ${m} min`
  return `${m} min`
}
export function toDate(v) {
  if (!v) return null
  if (typeof v === 'number' || /^\d+$/.test(v)) return new Date(+v * (String(v).length <= 10 ? 1000 : 1))
  const d = new Date(String(v).replace(' ', 'T'))
  return isNaN(d) ? null : d
}
export function fmtDate(v) {
  const d = toDate(v)
  return d ? d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' }) : '—'
}
export function timeAgo(v) {
  const d = toDate(v)
  if (!d) return '—'
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  const abs = Math.abs(s)
  const f = (n, u) => (s >= 0 ? t('il y a {n} {u}', { n, u }) : t('dans {n} {u}', { n, u }))
  if (abs < 60) return f(abs, 's')
  if (abs < 3600) return f(Math.round(abs / 60), 'min')
  if (abs < 86400) return f(Math.round(abs / 3600), 'h')
  if (abs < 86400 * 30) return f(Math.round(abs / 86400), t('j'))
  return fmtDate(v)
}
export function pct(a, b) { a = +a; b = +b; return b ? Math.round((a / b) * 1000) / 10 : 0 }

export function devName(d) {
  if (!d) return '?'
  return d.display || d.sysName || d.hostname
}
export function devStatus(d) {
  if (!d) return 'unknown'
  if (+d.disabled) return 'disabled'
  if (+d.ignore) return 'ignored'
  return +d.status ? 'up' : 'down'
}
export const statusLabel = { up: t('En ligne'), down: t('Hors ligne'), disabled: t('Désactivé'), ignored: t('Ignoré'), unknown: t('Inconnu'), warning: t('Alerte'), ok: 'OK', critical: t('Critique') }

export function portStatus(p) {
  if (!p) return 'unknown'
  if (+p.disabled || +p.deleted) return 'disabled'
  if (p.ifAdminStatus === 'down') return 'disabled'
  return p.ifOperStatus === 'up' ? 'up' : 'down'
}
export function portUtil(p) {
  const s = +p.ifSpeed
  if (!s) return 0
  return Math.min(100, (Math.max(+p.ifInOctets_rate || 0, +p.ifOutOctets_rate || 0) * 8 * 100) / s)
}

export function severityClass(sev) {
  sev = String(sev || '').toLowerCase()
  if (sev.includes('crit') || sev === '5' || sev === 'error') return 'critical'
  if (sev.includes('warn') || sev === '4' || sev === '3') return 'warning'
  if (sev.includes('ok') || sev === '1') return 'ok'
  return 'info'
}

export function osIcon(d) {
  if (!d || !session.librenms_url || (!d.icon && !d.os)) return null
  const icon = String(d.icon || `${d.os}.svg`)
  if (icon.startsWith('http')) return icon
  return `${session.librenms_url}/images/${icon.includes('/') ? icon : 'os/' + icon}`
}

export function utilColor(p) {
  if (p >= 90) return 'var(--red)'
  if (p >= 70) return 'var(--orange)'
  if (p >= 40) return 'var(--yellow)'
  return 'var(--green)'
}

export function downloadCSV(rows, columns, filename = 'export.csv') {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }))
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.map((c) => esc(c.label)).join(';')]
  for (const r of rows) lines.push(cols.map((c) => esc(r[c.key])).join(';'))
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// --- toasts
export const toasts = reactive([])
let tid = 0
export function toast(message, type = 'info', timeout = 4000) {
  const id = ++tid
  toasts.push({ id, message, type })
  setTimeout(() => { const i = toasts.findIndex((t) => t.id === id); if (i >= 0) toasts.splice(i, 1) }, timeout)
}
export function toastError(e) { toast(e?.message || String(e), 'error', 6000) }

// --- préférences UI
function load(k, d) { try { const v = localStorage.getItem('xui.' + k); return v === null ? d : JSON.parse(v) } catch { return d } }
export function save(k, v) { try { localStorage.setItem('xui.' + k, JSON.stringify(v)) } catch { /* noop */ } }
export const prefs = reactive({
  theme: load('theme', 'dark'),
  refresh: load('refresh', 60),
  sidebar: load('sidebar', true),
  devView: load('devView', 'cards'),
  range: load('range', '-1d'),
  rackZoom: load('rackZoom', 1),
  cableView: load('cableView', 'real'),
})

export const RANGES = [
  { v: '-1h', l: '1 h' }, { v: '-6h', l: '6 h' }, { v: '-1d', l: '24 h' },
  { v: '-7d', l: t('7 j') }, { v: '-30d', l: t('30 j') }, { v: '-1y', l: t('1 an') },
]

export const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function confirmAction(msg) { return window.confirm(msg) }
// couleurs d'une jauge de disponibilité : vert ≥ 99,4 %, orange ≥ 99 %, rouge en dessous
export function availColors(v) {
  if (v === null || v === undefined || isNaN(v)) return ['#64748b', '#94a3b8']
  return v >= 99.4 ? ['#22c55e', '#34d399'] : v >= 99 ? ['#facc15', '#fb923c'] : ['#f43f5e', '#fb7185']
}
