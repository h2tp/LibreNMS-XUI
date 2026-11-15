<template>
  <div v-if="photos.length || canEdit" class="card photos" :class="{ drag: dragOver }"
    @dragover.prevent="canEdit && (dragOver = true)" @dragleave.self="dragOver = false" @drop.prevent="onDrop">
    <div class="card-title"><Camera :size="17" /> Photos
      <span v-if="photos.length > 1" class="sub">{{ cur + 1 }} / {{ photos.length }}</span>
      <div class="right">
        <label v-if="canEdit && photos.length < MAX" class="btn ghost sm" title="Ajouter des photos (PNG, JPEG, WebP, GIF, 10 Mo max.)">
          <Loader2 v-if="busy" :size="14" class="spin" /><ImagePlus v-else :size="14" /> Ajouter
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden @change="onPick" />
        </label>
      </div>
    </div>

    <div v-if="!photos.length" class="empty small">
      <ImagePlus :size="22" /><span>Aucune photo. Cliquez sur « Ajouter » ou déposez des images ici.</span>
    </div>

    <template v-else>
      <div class="main" @click="lightbox = true">
        <img :src="photoApi.url(current.name)" :alt="current.caption || device.hostname" />
        <button v-if="photos.length > 1" class="nav prev" title="Précédente" @click.stop="go(-1)"><ChevronLeft :size="18" /></button>
        <button v-if="photos.length > 1" class="nav next" title="Suivante" @click.stop="go(1)"><ChevronRight :size="18" /></button>
      </div>

      <div class="cap row">
        <input v-if="canEdit" v-model="caption" class="input sm grow" maxlength="120" placeholder="Légende (ex. façade, arrière, baie B2…)" @change="saveCaption" @keydown.enter="$event.target.blur()" />
        <span v-else class="small muted grow">{{ current.caption }}</span>
        <template v-if="canEdit">
          <button v-if="cur > 0" class="btn ghost sm icon" title="Mettre en première position" @click="makeFirst"><Star :size="14" /></button>
          <button class="btn ghost sm icon danger" title="Supprimer cette photo" @click="remove"><Trash2 :size="14" /></button>
        </template>
      </div>

      <div v-if="photos.length > 1" class="thumbs">
        <button v-for="(p, i) in photos" :key="p.name" class="thumb" :class="{ on: i === cur }" :title="p.caption" @click="cur = i">
          <img :src="photoApi.url(p.name)" alt="" loading="lazy" />
        </button>
      </div>
      <div class="small faint meta">Ajoutée {{ timeAgo(current.added * 1000) }}{{ current.by ? ` par ${current.by}` : '' }}</div>
    </template>

    <teleport to="body">
      <div v-if="lightbox && current" class="lb" @click.self="lightbox = false">
        <img :src="photoApi.url(current.name)" :alt="current.caption" />
        <div class="lb-cap">{{ current.caption || device.hostname }}<span v-if="photos.length > 1"> · {{ cur + 1 }} / {{ photos.length }}</span></div>
        <button class="lb-btn close" title="Fermer (Échap)" @click="lightbox = false"><X :size="22" /></button>
        <template v-if="photos.length > 1">
          <button class="lb-btn prev" title="Précédente (←)" @click="go(-1)"><ChevronLeft :size="28" /></button>
          <button class="lb-btn next" title="Suivante (→)" @click="go(1)"><ChevronRight :size="28" /></button>
        </template>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Camera, ImagePlus, Loader2, Trash2, Star, ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import { photoApi, session } from '../api'
import { timeAgo, toast, toastError, confirmAction } from '../utils'

const MAX = 20
const props = defineProps({ device: Object })
const photos = ref([]); const cur = ref(0); const caption = ref('')
const busy = ref(false); const dragOver = ref(false); const lightbox = ref(false)
const canEdit = computed(() => !session.read_only)
const current = computed(() => photos.value[cur.value] || null)
watch(current, (p) => { caption.value = p?.caption || '' }, { immediate: true })

async function load() {
  try { photos.value = await photoApi.list(props.device.device_id) } catch { photos.value = [] }
  cur.value = Math.min(cur.value, Math.max(0, photos.value.length - 1))
}
watch(() => props.device?.device_id, () => { cur.value = 0; load() }, { immediate: true })

