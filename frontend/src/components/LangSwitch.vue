<template>
  <button class="btn ghost sm lang-btn" :title="lang === 'fr' ? 'Switch to English' : 'Passer en français'" @click="setLang(lang === 'fr' ? 'en' : 'fr')">
    <Languages :size="15" /><span>{{ lang === 'fr' ? 'EN' : 'FR' }}</span>
  </button>
</template>

<script setup>
import { Languages } from 'lucide-vue-next'
import { lang, setLang } from '../i18n'
</script>

<style scoped>
.lang-btn { gap: 5px; font-weight: 600; font-size: 12px; letter-spacing: .03em; }
</style>
