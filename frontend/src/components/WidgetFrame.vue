<template>
  <div class="wframe" :class="{ card: !def?.frameless, frameless: def?.frameless, editing }">
    <div v-if="!def?.frameless || editing" class="whead" :class="{ 'w-drag': editing, floating: def?.frameless }">
      <GripVertical v-if="editing" :size="15" class="faint grip" />
      <component :is="def?.icon || Puzzle" :size="16" class="ico" />
      <span class="ellipsis wtitle">{{ title }}</span>
      <div class="grow"></div>
      <template v-if="editing">
        <button class="btn ghost sm icon w-nodrag" :title="t('Configurer')" @click="$emit('configure')"><Settings2 /></button>
        <button class="btn ghost sm icon w-nodrag" :title="t('Dupliquer')" @click="$emit('duplicate')"><Copy /></button>
        <button class="btn ghost sm icon w-nodrag danger" :title="t('Retirer')" @click="$emit('remove')"><Trash2 /></button>
      </template>
      <button v-else-if="def?.fields?.length && canEdit" class="btn ghost sm icon hover-only" :title="t('Configurer')" @click="$emit('configure')"><Settings2 /></button>
    </div>
    <div ref="body" class="wbody" :class="{ 'w-nodrag': editing }">
      <div v-if="!def" class="empty small"><Puzzle /><div>Widget inconnu « {{ widget.type }} »</div></div>
      <div v-else-if="!ok" class="empty small"><Puzzle /><div>{{ t('Widget indisponible : les fichiers RRD ne sont pas montés.') }}</div></div>
      <div v-else-if="incomplete" class="empty small">
        <Settings2 /><div>{{ t('Ce widget doit être configuré.') }}</div>
        <button v-if="canEdit" class="btn sm primary mt" @click="$emit('configure')">{{ t('Configurer') }}</button>
      </div>
      <component :is="def.component" v-else-if="size.w" :key="cfgKey" :config="widget.config || {}" :size="size" />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { GripVertical, Settings2, Copy, Trash2, Puzzle } from 'lucide-vue-next'
import { WIDGETS, available, missingConfig } from '../dashboard/widgets'
import { t } from '../i18n'

const props = defineProps({ widget: Object, editing: Boolean, canEdit: Boolean })
defineEmits(['configure', 'duplicate', 'remove'])
const def = computed(() => WIDGETS[props.widget.type])
const ok = computed(() => available(props.widget.type))
const incomplete = computed(() => missingConfig(props.widget.type, props.widget.config))
const urlHost = (u) => { try { return new URL(u).host } catch { return '' } }
const title = computed(() => props.widget.config?.title || props.widget.config?.autoTitle
  || (props.widget.type === 'iframe' && urlHost(props.widget.config?.url)) || def.value?.label || props.widget.type)
// Recrée le widget quand sa configuration change (rechargement propre des données).
const cfgKey = computed(() => JSON.stringify(props.widget.config || {}))

const body = ref(null)
const size = reactive({ w: 0, h: 0 })
let ro = null
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    const r = e.contentRect
    size.w = Math.round(r.width); size.h = Math.round(r.height)
  })
  ro.observe(body.value)
})
onBeforeUnmount(() => ro && ro.disconnect())
</script>

<style scoped>
.wframe { height: 100%; display: flex; flex-direction: column; padding: 14px 16px; min-width: 0; }
.wframe.frameless { padding: 0; position: relative; }
.whead { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; min-height: 26px; }
.whead .ico { color: var(--accent); flex: none; }
.whead.floating { position: absolute; z-index: 3; top: -12px; left: 12px; right: 12px; margin: 0; padding: 2px 6px 2px 10px; border-radius: 10px; background: var(--panel-solid); border: 1px solid var(--border); box-shadow: 0 6px 18px rgba(0,0,0,.25); }
.wtitle { min-width: 0; }
.w-drag { cursor: grab; user-select: none; }
.w-drag:active { cursor: grabbing; }
.grip { flex: none; margin-left: -4px; }
.wbody { flex: 1; min-height: 0; overflow: auto; overflow-x: hidden; }
.frameless .wbody { overflow: visible; }
.editing.card { outline: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: -1px; }
.hover-only { opacity: 0; transition: opacity .2s; }
.wframe:hover .hover-only { opacity: .8; }
.danger:hover { color: var(--red); }
</style>
