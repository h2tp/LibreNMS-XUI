<template>
  <div class="ri" :class="[item.kind, status, { img: showImage }]">
    <!-- image choisie par l'utilisateur (photo de façade…) -->
    <template v-if="showImage">
      <img :src="diagApi.imgUrl(item.image)" alt="" draggable="false" />
      <!-- points d'accroche des câbles (les prises ne sont pas dessinées sur une photo) -->
      <span v-for="(k, i) in anchors" :key="k" class="anchor" :data-ep="k" :style="{ left: `${((i + 1) / (anchors.length + 1)) * 100}%` }"></span>
      <span class="img-name"><i v-if="item.kind === 'device'" class="dot" :class="status"></i>{{ name }}</span>
    </template>

    <template v-else>
      <div class="ears"><i></i><i></i></div>
      <div class="label" :style="{ width: `${LABEL_W}px` }">
        <span class="name"><i v-if="item.kind === 'device'" class="dot" :class="status"></i>{{ name }}</span>
        <span v-if="sub && hpx >= 30" class="sub">{{ sub }}</span>
      </div>

      <!-- prises : ports réels (équipement) ou numérotés (panneau, PDU, élément libre) -->
      <div v-if="grid.rows" class="sockets" :style="{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.pw}px)`, gridTemplateRows: `repeat(${grid.rows}, ${grid.ph}px)`, gap: `${grid.gap}px` }">
        <template v-if="item.kind === 'device'">
          <component :is="editing || cableMode ? 'span' : 'router-link'" v-for="(p, i) in devPorts" :key="p.port_id" :to="editing || cableMode ? undefined : `/port/${p.port_id}`"
            class="sock" :class="[p.cls, sockCls(+p.port_id)]" :style="{ gridRow: grid.pos(i).row, gridColumn: grid.pos(i).col, '--fill': p.color }" :title="p.tip"
            :data-ep="`${item.id}:${p.port_id}`" draggable="false" @click="onSock($event, +p.port_id)">
            <span v-if="grid.pw >= 14 && grid.ph >= 11" class="num">{{ p.label }}</span>
          </component>
        </template>
        <template v-else>
          <span v-for="i in item.ports" :key="i" class="sock passive" :class="[item.kind, sockCls(i)]" :style="{ gridRow: grid.pos(i - 1).row, gridColumn: grid.pos(i - 1).col }"
            :title="`${name} · ${i}`" :data-ep="`${item.id}:${i}`" @click="onSock($event, i)">
            <span v-if="grid.pw >= 14 && grid.ph >= 11" class="num">{{ i }}</span>
          </span>
        </template>
      </div>
      <div v-else-if="item.kind === 'cablemgmt'" class="brush"></div>
      <div v-else-if="item.kind === 'shelf'" class="tray"></div>
      <div v-else class="grow"></div>

      <!-- ports virtuels : équipement sans port physique (ping…), état = joignabilité de l'équipement -->
      <div v-if="vcount" class="vports">
        <span v-for="i in vcount" :key="i" class="sock virt" :class="[status === 'up' ? 'up' : 'vdown', sockCls(`v${i}`)]" style="--fill:#22c55e"
          :data-ep="`${item.id}:v${i}`" :title="t('{n} · port virtuel {i} (joignabilité : {s})', { n: name, i, s: statusLabel[status] || status })" @click="onSock($event, `v${i}`)">
          <span v-if="hpx >= 30" class="num">{{ vcount > 1 ? `v${i}` : 'LAN' }}</span>
        </span>
      </div>

      <!-- entrées d'alimentation -->
      <div v-if="psu" class="inlets" :class="{ col: psu > 1 && hpx >= 60 }">
        <span v-for="i in psu" :key="i" class="sock inlet" :class="sockCls(-i)" :data-ep="`${item.id}:${-i}`" :title="t('{n} · alimentation {i}', { n: name, i })" @click="onSock($event, -i)">
          <Zap :size="9" />
        </span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Zap } from 'lucide-vue-next'
import { diagApi } from '../api'
import { devName, devStatus, fmtBits, fmtSpeed, portUtil, statusLabel } from '../utils'
import { faceGrid, shortName, speedColor, UH, FACE_W, KIND_LABEL } from '../rack/core'
import { t } from '../i18n'

const LABEL_W = 118
const props = defineProps({
  item: Object, dev: Object, ports: { type: Array, default: () => [] }, editing: Boolean,
  cableMode: Boolean, cabled: { type: Object, default: () => new Set() }, highlight: { type: Object, default: () => new Set() },
})
const emit = defineEmits(['socket'])
const sockCls = (port) => {
  const k = `${props.item.id}:${port}`
  return { cabled: props.cabled.has(k), hl: props.highlight.has(k), pick: props.cableMode }
}
function onSock(e, port) {
  if (!props.cableMode) return
  e.preventDefault(); e.stopPropagation()
  emit('socket', { item: props.item.id, port })
}
const n = (v) => +v || 0
const hpx = computed(() => props.item.h * UH)
// en mode câblage, la façade dessinée remplace la photo pour pouvoir choisir les prises
const showImage = computed(() => props.item.display === 'image' && !!props.item.image && !props.cableMode)
const status = computed(() => (props.item.kind !== 'device' ? 'none' : props.dev ? devStatus(props.dev) : 'unknown'))
const name = computed(() => props.item.label || (props.dev ? devName(props.dev) : props.item.kind === 'device' ? `#${props.item.device_id}` : KIND_LABEL[props.item.kind]))
const sub = computed(() => (props.item.kind === 'device' ? (props.dev ? props.dev.hardware || props.dev.os || '' : t('équipement inconnu')) : ''))

