<template>
  <DataTable :rows="rows" :columns="columns" :loading="loading" :error="error" :filename="filename" :row-click="rowClick" :empty-text="emptyText" :page-size="pageSize">
    <template v-for="(_, name) in $slots" #[name]="slotData"><slot :name="name" v-bind="slotData || {}" /></template>
  </DataTable>
</template>
<script setup>
import { ref, watch } from 'vue'
import DataTable from './DataTable.vue'
import { api, pick } from '../api'
import { useLoader } from '../refresh'
const props = defineProps({
  path: String, params: Object, listKey: String, columns: Array, transform: Function, filename: String, rowClick: Function,
  emptyText: { type: String, default: 'Aucune donnée' }, pageSize: { type: Number, default: 50 }, auto: { type: Boolean, default: true },
})
const emit = defineEmits(['loaded'])
const rows = ref([])
const { loading, error, reload } = useLoader(async () => {
  let r = pick(await api.get(props.path, props.params), props.listKey)
  if (props.transform) r = await props.transform(r)
  rows.value = r
  emit('loaded', r)
}, { auto: props.auto })
watch(() => [props.path, JSON.stringify(props.params)], () => { rows.value = []; reload() })
defineExpose({ reload, rows })
</script>
