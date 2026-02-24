import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../styles/variables.css';
import { getDemandeById } from '../../api/demande.api';

const STATUT = {
  en_attente:  { color: '#F59E0B', bg: '#FFFBEB', label: 'EN ATTENTE',  icon: 'time-outline' },
  validee:     { color: '#10B981', bg: '#ECFDF5', label: 'VALIDÉE',     icon: 'checkmark-circle-outline' },
  rejetee:     { color: '#EF4444', bg: '#FEF2F2', label: 'REJETÉE',     icon: 'close-circle-outline' },
  en_cours:    { color: '#3B82F6', bg: '#EFF6FF', label: 'EN COURS',    icon: 'sync-outline' },
  deconsignee: { color: '#8B5CF6', bg: '#F5F3FF', label: 'DÉCONSIGNÉE', icon: 'unlock-outline' },
  cloturee:    { color: '#6B7280', bg: '#F9FAFB', label: 'CLÔTURÉE',    icon: 'archive-outline' },
};

const TYPES_LABELS = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

const InfoRow = ({ icon, label, value, color }) => (
  <View style={S.infoRow}>
    <View style={S.infoLeft}>
      <Ionicons name={icon} size={15} color={color || '#9E9E9E'} />
      <Text style={S.infoLabel}>{label}</Text>
    </View>
    <Text style={S.infoValue}>{value || '—'}</Text>
  </View>
);

export default function DetailDemande({ navigation, route }) {
  const { id } = route.params;
  const [demande, setDemande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur]   = useState(null);

  useEffect(() => {
    charger();
  }, [id]);

  const charger = async () => {
    try {
      setLoading(true);
      const res = await getDemandeById(id);
      if (res.success) {
        setDemande(res.data);
      } else {
        setErreur('Demande introuvable');
      }
    } catch (e) {
      setErreur('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={COLORS.green} />
      </View>
    );
  }

  if (erreur || !demande) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <Ionicons name="alert-circle-outline" size={50} color="#EF4444" />
        <Text style={{ color: '#EF4444', marginTop: 10, fontSize: 15 }}>{erreur}</Text>
        <TouchableOpacity style={S.retryBtn} onPress={charger}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg   = STATUT[demande.statut] || STATUT.en_attente;
  const types = Array.isArray(demande.types_intervenants) ? demande.types_intervenants : [];

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Détail Demande</Text>
          <Text style={S.headerSub}>{demande.numero_ordre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={S.body} showsVerticalScrollIndicator={false}>

        {/* Statut badge */}
        <View style={[S.statutCard, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
          <Ionicons name={cfg.icon} size={24} color={cfg.color} />
          <View style={{ marginLeft: 12 }}>
            <Text style={[S.statutLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={S.statutNumero}>{demande.numero_ordre}</Text>
          </View>
        </View>

        {/* LOT & TAG */}
        <View style={S.card}>
          <Text style={S.cardTitle}>🏷️ LOT & Équipement</Text>
          <InfoRow icon="layers-outline"        label="LOT"         value={demande.lot_code || demande.lot} color="#6366F1" />
          <InfoRow icon="hardware-chip-outline" label="TAG"         value={demande.tag}                    color={COLORS.green} />
          <InfoRow icon="cube-outline"          label="Équipement"  value={demande.equipement_nom}         color={COLORS.green} />
          <InfoRow icon="location-outline"      label="Localisation" value={demande.equipement_localisation} />
          <InfoRow icon="business-outline"      label="Entité"      value={demande.equipement_entite} />
        </View>

        {/* Demandeur */}
        <View style={S.card}>
          <Text style={S.cardTitle}>👤 Demandeur</Text>
          <InfoRow icon="person-outline"    label="Nom"       value={demande.demandeur_nom} />
          <InfoRow icon="card-outline"      label="Matricule" value={demande.demandeur_matricule} />
          <InfoRow icon="business-outline"  label="Entité"    value={demande.demandeur_entite} />
          <InfoRow icon="map-outline"       label="Zone"      value={demande.demandeur_zone} />
        </View>

        {/* Raison */}
        <View style={S.card}>
          <Text style={S.cardTitle}>📝 Raison de l'intervention</Text>
          <Text style={S.raisonText}>{demande.raison}</Text>
        </View>

        {/* Types intervenants */}
        {types.length > 0 && (
          <View style={S.card}>
            <Text style={S.cardTitle}>👷 Types d'intervenants</Text>
            <View style={S.typesWrap}>
              {types.map(k => (
                <View key={k} style={S.typePill}>
                  <Text style={S.typePillText}>{TYPES_LABELS[k] || k}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Dates */}
        <View style={S.card}>
          <Text style={S.cardTitle}>📅 Dates</Text>
          <InfoRow icon="calendar-outline"  label="Soumise le"   value={formatDate(demande.created_at)} />
          <InfoRow icon="calendar-outline"  label="Date souhaitée" value={formatDate(demande.date_souhaitee)} />
          {demande.date_validation && (
            <InfoRow icon="checkmark-circle-outline" label="Validée le" value={formatDate(demande.date_validation)} color="#10B981" />
          )}
        </View>

        {/* Commentaire rejet */}
        {demande.statut === 'rejetee' && demande.commentaire_rejet && (
          <View style={[S.card, S.rejetCard]}>
            <View style={S.rejetHeader}>
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={S.rejetTitle}>Motif du rejet</Text>
            </View>
            <Text style={S.rejetText}>{demande.commentaire_rejet}</Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    backgroundColor: COLORS.green,
    paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:   { color: '#A5D6A7', fontSize: 10, letterSpacing: 0.5 },

  body: { padding: 14 },

  statutCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1.5,
  },
  statutLabel:  { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  statutNumero: { fontSize: 12, color: '#757575', marginTop: 2 },

  card: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000',
    shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: 13, fontWeight: '700', color: '#424242',
    marginBottom: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#FAFAFA',
  },
  infoLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 12, color: '#9E9E9E' },
  infoValue: { fontSize: 12, fontWeight: '600', color: '#212121', maxWidth: '55%', textAlign: 'right' },

  raisonText: { fontSize: 14, color: '#424242', lineHeight: 21 },

  typesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typePill:  { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  typePillText: { fontSize: 12, fontWeight: '700', color: '#3730A3' },

  rejetCard:   { borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  rejetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  rejetTitle:  { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  rejetText:   { fontSize: 13, color: '#B91C1C', lineHeight: 19 },

  retryBtn: {
    backgroundColor: COLORS.green, borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 10, marginTop: 16,
  },
});