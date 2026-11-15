<template>
  <div class="cse">
    <div class="field"><span>{{ title || t('Couleur des liens selon') }}</span>
      <div class="seg">
        <button v-for="b in [['util', t('Charge (%)')], ['rate', t('Débit')]]" :key="b[0]" :class="{ on: form.colorMode === b[0] }" :disabled="disabled" @click="form.colorMode = b[0]">{{ b[1] }}</button>
      </div>
    </div>
    <div class="steps">
      <div v-for="(st, i) in cur" :key="i" class="step row">
        <input v-model="st.color" type="color" class="swatch" :disabled="disabled" />
        <span class="small muted">{{ t('à partir de') }}</span>
        <input v-model.number="st.min" type="number" class="input num" min="0" :step="form.colorMode === 'rate' ? 'any' : 1" :disabled="disabled || i === 0" />
        <span class="small muted">{{ form.colorMode === 'rate' ? t('Mbit/s') : '%' }}</span>
        <span v-if="form.colorMode === 'rate'" class="small faint">{{ fmtBits(st.min * 1e6) }}</span>
        <button v-if="!disabled && i > 0" class="btn ghost sm icon" :title="t('Supprimer ce palier')" @click="cur.splice(i, 1)"><Minus :size="13" /></button>
      </div>
      <div class="step row">
        <input v-model="form.downColor" type="color" class="swatch" :disabled="disabled" />
        <span class="small muted">{{ t('lien coupé') }}</span>
      </div>
      <div v-if="!disabled" class="row wrap" style="gap:8px">
        <button class="btn sm" :disabled="cur.length >= 10" @click="add"><Plus :size="13" /> {{ t('Ajouter un palier') }}</button>
        <button class="btn sm ghost" @click="reset">{{ t('Couleurs par défaut') }}</button>
      </div>
      <span class="small faint">{{ form.colorMode === 'rate' ? t('Débit le plus élevé des deux sens (1 Gbit/s = 1000 Mbit/s).') : t('Charge la plus élevée des deux extrémités, rapportée à la vitesse du port.') }}</span>
    </div>
  </div>
</template>

<script setup>
// Réglage d'une échelle de couleurs (mode charge / débit, paliers, couleur « coupé ») ; `form` vient de scaleForm().
import { computed } from 'vue'
import { Plus, Minus } from 'lucide-vue-next'
import { defaultSteps, DEFAULT_DOWN_COLOR } from '../diagram/core'
import { fmtBits } from '../utils'
import { t } from '../i18n'

const props = defineProps({ form: Object, disabled: Boolean, title: String })
const cur = computed(() => (props.form.colorMode === 'rate' ? props.form.rateSteps : props.form.utilSteps))
function add() {
  const last = cur.value.at(-1)
  cur.value.push({ min: last ? (props.form.colorMode === 'rate' ? last.min * 10 || 1 : Math.min(100, last.min + 10)) : 0, color: '#a855f7' })
}
function reset() {
  if (props.form.colorMode === 'rate') props.form.rateSteps = defaultSteps('rate'); else props.form.utilSteps = defaultSteps('util')
  props.form.downColor = DEFAULT_DOWN_COLOR
}
</script>

<style scoped>
.cse { display: flex; flex-direction: column; gap: 12px; }
.steps { display: flex; flex-direction: column; gap: 8px; }
.step { gap: 8px; align-items: center; }
.swatch { width: 34px; height: 28px; padding: 2px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-2); cursor: pointer; }
.input.num { width: 96px; }
</style>
