<template>
  <div class="ad" :style="{ '--sev': sevColor }">
    <!-- en-tête : sévérité, état, équipement, chronologie -->
    <div class="hero">
      <div class="hero-main">
        <div class="row wrap" style="gap:8px">
          <span class="badge" :class="severityClass(alert.severity)"><span class="dot" :class="severityClass(alert.severity)"></span>{{ alert.severity }}</span>
          <span class="badge" :class="stateCls">{{ stateLbl }}</span>
          <span v-if="entityLabel" class="badge">{{ entityLabel }}</span>
          <span v-if="untilClear" class="badge info">{{ t('Acquittée jusqu\'à résolution') }}</span>
        </div>
        <div class="hero-dev"><DeviceCell :device="device" :fallback="alert.hostname" /></div>
      </div>
      <div class="timeline">
        <div class="tl-step"><span class="tl-dot"></span><div><div class="faint small">{{ t('Première détection') }}</div><b>{{ fmtDate(alert.first_seen || alert.timestamp) }}</b></div></div>
        <div class="tl-line"><span class="small muted">{{ duration }}</span></div>
        <div class="tl-step"><span class="tl-dot" :class="{ live: +alert.state !== 0 }"></span><div><div class="faint small">{{ +alert.state === 0 ? t('Résolue') : t('Dernière vérification') }}</div><b>{{ fmtDate(alert.last_seen || alert.timestamp) }}</b></div></div>
      </div>
    </div>

    <div v-if="ackNote" class="note"><MessageSquare :size="15" /><span>{{ ackNote }}</span></div>

    <!-- pourquoi : conditions de la règle -->
    <section>
      <h4><ListChecks :size="15" /> {{ t('Conditions de la règle') }}</h4>
      <div v-if="rule?.builder?.rules?.length" class="cond-tree">
        <CondGroup :group="rule.builder" :entity="entities[0]" />
      </div>
      <code v-else-if="rule?.query" class="sql">{{ rule.query }}</code>
      <div v-else class="small faint">{{ t('Règle introuvable') }}</div>
      <details v-if="rule?.query && rule?.builder?.rules?.length" class="more">
        <summary class="small muted">{{ t('Requête SQL') }}</summary>
        <code class="sql">{{ rule.query }}</code>
      </details>
    </section>

    <!-- éléments concernés -->
    <section v-for="(e, i) in entities" :key="i">
      <h4><component :is="e.kind.icon" :size="15" /> {{ e.kind.label }}<span v-if="entities.length > 1" class="faint"> · {{ i + 1 }}/{{ entities.length }}</span></h4>
      <div class="ent">
        <div class="ent-head">
          <component :is="e.link ? 'router-link' : 'span'" :to="e.link" class="ent-title">{{ e.title }}</component>
          <span v-if="e.subtitle" class="muted small ellipsis">{{ e.subtitle }}</span>
        </div>

        <!-- jauge de capteur : valeur courante entre les seuils -->
        <div v-if="e.gauge" class="gauge">
          <div class="g-track">
            <i class="g-zone low" :style="{ width: `${e.gauge.lowPct}%` }"></i>
            <i class="g-zone high" :style="{ left: `${e.gauge.highPct}%`, right: 0 }"></i>
            <span class="g-mark" :style="{ left: `${e.gauge.valPct}%` }"></span>
          </div>
          <div class="g-scale small faint">
            <span>{{ e.gauge.lowTxt }}</span><b :style="{ color: e.gauge.bad ? 'var(--red)' : 'var(--green)' }">{{ e.gauge.valTxt }}</b><span>{{ e.gauge.highTxt }}</span>
          </div>
        </div>

        <div class="metrics">
          <div v-for="m in e.metrics" :key="m.l" class="metric" :class="m.tone">
            <div class="faint small">{{ m.l }}</div>
            <b>{{ m.v }}</b>
            <div v-if="m.s" class="faint small">{{ m.s }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- toutes les propriétés, regroupées -->
    <section v-if="entities.length">
      <details class="more">
        <summary><h4 style="display:inline-flex;margin:0"><Table2 :size="15" /> {{ t('Toutes les propriétés') }}</h4></summary>
        <div class="row wrap" style="gap:10px;margin:10px 0">
          <input v-model="q" class="input" style="flex:1;min-width:180px;padding:6px 10px" :placeholder="t('Filtrer…')" />
          <label class="check small"><input v-model="showEmpty" type="checkbox" /> {{ t('Afficher les valeurs vides') }}</label>
        </div>
        <div v-for="g in groups" :key="g.label" class="pgroup">
          <div class="pg-title small">{{ g.label }} <span class="faint">{{ g.rows.length }}</span></div>
          <div class="props">
            <template v-for="r in g.rows" :key="r.k">
              <span class="pk mono" :class="{ hit: r.hit }">{{ r.k }}</span>
              <span class="pv mono" :class="{ empty: r.empty, secret: r.secret }">{{ r.v }}</span>
            </template>
          </div>
        </div>
        <div v-if="!groups.length" class="small faint">{{ t('Aucune propriété') }}</div>
      </details>
    </section>

    <section>
      <details class="more">
        <summary><h4 style="display:inline-flex;margin:0"><Braces :size="15" /> {{ t('Données brutes') }}</h4></summary>
        <div class="raw-tools"><span class="small faint">{{ t('Les secrets SNMP sont masqués.') }}</span><button class="btn sm" @click="copy"><Copy /> {{ t('Copier') }}</button></div>
        <pre class="code">{{ rawTxt }}</pre>
      </details>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, h } from 'vue'
