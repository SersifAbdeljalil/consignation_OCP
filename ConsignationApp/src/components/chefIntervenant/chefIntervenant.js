// src/components/chefIntervenant/chefIntervenant.js
// ✅ REFONTE DÉCONSIGNATION PAR MÉTIER INDÉPENDANT
// FIX : import getMesDemandes depuis intervenant.api (pas consignation.api)
// FIX : navigation vers DetailConsignation
// ✅ FIX STATUTS : deconsigne_gc | deconsigne_mec | deconsigne_elec ajoutés

'use strict';

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMe } from '../../api/auth.api';
import { getMesDemandes } from '../../api/intervenant.api';

const CFG = { couleur: '#1565C0', bg: '#E3F2FD' };

// ✅ FIX : 3 nouveaux statuts par métier ajoutés
const STATUT_CFG = {
  en_attente:           { color: '#F59E0B', label: 'En attente'        },
  validee:              { color: '#10B981', label: 'Validée'           },
  rejetee:              { color: '#EF4444', label: 'Rejetée'           },
  en_cours:             { color: '#3B82F6', label: 'En cours'          },
  consigne:             { color: '#2E7D32', label: 'Consignée'         },
  consigne_charge:      { color: '#1565C0', label: 'Consignée Chargé'  },
  consigne_process:     { color: '#6A1B9A', label: 'Consignée Process' },
  // ✅ NOUVEAUX — déconsignation par métier indépendant
  deconsigne_gc:        { color: '#92400E', label: 'Déconsig. GC'      },
  deconsigne_mec:       { color: '#1e40af', label: 'Déconsig. Méca'    },
  deconsigne_elec:      { color: '#6d28d9', label: 'Déconsig. Élec'    },
  // Pipeline chargé / process
  deconsigne_charge:    { color: '#0277BD', label: 'Déconsig. Chargé'  },
  deconsigne_process:   { color: '#558B2F', label: 'Déconsig. Process' },
  // Ancien statut (rétrocompat)
  deconsigne_intervent: { color: '#6A1B9A', label: 'Déconsig. Interv.' },
  deconsignee:          { color: '#8B5CF6', label: 'Déconsignée'       },
  cloturee:             { color: '#6B7280', label: 'Clôturée'          },
};

// ✅ Tous les statuts considérés comme "consignés actifs"
const STATUTS_CONSIGNE = ['consigne', 'consigne_charge', 'consigne_process'];

// ✅ Tous les statuts considérés comme "déconsignés / clôturés"
const STATUTS_DECONSIGNE = [
  'deconsigne_gc',
  'deconsigne_mec',
  'deconsigne_elec',
  'deconsigne_charge',
  'deconsigne_process',
  'deconsigne_intervent',
  'deconsignee',
];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
};

