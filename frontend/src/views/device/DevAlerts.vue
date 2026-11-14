<template>
  <div class="col" style="gap:18px">
    <AlertsPanel :device-id="+device.device_id" />
    <div class="card"><div class="card-title">Historique des alertes</div><LogList :host="device.hostname" initial-type="alertlog" fixed-type /></div>
  </div>
</template>
<script setup>
import AlertsPanel from '../../components/AlertsPanel.vue'
import LogList from '../../components/LogList.vue'
defineProps({ device: Object })
</script>
