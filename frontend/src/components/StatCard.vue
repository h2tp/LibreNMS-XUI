<template>
  <div class="card stat" :class="{ hover: !!to }" @click="to && $router.push(to)">
    <div class="glow" :style="{ background: color }"></div>
    <div class="row">
      <div class="ico" :style="{ background: color + '22', color }"><component :is="icon" :size="21" /></div>
      <div class="grow"></div>
      <slot name="badge" />
    </div>
    <div class="val"><CountUp :value="value" /><span v-if="suffix" class="muted" style="font-size:16px;font-weight:500"> {{ suffix }}</span></div>
    <div class="lbl2">{{ label }}</div>
    <slot />
  </div>
</template>
<script setup>
import CountUp from './CountUp.vue'
defineProps({ icon: Object, label: String, value: Number, color: { type: String, default: '#22d3ee' }, to: String, suffix: String })
</script>
