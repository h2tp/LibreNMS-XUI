<template>
  <div v-if="!config.text" class="empty small">{{ t('Note vide — modifiez le widget pour écrire du texte.') }}</div>
  <div v-else class="notes" v-html="html"></div>
</template>
<script setup>
import { computed } from 'vue'
import { t } from '../../i18n'
const props = defineProps({ config: Object, size: Object })
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
}
const html = computed(() => {
  const out = []; let list = false
  for (const line of String(props.config.text).split('\n')) {
    const m = /^\s*[-*]\s+(.*)$/.exec(line)
    if (m) { if (!list) { out.push('<ul>'); list = true } out.push(`<li>${inline(m[1])}</li>`); continue }
    if (list) { out.push('</ul>'); list = false }
    const h = /^#{1,3}\s+(.*)$/.exec(line)
    out.push(h ? `<h4>${inline(h[1])}</h4>` : line.trim() ? `<p>${inline(line)}</p>` : '<p class="sp"></p>')
  }
  if (list) out.push('</ul>')
  return out.join('')
})
</script>
<style scoped>
.notes { font-size: 13.5px; line-height: 1.55; word-break: break-word; }
.notes :deep(p) { margin: 0; }
.notes :deep(p.sp) { height: .6em; }
.notes :deep(ul) { margin: 4px 0; padding-left: 20px; }
.notes :deep(h4) { margin: 6px 0 4px; font-size: 14.5px; }
</style>