import { ListChecks, MessageSquare, Table2, Braces, Copy, Network, Thermometer, Server, Activity, Cog } from 'lucide-vue-next'
import DeviceCell from './DeviceCell.vue'
import { fmtDate, toDate, fmtBits, fmtUptime, fmtSpeed, severityClass, toast } from '../utils'
import { t } from '../i18n'

const props = defineProps({ alert: Object, rule: Object, device: Object })
const q = ref(''); const showEmpty = ref(false)

const SEV = { critical: 'var(--red)', warning: 'var(--orange)', ok: 'var(--green)' }
const sevColor = computed(() => SEV[severityClass(props.alert.severity)] || 'var(--blue)')
const STATES = { 0: [t('Résolue'), 'ok'], 1: ['Active', 'critical'], 2: [t('Acquittée'), 'info'], 3: [t('Aggravée'), 'critical'], 4: [t('Améliorée'), 'warning'] }
const stateLbl = computed(() => STATES[props.alert.state]?.[0] ?? props.alert.state)
const stateCls = computed(() => STATES[props.alert.state]?.[1] ?? '')
const ENTITY = { interface: t('Port'), sensor: t('Capteur'), location: t('Équipement'), service: t('Service'), wireless: t('Capteur sans fil') }
const entityLabel = computed(() => ENTITY[props.alert.entity_type] || props.alert.entity_type || '')
const info = computed(() => { try { return typeof props.alert.info === 'string' ? JSON.parse(props.alert.info) : props.alert.info || {} } catch { return {} } })
const untilClear = computed(() => +props.alert.state === 2 && info.value?.until_clear)
const ackNote = computed(() => props.alert.note || '')

function human(sec) {
  sec = Math.max(0, Math.round(sec))
  if (sec < 60) return `${sec} s`
  return fmtUptime(sec)
}
const duration = computed(() => {
  const a = toDate(props.alert.first_seen || props.alert.timestamp)
  const b = +props.alert.state === 0 ? toDate(props.alert.last_seen || props.alert.timestamp) : new Date()
  if (!a || !b) return ''
  return (+props.alert.state === 0 ? t('a duré {d}', { d: human((b - a) / 1000) }) : t('depuis {d}', { d: human((b - a) / 1000) }))
})

