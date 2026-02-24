// src/components/agent/mesDemandes.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  ScrollView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE } from '../../styles/variables.css';
import { getMesDemandes } from '../../api/demande.api';

const FILTRES = [
  { key: null,          label: 'Toutes',      icon: 'list-outline' },
  { key: 'en_attente',  label: 'En attente',  icon: 'time-outline' },
  { key: 'validee',     label: 'Validées',    icon: 'checkmark-circle-outline' },
  { key: 'en_cours',    label: 'En cours',    icon: 'sync-outline' },
  { key: 'rejetee',     label: 'Rejetées',    icon: 'close-circle-outline' },
  { key: 'cloturee',    label: 'Clôturées',   icon: 'archive-outline' },
];

const STATUT = {
  en_attente:  { color: '#F59E0B', bg: '#FFFBEB', label: 'EN ATTENTE',  icon: 'time-outline' },
  validee:     { color: '#10B981', bg: '#ECFDF5', label: 'VALIDÉE',     icon: 'checkmark-circle-outline' },
  rejetee:     { color: '#EF4444', bg: '#FEF2F2', label: 'REJETÉE',     icon: 'close-circle-outline' },
  en_cours:    { color: '#3B82F6', bg: '#EFF6FF', label: 'EN COURS',    icon: 'sync-outline' },
  deconsignee: { color: '#8B5CF6', bg: '#F5F3FF', label: 'DÉCONSIGNÉE', icon: 'unlock-outline' },
  cloturee:    { color: '#6B7280', bg: '#F9FAFB', label: 'CLÔTURÉE',    icon: 'archive-outline' },
};

const TYPES_LABELS = {
  genie_civil: 'GC', mecanique: 'MEC', electrique: 'ÉLEC', process: 'PROC',
};

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

export default function MesDemandes({ navigation }) {
  const [demandes, setDemandes]     = useState([]);
  const [filtre, setFiltre]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const charger = async (f = null) => {
    try {
      const res = await getMesDemandes(f);
      if (res.success) setDemandes(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { charger(filtre); }, [filtre]);
  const onRefresh = useCallback(() => { setRefreshing(true); charger(filtre); }, [filtre]);

  const renderCard = ({ item }) => {
    const cfg = STATUT[item.statut] || STATUT.en_attente;
    const types = Array.isArray(item.types_intervenants) ? item.types_intervenants : [];
    return (
      <View style={[S.card, { borderLeftColor: cfg.color }]}>
        {/* Top row */}
        <View style={S.cardTop}>
          <View>
            <Text style={S.cardNum}>{item.numero_ordre}</Text>
            {item.lot && <Text style={S.cardLot}>LOT : {item.lot}</Text>}
          </View>
          <View style={[S.badge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={11} color={cfg.color} style={{ marginRight: 4 }} />
            <Text style={[S.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* TAG */}
        {item.tag && (
          <View style={S.tagRow}>
            <Ionicons name="hardware-chip-outline" size={13} color={COLORS.green} />
            <Text style={S.tagText}>{item.tag} — {item.equipement_nom}</Text>
          </View>
        )}

        {/* Raison */}
        <Text style={S.cardRaison} numberOfLines={2}>{item.raison}</Text>

        {/* Types intervenants */}
        {types.length > 0 && (
          <View style={S.typesRow}>
            {types.map(k => (
              <View key={k} style={S.typePill}>
                <Text style={S.typePillText}>{TYPES_LABELS[k] || k}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Bottom */}
        <View style={S.cardBottom}>
          <Ionicons name="calendar-outline" size={12} color={COLORS.gray} />
          <Text style={S.cardDate}>{formatDate(item.created_at)}</Text>
          {item.statut === 'rejetee' && item.commentaire_rejet && (
            <View style={S.rejetRow}>
              <Ionicons name="information-circle-outline" size={12} color="#EF4444" />
              <Text style={S.rejetText} numberOfLines={1}>{item.commentaire_rejet}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Mes Demandes</Text>
          <Text style={S.headerSub}>{demandes.length} demande{demandes.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Filtres */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' }}>
          {FILTRES.map(f => (
            <TouchableOpacity
              key={f.key ?? 'all'}
              style={[S.chip, filtre === f.key && S.chipActive]}
              onPress={() => setFiltre(f.key)}
            >
              <Ionicons name={f.icon} size={13} color={filtre === f.key ? '#fff' : COLORS.gray} style={{ marginRight: 4 }} />
              <Text style={[S.chipText, filtre === f.key && S.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading
        ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.green} />
          </View>
        : <FlatList
            data={demandes}
            keyExtractor={item => item.id.toString()}
            renderItem={renderCard}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.green]} />}
            ListEmptyComponent={
              <View style={S.empty}>
                <Ionicons name="document-text-outline" size={55} color="#BDBDBD" />
                <Text style={S.emptyTitle}>Aucune demande</Text>
                <Text style={S.emptySub}>
                  {filtre ? 'Aucune demande avec ce statut' : 'Créez votre première demande de consignation'}
                </Text>
                {!filtre && (
                  <TouchableOpacity
                    style={S.emptyBtn}
                    onPress={() => navigation.navigate('NouvelleDemande')}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={S.emptyBtnText}>Nouvelle demande</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
      }
    </View>
  );
}

const S = StyleSheet.create({
  header: { backgroundColor: COLORS.green, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#A5D6A7', fontSize: 10, letterSpacing: 0.5 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#fff' },
  chipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  chipText: { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },
  chipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderLeftWidth: 4, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardNum: { fontSize: 13, fontWeight: '800', color: '#424242' },
  cardLot: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  tagText: { fontSize: 13, fontWeight: '600', color: COLORS.green },
  cardRaison: { fontSize: 13, color: '#757575', marginBottom: 8, lineHeight: 18 },
  typesRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  typePill: { backgroundColor: '#EEF2FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typePillText: { fontSize: 10, fontWeight: '700', color: '#3730A3', letterSpacing: 0.5 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardDate: { fontSize: 11, color: '#9E9E9E', flex: 1 },
  rejetRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rejetText: { fontSize: 11, color: '#EF4444', maxWidth: 140 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub: { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 20, gap: 8 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});