<template>
  <div v-if="error" class="empty small"><Workflow /><div>{{ error }}</div></div>
  <div v-else-if="!diag" class="skeleton" :style="{ height: `${size.h}px` }"></div>
  <div v-else class="wd" :style="{ height: `${size.h}px` }">
    <DiagramCanvas :diagram="shown" :live="live" :bg-url="diag.bg ? diagApi.bgUrl(diag.id, diag.bg) : ''" wheel="ctrl" />
    <router-link :to="`/diagrams/${diag.id}`" class="btn ghost sm icon open" title="Ouvrir le schéma"><Maximize2 :size="14" /></router-link>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Workflow, Maximize2 } from 'lucide-vue-next'
import DiagramCanvas from '../DiagramCanvas.vue'
import { diagApi } from '../../api'
import { useDiagramLive } from '../../diagram/core'

const props = defineProps({ config: Object, size: Object })
const live = useDiagramLive()
const diag = ref(null); const error = ref(null)
const shown = computed(() => diag.value && { ...diag.value, view: { ...diag.value.view, showRates: props.config.rates !== false && diag.value.view?.showRates !== false } })
onMounted(async () => {
  try { diag.value = await diagApi.get(props.config.diagram) } catch (e) { error.value = e.status === 404 ? 'Schéma introuvable (supprimé ou non partagé)' : e.message }
})
</script>

<style scoped>
.wd { position: relative; }
.open { position: absolute; top: 8px; right: 8px; background: var(--panel-solid); border: 1px solid var(--border); }
</style>