// ---------- secrets ----------
const SECRET = /^(authpass|cryptopass|community|authname)$|pass(word)?$|secret|token/i
const mask = (k, v) => (SECRET.test(k) && v !== null && v !== '' ? '••••••' : v)
function scrub(o) {
  if (Array.isArray(o)) return o.map(scrub)
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' ? scrub(v) : mask(k, v)]))
  return o
}
const rawTxt = computed(() => JSON.stringify(scrub(props.alert), null, 2))
function copy() { navigator.clipboard?.writeText(rawTxt.value).then(() => toast(t('Copié'), 'success')).catch(() => {}) }

// ---------- conditions de la règle ----------
const OPS = {
  equal: '=', not_equal: '≠', less: '<', less_or_equal: '≤', greater: '>', greater_or_equal: '≥',
  in: t('parmi'), not_in: t('hors de'), between: t('entre'), not_between: t('hors de'),
  begins_with: t('commence par'), not_begins_with: t('ne commence pas par'), contains: t('contient'), not_contains: t('ne contient pas'),
  ends_with: t('finit par'), not_ends_with: t('ne finit pas par'), is_empty: t('est vide'), is_not_empty: t("n'est pas vide"),
  is_null: t('est nul'), is_not_null: t("n'est pas nul"), regex: t('correspond à'), not_regex: t('ne correspond pas à'),
}
const MACROS = {
  device_down: t('équipement hors ligne'), device_up: t('équipement en ligne'), device: t('équipement actif'),
  port_down: t('port hors ligne'), port_up: t('port en ligne'), port_usage_perc: t('utilisation du port (%)'),
  state_sensor_critical: t('capteur d\'état critique'), state_sensor_warning: t('capteur d\'état en alerte'),
}
const col = (field) => String(field || '').split('.').pop()
const refVal = (v, e) => { const m = /^`(.+)`$/.exec(String(v ?? '')); return m ? { ref: col(m[1]), val: e?.raw?.[col(m[1])] } : null }

function test(op, a, b) {
  const n = (x) => (x === null || x === '' || isNaN(+x) ? null : +x)
  const s = (x) => String(x ?? '').toLowerCase()
  switch (op) {
    case 'equal': return n(a) !== null && n(b) !== null ? n(a) === n(b) : s(a) === s(b)
    case 'not_equal': return n(a) !== null && n(b) !== null ? n(a) !== n(b) : s(a) !== s(b)
    case 'less': return n(a) !== null && n(b) !== null && n(a) < n(b)
    case 'less_or_equal': return n(a) !== null && n(b) !== null && n(a) <= n(b)
    case 'greater': return n(a) !== null && n(b) !== null && n(a) > n(b)
    case 'greater_or_equal': return n(a) !== null && n(b) !== null && n(a) >= n(b)
    case 'contains': return s(a).includes(s(b))
    case 'not_contains': return !s(a).includes(s(b))
    case 'begins_with': return s(a).startsWith(s(b))
    case 'ends_with': return s(a).endsWith(s(b))
    case 'is_empty': return a === '' || a === null
    case 'is_not_empty': return !(a === '' || a === null)
    case 'is_null': return a === null
    case 'is_not_null': return a !== null
    default: return null
  }
}

