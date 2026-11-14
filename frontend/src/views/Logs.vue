<template>
  <div>
    <div class="page-head"><div><h1>Journaux</h1><div class="sub">Évènements, syslog, alertes et authentifications</div></div></div>
    <div class="card"><LogList :key="tab" :initial-type="tab" /></div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import LogList from '../components/LogList.vue'
const route = useRoute()
const tab = computed(() => route.params.tab || 'eventlog')
</script>
