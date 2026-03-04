// src/components/chefIntervenant/chefIntervenant.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { getMesDemandes } from '../../api/intervenant.api';

// ── Couleurs par type métier ─────────────────
const TYPE_CFG = {
  genie_civil: { couleur: '#E65100', bg: '#FFF3E0', label: 'Génie Civil',         icon: 'business'         },
  mecanique:   { couleur: '#1565C0', bg: '#E3F2FD', label: 'Travaux Mécaniques',  icon: 'build'            },
  electrique:  { couleur: '#F9A825', bg: '#FFFDE7', label: 'Travaux Électriques', icon: 'flash'            },
  process:     { couleur: '#2E7D32', bg: '#E8F5E9', label: 'Process',              icon: 'settings'         },
};

const STATUT_CFG = {
  en_attente:  { color: '#F59E0B', bg: '#FFFBEB', label: 'EN ATTENTE',  icon: 'time-outline'              },
  validee:     { color: '#10B981', bg: '#ECFDF5', label: 'VALIDÉE',     icon: 'checkmark-circle-outline'  },
  rejetee:     { color: '#EF4444', bg: '#FEF2F2', label: 'REJETÉE',     icon: 'close-circle-outline'      },
  en_cours:    { color: '#3B82F6', bg: '#EFF6FF', label: 'EN COURS',    icon: 'sync-outline'              },
  deconsignee: { color: '#8B5CF6', bg: '#F5F3FF', label: 'DÉCONSIGNÉE', icon: 'unlock-outline'            },
  cloturee:    { color: '#6B7280', bg: '#F9FAFB', label: 'CLÔTURÉE',    icon: 'archive-outline'           },
};

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

