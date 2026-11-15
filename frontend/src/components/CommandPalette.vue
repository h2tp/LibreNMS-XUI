<template>
  <div class="overlay" @mousedown.self="$emit('close')">
    <div class="modal palette">
      <input ref="inp" v-model="q" :placeholder="t('Équipement, IP, port, MAC, page…')" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="go(flat[sel])" />
      <div class="res">
        <template v-for="g in groups" :key="g.name">
          <div v-if="g.items.length" class="grp">{{ g.name }}</div>
          <div v-for="it in g.items" :key="it.key" class="item" :class="{ sel: flat[sel] === it }" @mouseenter="sel = flat.indexOf(it)" @click="go(it)">
            <span v-if="it.status" class="dot" :class="it.status"></span>
            <component :is="it.icon" v-else :size="16" class="muted" />
            <div class="grow ellipsis"><b>{{ it.title }}</b> <span class="muted small">{{ it.sub }}</span></div>
            <CornerDownLeft v-if="flat[sel] === it" :size="14" class="faint" />
          </div>
        </template>
        <div v-if="searching" class="empty small"><Loader2 class="spin" :size="18" /></div>
        <div v-else-if="!flat.length" class="empty small">{{ t('Aucun résultat') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { CornerDownLeft, Loader2, Network, FileText, Cable } from 'lucide-vue-next'
import { api, pick, devicesCached } from '../api'
import { devName, devStatus } from '../utils'
import { t } from '../i18n'

const emit = defineEmits(['close'])
const router = useRouter()
const q = ref('')
const sel = ref(0)
const inp = ref(null)
const devices = ref([])
const ports = ref([])
const searching = ref(false)

const pages = [
  ['/', t('Tableau de bord')], ['/devices', t('Équipements')], ['/ports', t('Ports')], ['/health', t('Santé & capteurs')], ['/alerts', t('Alertes')],
  ['/alerts/rules', t('Règles d\'alerte')], ['/logs', t('Journal des évènements')], ['/logs/syslog', 'Syslog'], ['/map', t('Carte')],
  ['/racks', t('Baies')], ['/topology', t('Topologie')], ['/groups', t('Groupes')], ['/locations', t('Emplacements')], ['/services', 'Services'], ['/routing', t('Routage BGP')],
  ['/routing/ospf', 'OSPF'], ['/resources', 'Adresses IP'], ['/resources/arp', 'Table ARP'], ['/resources/fdb', 'Table FDB / MAC'],
  ['/resources/vlans', 'VLANs'], ['/bills', t('Facturation')], ['/system', t('Système')], ['/explorer', t('Explorateur API')],
]

const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  const devs = devices.value.filter((d) => !s || [d.hostname, d.sysName, d.display, d.ip, d.os, d.hardware, d.location].some((x) => x && String(x).toLowerCase().includes(s))).slice(0, 8)
    .map((d) => ({ key: 'd' + d.device_id, title: devName(d), sub: `${d.hostname} · ${d.os || ''} ${d.hardware || ''}`, status: devStatus(d), to: `/device/${encodeURIComponent(d.hostname)}` }))
  const pg = pages.filter(([, l]) => !s || l.toLowerCase().includes(s)).slice(0, s ? 6 : 4).map(([to, l]) => ({ key: 'p' + to, title: l, sub: to, icon: FileText, to }))
  const pts = ports.value.slice(0, 8).map((p) => ({ key: 'pt' + p.port_id, title: p.ifName || p.ifDescr, sub: `${p.ifAlias || ''} · ${p.hostname || ''}`, icon: Cable, to: `/port/${p.port_id}` }))
  return [{ name: t('Équipements'), items: devs }, { name: 'Ports', items: pts }, { name: 'Pages', items: pg }]
})
const flat = computed(() => groups.value.flatMap((g) => g.items))

function move(d) { const n = flat.value.length; if (n) sel.value = (sel.value + d + n) % n }
function go(it) { if (!it) return; router.push(it.to); emit('close') }

let timer = null
watch(q, (v) => {
  sel.value = 0
  clearTimeout(timer)
  ports.value = []
  if (v.trim().length < 2) return
  timer = setTimeout(async () => {
    searching.value = true
    try {
      const r = pick(await api.get(`ports/search/${encodeURIComponent(v.trim())}`, { columns: 'port_id,ifName,ifDescr,ifAlias,device_id' }), 'ports')
      const byId = Object.fromEntries(devices.value.map((d) => [d.device_id, d]))
      ports.value = r.map((p) => ({ ...p, hostname: devName(byId[p.device_id]) }))
    } catch { ports.value = [] } finally { searching.value = false }
  }, 300)
})

onMounted(async () => {
  await nextTick(); inp.value?.focus()
  try { devices.value = await devicesCached() } catch { /* ignore */ }
})
</script>
