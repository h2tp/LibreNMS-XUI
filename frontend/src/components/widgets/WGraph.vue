<template>
  <ApiGraph :path="`devices/${encodeURIComponent(config.device)}/${config.graph}`" :range="config.range || '-1d'"
    :width="Math.round(size.w)" :height="Math.max(80, Math.round(size.h * 0.62))" />
</template>
<script setup>
import ApiGraph from '../ApiGraph.vue'
defineProps({ config: Object, size: Object })
</script>
