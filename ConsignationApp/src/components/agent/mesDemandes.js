// src/components/agent/mesDemandes.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  ScrollView, StyleSheet, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import { getMesDemandes } from '../../api/demande.api';
import { API_URL } from '../../api/client';

// ── Config statuts (COLORS.statut de variables.css.js) ──
const STATUT = {
  en_attente:  { color: COLORS.statut.en_attente,  bg: '#FFF8E1',        label: 'EN ATTENTE',   icon: 'time-outline'             },
  validee:     { color: COLORS.statut.validee,     bg: COLORS.greenPale, label: 'VALIDÉE',      icon: 'checkmark-circle-outline' },
  rejetee:     { color: COLORS.statut.rejetee,     bg: '#FFEBEE',        label: 'REJETÉE',      icon: 'close-circle-outline'     },
  en_cours:    { color: COLORS.statut.en_cours,    bg: COLORS.bluePale,  label: 'EN COURS',     icon: 'sync-outline'             },
  consigne:    { color: COLORS.statut.validee,     bg: '#D1FAE5',        label: 'CONSIGNÉ',     icon: 'lock-closed-outline'      },
  deconsignee: { color: COLORS.statut.deconsignee, bg: '#F3E5F5',        label: 'DÉCONSIGNÉE',  icon: 'unlock-outline'           },
  cloturee:    { color: COLORS.statut.cloturee,    bg: COLORS.grayLight, label: 'CLÔTURÉE',     icon: 'archive-outline'          },
};

const FILTRES = [
  { key: null,         label: 'Toutes',      icon: 'list-outline'             },
  { key: 'en_attente', label: 'En attente',  icon: 'time-outline'             },
  { key: 'validee',    label: 'Validées',    icon: 'checkmark-circle-outline' },
  { key: 'en_cours',   label: 'En cours',    icon: 'sync-outline'             },
  { key: 'rejetee',    label: 'Rejetées',    icon: 'close-circle-outline'     },
  { key: 'consigne',   label: 'Consignées',  icon: 'lock-closed-outline'      },
  { key: 'cloturee',   label: 'Clôturées',   icon: 'archive-outline'          },
];

const TYPES_LABELS = {
  genie_civil: 'GC',
  mecanique:   'MEC',
  electrique:  'ÉLEC',
  process:     'PROC',
};

const formatDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

const hasPdf = (statut) => statut === 'consigne' || statut === 'cloturee';

