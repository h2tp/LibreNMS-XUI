<template>
  <div class="slegend small muted">
    <span v-if="label" class="faint">{{ label }}</span>
    <span v-for="(s, i) in items" :key="i"><i :style="{ background: s.color }"></i>{{ s.label }}</span>
    <span><i :style="{ background: scale.down }"></i>{{ t('coupé') }}</span>
    <slot />
  </div>
</template>

<script setup>
// Légende d'une échelle de couleurs de liens (d'après les champs enregistrés : colorMode, paliers…).
import { computed } from 'vue'
import { colorScale } from '../diagram/core'
import { fmtBits } from '../utils'
import { t } from '../i18n'

const props = defineProps({ view: Object, label: String })
const scale = computed(() => colorScale(props.view || {}))
const items = computed(() => {
  const { mode, steps } = scale.value
  const f = (v) => (mode === 'rate' ? fmtBits(v * 1e6, 1) : `${v} %`)
  return steps.map((s, i) => ({
    color: s.color,
    label: i === steps.length - 1 ? `≥ ${f(s.min)}` : i === 0 ? `< ${f(steps[1].min)}` : `${f(s.min)} – ${f(steps[i + 1].min)}`,
  }))
})
</script>

<style scoped>
.slegend { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 0 6px; font-size: 11.5px; }
.slegend i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-right: 5px; vertical-align: 2px; }
</style>