const count = computed(() => (props.item.kind === 'device' ? props.ports.length : props.item.ports))
const psu = computed(() => (['device', 'custom', 'pdu'].includes(props.item.kind) ? props.item.psu ?? (props.item.kind === 'device' ? 1 : 0) : 0))
const grid = computed(() => faceGrid(count.value, FACE_W - LABEL_W - 34 - (psu.value ? (psu.value > 1 && hpx.value >= 60 ? 22 : psu.value * 19) : 0), hpx.value - 10))
const vcount = computed(() => (props.item.kind === 'device' ? props.item.vports ?? (props.ports.length ? 0 : 1) : 0))
const anchors = computed(() => [...props.cabled].filter((k) => k.startsWith(`${props.item.id}:`)))

const devPorts = computed(() => props.ports.map((p) => {
  const admin = p.ifAdminStatus === 'down'
  const up = !admin && p.ifOperStatus === 'up'
  const errs = n(p.ifInErrors_delta) + n(p.ifOutErrors_delta) > 0
  return {
    ...p, label: shortName(p), color: up ? speedColor(n(p.ifSpeed)) : '',
    cls: [admin ? 'admin' : up ? 'up' : 'off', errs ? 'err' : ''],
    tip: [`${p.ifName}${p.ifAlias && p.ifAlias !== p.ifName ? ' — ' + p.ifAlias : ''}`,
      admin ? t('Désactivé') : up ? t('Connecté à {s}', { s: fmtSpeed(n(p.ifSpeed)) }) : t('Déconnecté'),
      up ? `↓ ${fmtBits(n(p.ifInOctets_rate) * 8)} · ↑ ${fmtBits(n(p.ifOutOctets_rate) * 8)} · ${Math.round(portUtil(p))} %` : ''].filter(Boolean).join('\n'),
  }
}))
</script>

<style scoped>
.ri { position: relative; height: 100%; display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 0; border-radius: 3px; overflow: hidden;
  background: linear-gradient(180deg, #2b3445, #1c2331); border: 1px solid #3b4658; color: #e2e8f0; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .06); }
.ri.down { border-color: #f43f5e; box-shadow: inset 0 0 0 1px #f43f5e; }
.ri.blank { background: repeating-linear-gradient(180deg, #273142 0 3px, #222b3a 3px 6px); }
.ri.patch { background: linear-gradient(180deg, #20262f, #161b22); }
.ri.pdu { background: linear-gradient(180deg, #2a2f3a, #1b1f27); }
.ri.shelf, .ri.cablemgmt { background: linear-gradient(180deg, #252d3b, #1a202b); }
.ears { align-self: stretch; width: 14px; flex: none; display: flex; flex-direction: column; justify-content: space-around; align-items: center;
  background: linear-gradient(90deg, #3a4558, #2c3546); border-right: 1px solid #45526a; }
.ears i { width: 5px; height: 5px; border-radius: 50%; background: #10151d; box-shadow: inset 0 0 0 1px #5b6880; }
.label { flex: none; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.name { font-size: 11.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
.sub { font-size: 9.5px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #64748b; }
.dot.up { background: #22c55e; } .dot.down { background: #f43f5e; }
.sockets { display: grid; margin-left: auto; }
.sock { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 2px; font-size: 8.5px; font-weight: 700; color: #64748b;
  background: #0b1018; border: 1px solid #334155; text-decoration: none; overflow: hidden; }
a.sock:hover { border-color: #e2e8f0; text-decoration: none; }
.sock.up { border-color: var(--fill); color: #fff; background: color-mix(in srgb, var(--fill) 35%, #0b1018); }
.sock.admin { background: repeating-linear-gradient(135deg, #1e293b 0 3px, #0b1018 3px 6px); }
.sock.err { box-shadow: 0 0 0 1.5px #f43f5e; }
.sock.passive { background: #05080d; border-color: #2a3442; color: #7c8aa0; }
.sock.pdu { border-radius: 40%; background: #111; }
.num { position: relative; z-index: 1; line-height: 1; }
.sock.cabled::after { content: ''; position: absolute; right: 1px; top: 1px; width: 4px; height: 4px; border-radius: 50%; background: #e2e8f0; }
.sock.pick { cursor: crosshair; }
.sock.pick:hover { border-color: #fff; box-shadow: 0 0 0 2px var(--accent); z-index: 2; }
.sock.hl { border-color: #fff; box-shadow: 0 0 0 2px var(--accent); z-index: 2; }
.vports { flex: none; display: flex; gap: 3px; margin-left: 6px; }
.sock.virt { width: 26px; height: 15px; border-style: dashed; font-size: 7.5px; }
.sock.virt.vdown { border-color: #f43f5e; color: #f43f5e; }
.inlets { flex: none; display: flex; gap: 4px; margin-left: 6px; }
.inlets.col { flex-direction: column; }
.sock.inlet { width: 15px; height: 13px; border-radius: 3px 3px 5px 5px; background: #0b0d10; border-color: #4b5563; color: #facc15; }
.anchor { position: absolute; bottom: 2px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: #e2e8f0; box-shadow: 0 0 0 1px #0b1018; }
.brush { flex: 1; align-self: stretch; margin: 2px 0; border-radius: 3px; background: repeating-linear-gradient(90deg, #0f141c 0 2px, #1e2633 2px 5px); }
.tray { flex: 1; align-self: flex-end; height: 5px; border-radius: 2px; background: #475569; }
.ri.img { padding: 0; background: #111827; }
.ri.img img { width: 100%; height: 100%; object-fit: fill; display: block; }
.img-name { position: absolute; left: 6px; bottom: 3px; max-width: 70%; font-size: 10.5px; font-weight: 700; color: #fff; display: flex; gap: 5px; align-items: center;
  padding: 1px 6px; border-radius: 4px; background: rgba(0, 0, 0, .55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
