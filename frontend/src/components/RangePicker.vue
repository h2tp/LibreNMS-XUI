<template>
  <div class="seg">
    <button v-for="r in RANGES" :key="r.v" :class="{ on: modelValue === r.v }" type="button" @click="$emit('update:modelValue', r.v)">{{ r.l }}</button>
  </div>
</template>
<script setup>
import { RANGES } from '../utils'
defineProps({ modelValue: String })
defineEmits(['update:modelValue'])
</script>