const go = (d) => { const n = photos.value.length; if (n) cur.value = (cur.value + d + n) % n }

async function upload(files) {
  const imgs = [...files].filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type))
  if (!imgs.length) { toast('Formats acceptés : PNG, JPEG, WebP, GIF', 'error'); return }
  busy.value = true
  let ok = 0
  for (const f of imgs) {
    try { await photoApi.add(props.device.device_id, f); ok++ } catch (e) { toastError(e) }
  }
  busy.value = false
  const before = photos.value.length
  await load()
  if (ok) { cur.value = Math.max(0, before); toast(ok > 1 ? `${ok} photos ajoutées` : 'Photo ajoutée', 'success') }
}
function onPick(e) { const f = e.target.files; if (f?.length) upload(f); e.target.value = '' }
function onDrop(e) { dragOver.value = false; if (canEdit.value && e.dataTransfer.files?.length) upload(e.dataTransfer.files) }

async function saveCaption() {
  const p = current.value
  if (!p || caption.value === p.caption) return
  try { photos.value = await photoApi.edit(props.device.device_id, p.name, { caption: caption.value }) } catch (e) { toastError(e) }
}
async function makeFirst() {
  try { photos.value = await photoApi.edit(props.device.device_id, current.value.name, { first: true }); cur.value = 0 } catch (e) { toastError(e) }
}
async function remove() {
  if (!confirmAction('Supprimer cette photo ?')) return
  try { await photoApi.remove(props.device.device_id, current.value.name); await load(); toast('Photo supprimée', 'success') } catch (e) { toastError(e) }
}

function onKey(e) {
  if (!lightbox.value) return
  if (e.key === 'Escape') lightbox.value = false
  else if (e.key === 'ArrowLeft') go(-1)
  else if (e.key === 'ArrowRight') go(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.photos.drag { outline: 2px dashed var(--accent); outline-offset: -6px; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 8px; color: var(--muted); text-align: center; border: 1px dashed var(--border); border-radius: 10px; }
.main { position: relative; border-radius: 10px; overflow: hidden; background: var(--panel-2); height: 260px; padding: 10px; display: flex; align-items: center; justify-content: center; cursor: zoom-in; }
/* tailles en px (et non en %) : l'image entière tient toujours dans le cadre, sans être rognée */
.main img { max-width: 100%; max-height: 240px; width: auto; height: auto; object-fit: contain; display: block; }
.nav { position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 50%; border: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--panel-solid) 85%, transparent); color: var(--text); cursor: pointer; opacity: 0; transition: .15s; }
.main:hover .nav { opacity: 1; }
.nav.prev { left: 8px; } .nav.next { right: 8px; }
.cap { gap: 6px; margin-top: 10px; align-items: center; }
.cap .input.sm { padding: 5px 9px; font-size: 12.5px; }
.thumbs { display: flex; gap: 6px; margin-top: 10px; overflow-x: auto; padding-bottom: 2px; }
.thumb { flex: none; width: 54px; height: 42px; padding: 2px; border-radius: 8px; border: 1px solid var(--border); background: var(--panel-2); cursor: pointer; display: grid; place-items: center; }
.thumb img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 5px; }
.thumb.on { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.meta { margin-top: 8px; }
.lb { position: fixed; inset: 0; z-index: 1000; background: rgba(5, 8, 15, .92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 70px; }
.lb img { max-width: 100%; max-height: calc(100vh - 110px); object-fit: contain; border-radius: 8px; }
.lb-cap { color: #e2e8f0; font-size: 14px; }
.lb-btn { position: absolute; border: 0; background: rgba(255, 255, 255, .08); color: #fff; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; }
.lb-btn:hover { background: rgba(255, 255, 255, .18); }
.lb-btn.close { top: 16px; right: 16px; }
.lb-btn.prev { left: 14px; top: 50%; transform: translateY(-50%); }
.lb-btn.next { right: 14px; top: 50%; transform: translateY(-50%); }
@media (max-width: 640px) { .lb { padding: 60px 12px; } .lb-btn.prev, .lb-btn.next { top: auto; bottom: 16px; transform: none; } }
</style>
