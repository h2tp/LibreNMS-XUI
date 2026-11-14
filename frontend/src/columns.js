// Définitions de colonnes partagées
export const BGP_COLS = [
  { key: 'bgpPeerIdentifier', label: 'Pair', class: 'mono' }, { key: 'bgpPeerRemoteAs', label: 'AS distant' }, { key: 'astext', label: 'Nom AS' },
  { key: 'bgpPeerDescr', label: 'Description' }, { key: 'bgpPeerState', label: 'État' }, { key: 'bgpPeerAdminStatus', label: 'Admin' },
  { key: 'bgpLocalAddr', label: 'Adresse locale', class: 'mono' }, { key: 'bgpPeerFsmEstablishedTime', label: 'Établie depuis' },
  { key: 'bgpPeerInUpdates', label: 'Updates in' }, { key: 'bgpPeerOutUpdates', label: 'Updates out' }, { key: 'bgpPeerLastErrorText', label: 'Dernière erreur' },
]
export const OSPF_COLS = [
  { key: 'ospfNbrIpAddr', label: 'Voisin', class: 'mono' }, { key: 'ospfNbrRtrId', label: 'Router ID', class: 'mono' }, { key: 'ospfNbrState', label: 'État' },
  { key: 'ospfNbrPriority', label: 'Priorité' }, { key: 'ospfNbrEvents', label: 'Évènements' }, { key: 'context_name', label: 'Contexte' },
]
export const OSPF_PORT_COLS = [
  { key: 'ospfIfIpAddress', label: 'Adresse', class: 'mono' }, { key: 'ospfIfAreaId', label: 'Aire' }, { key: 'ospfIfType', label: 'Type' },
  { key: 'ospfIfState', label: 'État' }, { key: 'ospfIfAdminStat', label: 'Admin' }, { key: 'ospfIfRtrPriority', label: 'Priorité' },
  { key: 'ospfIfDesignatedRouter', label: 'DR', class: 'mono' }, { key: 'ospfIfBackupDesignatedRouter', label: 'BDR', class: 'mono' },
]
export const VRF_COLS = [
  { key: 'vrf_name', label: 'VRF' }, { key: 'mplsVpnVrfRouteDistinguisher', label: 'RD' }, { key: 'mplsVpnVrfDescription', label: 'Description' },
  { key: 'bgpLocalAs', label: 'AS local' }, { key: 'device_id', label: 'Équipement' },
]
