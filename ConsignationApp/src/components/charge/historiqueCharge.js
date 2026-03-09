// src/components/charge/historiqueCharge.js
// ✅ Uniquement l'historique : consigne, consigne_charge, cloturee, rejetee
// ✅ Demandes actives (en_attente, en_cours) gérées dans mesDemandes.js
// ✅ Navigation vers DetailConsignation au clic

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHistorique } from '../../api/charge.api';
import { API_URL } from '../../api/client';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const STATUT_CONFIG = {
  consigne: {
    color: '#10B981', bg: '#D1FAE5',
    label: 'CONSIGNÉ', icon: 'lock-closed-outline',
  },
  consigne_charge: {
    color: '#1d4ed8', bg: '#dbeafe',
    label: 'ATT. PROCESS', icon: 'time-outline',
  },
  consigne_process: {
    color: '#b45309', bg: '#fde68a',
    label: 'ATT. CHARGÉ', icon: 'time-outline',
  },
  deconsignee: {
    color: '#6366F1', bg: '#EEF2FF',
    label: 'DÉCONSIGNÉE', icon: 'lock-open-outline',
  },
  cloturee: {
    color: '#6B7280', bg: '#F3F4F6',
    label: 'CLÔTURÉE', icon: 'archive-outline',
  },
  rejetee: {
    color: '#EF4444', bg: '#FEE2E2',
    label: 'REFUSÉE', icon: 'close-circle-outline',
  },
};