// rendu récursif des groupes ET / OU
const CondGroup = {
  name: 'CondGroup',
  props: { group: Object, entity: Object },
  setup(p) {
    return () => {
      const g = p.group
      const conj = String(g.condition || 'AND').toUpperCase() === 'OR' ? t('OU') : t('ET')
      const kids = (g.rules || []).map((r, i) => {
        const sep = i ? h('span', { class: 'conj' }, conj) : null
        if (r.rules) return [sep, h('div', { class: 'cond-sub' }, [h(CondGroup, { group: r, entity: p.entity })])]
        const name = col(r.field || r.id)
        const isMacro = String(r.field || r.id).startsWith('macros.')
        const ref = refVal(r.value, p.entity)
        const expected = ref ? ref.val : r.value
        const raw = p.entity?.raw || {}
        const has = !isMacro && Object.prototype.hasOwnProperty.call(raw, name)
        const actual = has ? raw[name] : undefined
        const ok = has ? test(r.operator, actual, expected) : null
        const valTxt = isMacro && r.input === 'radio' ? null : ref ? `${ref.ref}${ref.val !== undefined ? ` (${ref.val})` : ''}` : Array.isArray(r.value) ? r.value.join(', ') : r.value
        return [sep, h('div', { class: ['cond', ok === true && 'met', ok === false && 'unmet'] }, [
          h('span', { class: 'c-field mono', title: r.field }, isMacro ? (MACROS[name] || name) : name),
          isMacro && r.input === 'radio'
            ? h('span', { class: 'c-op' }, String(r.value) === '1' ? t('vrai') : t('faux'))
            : [h('span', { class: 'c-op' }, OPS[r.operator] || r.operator), valTxt !== undefined && valTxt !== null && !/^is_/.test(r.operator) ? h('span', { class: 'c-val mono' }, String(valTxt)) : null],
          has ? h('span', { class: 'c-act' }, [t('valeur'), ' ', h('b', { class: 'mono' }, actual === null ? 'null' : String(actual))]) : null,
        ])]
      })
      return h('div', { class: 'cond-group' }, kids.flat())
    }
  },
}

// ---------- éléments concernés ----------
const num = (v) => (v === null || v === undefined || v === '' ? null : +v)
const fmtN = (v, d = 1) => (v === null ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString())

