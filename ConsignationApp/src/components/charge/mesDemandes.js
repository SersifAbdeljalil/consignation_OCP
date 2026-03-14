// src/components/charge/mesDemandes.js
// ✅ Onglet "Consignation" : demandes actives (en_attente, en_cours, consigne_charge, consigne_process)
// ✅ Onglet "Déconsignation" : MES demandes en cours de déconsignation (statut deconsigne_charge)
//    = les demandes où le chargé A déjà scanné mais pas encore validé complètement
//    = vient de getDemandesADeconsigner filtré par statut deconsigne_charge
// ✅ Thème vert unifié #2d6a4f pour tout ce qui est déconsignation

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDemandesAConsigner, getDemandesADeconsigner } from '../../api/charge.api';
import { API_URL } from '../../api/client';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
  vert:        '#10B981',
};

const STATUT_CONFIG = {
  en_attente:       { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',   icon: 'time-outline'        },
  en_cours:         { color: '#2d6a4f', bg: '#d8f3dc', label: 'EN COURS',     icon: 'sync-outline'        },
  consigne_charge:  { color: '#1565C0', bg: '#E3F2FD', label: 'ATT. PROCESS', icon: 'time-outline'        },
  consigne_process: { color: '#6A1B9A', bg: '#F3E5F5', label: 'ATT. CHARGÉ',  icon: 'time-outline'        },
  consigne:         { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉ ✓',   icon: 'lock-closed-outline' },
  rejetee:          { color: '#EF4444', bg: '#FEE2E2', label: 'REFUSÉE',      icon: 'close-circle-outline'},
  cloturee:         { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',     icon: 'archive-outline'     },
  deconsigne_charge: { color: CFG.couleur, bg: CFG.bgPale, label: 'DÉCONS. EN COURS', icon: 'lock-open-outline' },
  consigne_gc:      { color: '#0F766E', bg: '#CCFBF1', label: 'CONSIGNÉ GC',  icon: 'lock-closed-outline' },
};

const FILTRES_CONSIGNATION = [
  { key: null,               label: 'Toutes',       icon: 'list-outline'      },
  { key: 'en_attente',       label: 'En attente',   icon: 'time-outline'      },
  { key: 'en_cours',         label: 'En cours',     icon: 'sync-outline'      },
  { key: 'consigne_charge',  label: 'Att. Process', icon: 'time-outline'      },
  { key: 'consigne_process', label: 'Att. Chargé',  icon: 'time-outline'      },
];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export default function MesDemandesCharge({ navigation, route }) {
  const filtreInitial = route.params?.filtreInitial ?? null;

  const [onglet,        setOnglet]        = useState('consignation');
  const [demandes,      setDemandes]      = useState([]);
  const [demandesDecon, setDemandesDecon] = useState([]);
  const [filtre,        setFiltre]        = useState(filtreInitial);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [recherche,     setRecherche]     = useState('');
  const [searchFocus,   setSearchFocus]   = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    if (route.params?.filtreInitial !== undefined) {
      setFiltre(route.params.filtreInitial ?? null);
    }
  }, [route.params?.filtreInitial]);

  const charger = useCallback(async () => {
    try {
      const [consRes, deconRes] = await Promise.all([
        getDemandesAConsigner(),
        getDemandesADeconsigner(),
      ]);
      if (isMountedRef.current) {
        if (consRes?.success)  setDemandes(consRes.data || []);
        if (deconRes?.success) setDemandesDecon(deconRes.data || []);
      }
    } catch (e) {
      console.error('MesDemandesCharge error:', e?.message || e);
    } finally {
      if (isMountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    charger();
    return () => { isMountedRef.current = false; };
  }, [charger]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const onRefresh = useCallback(() => { setRefreshing(true); charger(); }, [charger]);

  // ── Filtrage consignation ──
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

  // ── Déconsignation : MES demandes en cours (deconsigne_charge = chargé a commencé mais pas terminé) ──
  // On prend toutes les demandes à déconsigner (pas seulement deconsigne_charge)
  // car les demandes consigne/consigne_charge aussi doivent apparaître quand déconsignation demandée
  const deconFiltrees = demandesDecon.filter(d => {
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
    en_attente:    demandes.filter(d => d.statut === 'en_attente').length,
    en_cours:      demandes.filter(d => d.statut === 'en_cours').length,
    a_deconsigner: demandesDecon.length,
  };

  const filtreActifLabel = FILTRES_CONSIGNATION.find(f => f.key === filtre)?.label || 'Toutes';

  // ── Card consignation ──
  const renderCardConsignation = ({ item }) => {
    const cfg = STATUT_CONFIG[item.statut] || STATUT_CONFIG.en_attente;
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailConsignation', { demande: item })}
      >
        <View style={S.cardTop}>
          <View style={[S.cardIconWrap, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="lock-closed-outline" size={20} color={CFG.couleur} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.cardNumero}>{item.numero_ordre}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
              <Text style={S.cardTag}>
                {item.tag || ''}{item.equipement_nom ? ` — ${item.equipement_nom}` : ''}
              </Text>
            </View>
            {item.lot_code && <Text style={S.cardLot}>LOT : {item.lot_code}</Text>}
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

  // ── Card déconsignation ── → DetailDeconsignation
  const renderCardDeconsignation = ({ item }) => {
    // Si déconsignée : afficher PDF, pas le bouton "Procéder"
    const estDeconsignee = item.statut === 'deconsignee' || item.statut === 'cloturee';
    const pdfPath = item.pdf_path_final || item.pdf_path;

    // Badge statut
    const statutLabel = estDeconsignee ? 'DÉCONSIGNÉE ✓' : 'À DÉCONSIGNER';
    const statutIcon  = estDeconsignee ? 'checkmark-circle-outline' : 'lock-open-outline';
    const statutBg    = estDeconsignee ? CFG.bgPale : CFG.bgPale;
    const statutColor = estDeconsignee ? CFG.vert : CFG.couleur;

    return (
      <TouchableOpacity
        style={[S.card, { borderLeftWidth: 3, borderLeftColor: estDeconsignee ? CFG.vert : CFG.couleur }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailDeconsignation', { demande: item })}
      >
        <View style={S.cardTop}>
          <View style={[S.cardIconWrap, { backgroundColor: CFG.bgPale }]}>
            <Ionicons
              name={estDeconsignee ? 'lock-open' : 'lock-open-outline'}
              size={20}
              color={estDeconsignee ? CFG.vert : CFG.couleur}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.cardNumero}>{item.numero_ordre}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
              <Text style={S.cardTag}>
                {item.tag || ''}{item.equipement_nom ? ` — ${item.equipement_nom}` : ''}
              </Text>
            </View>
            {item.lot_code && <Text style={S.cardLot}>LOT : {item.lot_code}</Text>}
            <Text style={S.cardDemandeur}>Par : {item.demandeur_nom || '—'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
              <Ionicons name="time-outline" size={11} color="#BDBDBD" />
              <Text style={S.cardDate}> Mis à jour : {fmtDate(item.updated_at)}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <View style={[S.statutBadge, { backgroundColor: statutBg }]}>
              <Ionicons name={statutIcon} size={10} color={statutColor} />
              <Text style={[S.statutTxt, { color: statutColor }]}> {statutLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
          </View>
        </View>

        {item.types_intervenants?.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5F5F5' }}>
            {item.types_intervenants.map((t, i) => (
              <View key={i} style={[S.typeChip, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
                <Text style={[S.typeChipTxt, { color: CFG.couleur }]}>
                  {t === 'genie_civil' ? 'GC' : t === 'mecanique' ? 'Méca' : t === 'electrique' ? 'Élec' : 'Process'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Si déconsignée → bouton PDF via endpoint /pdf. Sinon → bouton Procéder */}
        {estDeconsignee ? (
          <TouchableOpacity
            style={[S.actionBtn, { backgroundColor: CFG.bgPale, borderWidth: 1, borderColor: CFG.couleur }]}
            onPress={() => navigation.navigate('PdfViewer', {
              url:   API_URL + '/charge/demandes/' + item.id + '/pdf',
              titre: item.numero_ordre,
              role:  'charge',
            })}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={14} color={CFG.couleur} />
            <Text style={[S.actionBtnTxt, { color: CFG.couleur }]}>Voir le PDF consignation/déconsignation</Text>
            <Ionicons name="open-outline" size={12} color={CFG.couleur} />
          </TouchableOpacity>
        ) : (
          // Pas encore déconsignée → bouton Procéder
          <TouchableOpacity
            style={[S.actionBtn, { backgroundColor: CFG.couleur }]}
            onPress={() => navigation.navigate('DetailDeconsignation', { demande: item })}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code-outline" size={14} color="#fff" />
            <Text style={S.actionBtnTxt}>Procéder à la déconsignation</Text>
            <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
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

  const donneesActuelles  = onglet === 'consignation' ? demandesFiltrees : deconFiltrees;
  const renderItemActuel  = onglet === 'consignation' ? renderCardConsignation : renderCardDeconsignation;
  const labelCompteActuel = onglet === 'consignation'
    ? `${demandesFiltrees.length} demande${demandesFiltrees.length !== 1 ? 's' : ''} · ${filtreActifLabel}`
    : `${deconFiltrees.length} à déconsigner`;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Mes demandes</Text>
          <Text style={S.hSub}>{labelCompteActuel}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Barre stats */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { lbl: 'Total',       val: demandes.length,      color: '#fff'    },
          { lbl: 'En attente',  val: stats.en_attente,     color: '#FDE68A' },
          { lbl: 'En cours',    val: stats.en_cours,       color: '#6EE7B7' },
          { lbl: 'Déconsigner', val: stats.a_deconsigner,  color: '#DDD6FE', onPress: () => setOnglet('deconsignation') },
        ].map((s, i) => (
          <TouchableOpacity key={i} style={S.statItem} onPress={s.onPress}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Onglets */}
      <View style={S.ongletRow}>
        <TouchableOpacity
          style={[S.onglet, onglet === 'consignation' && S.ongletActive]}
          onPress={() => setOnglet('consignation')}
        >
          <Ionicons name="lock-closed-outline" size={14} color={onglet === 'consignation' ? CFG.couleur : '#9E9E9E'} />
          <Text style={[S.ongletTxt, onglet === 'consignation' && S.ongletTxtActive]}>
            Consignation ({demandes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.onglet, onglet === 'deconsignation' && [S.ongletActive, { borderBottomColor: CFG.couleur }]]}
          onPress={() => setOnglet('deconsignation')}
        >
          <Ionicons name="lock-open-outline" size={14} color={onglet === 'deconsignation' ? CFG.couleur : '#9E9E9E'} />
          <Text style={[S.ongletTxt, onglet === 'deconsignation' && [S.ongletTxtActive, { color: CFG.couleur }]]}>
            Déconsignation ({demandesDecon.length})
          </Text>
          {demandesDecon.length > 0 && (
            <View style={[S.ongletBadge, { backgroundColor: CFG.couleur }]}>
              <Text style={S.ongletBadgeTxt}>{demandesDecon.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filtres consignation seulement */}
      {onglet === 'consignation' && (
        <View style={S.filtresWrap}>
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 8, flexDirection: 'row', paddingVertical: 10 }}
          >
            {FILTRES_CONSIGNATION.map(f => (
              <TouchableOpacity
                key={f.key ?? 'all'}
                style={[S.chip, filtre === f.key && S.chipActive]}
                onPress={() => setFiltre(f.key)}
              >
                <Ionicons name={f.icon} size={12} color={filtre === f.key ? '#fff' : '#9E9E9E'} style={{ marginRight: 4 }} />
                <Text style={[S.chipTxt, filtre === f.key && S.chipTxtActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bannière déconsignation */}
      {onglet === 'deconsignation' && demandesDecon.length > 0 && (
        <View style={[S.infoBanner, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
          <Ionicons name="information-circle-outline" size={14} color={CFG.couleur} />
          <Text style={[S.infoBannerTxt, { color: CFG.couleurDark }]}>
            Scannez chaque cadenas électrique, puis validez avec votre badge.
          </Text>
        </View>
      )}

      {/* Barre de recherche */}
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

      {/* Liste */}
      {donneesActuelles.length === 0 ? (
        <View style={S.emptyWrap}>
          <Ionicons
            name={onglet === 'deconsignation' ? 'lock-open-outline' : 'document-text-outline'}
            size={56}
            color={onglet === 'deconsignation' ? '#DDD6FE' : CFG.bg}
          />
          <Text style={S.emptyTitle}>
            {recherche ? 'Aucun résultat' : onglet === 'deconsignation' ? 'Aucune déconsignation' : 'Aucune demande'}
          </Text>
          <Text style={S.emptySub}>
            {recherche
              ? `Aucune demande pour « ${recherche} »`
              : onglet === 'deconsignation'
                ? 'Les demandes de déconsignation apparaîtront ici'
                : filtre ? 'Aucune demande avec ce statut' : 'Aucune demande en attente'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={donneesActuelles}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItemActuel}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />}
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

  ongletRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  onglet: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  ongletActive:    { borderBottomColor: '#2d6a4f' },
  ongletTxt:       { fontSize: 13, fontWeight: '600', color: '#9E9E9E' },
  ongletTxtActive: { color: '#2d6a4f', fontWeight: '700' },
  ongletBadge:     { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  ongletBadgeTxt:  { color: '#fff', fontSize: 9, fontWeight: '900' },

  filtresWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#fff' },
  chipActive:  { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  chipTxt:     { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },
  chipTxtActive: { color: '#fff' },

  infoBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 8, borderRadius: 10, padding: 10, borderWidth: 1 },
  infoBannerTxt: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    marginHorizontal: 14, marginTop: 10, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#E0E0E0',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  searchBarFocus: { borderColor: '#2d6a4f' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#212121', paddingVertical: 0 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start' },
  cardIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardNumero:   { fontSize: 13, fontWeight: '800', color: '#212121' },
  cardTag:      { fontSize: 11, color: '#2d6a4f', fontWeight: '600', marginLeft: 4 },
  cardLot:      { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  cardDemandeur:{ fontSize: 10, color: '#9E9E9E' },
  cardDate:     { fontSize: 10, color: '#BDBDBD' },

  statutBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statutTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  typeChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 9, fontWeight: '700' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 10, paddingVertical: 9, marginTop: 10,
  },
  actionBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'center' },

  doubleValBar: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  doubleValStep: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 5, borderRadius: 8 },
  doubleValSep:  { width: 8 },
  doubleValTxt:  { fontSize: 10, fontWeight: '700', color: '#fff' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});