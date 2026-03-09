// src/components/process/mesDemandesProcess.js
// ✅ Liste des demandes actives du chef process
// ✅ Lecture de filtreInitial depuis route.params (venant du dashboard)
// ✅ Navigation vers DetailConsignationProcess au clic
// ✅ Filtres : Toutes / En attente / En cours / Att.Chargé / Att.Process
// ✅ Barre de recherche
// ✅ Couleurs Process (ambre/orange)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDemandesProcess } from '../../api/process.api';

const CFG = {
  couleur:     '#b45309',
  couleurDark: '#92400e',
  bg:          '#fef3c7',
  bgPale:      '#fde68a',
};

const STATUT_CONFIG = {
  en_attente:       { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',   icon: 'time-outline'         },
  en_cours:         { color: '#b45309', bg: '#fde68a', label: 'EN COURS',     icon: 'sync-outline'         },
  consigne_charge:  { color: '#1565C0', bg: '#E3F2FD', label: 'ATT. CHARGÉ',  icon: 'time-outline'         },
  consigne_process: { color: '#6A1B9A', bg: '#F3E5F5', label: 'ATT. PROCESS', icon: 'time-outline'         },
  consigne:         { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉ ✓',   icon: 'lock-closed-outline'  },
  rejetee:          { color: '#EF4444', bg: '#FEE2E2', label: 'REFUSÉE',      icon: 'close-circle-outline' },
  cloturee:         { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',     icon: 'archive-outline'      },
};

const FILTRES = [
  { key: null,               label: 'Toutes',       icon: 'list-outline'      },
  { key: 'en_attente',       label: 'En attente',   icon: 'time-outline'      },
  { key: 'en_cours',         label: 'En cours',     icon: 'sync-outline'      },
  { key: 'consigne_charge',  label: 'Att. Chargé',  icon: 'hourglass-outline' },
  { key: 'consigne_process', label: 'Att. Process', icon: 'hourglass-outline' },
];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

export default function MesDemandesProcess({ navigation, route }) {
  const filtreInitial = route.params?.filtreInitial ?? null;

  const [demandes,    setDemandes]    = useState([]);
  const [filtre,      setFiltre]      = useState(filtreInitial);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [recherche,   setRecherche]   = useState('');
  const [searchFocus, setSearchFocus] = useState(false);

  // ✅ Sync filtre si navigation revient avec un nouveau filtreInitial
  useEffect(() => {
    if (route.params?.filtreInitial !== undefined) {
      setFiltre(route.params.filtreInitial ?? null);
    }
  }, [route.params?.filtreInitial]);

  const charger = useCallback(async () => {
    try {
      const res = await getDemandesProcess();
      if (res?.success) setDemandes(res.data || []);
    } catch (e) {
      console.error('MesDemandesProcess error:', e?.message || e);
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger();
  }, [charger]);

  // ── Filtrage ──
  const demandesFiltrees = demandes.filter(d => {
    const matchFiltre = filtre === null ? true : d.statut === filtre;
    if (!matchFiltre) return false;
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return (
      (d.numero_ordre   || '').toLowerCase().includes(q) ||
      (d.tag            || '').toLowerCase().includes(q) ||
      (d.equipement_nom || '').toLowerCase().includes(q) ||
      (d.lot_code       || '').toLowerCase().includes(q) ||
      (d.demandeur_nom  || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    en_attente:       demandes.filter(d => d.statut === 'en_attente').length,
    en_cours:         demandes.filter(d => d.statut === 'en_cours').length,
    consigne_charge:  demandes.filter(d => d.statut === 'consigne_charge').length,
    consigne_process: demandes.filter(d => d.statut === 'consigne_process').length,
  };

  const filtreActifLabel = FILTRES.find(f => f.key === filtre)?.label || 'Toutes';

  const renderCard = ({ item }) => {
    const cfg = STATUT_CONFIG[item.statut] || STATUT_CONFIG.en_attente;
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailConsignationProcess', { demande: item })}
      >
        <View style={S.cardTop}>
          <View style={[S.cardIconWrap, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="cog-outline" size={20} color={CFG.couleur} />
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
            <Text style={S.cardDemandeur}>Par : {item.demandeur_nom || '—'}</Text>
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

        {/* ── Types intervenants ── */}
        {item.types_intervenants?.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5F5F5' }}>
            {item.types_intervenants.map((t, i) => (
              <View key={i} style={[
                S.typeChip,
                t === 'process' && { backgroundColor: CFG.bgPale, borderColor: CFG.couleur },
              ]}>
                <Text style={[
                  S.typeChipTxt,
                  t === 'process' && { color: CFG.couleur },
                ]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Indicateur de progression pour double validation ── */}
        {(item.statut === 'consigne_charge' || item.statut === 'consigne_process') && (
          <View style={S.doubleValBar}>
            <View style={[S.doubleValStep, {
              backgroundColor: item.statut === 'consigne_process' ? CFG.couleur : '#10B981',
            }]}>
              <Ionicons name="cog-outline" size={9} color="#fff" />
              <Text style={S.doubleValTxt}>Process</Text>
            </View>
            <View style={S.doubleValSep} />
            <View style={[S.doubleValStep, {
              backgroundColor: item.statut === 'consigne_charge' ? '#1565C0' : '#E0E0E0',
            }]}>
              <Ionicons name="flash-outline" size={9} color={item.statut === 'consigne_charge' ? '#fff' : '#9E9E9E'} />
              <Text style={[S.doubleValTxt, { color: item.statut === 'consigne_charge' ? '#fff' : '#9E9E9E' }]}>
                Chargé
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
          <Text style={S.hTitle}>Mes demandes</Text>
          <Text style={S.hSub}>
            {demandesFiltrees.length} demande{demandesFiltrees.length !== 1 ? 's' : ''} · {filtreActifLabel}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Barre stats ── */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { lbl: 'Total',      val: demandes.length,          color: '#fff'    },
          { lbl: 'En attente', val: stats.en_attente,         color: '#FDE68A' },
          { lbl: 'En cours',   val: stats.en_cours,           color: '#FED7AA' },
          { lbl: 'Att.Chargé', val: stats.consigne_charge,    color: '#BFDBFE' },
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
            {recherche ? 'Aucun résultat' : 'Aucune demande'}
          </Text>
          <Text style={S.emptySub}>
            {recherche
              ? `Aucune demande pour « ${recherche} »`
              : filtre
                ? 'Aucune demande avec ce statut'
                : 'Aucune demande en attente'}
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
  chipActive:  { backgroundColor: '#b45309', borderColor: '#b45309' },
  chipTxt:     { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },
  chipTxtActive: { color: '#fff' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 14, marginTop: 10, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#E0E0E0',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  searchBarFocus: { borderColor: '#b45309' },
  searchInput: {
    flex: 1, marginLeft: 8,
    fontSize: 13, color: '#212121', paddingVertical: 0,
  },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10,
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start' },
  cardIconWrap:{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardNumero:  { fontSize: 13, fontWeight: '800', color: '#212121' },
  cardTag:     { fontSize: 11, color: '#b45309', fontWeight: '600', marginLeft: 4 },
  cardLot:     { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  cardDemandeur:{ fontSize: 10, color: '#9E9E9E' },
  cardDate:    { fontSize: 10, color: '#BDBDBD' },

  statutBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  statutTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  typeChip:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#F5F5F5' },
  typeChipTxt: { fontSize: 10, fontWeight: '700', color: '#9E9E9E' },

  doubleValBar: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F5F5F5',
  },
  doubleValStep: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4,
    paddingVertical: 5, borderRadius: 8,
  },
  doubleValSep: { width: 8 },
  doubleValTxt: { fontSize: 10, fontWeight: '700', color: '#fff' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});