import { t } from './i18n'
// Définitions de colonnes partagées
export const BGP_COLS = [
  { key: 'bgpPeerIdentifier', label: t('Pair'), class: 'mono' }, { key: 'bgpPeerRemoteAs', label: t('AS distant') }, { key: 'astext', label: t('Nom AS') },
  { key: 'bgpPeerDescr', label: t('Description') }, { key: 'bgpPeerState', label: t('État') }, { key: 'bgpPeerAdminStatus', label: t('Admin') },
  { key: 'bgpLocalAddr', label: t('Adresse locale'), class: 'mono' }, { key: 'bgpPeerFsmEstablishedTime', label: t('Établie depuis') },
  { key: 'bgpPeerInUpdates', label: t('Updates in') }, { key: 'bgpPeerOutUpdates', label: t('Updates out') }, { key: 'bgpPeerLastErrorText', label: t('Dernière erreur') },
]
export const OSPF_COLS = [
  { key: 'ospfNbrIpAddr', label: t('Voisin'), class: 'mono' }, { key: 'ospfNbrRtrId', label: t('Router ID'), class: 'mono' }, { key: 'ospfNbrState', label: t('État') },
  { key: 'ospfNbrPriority', label: t('Priorité') }, { key: 'ospfNbrEvents', label: t('Évènements') }, { key: 'context_name', label: t('Contexte') },
]
export const OSPF_PORT_COLS = [
  { key: 'ospfIfIpAddress', label: t('Adresse'), class: 'mono' }, { key: 'ospfIfAreaId', label: t('Aire') }, { key: 'ospfIfType', label: t('Type') },
  { key: 'ospfIfState', label: t('État') }, { key: 'ospfIfAdminStat', label: t('Admin') }, { key: 'ospfIfRtrPriority', label: t('Priorité') },
  { key: 'ospfIfDesignatedRouter', label: 'DR', class: 'mono' }, { key: 'ospfIfBackupDesignatedRouter', label: 'BDR', class: 'mono' },
]
export const VRF_COLS = [
  { key: 'vrf_name', label: 'VRF' }, { key: 'mplsVpnVrfRouteDistinguisher', label: 'RD' }, { key: 'mplsVpnVrfDescription', label: t('Description') },
  { key: 'bgpLocalAs', label: t('AS local') }, { key: 'device_id', label: t('Équipement') },
]
