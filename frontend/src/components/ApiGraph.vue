<template>
  <div class="api-graph">
    <div v-if="title" class="small muted" style="margin-bottom:6px">{{ title }}</div>
    <div v-if="failed" class="empty small" style="padding:20px">{{ t('Graphique indisponible') }}</div>
    <img v-else :src="src" class="graph" :class="{ loading: !loaded }" loading="lazy" @load="loaded = true" @error="failed = true" />
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../api'
import { clock } from '../refresh'
import { t } from '../i18n'
const props = defineProps({ path: String, range: { type: String, default: '-1d' }, title: String, width: { type: Number, default: 1000 }, height: { type: Number, default: 260 }, params: Object })
const loaded = ref(false)
const failed = ref(false)
const secs = { h: 3600, d: 86400, w: 604800, y: 31536000 }
const from = computed(() => {
  const m = /^-(\d+)([hdwy])$/.exec(props.range || '-1d')
  return Math.floor(Date.now() / 1000) - (m ? +m[1] * secs[m[2]] : 86400)
})
const src = computed(() => api.img(props.path, { from: from.value, width: props.width, height: props.height, ...(props.params || {}), _t: clock.tick }))
watch(() => props.path, () => { loaded.value = false; failed.value = false })
</script>
<style scoped>
img.loading { opacity: .3; min-height: 120px; }
img.graph { transition: opacity .4s; }
</style>
