<template>
  <div v-if="!safeUrl" class="empty small"><AppWindow /><div>Adresse invalide : elle doit commencer par http:// ou https://</div></div>
  <div v-else class="wrap" :style="{ height: `${size.h}px` }">
    <iframe :key="reloadKey" :src="safeUrl" :title="config.title || host"
      :sandbox="sandbox" referrerpolicy="no-referrer" loading="lazy" allow="fullscreen"
      :style="frameStyle" @load="loading = false"></iframe>
    <div v-if="loading" class="loading small muted"><Loader2 class="spin" :size="16" /> Chargement de {{ host }}…</div>
    <div class="tools">
      <button class="btn ghost sm icon" title="Recharger" @click="reload"><RefreshCw :size="14" /></button>
      <a class="btn ghost sm icon" :href="safeUrl" target="_blank" rel="noopener noreferrer" title="Ouvrir dans un nouvel onglet"><ExternalLink :size="14" /></a>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { AppWindow, Loader2, RefreshCw, ExternalLink } from 'lucide-vue-next'

const props = defineProps({ config: Object, size: Object })
const reloadKey = ref(0)
const loading = ref(true)

// Seules les adresses absolues http(s) sont acceptées (pas de javascript:, data:, ni de page XUI elle-même).
const safeUrl = computed(() => {
  try {
    const u = new URL(String(props.config.url || '').trim())
    if (!['http:', 'https:'].includes(u.protocol) || u.origin === location.origin) return ''
    return u.href
  } catch { return '' }
})
const host = computed(() => { try { return new URL(safeUrl.value).host } catch { return '' } })

// Pas de allow-top-navigation : la page intégrée ne peut pas rediriger XUI.
const sandbox = computed(() => ['allow-same-origin', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-downloads',
  ...(props.config.scripts !== false ? ['allow-scripts'] : [])].join(' '))

const frameStyle = computed(() => {
  const z = (+props.config.zoom || 100) / 100
  return {
    width: `${100 / z}%`, height: `${100 / z}%`, transform: z === 1 ? undefined : `scale(${z})`, transformOrigin: '0 0',
    pointerEvents: props.config.interact === false ? 'none' : undefined,
  }
})

function reload() { loading.value = true; reloadKey.value++ }
let timer = null
onMounted(() => {
  const s = +props.config.refresh || 0
  if (s > 0) timer = setInterval(() => { if (!document.hidden) reload() }, s * 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.wrap { position: relative; border-radius: 10px; overflow: hidden; background: #fff; }
iframe { border: 0; display: block; background: #fff; }
.loading { position: absolute; inset: 0; display: grid; place-items: center; background: var(--panel-2); gap: 8px; grid-auto-flow: column; justify-content: center; }
.tools { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity .2s; }
.wrap:hover .tools { opacity: 1; }
.tools .btn { background: var(--panel-solid); border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,.25); }
</style>
