<template>
  <div>
    <div class="page-head"><div><h1>{{ t('Services') }}</h1><div class="sub">{{ t('Sondes Nagios supervisées par LibreNMS') }}</div></div></div>
    <ServicesPanel />
  </div>
</template>
<script setup>
import ServicesPanel from '../components/ServicesPanel.vue'
import { t } from '../i18n'
</script>
