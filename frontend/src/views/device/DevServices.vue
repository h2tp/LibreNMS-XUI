<template><ServicesPanel :host="device.hostname" /></template>
<script setup>
import ServicesPanel from '../../components/ServicesPanel.vue'
defineProps({ device: Object })
</script>
