<template>
  <div>
    <div v-if="searchable || $slots.tools || exportable" class="row wrap mb" style="margin-bottom:12px">
      <div v-if="searchable" class="row search-in">
        <Search :size="15" class="faint" />
        <input v-model="q" class="input" :placeholder="placeholder" />
      </div>
      <slot name="tools" />
      <div class="grow"></div>
      <span class="muted small">{{ filtered.length }} élément{{ filtered.length > 1 ? 's' : '' }}</span>
      <button v-if="exportable && filtered.length" class="btn sm" title="Exporter en CSV" @click="exportCsv"><Download /> CSV</button>
    </div>

    <div v-if="loading && !rows.length" class="col">
      <div v-for="i in 5" :key="i" class="skeleton" style="height:38px"></div>
    </div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <div v-else-if="!filtered.length" class="empty"><Inbox /><div>{{ emptyText }}</div></div>
    <div v-else class="table-wrap" :style="maxHeight ? { maxHeight, overflowY: 'auto' } : null">
      <table class="tbl">
        <thead>
          <tr>
            <th v-for="c in cols" :key="c.key" :class="{ sortable: c.sortable !== false }" :style="{ textAlign: c.align || 'left', width: c.width }" @click="c.sortable !== false && sortBy(c.key)">
              {{ c.label }}
              <ChevronUp v-if="sort.key === c.key && sort.dir > 0" :size="12" />
              <ChevronDown v-if="sort.key === c.key && sort.dir < 0" :size="12" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in paged" :key="rowKey ? r[rowKey] : i" :class="{ click: !!rowClick }" @click="rowClick && rowClick(r)">
            <td v-for="c in cols" :key="c.key" :style="{ textAlign: c.align || 'left' }" :class="c.class">
              <slot :name="'c-' + c.key" :row="r" :value="r[c.key]">{{ c.format ? c.format(r[c.key], r) : display(r[c.key]) }}</slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pages > 1" class="tbl-foot">
      <select v-model.number="size" class="input" style="padding:4px 8px">
        <option v-for="s in [25, 50, 100, 250, 1000]" :key="s" :value="s">{{ s }} / page</option>
      </select>
      <div class="grow"></div>
      <button class="btn sm icon" :disabled="page === 1" @click="page--"><ChevronLeft /></button>
      <span>Page {{ page }} / {{ pages }}</span>
      <button class="btn sm icon" :disabled="page === pages" @click="page++"><ChevronRight /></button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Search, Download, Inbox, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { downloadCSV } from '../utils'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: null },
  loading: Boolean,
  error: String,
  searchable: { type: Boolean, default: true },
  exportable: { type: Boolean, default: true },
  placeholder: { type: String, default: 'Filtrer…' },
  emptyText: { type: String, default: 'Aucune donnée' },
  pageSize: { type: Number, default: 50 },
  rowKey: String,
  rowClick: Function,
  defaultSort: { type: Object, default: () => ({ key: null, dir: 1 }) },
  maxHeight: String,
  filename: { type: String, default: 'export.csv' },
  filter: Function,
})

const q = ref('')
const page = ref(1)
const size = ref(props.pageSize)
const sort = ref({ ...props.defaultSort })

const cols = computed(() => {
  if (props.columns) return props.columns
  const keys = new Set()
  props.rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => keys.add(k)))
  return [...keys].filter((k) => !(props.rows[0] && typeof props.rows[0][k] === 'object' && props.rows[0][k] !== null)).slice(0, 14).map((k) => ({ key: k, label: k.replace(/_/g, ' ') }))
})

function display(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

const filtered = computed(() => {
  let r = props.rows
  if (props.filter) r = r.filter(props.filter)
  const s = q.value.trim().toLowerCase()
  if (s) r = r.filter((row) => Object.values(row).some((v) => v !== null && v !== undefined && typeof v !== 'object' && String(v).toLowerCase().includes(s)))
  if (sort.value.key) {
    const k = sort.value.key; const d = sort.value.dir
    const col = cols.value.find((c) => c.key === k)
    const val = col?.sortValue || ((row) => row[k])
    r = [...r].sort((a, b) => {
      const x = val(a); const y = val(b)
      if (x === y) return 0
      if (x === null || x === undefined || x === '') return 1
      if (y === null || y === undefined || y === '') return -1
      const nx = +x; const ny = +y
      if (!isNaN(nx) && !isNaN(ny)) return (nx - ny) * d
      return String(x).localeCompare(String(y), 'fr', { numeric: true }) * d
    })
  }
  return r
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / size.value)))
const paged = computed(() => filtered.value.slice((page.value - 1) * size.value, page.value * size.value))
watch([q, size], () => (page.value = 1))
watch(pages, (p) => { if (page.value > p) page.value = p })

function sortBy(k) {
  if (sort.value.key === k) sort.value.dir = -sort.value.dir
  else sort.value = { key: k, dir: 1 }
}
function exportCsv() { downloadCSV(filtered.value, cols.value, props.filename) }
</script>

<style scoped>
.search-in { position: relative; }
.search-in svg { position: absolute; left: 11px; }
.search-in .input { padding-left: 34px; width: 260px; }
</style>