function describe(e) {
  const isPort = e.port_id !== undefined && e.ifName !== undefined
  const isSensor = e.sensor_id !== undefined
  const isPing = e.ping_rtt_last !== undefined
  const host = e.display || e.sysName || e.hostname
  const devLink = e.hostname ? `/device/${encodeURIComponent(e.hostname)}` : null
  const metrics = []
  let kind; let title = host; let subtitle = ''; let link = devLink; let gauge = null

  if (isPort) {
    kind = { label: t('Port'), icon: Network }
    title = e.ifName || e.ifDescr; subtitle = [host, e.ifAlias && e.ifAlias !== e.ifName ? e.ifAlias : ''].filter(Boolean).join(' · ')
    link = `/port/${e.port_id}`
    const speed = num(e.ifSpeed)
    const inb = num(e.ifInOctets_rate) * 8; const outb = num(e.ifOutOctets_rate) * 8
    const st = (v) => (v === 'up' ? 'good' : v === 'down' ? 'bad' : '')
    metrics.push({ l: t('État opérationnel'), v: e.ifOperStatus || '—', s: e.ifOperStatus_prev && e.ifOperStatus_prev !== e.ifOperStatus ? t('avant : {v}', { v: e.ifOperStatus_prev }) : '', tone: st(e.ifOperStatus) })
    metrics.push({ l: t('État administratif'), v: e.ifAdminStatus || '—', tone: st(e.ifAdminStatus) })
    metrics.push({ l: t('Vitesse'), v: fmtSpeed(speed) })
    metrics.push({ l: t('Entrant'), v: fmtBits(inb), s: speed ? `${fmtN((inb / speed) * 100)} %` : '' })
    metrics.push({ l: t('Sortant'), v: fmtBits(outb), s: speed ? `${fmtN((outb / speed) * 100)} %` : '' })
    const err = (num(e.ifInErrors_rate) || 0) + (num(e.ifOutErrors_rate) || 0)
    metrics.push({ l: t('Erreurs'), v: `${fmtN(err, 2)}/s`, tone: err > 0 ? 'bad' : '' })
  } else if (isSensor) {
    kind = { label: t('Capteur'), icon: Thermometer }
    title = e.sensor_descr || e.sensor_type; subtitle = [host, e.sensor_class].filter(Boolean).join(' · ')
    const cur = num(e.sensor_current)
    if (e.state_descr !== undefined) {
      metrics.push({ l: t('État'), v: e.state_descr || cur, s: e.state_value !== undefined ? t('valeur {v}', { v: e.state_value }) : '', tone: +e.state_generic_value >= 2 ? 'bad' : +e.state_generic_value === 1 ? 'warn' : 'good' })
    } else {
      const lo = num(e.sensor_limit_low); const hi = num(e.sensor_limit)
      metrics.push({ l: t('Valeur'), v: fmtN(cur, 2), s: e.sensor_prev !== null && e.sensor_prev !== undefined ? t('avant : {v}', { v: fmtN(num(e.sensor_prev), 2) }) : '' })
      metrics.push({ l: t('Seuil bas'), v: fmtN(lo, 2), s: e.sensor_limit_low_warn !== null && e.sensor_limit_low_warn !== undefined ? t('alerte {v}', { v: fmtN(num(e.sensor_limit_low_warn), 2) }) : '' })
      metrics.push({ l: t('Seuil haut'), v: fmtN(hi, 2), s: e.sensor_limit_warn !== null && e.sensor_limit_warn !== undefined ? t('alerte {v}', { v: fmtN(num(e.sensor_limit_warn), 2) }) : '' })
      if (cur !== null && (lo !== null || hi !== null)) {
        const a = Math.min(lo ?? cur, cur); const b = Math.max(hi ?? cur, cur)
        const pad = (b - a) * 0.15 || Math.abs(cur) * 0.2 || 1
        const min = a - pad; const max = b + pad; const p = (v) => ((v - min) / (max - min)) * 100
        gauge = {
          lowPct: lo !== null ? p(lo) : 0, highPct: hi !== null ? p(hi) : 100, valPct: Math.max(0, Math.min(100, p(cur))),
          lowTxt: lo !== null ? fmtN(lo, 2) : '', highTxt: hi !== null ? fmtN(hi, 2) : '', valTxt: fmtN(cur, 2),
          bad: (lo !== null && cur < lo) || (hi !== null && cur > hi),
        }
      }
    }
  } else if (isPing) {
    kind = { label: t('Latence'), icon: Activity }
    subtitle = e.ip || e.hostname
    const last = num(e.ping_rtt_last); const avg = num(e.ping_rtt_avg)
    metrics.push({ l: t('Dernière latence'), v: `${fmtN(last)} ms`, tone: last > 100 ? 'bad' : last > 30 ? 'warn' : 'good' })
    metrics.push({ l: t('Précédente'), v: `${fmtN(num(e.ping_rtt_prev))} ms` })
    metrics.push({ l: t('Moyenne'), v: `${fmtN(avg)} ms`, s: last !== null && avg ? `${last >= avg ? '+' : ''}${fmtN(last - avg)} ms` : '' })
    metrics.push({ l: t('Perte (dernière)'), v: `${fmtN(num(e.ping_loss_last))} %`, tone: num(e.ping_loss_last) > 0 ? 'bad' : '' })
    metrics.push({ l: t('Perte (moyenne)'), v: `${fmtN(num(e.ping_loss_avg), 2)} %` })
  } else if (e.service_id !== undefined) {
    kind = { label: t('Service'), icon: Cog }
    title = e.service_name || e.service_type; subtitle = host
    metrics.push({ l: t('Type'), v: e.service_type || '—' })
    metrics.push({ l: t('État'), v: +e.service_status === 0 ? 'OK' : +e.service_status === 1 ? t('Avertissement') : t('Critique'), tone: +e.service_status === 0 ? 'good' : +e.service_status === 1 ? 'warn' : 'bad' })
    if (e.service_message) metrics.push({ l: t('Message'), v: e.service_message })
  } else {
    kind = { label: t('Équipement'), icon: Server }
    subtitle = [e.hardware, e.os].filter(Boolean).join(' · ')
  }
  // contexte équipement commun
  if (!isPort && !isSensor) {
    metrics.push({ l: t('Statut'), v: +e.status ? t('En ligne') : t('Hors ligne'), s: e.status_reason || '', tone: +e.status ? 'good' : 'bad' })
    if (e.uptime) metrics.push({ l: t('Uptime'), v: fmtUptime(e.uptime) })
  }
  if (e.last_polled) metrics.push({ l: t('Dernière interrogation'), v: fmtDate(e.last_polled) })
  return { raw: e, kind, title: title || '—', subtitle, link, metrics, gauge }
}
const entities = computed(() => (props.alert.details?.rule || []).map(describe))

