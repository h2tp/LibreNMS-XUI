<template>
  <router-link v-if="device" class="devcell" :to="`/device/${encodeURIComponent(device.hostname)}`" @click.stop>
    <span class="dot" :class="devStatus(device)"></span>
    <img v-if="showIcon && osIcon(device)" :src="osIcon(device)" class="os-icon sm" loading="lazy" @error="(e) => (e.target.style.display = 'none')" />
    <span class="col" style="gap:0;min-width:0">
      <b class="ellipsis">{{ devName(device) }}</b>
      <span v-if="sub && devName(device) !== device.hostname" class="small muted ellipsis">{{ device.hostname }}</span>
    </span>
  </router-link>
  <span v-else class="muted">{{ fallback || '—' }}</span>
</template>
<script setup>
import { devName, devStatus, osIcon } from '../utils'
defineProps({ device: Object, showIcon: { type: Boolean, default: true }, sub: { type: Boolean, default: true }, fallback: [String, Number] })
</script>
<style scoped>
.devcell { display: inline-flex; align-items: center; gap: 10px; color: var(--text); min-width: 0; }
.devcell:hover { text-decoration: none; color: var(--accent); }
.os-icon.sm { width: 26px; height: 26px; padding: 3px; border-radius: 6px; }
</style>