export default function MesDemandes({ navigation }) {
  const [demandes,    setDemandes]    = useState([]);
  const [filtre,      setFiltre]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [recherche,   setRecherche]   = useState('');
  const [searchFocus, setSearchFocus] = useState(false);

  const charger = async (f = null) => {
    try {
      const res = await getMesDemandes(f);
      if (res.success) setDemandes(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { charger(filtre); }, [filtre]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger(filtre);
  }, [filtre]);

  const ouvrirPDF = (item) => {
    navigation.navigate('PdfViewer', {
      url:   `${API_URL}/charge/demandes/${item.id}/pdf`,
      titre: item.numero_ordre,
    });
  };

  // ── Filtrage recherche ────────────────────────
  const demandesFiltrees = demandes.filter(d => {
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return (
      (d.numero_ordre   || '').toLowerCase().includes(q) ||
      (d.equipement_nom || '').toLowerCase().includes(q) ||
      (d.tag            || '').toLowerCase().includes(q) ||
      (d.raison         || '').toLowerCase().includes(q)
    );
  });

  const renderCard = ({ item }) => {
    const cfg   = STATUT[item.statut] || STATUT.en_attente;
    const types = Array.isArray(item.types_intervenants) ? item.types_intervenants : [];

    return (
      // ✅ Navigation directe vers le détail de la demande
      <TouchableOpacity
        style={[S.card, { borderLeftColor: cfg.color }]}
        onPress={() => navigation.navigate('DetailDemande', { demande: item })}
        activeOpacity={0.85}
      >
        {/* Top : numéro + badge statut */}
        <View style={S.cardTop}>
          <View>
            <Text style={S.cardNum}>{item.numero_ordre}</Text>
            {item.lot_code && <Text style={S.cardLot}>LOT : {item.lot_code}</Text>}
          </View>
          <View style={[S.badge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={11} color={cfg.color} style={{ marginRight: 4 }} />
            <Text style={[S.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* TAG + équipement */}
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

        {/* Date + motif rejet */}
        <View style={S.cardBottom}>
          <Ionicons name="calendar-outline" size={12} color={COLORS.gray} />
          <Text style={S.cardDate}>{formatDate(item.created_at)}</Text>
        </View>

        {/* Motif rejet */}
        {item.statut === 'rejetee' && item.commentaire_rejet && (
          <View style={S.rejetRow}>
            <Ionicons name="information-circle-outline" size={13} color={COLORS.statut.rejetee} />
            <Text style={S.rejetText} numberOfLines={2}>{item.commentaire_rejet}</Text>
          </View>
        )}

        {/* Bouton PDF */}
        {hasPdf(item.statut) && (
          <TouchableOpacity
            style={S.pdfBtn}
            onPress={(e) => { e.stopPropagation(); ouvrirPDF(item); }}
            activeOpacity={0.8}
          >
            <View style={S.pdfIcon}>
              <Ionicons name="document-text" size={18} color={COLORS.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.pdfTitre}>Fiche de consignation PDF</Text>
              <Text style={S.pdfSub}>Ouvrir dans l'application</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.green} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Mes Demandes</Text>
          <Text style={S.headerSub}>
            {demandes.length} demande{demandes.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Filtres ── */}
      <View style={S.filtresWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.filtresContent}
        >
          {FILTRES.map(f => (
            <TouchableOpacity
              key={f.key ?? 'all'}
              style={[S.chip, filtre === f.key && S.chipActive]}
              onPress={() => setFiltre(f.key)}
            >
              <Ionicons
                name={f.icon}
                size={13}
                color={filtre === f.key ? COLORS.white : COLORS.gray}
                style={{ marginRight: 4 }}
              />
              <Text style={[S.chipText, filtre === f.key && S.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Barre de recherche ── */}
      <View style={S.searchWrap}>
        <View style={[S.searchBar, searchFocus && S.searchBarFocus]}>
          <Ionicons
            name="search-outline"
            size={18}
            color={searchFocus ? COLORS.green : COLORS.gray}
          />
          <TextInput
            style={S.searchInput}
            placeholder="Rechercher par N°, équipement, TAG..."
            placeholderTextColor={COLORS.gray}
            value={recherche}
            onChangeText={setRecherche}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            returnKeyType="search"
          />
          {recherche.length > 0 && (
            <TouchableOpacity onPress={() => setRecherche('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>
        {recherche.length > 0 && (
          <Text style={S.searchResult}>
            {demandesFiltrees.length} résultat{demandesFiltrees.length !== 1 ? 's' : ''} pour « {recherche} »
          </Text>
        )}
      </View>

      {/* ── Liste ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.green} />
        </View>
      ) : (
        <FlatList
          data={demandesFiltrees}
          keyExtractor={item => item.id.toString()}
          renderItem={renderCard}
          contentContainerStyle={{ padding: SPACE.base, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.green]} />
          }
          ListEmptyComponent={
            <View style={S.emptyWrap}>
              <Ionicons name="document-text-outline" size={55} color={COLORS.grayMedium} />
              <Text style={S.emptyTitle}>
                {recherche ? 'Aucun résultat' : 'Aucune demande'}
              </Text>
              <Text style={S.emptySub}>
                {recherche
                  ? `Aucune demande ne correspond à « ${recherche} »`
                  : filtre
                    ? 'Aucune demande avec ce statut'
                    : 'Créez votre première demande de consignation'
                }
              </Text>
              {!filtre && !recherche && (
                <TouchableOpacity
                  style={S.emptyBtn}
                  onPress={() => navigation.navigate('NouvelleDemande')}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.white} />
                  <Text style={S.emptyBtnTxt}>Nouvelle demande</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  // ── Header ──────────────────────────────────
  header: {
    paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: SPACE.base,
    flexDirection: 'row', alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: COLORS.white, fontSize: FONTS.size.xl, fontWeight: FONTS.weight.bold },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, letterSpacing: 0.5, marginTop: 1 },

  // ── Filtres ──────────────────────────────────
  filtresWrap:    { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  filtresContent: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.sm, flexDirection: 'row' },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm - 2,
    borderRadius: RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.grayMedium,
    backgroundColor: COLORS.surface,
  },
  chipActive:     { backgroundColor: COLORS.green, borderColor: COLORS.green },
  chipText:       { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.gray },
  chipTextActive: { color: COLORS.white },

  // ── Recherche ────────────────────────────────
  searchWrap: { paddingHorizontal: SPACE.base, paddingTop: SPACE.sm, backgroundColor: COLORS.surface },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.grayPale,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderWidth: 1.5,
    borderColor: COLORS.grayMedium,
    marginBottom: SPACE.sm,
  },
  searchBarFocus: { borderColor: COLORS.green, backgroundColor: COLORS.surface },
  searchInput: {
    flex: 1, marginLeft: SPACE.sm,
    fontSize: FONTS.size.sm,
    color: COLORS.grayDeep,
    paddingVertical: 0,
  },
  searchResult: {
    fontSize: FONTS.size.xs, color: COLORS.gray,
    marginBottom: SPACE.sm, fontStyle: 'italic',
  },

  // ── Card demande ─────────────────────────────
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.base,
    marginBottom: SPACE.md,
    borderLeftWidth: 4,
    ...SHADOW.sm,
  },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: SPACE.sm,
  },
  cardNum: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDeep },
  cardLot: { fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs,
    borderRadius: RADIUS.full,
  },
  badgeText: { fontSize: FONTS.size.xs - 1, fontWeight: FONTS.weight.bold, letterSpacing: 0.3 },

  tagRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.sm },
  tagText:  { fontSize: FONTS.size.md - 1, fontWeight: FONTS.weight.semibold, color: COLORS.green },

  cardRaison: { fontSize: FONTS.size.sm, color: COLORS.grayDark, marginBottom: SPACE.sm, lineHeight: 18 },

  typesRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.sm, flexWrap: 'wrap' },
  typePill: {
    backgroundColor: COLORS.bluePale,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.sm, paddingVertical: 3,
  },
  typePillText: { fontSize: FONTS.size.xs - 1, fontWeight: FONTS.weight.bold, color: COLORS.blue, letterSpacing: 0.5 },

  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  cardDate:   { fontSize: FONTS.size.xs, color: COLORS.gray, flex: 1 },

  rejetRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: SPACE.xs, marginTop: SPACE.sm,
    backgroundColor: '#FFEBEE',
    padding: SPACE.sm, borderRadius: RADIUS.md,
  },
  rejetText: { fontSize: FONTS.size.xs, color: COLORS.statut.rejetee, flex: 1, lineHeight: 16 },

  pdfBtn: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: SPACE.md, padding: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.greenPale,
    borderWidth: 1, borderColor: '#A5D6A7',
    gap: SPACE.sm,
  },
  pdfIcon: {
    width: 34, height: 34, borderRadius: RADIUS.sm,
    backgroundColor: '#C8E6C9',
    alignItems: 'center', justifyContent: 'center',
  },
  pdfTitre: { fontSize: FONTS.size.sm,  fontWeight: FONTS.weight.bold, color: COLORS.green },
  pdfSub:   { fontSize: FONTS.size.xs,  color: COLORS.greenLight, marginTop: 1 },

  // ── Empty ────────────────────────────────────
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACE.xl },
  emptyTitle: {
    fontSize: FONTS.size.lg, fontWeight: FONTS.weight.bold,
    color: COLORS.grayDark, marginTop: SPACE.md,
  },
  emptySub: {
    fontSize: FONTS.size.sm, color: COLORS.gray,
    marginTop: SPACE.sm, textAlign: 'center', lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.green,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
    marginTop: SPACE.lg, gap: SPACE.sm,
  },
  emptyBtnTxt: { color: COLORS.white, fontWeight: FONTS.weight.bold, fontSize: FONTS.size.md },
});