// ---------- propriétés regroupées ----------
const usedCols = computed(() => {
  const s = new Set()
  const walk = (g) => (g?.rules || []).forEach((r) => (r.rules ? walk(r) : s.add(col(r.field || r.id))))
  walk(props.rule?.builder)
  return s
})
const GROUPS = [
  [t('Port'), /^(if|port|pagp|poll_)/],
  [t('Capteur'), /^(sensor|state_|entPhysical|group$|rrd_type|user_func|lastupdate|poller_type)/],
  [t('Latence'), /^ping_/],
  [t('Service'), /^service/],
  ['SNMP', /^(snmp|auth|crypto|community|transport|port$|timeout|retries|sysObjectID)/],
  [t('Équipement'), /.*/],
]
const groups = computed(() => {
  const e = entities.value[0]?.raw || {}
  const ql = q.value.trim().toLowerCase()
  const out = GROUPS.map(([label]) => ({ label, rows: [] }))
  for (const [k, v0] of Object.entries(e)) {
    const empty = v0 === null || v0 === ''
    if (empty && !showEmpty.value) continue
    const secret = SECRET.test(k) && !empty
    const v = empty ? (v0 === null ? 'null' : '""') : secret ? '••••••' : typeof v0 === 'object' ? JSON.stringify(v0) : String(v0)
    if (ql && !k.toLowerCase().includes(ql) && !v.toLowerCase().includes(ql)) continue
    const gi = GROUPS.findIndex(([, re]) => re.test(k))
    out[gi].rows.push({ k, v, empty, secret, hit: usedCols.value.has(k) })
  }
  out.forEach((g) => g.rows.sort((a, b) => b.hit - a.hit || a.k.localeCompare(b.k)))
  return out.filter((g) => g.rows.length)
})
</script>

<style scoped>
.ad { display: flex; flex-direction: column; gap: 18px; }
.hero { display: flex; flex-wrap: wrap; gap: 16px 28px; align-items: center; padding: 14px 16px; border-radius: 12px;
  background: color-mix(in srgb, var(--sev) 8%, var(--panel-2)); border: 1px solid color-mix(in srgb, var(--sev) 28%, var(--border)); border-left: 4px solid var(--sev); }
.hero-main { display: flex; flex-direction: column; gap: 10px; min-width: 0; flex: 1 1 240px; }
.hero-dev { font-size: 14px; }
.timeline { display: flex; align-items: center; gap: 10px; flex: 1 1 360px; }
.tl-step { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; }
.tl-step b { font-weight: 600; font-variant-numeric: tabular-nums; }
.tl-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); margin-top: 4px; flex: none; }
.tl-dot.live { background: var(--sev); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sev) 25%, transparent); animation: pulse 2s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--sev) 8%, transparent); } }
.tl-line { flex: 1; min-width: 50px; border-top: 2px dashed var(--border); position: relative; text-align: center; }
.tl-line span { position: relative; top: -10px; background: color-mix(in srgb, var(--sev) 8%, var(--panel-2)); padding: 0 6px; white-space: nowrap; }
.note { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--panel-2); border: 1px solid var(--border); font-size: 13px; color: var(--muted); }

section h4 { display: flex; align-items: center; gap: 7px; margin: 0 0 10px; font-size: 13px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: .04em; }
section h4 svg { color: var(--accent); }