export default function ChefIntervenant({ navigation }) {
  const user                        = useSelector(s => s.auth.user);
  const [demandes, setDemandes]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cfg = TYPE_CFG[user?.type_metier] || TYPE_CFG.mecanique;

  // Stats rapides
  const stats = {
    total:      demandes.length,
    en_attente: demandes.filter(d => d.statut === 'en_attente').length,
    en_cours:   demandes.filter(d => d.statut === 'en_cours').length,
    cloturees:  demandes.filter(d => d.statut === 'cloturee').length,
  };

  const charger = async () => {
    try {
      const res = await getMesDemandes();
      if (res.success) setDemandes(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { charger(); }, []);
  const onRefresh = useCallback(() => { setRefreshing(true); charger(); }, []);

  const renderCard = ({ item }) => {
    const st = STATUT_CFG[item.statut] || STATUT_CFG.en_attente;
    return (
      <TouchableOpacity
        style={[S.card, { borderLeftColor: cfg.couleur }]}
        onPress={() => navigation.navigate('ScanBadge', { demande: item })}
        activeOpacity={0.85}
      >
        {/* En-tête */}
        <View style={S.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={S.cardNum}>{item.numero_ordre}</Text>
            <View style={S.tagRow}>
              <Ionicons name="hardware-chip-outline" size={12} color={cfg.couleur} />
              <Text style={[S.tagText, { color: cfg.couleur }]}>{item.tag}</Text>
              <Text style={S.sepText}>·</Text>
              <Text style={S.lotText}>LOT {item.lot_code}</Text>
            </View>
          </View>
          <View style={[S.badge, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={11} color={st.color} />
            <Text style={[S.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        {/* Équipement */}
        <Text style={S.equipNom} numberOfLines={1}>{item.equipement_nom}</Text>
        <Text style={S.equipLoc} numberOfLines={1}>{item.equipement_localisation}</Text>

        {/* Pied de carte */}
        <View style={S.cardFoot}>
          <Ionicons name="person-outline" size={12} color="#9E9E9E" />
          <Text style={S.footText}>{item.demandeur_nom}</Text>
          <Text style={S.dotText}>·</Text>
          <Ionicons name="calendar-outline" size={12} color="#9E9E9E" />
          <Text style={S.footText}>{formatDate(item.created_at)}</Text>
        </View>

        {/* Flèche */}
        <View style={S.arrow}>
          <Ionicons name="chevron-forward" size={16} color={cfg.couleur} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={cfg.couleur} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: cfg.couleur }]}>
        <View style={{ flex: 1 }}>
          <Text style={S.headerSub}>Chef d'Équipe</Text>
          <Text style={S.headerTitle}>{cfg.label}</Text>
          <Text style={S.headerUser}>
            {user?.prenom} {user?.nom} · {user?.matricule}
          </Text>
        </View>
        <View style={S.headerRight}>
          <TouchableOpacity
            style={S.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.iconBtn, { marginLeft: 8 }]}
            onPress={() => navigation.navigate('Profil')}
          >
            <Ionicons name="person-circle-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Stats ── */}
      <View style={[S.statsBar, { backgroundColor: cfg.couleur }]}>
        {[
          { val: stats.total,      label: 'Total',       icon: 'layers-outline'           },
          { val: stats.en_attente, label: 'En attente',  icon: 'time-outline'             },
          { val: stats.en_cours,   label: 'En cours',    icon: 'sync-outline'             },
          { val: stats.cloturees,  label: 'Clôturées',   icon: 'checkmark-done-outline'   },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Ionicons name={s.icon} size={14} color="rgba(255,255,255,0.8)" />
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Mon équipe (raccourci) ── */}
      {/* ✅ MODIFIÉ : navigue vers 'MonEquipe' (vue globale intervenants) */}
      <TouchableOpacity
        style={[S.equipeBtn, { borderColor: cfg.couleur }]}
        onPress={() => navigation.navigate('MonEquipe')}
      >
        <View style={[S.equipeBtnIcon, { backgroundColor: cfg.bg }]}>
          <Ionicons name="people" size={20} color={cfg.couleur} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[S.equipeBtnTitle, { color: cfg.couleur }]}>Mon Équipe</Text>
          <Text style={S.equipeBtnSub}>Gérer entrées / sorties intervenants</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={cfg.couleur} />
      </TouchableOpacity>

      {/* ── Séparateur ── */}
      <View style={S.sectionHeader}>
        <Text style={S.sectionTitle}>Consignations me concernant</Text>
        <Text style={S.sectionCount}>{demandes.length}</Text>
      </View>

      {/* ── Liste demandes ── */}
      {loading
        ? <ActivityIndicator color={cfg.couleur} size="large" style={{ marginTop: 40 }} />
        : <FlatList
            data={demandes}
            keyExtractor={item => item.id.toString()}
            renderItem={renderCard}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[cfg.couleur]} />
            }
            ListEmptyComponent={
              <View style={S.empty}>
                <Ionicons name="calendar-outline" size={55} color="#BDBDBD" />
                <Text style={S.emptyTitle}>Aucune consignation</Text>
                <Text style={S.emptySub}>
                  Vous serez notifié quand une consignation concerne votre corps de métier
                </Text>
              </View>
            }
          />
      }
    </View>
  );
}

const S = StyleSheet.create({
  // Header
  header:      { paddingTop: 52, paddingBottom: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-start' },
  headerSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  headerUser:  { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  headerRight: { flexDirection: 'row', marginTop: 4 },
  iconBtn:     { width: 38, height: 38, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Stats
  statsBar:  { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 18 },
  statItem:  { flex: 1, alignItems: 'center', gap: 2 },
  statVal:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLbl:   { color: 'rgba(255,255,255,0.75)', fontSize: 9, textAlign: 'center' },

  // Bouton équipe
  equipeBtn:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 14, marginBottom: 4, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1.5, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  equipeBtnIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  equipeBtnTitle:{ fontSize: 15, fontWeight: '700' },
  equipeBtnSub:  { fontSize: 12, color: '#9E9E9E', marginTop: 2 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: '#424242' },
  sectionCount:  { fontSize: 12, fontWeight: '700', color: '#9E9E9E', backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  // Card
  card:     { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 4, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, position: 'relative' },
  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardNum:  { fontSize: 13, fontWeight: '800', color: '#424242' },
  tagRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 },
  tagText:  { fontSize: 11, fontWeight: '700' },
  sepText:  { fontSize: 10, color: '#BDBDBD' },
  lotText:  { fontSize: 11, color: '#9E9E9E' },
  badge:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  badgeText:{ fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  equipNom: { fontSize: 14, fontWeight: '600', color: '#212121', marginBottom: 2 },
  equipLoc: { fontSize: 12, color: '#9E9E9E', marginBottom: 8 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footText: { fontSize: 11, color: '#9E9E9E' },
  dotText:  { color: '#BDBDBD', marginHorizontal: 2 },
  arrow:    { position: 'absolute', right: 12, top: '50%' },

  // Empty
  empty:      { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});