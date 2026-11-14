// Volumes de stockage : nettoyage commun aux widgets Stockage et Serveurs.
export const SYSTEM_MOUNT = /^\/(run|dev|sys|proc|tmp|boot|snap|var\/lib\/docker|var\/snap)(\/|$)/

/** « C:\ Label:Data  Serial Number 1a2b » -> « C:\ (Data) » */
export function volumeName(d) {
  const w = /^([A-Za-z]:\\?)\s*Label:\s*(.*?)\s*Serial Number.*$/.exec(d || '')
  if (w) return w[2] ? `${w[1]} (${w[2]})` : w[1]
  return d || '?'
}

/** Retire volumes système, volumes < 1 Go et montages en double (même FS vu plusieurs fois). */
export function usefulVolumes(list) {
  const seen = new Map()
  for (const v of list.filter((x) => +x.size > 0 && !SYSTEM_MOUNT.test(x.descr || '') && +x.size >= 1e9)
    .sort((a, b) => String(a.descr).length - String(b.descr).length)) {
    const k = `${v.device_id}:${v.size}:${v.used}`
    if (!seen.has(k)) seen.set(k, v)
  }
  return [...seen.values()]
}