/* conditions */
.cond-tree :deep(.cond-group) { display: flex; flex-direction: column; gap: 6px; }
.cond-tree :deep(.cond-sub) { padding-left: 14px; border-left: 2px solid var(--border); }
.cond-tree :deep(.conj) { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; color: var(--faint, var(--muted)); padding-left: 10px; }
.cond-tree :deep(.cond) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 9px; background: var(--panel-2); border: 1px solid var(--border); font-size: 13px; }
.cond-tree :deep(.cond.met) { border-color: color-mix(in srgb, var(--red) 40%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--panel-2)); }
.cond-tree :deep(.cond.unmet) { opacity: .75; }
.cond-tree :deep(.c-field) { font-weight: 600; }
.cond-tree :deep(.c-op) { color: var(--accent); font-weight: 600; }
.cond-tree :deep(.c-val) { padding: 1px 7px; border-radius: 6px; background: var(--panel-solid, var(--panel)); border: 1px solid var(--border); }
.cond-tree :deep(.c-act) { margin-left: auto; color: var(--muted); font-size: 12px; }
.cond-tree :deep(.cond.met .c-act b) { color: var(--red); }
.sql { display: block; font-family: var(--mono); font-size: 11.5px; padding: 10px 12px; border-radius: 9px; background: var(--panel-2); border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word; color: var(--muted); margin-top: 8px; }

/* entités */
.ent { padding: 14px; border-radius: 12px; background: var(--panel-2); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 14px; }
.ent-head { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.ent-title { font-size: 16px; font-weight: 700; color: var(--text); white-space: nowrap; }
a.ent-title:hover { color: var(--accent); text-decoration: none; }
.metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.metric { padding: 9px 11px; border-radius: 9px; background: var(--panel-solid, var(--panel)); border: 1px solid var(--border); min-width: 0; }
.metric b { display: block; font-size: 15px; font-variant-numeric: tabular-nums; margin: 2px 0 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.metric.good b { color: var(--green); }
.metric.warn b { color: var(--orange); }
.metric.bad { border-color: color-mix(in srgb, var(--red) 35%, var(--border)); }
.metric.bad b { color: var(--red); }
.gauge { display: flex; flex-direction: column; gap: 6px; }
.g-track { position: relative; height: 10px; border-radius: 5px; background: color-mix(in srgb, var(--green) 30%, var(--panel-solid, var(--panel))); overflow: visible; }
.g-zone { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--red) 40%, transparent); }
.g-zone.low { left: 0; border-radius: 5px 0 0 5px; }
.g-zone.high { border-radius: 0 5px 5px 0; }
.g-mark { position: absolute; top: -4px; width: 4px; height: 18px; margin-left: -2px; border-radius: 2px; background: var(--text); box-shadow: 0 0 0 2px var(--panel-2); }
.g-scale { display: flex; justify-content: space-between; }
.g-scale b { font-size: 13px; }

/* propriétés */
.more summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
.more summary::-webkit-details-marker { display: none; }
.more summary::before { content: '▸'; color: var(--muted); transition: transform .15s; display: inline-block; }
.more[open] summary::before { transform: rotate(90deg); }
.pgroup + .pgroup { margin-top: 14px; }
.pg-title { font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em; font-size: 11.5px; }
.props { display: grid; gap: 0 18px; grid-template-columns: max-content 1fr max-content 1fr; }
@media (max-width: 760px) { .props { grid-template-columns: max-content 1fr; } }
.pk, .pv { font-size: 12px; padding: 4px 0; border-bottom: 1px solid var(--border); min-width: 0; }
.pk { color: var(--muted); padding-right: 10px; }
.pk.hit { color: var(--accent); font-weight: 600; }
.pv { word-break: break-all; padding-right: 14px; }
.pv.empty { color: var(--muted); opacity: .6; font-style: italic; }
.pv.secret { color: var(--muted); letter-spacing: .1em; }
.raw-tools { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 8px; }
</style>
