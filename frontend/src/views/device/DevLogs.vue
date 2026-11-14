<template><div class="card"><LogList :host="device.hostname" /></div></template>
<script setup>
import LogList from '../../components/LogList.vue'
defineProps({ device: Object })
</script>
