<template>
  <RrdChart :host="config.device" :file="config.file" :range="config.range || '-1d'" hide-range compact :axes="config.scale !== false" :zoom="false"
    :show-stats="config.stats !== false" :height="`${Math.max(100, size.h - (config.stats !== false ? 56 : 0))}px`" />
</template>
<script setup>
import RrdChart from '../RrdChart.vue'
defineProps({ config: Object, size: Object })
</script>
