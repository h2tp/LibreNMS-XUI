<template>
  <teleport to="body">
    <div class="overlay" @mousedown.self="$emit('close')">
      <div class="modal" :class="{ wide }">
        <div class="modal-head"><component :is="icon" v-if="icon" :size="18" color="var(--accent)" />{{ title }}<div class="grow"></div><button class="btn ghost sm icon" @click="$emit('close')"><X /></button></div>
        <div class="modal-body"><slot /></div>
        <div v-if="$slots.foot" class="modal-foot"><slot name="foot" /></div>
      </div>
    </div>
  </teleport>
</template>
<script setup>
import { X } from 'lucide-vue-next'
defineProps({ title: String, icon: Object, wide: Boolean })
defineEmits(['close'])
</script>
