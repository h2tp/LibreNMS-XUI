<template>
  <div class="inv">
    <div class="inv-row" :style="{ paddingLeft: depth * 22 + 'px' }" @click="open = !open">
      <ChevronRight v-if="kids.length" :size="14" class="chev" :class="{ open }" /><span v-else style="width:14px"></span>
      <component :is="icon" :size="15" class="muted" />
      <b>{{ node.entPhysicalName || node.entPhysicalDescr }}</b>
      <span class="muted ellipsis">{{ node.entPhysicalName ? node.entPhysicalDescr : '' }}</span>
      <span v-if="node.entPhysicalModelName" class="badge">{{ node.entPhysicalModelName }}</span>
      <span v-if="node.entPhysicalSerialNum" class="badge accent mono">S/N {{ node.entPhysicalSerialNum }}</span>
      <span v-if="node.entPhysicalSoftwareRev || node.entPhysicalFirmwareRev" class="small faint">{{ node.entPhysicalSoftwareRev || node.entPhysicalFirmwareRev }}</span>
    </div>
    <div v-if="open && kids.length"><InvNode v-for="k in kids" :key="k.entPhysicalIndex" :node="k" :children="children" :depth="depth + 1" /></div>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
import { ChevronRight, Server, Cpu, Fan, Zap, Box, Cable, Thermometer, Layers } from 'lucide-vue-next'
const props = defineProps({ node: Object, children: Object, depth: Number })
const open = ref(props.depth < 2)
const kids = computed(() => props.children[props.node.entPhysicalIndex] || [])
const icon = computed(() => ({ chassis: Server, module: Cpu, fan: Fan, powerSupply: Zap, port: Cable, sensor: Thermometer, container: Box, stack: Layers }[props.node.entPhysicalClass] || Box))
</script>
<style scoped>
.inv-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; white-space: nowrap; overflow: hidden; }
.inv-row:hover { background: var(--panel-2); }
.chev { transition: transform .2s; flex-shrink: 0; } .chev.open { transform: rotate(90deg); }
</style>