export default function ChefIntervenant({ navigation }) {
  const [user, setUser]             = useState(null);
  const [demandes, setDemandes]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const charger = useCallback(async (refresh = false) => {
    try {
      if (!refresh) setLoading(true);
      const [meRes, demandesRes] = await Promise.all([
        getMe(),
        getMesDemandes(),
      ]);
      if (meRes?.success)       setUser(meRes.data);
      if (demandesRes?.success) setDemandes(demandesRes.data || []);
    } catch (e) {
      console.error('ChefIntervenant charger error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => charger());
    return unsub;
  }, [navigation, charger]);

  const onRefresh = () => { setRefreshing(true); charger(true); };

  // ✅ FIX stats : enCours inclut consigne_charge/process, cloturees inclut tous les déconsignés
  const stats = {
    total:     demandes.length,
    attente:   demandes.filter(d => d.statut === 'en_attente').length,
    enCours:   demandes.filter(d => STATUTS_CONSIGNE.includes(d.statut)).length,
    cloturees: demandes.filter(d => STATUTS_DECONSIGNE.includes(d.statut) || d.statut === 'cloturee').length,
  };

  const renderDemande = ({ item }) => {
    const sc = STATUT_CFG[item.statut] || { color: '#9E9E9E', label: item.statut || '—' };
    const isConsigne    = STATUTS_CONSIGNE.includes(item.statut);
    const isDeconsigne  = STATUTS_DECONSIGNE.includes(item.statut);

    return (
      <TouchableOpacity
        style={S.demandeCard}
        onPress={() => navigation.navigate('DetailConsignation', { demande: item })}
        activeOpacity={0.85}
      >
        {/* En-tête carte */}
        <View style={S.cardHeader}>
          <View style={[S.statutDot, { backgroundColor: sc.color }]} />
          <Text style={[S.statutLbl, { color: sc.color }]}>{sc.label}</Text>
          <Text style={S.dateTxt}>{fmtDate(item.created_at)}</Text>
        </View>

        {/* Contenu */}
        <View style={S.cardBody}>
          <View style={S.tagRow}>
            <Ionicons name="hardware-chip-outline" size={13} color={CFG.couleur} />
            <Text style={S.tagTxt}>{item.tag || item.code_equipement || '—'}</Text>
          </View>
          {item.equipement_nom && (
            <Text style={S.equipNom} numberOfLines={1}>{item.equipement_nom}</Text>
          )}
          <Text style={S.ordreNum}>{item.numero_ordre || '—'}</Text>
        </View>

        {/* Pied carte */}
        <View style={S.cardFooter}>
          {isConsigne && (
            <View style={[S.actionChip, { backgroundColor: CFG.bg }]}>
              <Ionicons name="people-outline" size={12} color={CFG.couleur} />
              <Text style={[S.actionChipTxt, { color: CFG.couleur }]}>Gérer l'équipe</Text>
            </View>
          )}
          {/* ✅ FIX : afficher "Rapport disponible" pour tous les statuts déconsignés */}
          {isDeconsigne && (
            <View style={[S.actionChip, { backgroundColor: '#F3E5F5' }]}>
              <Ionicons name="document-text-outline" size={12} color={sc.color} />
              <Text style={[S.actionChipTxt, { color: sc.color }]}>Rapport disponible</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-forward" size={16} color="#BDBDBD" />
        </View>
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
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleur} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <View style={{ flex: 1 }}>
          <Text style={S.hGreeting}>Bonjour,</Text>
          <Text style={S.hName}>{user ? `${user.prenom} ${user.nom}` : '—'}</Text>
        </View>
        <TouchableOpacity
          style={S.notifBtn}
          onPress={() => navigation.navigate('NotificationsChef')}
        >
          <Ionicons name="notifications-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Stats ── */}
      <View style={S.statsRow}>
        {[
          { val: stats.total,     label: 'Total',      color: CFG.couleur, bg: CFG.bg    },
          { val: stats.attente,   label: 'En attente', color: '#F59E0B',   bg: '#FFFBEB' },
          { val: stats.enCours,   label: 'Consignées', color: '#2E7D32',   bg: '#E8F5E9' },
          { val: stats.cloturees, label: 'Terminées',  color: '#6B7280',   bg: '#F5F5F5' },
        ].map((s, i) => (
          <View key={i} style={[S.statBox, { backgroundColor: s.bg }]}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Actions rapides ── */}
      <View style={S.actionsRow}>
        {[
          { icon: 'people-outline',        label: 'Mon Équipe', screen: 'MonEquipe'         },
          { icon: 'notifications-outline', label: 'Alertes',    screen: 'NotificationsChef' },
          { icon: 'person-outline',        label: 'Profil',     screen: 'Profil'            },
        ].map((a, i) => (
          <TouchableOpacity
            key={i}
            style={S.actionBtn}
            onPress={() => navigation.navigate(a.screen)}
            activeOpacity={0.8}
          >
            <View style={[S.actionIcon, { backgroundColor: CFG.bg }]}>
              <Ionicons name={a.icon} size={20} color={CFG.couleur} />
            </View>
            <Text style={S.actionLbl}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Liste consignations ── */}
      <View style={S.listHeader}>
        <Text style={S.listTitle}>Mes consignations</Text>
        <Text style={S.listCount}>{demandes.length}</Text>
      </View>

      <FlatList
        data={demandes}
        keyExtractor={item => item.id.toString()}
        renderItem={renderDemande}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[CFG.couleur]}
            tintColor={CFG.couleur}
          />
        }
        ListEmptyComponent={
          <View style={S.emptyBox}>
            <Ionicons name="document-outline" size={48} color="#BDBDBD" />
            <Text style={S.emptyTxt}>Aucune consignation assignée</Text>
          </View>
        }
      />
    </View>
  );
}

const S = StyleSheet.create({
  header:    { paddingTop: 50, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  hGreeting: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  hName:     { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 2 },
  notifBtn:  { width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  statsRow: { flexDirection: 'row', marginHorizontal: 14, marginTop: 14, gap: 8 },
  statBox:  { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center' },
  statVal:  { fontSize: 20, fontWeight: '800' },
  statLbl:  { fontSize: 9, fontWeight: '600', marginTop: 2, textAlign: 'center' },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 14, marginTop: 14, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  actionBtn:  { alignItems: 'center', gap: 6 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLbl:  { fontSize: 10, fontWeight: '600', color: '#424242' },

  listHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  listTitle:  { fontSize: 15, fontWeight: '700', color: '#212121', flex: 1 },
  listCount:  { fontSize: 12, fontWeight: '700', color: CFG?.couleur || '#1565C0', backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },

  demandeCard:   { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, overflow: 'hidden' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  statutDot:     { width: 8, height: 8, borderRadius: 4 },
  statutLbl:     { fontSize: 12, fontWeight: '700', flex: 1 },
  dateTxt:       { fontSize: 11, color: '#9E9E9E' },
  cardBody:      { paddingHorizontal: 14, paddingVertical: 10 },
  tagRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  tagTxt:        { fontSize: 14, fontWeight: '800', color: '#212121' },
  equipNom:      { fontSize: 12, color: '#616161', marginBottom: 2 },
  ordreNum:      { fontSize: 11, color: '#9E9E9E' },
  cardFooter:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, paddingTop: 6 },
  actionChip:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  actionChipTxt: { fontSize: 11, fontWeight: '700' },

  emptyBox: { alignItems: 'center', paddingTop: 60, paddingBottom: 30 },
  emptyTxt: { fontSize: 14, color: '#9E9E9E', marginTop: 12 },
});