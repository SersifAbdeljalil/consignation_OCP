// src/components/chefIntervenant/mesConsignationsChef.js
// ✅ Liste complète des consignations du chef intervenant
// ✅ Filtres : Toutes / En attente / Consignées / Déconsignées / Clôturées / Refusées
// ✅ Barre de recherche
// ✅ Indicateur d'équipe sur les cartes consignées
// ✅ Couleurs bleu #1565C0
// ✅ FIX : 3 nouveaux statuts déconsignés
//    deconsigne_intervent | deconsigne_charge | deconsigne_process

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMesDemandes } from '../../api/intervenant.api';
import { getStatutDeconsignation } from '../../api/equipeIntervention.api';

const BASE_URL = 'http://192.168.1.104:3000';

const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
  bgPale:      '#BBDEFB',
};

// ✅ Ajout des 3 nouveaux statuts déconsignés
const STATUT_CONFIG = {
  en_attente:            { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',        icon: 'time-outline'             },
  validee:               { color: '#10B981', bg: '#D1FAE5', label: 'VALIDÉE',           icon: 'checkmark-circle-outline' },
  rejetee:               { color: '#EF4444', bg: '#FEE2E2', label: 'REJETÉE',           icon: 'close-circle-outline'     },
  en_cours:              { color: '#1565C0', bg: '#E3F2FD', label: 'EN COURS',          icon: 'sync-outline'             },
  consigne:              { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉE',         icon: 'lock-closed-outline'      },
  consigne_charge:       { color: '#1565C0', bg: '#E3F2FD', label: 'CONSIG. CHARGÉ',   icon: 'flash-outline'            },
  consigne_process:      { color: '#6A1B9A', bg: '#F3E5F5', label: 'CONSIG. PROCESS',  icon: 'cog-outline'              },
  deconsigne_intervent:  { color: '#6A1B9A', bg: '#F3E5F5', label: 'DÉCONSIG. INTERV', icon: 'lock-open-outline'        },
  deconsigne_charge:     { color: '#0277BD', bg: '#E1F5FE', label: 'DÉCONSIG. CHARGÉ', icon: 'flash-outline'            },
  deconsigne_process:    { color: '#558B2F', bg: '#F1F8E9', label: 'DÉCONSIG. PROCESS', icon: 'cog-outline'             },
  // Compatibilité ancien statut
  deconsignee:           { color: '#6A1B9A', bg: '#F3E5F5', label: 'DÉCONSIGNÉE',      icon: 'lock-open-outline'        },
  cloturee:              { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',          icon: 'archive-outline'          },
};

// ✅ Liste des statuts "déconsignés"
const STATUTS_DECONSIGNE = [
  'deconsigne_intervent',
  'deconsigne_charge',
  'deconsigne_process',
  'deconsignee', // ancien statut — compatibilité
];

// Statuts "consignés" (équipe active)
const STATUTS_EQUIPE = ['consigne', 'consigne_charge', 'consigne_process'];

const FILTRES = [
  { key: null,                   label: 'Toutes',      icon: 'list-outline'          },
  { key: 'en_attente',           label: 'En attente',  icon: 'time-outline'          },
  { key: 'consigne',             label: 'Consignées',  icon: 'lock-closed-outline'   },
  { key: 'deconsigne_intervent', label: 'Déconsign.',  icon: 'lock-open-outline'     },
  { key: 'cloturee',             label: 'Clôturées',   icon: 'archive-outline'       },
  { key: 'rejetee',              label: 'Refusées',    icon: 'close-circle-outline'  },
];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

export default function MesConsignationsChef({ navigation, route }) {
  const filtreInitial = route.params?.filtreInitial ?? null;

  const [demandes,    setDemandes]    = useState([]);
  const [filtre,      setFiltre]      = useState(filtreInitial);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [recherche,   setRecherche]   = useState('');
  const [searchFocus, setSearchFocus] = useState(false);

  useEffect(() => {
    if (route.params?.filtreInitial !== undefined) {
      setFiltre(route.params.filtreInitial ?? null);
    }
  }, [route.params?.filtreInitial]);

  const charger = useCallback(async () => {
    try {
      const res = await getMesDemandes();
      if (res?.success) setDemandes(res.data || []);
    } catch (e) {
      console.error('MesConsignationsChef error:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const [loadingPdfId, setLoadingPdfId] = useState(null);

  // ✅ Ouvrir le rapport PDF directement depuis la liste
  const ouvrirRapportPdf = async (item) => {
    if (loadingPdfId) return;
    try {
      setLoadingPdfId(item.id);
      const res = await getStatutDeconsignation(item.id);
      if (res?.success && res.data?.rapport_pdf_path) {
        const url = `${BASE_URL}/${res.data.rapport_pdf_path}`.replace(/([^:]\/)\/+/g, '$1');
        navigation.navigate('PdfViewer', {
          url,
          titre: `Rapport — ${item.numero_ordre}`,
          role: 'chef_equipe',
        });
      } else {
        // Fallback : aller dans GestionEquipe si le PDF n'est pas encore trouvé
        navigation.navigate('GestionEquipe', { demande: item });
      }
    } catch {
      navigation.navigate('GestionEquipe', { demande: item });
    } finally {
      setLoadingPdfId(null);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger();
  }, [charger]);

  // ── Filtrage ──
  // Le filtre 'consigne' couvre aussi consigne_charge et consigne_process
  // Le filtre 'deconsigne_intervent' couvre tous les statuts déconsignés
  const matchFiltre = (d) => {
    if (filtre === null) return true;
    if (filtre === 'consigne') return STATUTS_EQUIPE.includes(d.statut);
    if (filtre === 'deconsigne_intervent') return STATUTS_DECONSIGNE.includes(d.statut);
    return d.statut === filtre;
  };

  const demandesFiltrees = demandes.filter(d => {
    if (!matchFiltre(d)) return false;
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return (
      (d.numero_ordre   || '').toLowerCase().includes(q) ||
      (d.tag            || '').toLowerCase().includes(q) ||
      (d.equipement_nom || '').toLowerCase().includes(q) ||
      (d.lot_code       || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    en_attente:  demandes.filter(d => d.statut === 'en_attente').length,
    consignees:  demandes.filter(d => STATUTS_EQUIPE.includes(d.statut)).length,
    deconsignees:demandes.filter(d => STATUTS_DECONSIGNE.includes(d.statut)).length,
    cloturees:   demandes.filter(d => d.statut === 'cloturee').length,
  };

  const filtreActifLabel = FILTRES.find(f => f.key === filtre)?.label || 'Toutes';

  const renderCard = ({ item }) => {
    const cfg = STATUT_CONFIG[item.statut] || STATUT_CONFIG.en_attente;
    const isConsigne    = STATUTS_EQUIPE.includes(item.statut);
    const isDeconsigne  = STATUTS_DECONSIGNE.includes(item.statut);

    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailConsignation', { demande: item })}
      >
        <View style={S.cardTop}>
          <View style={[S.cardIconWrap, { backgroundColor: CFG.bg }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={CFG.couleur} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.cardNumero}>{item.numero_ordre}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
              <Text style={S.cardTag}>
                {item.tag || ''}{item.equipement_nom ? ` — ${item.equipement_nom}` : ''}
              </Text>
            </View>
            {item.lot_code && (
              <Text style={S.cardLot}>LOT : {item.lot_code}</Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
              <Ionicons name="calendar-outline" size={11} color="#BDBDBD" />
              <Text style={S.cardDate}> {fmtDate(item.created_at)}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={10} color={cfg.color} />
              <Text style={[S.statutTxt, { color: cfg.color }]}> {cfg.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
          </View>
        </View>

        {/* ── Indicateur équipe active (consignée) ── */}
        {isConsigne && (
          <TouchableOpacity
            style={S.equipeBar}
            onPress={() => navigation.navigate('MonEquipe', { demande: item })}
            activeOpacity={0.8}
          >
            <View style={S.equipeBarLeft}>
              <Ionicons name="people-outline" size={14} color={CFG.couleur} />
              <Text style={S.equipeBarTxt}>Équipe active — Appuyez pour gérer</Text>
            </View>
            <Ionicons name="arrow-forward-circle-outline" size={16} color={CFG.couleur} />
          </TouchableOpacity>
        )}

        {/* ── Indicateur rapport disponible (déconsignée) ── */}
        {isDeconsigne && (
          <TouchableOpacity
            style={S.rapportBar}
            onPress={() => ouvrirRapportPdf(item)}
            activeOpacity={0.8}
            disabled={loadingPdfId === item.id}
          >
            <View style={S.equipeBarLeft}>
              {loadingPdfId === item.id
                ? <ActivityIndicator size="small" color={cfg.color} />
                : <Ionicons name="document-text-outline" size={14} color={cfg.color} />
              }
              <Text style={[S.rapportBarTxt, { color: cfg.color }]}>
                {loadingPdfId === item.id
                  ? 'Chargement du rapport...'
                  : 'Intervention terminée — Voir rapport PDF'}
              </Text>
            </View>
            {loadingPdfId !== item.id && (
              <Ionicons name="arrow-forward-circle-outline" size={16} color={cfg.color} />
            )}
          </TouchableOpacity>
        )}

        {/* ── Barre double validation (consigne_charge / consigne_process) ── */}
        {(item.statut === 'consigne_charge' || item.statut === 'consigne_process') && (
          <View style={S.doubleValBar}>
            <View style={[S.doubleValStep, {
              backgroundColor: item.statut === 'consigne_charge' ? '#1565C0' : '#10B981',
            }]}>
              <Ionicons name="flash-outline" size={9} color="#fff" />
              <Text style={S.doubleValTxt}>Chargé</Text>
            </View>
            <View style={S.doubleValSep} />
            <View style={[S.doubleValStep, {
              backgroundColor: item.statut === 'consigne_process' ? '#6A1B9A' : '#E0E0E0',
            }]}>
              <Ionicons name="cog-outline" size={9} color={item.statut === 'consigne_process' ? '#fff' : '#9E9E9E'} />
              <Text style={[S.doubleValTxt, { color: item.statut === 'consigne_process' ? '#fff' : '#9E9E9E' }]}>
                Process
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Mes consignations</Text>
          <Text style={S.hSub}>
            {demandesFiltrees.length} consignation{demandesFiltrees.length !== 1 ? 's' : ''} · {filtreActifLabel}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Barre stats ── */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { lbl: 'Total',       val: demandes.length,      color: '#fff'    },
          { lbl: 'En attente',  val: stats.en_attente,     color: '#FDE68A' },
          { lbl: 'Consignées',  val: stats.consignees,     color: '#6EE7B7' },
          { lbl: 'Déconsign.',  val: stats.deconsignees,   color: '#CE93D8' },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* ── Filtres ── */}
      <View style={S.filtresWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8, flexDirection: 'row', paddingVertical: 10 }}
        >
          {FILTRES.map(f => (
            <TouchableOpacity
              key={f.key ?? 'all'}
              style={[S.chip, filtre === f.key && S.chipActive]}
              onPress={() => setFiltre(f.key)}
            >
              <Ionicons
                name={f.icon}
                size={12}
                color={filtre === f.key ? '#fff' : '#9E9E9E'}
                style={{ marginRight: 4 }}
              />
              <Text style={[S.chipTxt, filtre === f.key && S.chipTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Barre de recherche ── */}
      <View style={[S.searchBar, searchFocus && S.searchBarFocus]}>
        <Ionicons name="search-outline" size={18} color={searchFocus ? CFG.couleur : '#9E9E9E'} />
        <TextInput
          style={S.searchInput}
          placeholder="N° ordre, TAG, équipement, LOT..."
          placeholderTextColor="#9E9E9E"
          value={recherche}
          onChangeText={setRecherche}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          returnKeyType="search"
        />
        {recherche.length > 0 && (
          <TouchableOpacity onPress={() => setRecherche('')}>
            <Ionicons name="close-circle" size={18} color="#9E9E9E" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Liste ── */}
      {demandesFiltrees.length === 0 ? (
        <View style={S.emptyWrap}>
          <Ionicons name="document-text-outline" size={56} color={CFG.bg} />
          <Text style={S.emptyTitle}>
            {recherche ? 'Aucun résultat' : 'Aucune consignation'}
          </Text>
          <Text style={S.emptySub}>
            {recherche
              ? `Aucune consignation pour « ${recherche} »`
              : filtre
                ? 'Aucune consignation avec ce statut'
                : 'Vos consignations apparaîtront ici'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={demandesFiltrees}
          keyExtractor={item => item.id.toString()}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  statsBar: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal:  { fontSize: 18, fontWeight: '900' },
  statLbl:  { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2, textAlign: 'center' },

  filtresWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#fff' },
  chipActive:  { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipTxt:     { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },
  chipTxtActive: { color: '#fff' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    marginHorizontal: 14, marginTop: 10, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#E0E0E0',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  searchBarFocus: { borderColor: '#1565C0' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#212121', paddingVertical: 0 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start' },
  cardIconWrap:{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardNumero:  { fontSize: 13, fontWeight: '800', color: '#212121' },
  cardTag:     { fontSize: 11, color: '#1565C0', fontWeight: '600', marginLeft: 4 },
  cardLot:     { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  cardDate:    { fontSize: 10, color: '#BDBDBD' },

  statutBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  statutTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Barre équipe active
  equipeBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    backgroundColor: '#F0F7FF', borderRadius: 8, padding: 8, paddingHorizontal: 10,
  },
  equipeBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  equipeBarTxt:  { fontSize: 11, fontWeight: '700', color: '#1565C0' },

  // Barre rapport déconsigné
  rapportBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    backgroundColor: '#F3E5F5', borderRadius: 8, padding: 8, paddingHorizontal: 10,
  },
  rapportBarTxt: { fontSize: 11, fontWeight: '700' },

  doubleValBar: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  doubleValStep: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4, paddingVertical: 5, borderRadius: 8,
  },
  doubleValSep: { width: 8 },
  doubleValTxt: { fontSize: 10, fontWeight: '700', color: '#fff' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});