const FILTRES = [
  { key: null,               label: 'Tout',         icon: 'list-outline'         },
  { key: 'consigne',         label: 'Consignés',    icon: 'lock-closed-outline'  },
  { key: 'consigne_charge',  label: 'Att. Process', icon: 'time-outline'         },
  { key: 'deconsignee',      label: 'Déconsignées', icon: 'lock-open-outline'    },
  { key: 'cloturee',         label: 'Clôturées',    icon: 'archive-outline'      },
  { key: 'rejetee',          label: 'Refusées',     icon: 'close-circle-outline' },
];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export default function HistoriqueCharge({ navigation }) {
  const [historique, setHistorique] = useState([]);
  const [filtre,     setFiltre]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await getHistorique();
      if (res?.success) setHistorique(res.data || []);
    } catch (e) {
      console.error('HistoriqueCharge error:', e?.message || e);
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

  const ouvrirPDF = (item) => {
    navigation.navigate('PdfViewer', {
      url:   `${API_URL}/charge/demandes/${item.id}/pdf`,
      titre: item.numero_ordre,
      role:  'charge',
    });
  };

  const donneesFiltrees = filtre
    ? historique.filter(d => d.statut === filtre)
    : historique;

  const stats = {
    total:       historique.length,
    consigne:    historique.filter(d => ['consigne', 'consigne_charge'].includes(d.statut)).length,
    cloturee:    historique.filter(d => d.statut === 'cloturee').length,
    rejetee:     historique.filter(d => d.statut === 'rejetee').length,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  const renderCard = ({ item }) => {
    const cfg = STATUT_CONFIG[item.statut] || STATUT_CONFIG.cloturee;
    const hasPdf = item.statut === 'consigne' || item.statut === 'cloturee';

    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailConsignation', { demande: item })}
      >
        {/* Ligne supérieure */}
        <View style={S.cardTop}>
          <View style={S.cardLeft}>
            <View style={[S.cardIconWrap, { backgroundColor: CFG.bgPale }]}>
              <Ionicons name="lock-closed-outline" size={18} color={CFG.couleur} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.cardNumero}>{item.numero_ordre}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
                <Text style={S.cardTag}>
                  {item.tag || ''}{item.equipement_nom ? ` — ${item.equipement_nom}` : ''}
                </Text>
              </View>
            </View>
          </View>
          <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={10} color={cfg.color} style={{ marginRight: 3 }} />
            <Text style={[S.statutTxt, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Infos */}
        <View style={S.infoRow}>
          <Ionicons name="layers-outline" size={12} color="#9E9E9E" />
          <Text style={S.infoTxt}>LOT : {item.lot_code || item.lot || '—'}</Text>
          <View style={S.separator} />
          <Ionicons name="person-outline" size={12} color="#9E9E9E" />
          <Text style={S.infoTxt} numberOfLines={1}>{item.demandeur_nom || '—'}</Text>
        </View>

        <View style={S.infoRow}>
          <Ionicons name="calendar-outline" size={12} color="#9E9E9E" />
          <Text style={S.infoTxt}>{fmtDate(item.created_at)}</Text>
          {item.date_validation && (
            <>
              <View style={S.separator} />
              <Ionicons name="checkmark-circle-outline" size={12} color={CFG.couleur} />
              <Text style={[S.infoTxt, { color: CFG.couleur }]}>
                Validé {fmtDate(item.date_validation)}
              </Text>
            </>
          )}
        </View>

        {/* Badge att. process */}
        {item.statut === 'consigne_charge' && (
          <View style={S.attenteBadge}>
            <Ionicons name="time-outline" size={12} color="#1d4ed8" />
            <Text style={S.attenteBadgeTxt}>
              Vos points validés ✅ — En attente du chef process pour le PDF complet
            </Text>
          </View>
        )}

        {/* Bouton PDF */}
        {hasPdf && (
          <TouchableOpacity
            style={S.pdfBtn}
            onPress={(e) => { e.stopPropagation(); ouvrirPDF(item); }}
            activeOpacity={0.8}
          >
            <Ionicons name="document-text-outline" size={16} color={CFG.couleur} />
            <Text style={S.pdfBtnTxt}>Voir PDF consignation complet</Text>
            <Ionicons name="open-outline" size={14} color={CFG.couleur} />
          </TouchableOpacity>
        )}

        {/* Motif rejet */}
        {item.statut === 'rejetee' && item.commentaire_rejet && (
          <View style={S.rejetBadge}>
            <Ionicons name="alert-circle-outline" size={12} color="#EF4444" />
            <Text style={S.rejetTxt} numberOfLines={2}>{item.commentaire_rejet}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Historique</Text>
          <Text style={S.hSub}>
            {historique.length} consignation{historique.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Barre stats */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { lbl: 'Total',    val: stats.total,    color: '#fff'    },
          { lbl: 'Consigné', val: stats.consigne, color: '#6EE7B7' },
          { lbl: 'Clôturé',  val: stats.cloturee, color: '#D1D5DB' },
          { lbl: 'Refusé',   val: stats.rejetee,  color: '#FCA5A5' },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Filtres */}
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

      {/* Liste */}
      {donneesFiltrees.length === 0 ? (
        <View style={S.emptyWrap}>
          <Ionicons name="time-outline" size={56} color={CFG.bg} />
          <Text style={S.emptyTitle}>Aucune consignation</Text>
          <Text style={S.emptySub}>
            {filtre
              ? 'Aucune consignation avec ce statut'
              : 'Votre historique apparaîtra ici une fois les demandes traitées'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={donneesFiltrees}
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
  statVal:  { fontSize: 20, fontWeight: '900' },
  statLbl:  { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2, textAlign: 'center' },

  filtresWrap:   { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  chip:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#fff' },
  chipActive:    { backgroundColor: '#2d6a4f', borderColor: '#2d6a4f' },
  chipTxt:       { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },
  chipTxtActive: { color: '#fff' },

  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  cardLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10, marginRight: 8 },
  cardIconWrap:{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardNumero:  { fontSize: 13, fontWeight: '800', color: '#212121' },
  cardTag:     { fontSize: 11, color: '#2d6a4f', fontWeight: '600', marginLeft: 4 },

  statutBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  statutTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  infoTxt:   { fontSize: 11, color: '#9E9E9E' },
  separator: { width: 1, height: 10, backgroundColor: '#E0E0E0', marginHorizontal: 6 },

  attenteBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dbeafe', borderRadius: 8, padding: 7, marginBottom: 6 },
  attenteBadgeTxt: { fontSize: 11, color: '#1d4ed8', fontWeight: '600', flex: 1 },

  rejetBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FEE2E2', borderRadius: 8, padding: 7, marginTop: 6 },
  rejetTxt:   { fontSize: 11, color: '#EF4444', flex: 1 },

  pdfBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: '#d8f3dc', borderWidth: 1, borderColor: '#2d6a4f' },
  pdfBtnTxt: { fontSize: 13, fontWeight: '700', color: '#2d6a4f', flex: 1, textAlign: 'center' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});