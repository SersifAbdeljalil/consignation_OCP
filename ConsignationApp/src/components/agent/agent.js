// src/components/agent/agent.js
// ✅ Auto-refresh silencieux toutes les 1s
// ✅ Stats cliquables → MesDemandes avec filtre pré-sélectionné
// ✅ [FIX] Statuts déconsignation complets, alignés sur dashboardChef.js :
//    deconsigne_intervent | deconsigne_charge | deconsigne_process | deconsignee
// ✅ Stat "Consignées" = consigne + consigne_charge + consigne_process
// ✅ Stat "Déconsignées" = deconsigne_intervent + deconsigne_charge + deconsigne_process + deconsignee

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import { getMesDemandes } from '../../api/demande.api';
import { getNotificationsNonLues } from '../../api/notification.api';

const REFRESH_INTERVAL_MS = 1000;

// ✅ Config statuts COMPLÈTE — tous les statuts possibles d'une demande
const STATUT_CONFIG = {
  en_attente:           { color: COLORS.statut.en_attente,  bg: '#FFF8E1',        label: 'EN ATTENTE',        icon: 'time-outline'              },
  validee:              { color: COLORS.statut.validee,     bg: COLORS.greenPale, label: 'VALIDÉE',           icon: 'checkmark-circle-outline'  },
  rejetee:              { color: COLORS.statut.rejetee,     bg: '#FFEBEE',        label: 'REJETÉE',           icon: 'close-circle-outline'      },
  en_cours:             { color: COLORS.statut.en_cours,    bg: COLORS.bluePale,  label: 'EN COURS',          icon: 'sync-outline'              },
  consigne_charge:      { color: '#1d4ed8',                 bg: '#dbeafe',        label: 'CONSIG. EN COURS',  icon: 'time-outline'              },
  consigne_process:     { color: '#b45309',                 bg: '#fde68a',        label: 'CONSIG. EN COURS',  icon: 'time-outline'              },
  consigne:             { color: COLORS.statut.validee,     bg: '#D1FAE5',        label: 'CONSIGNÉ',          icon: 'lock-closed-outline'       },
  // ✅ [AJOUTÉ] Statuts déconsignation — identiques à dashboardChef.js
  deconsigne_intervent: { color: '#7C3AED',                 bg: '#EDE9FE',        label: 'DÉCONSIG. ÉQUIPE',  icon: 'people-outline'            },
  deconsigne_charge:    { color: '#1d4ed8',                 bg: '#dbeafe',        label: 'DÉCONSIG. CHARGÉ',  icon: 'flash-outline'             },
  deconsigne_process:   { color: '#b45309',                 bg: '#fde68a',        label: 'DÉCONSIG. PROCESS', icon: 'cog-outline'               },
  deconsignee:          { color: COLORS.statut.deconsignee ?? '#7C3AED', bg: '#F3E5F5', label: 'DÉCONSIGNÉE', icon: 'lock-open-outline'            },
  cloturee:             { color: COLORS.statut.cloturee,    bg: COLORS.grayLight, label: 'CLÔTURÉE',          icon: 'archive-outline'           },
};

// Groupes de statuts
const STATUTS_CONSIGNE    = ['consigne', 'consigne_charge', 'consigne_process'];
const STATUTS_DECONSIGNE  = ['deconsigne_intervent', 'deconsigne_charge', 'deconsigne_process', 'deconsignee'];

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

export default function Agent({ navigation }) {
  const [user,        setUser]        = useState(null);
  const [demandes,    setDemandes]    = useState([]);
  const [notifCount,  setNotifCount]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [recherche,   setRecherche]   = useState('');
  const [searchFocus, setSearchFocus] = useState(false);

  const intervalRef  = useRef(null);
  const isMountedRef = useRef(true);

  const charger = useCallback(async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));
      const [demandesRes, notifsRes] = await Promise.all([
        getMesDemandes(),
        getNotificationsNonLues(),
      ]);
      if (demandesRes?.success) setDemandes(demandesRes.data || []);
      if (notifsRes?.success)   setNotifCount(notifsRes.data?.length || 0);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const chargerSilencieux = useCallback(async () => {
    try {
      const [demandesRes, notifsRes] = await Promise.all([
        getMesDemandes(),
        getNotificationsNonLues(),
      ]);
      if (!isMountedRef.current) return;
      if (demandesRes?.success) setDemandes(demandesRes.data || []);
      if (notifsRes?.success)   setNotifCount(notifsRes.data?.length || 0);
    } catch {}
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    charger();
    return () => { isMountedRef.current = false; };
  }, [charger]);

  useEffect(() => {
    intervalRef.current = setInterval(chargerSilencieux, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [chargerSilencieux]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger();
  }, [charger]);

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

  // ✅ Stats : 4 tuiles (en_attente / consignées / déconsignées / en_cours)
  const stats = {
    en_attente:   demandes.filter(d => d.statut === 'en_attente').length,
    consigne:     demandes.filter(d => STATUTS_CONSIGNE.includes(d.statut)).length,
    deconsignee:  demandes.filter(d => STATUTS_DECONSIGNE.includes(d.statut)).length,
    en_cours:     demandes.filter(d => d.statut === 'en_cours').length,
  };

  const allerMesDemandes = (filtre) => {
    navigation.navigate('MesDemandes', { filtreInitial: filtre });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.green} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.green]} />
        }
      >
        {/* ── Header ── */}
        <View style={[S.header, { backgroundColor: COLORS.green }]}>
          <View style={S.headerDecoCircle} />
          <View style={S.headerGreetRow}>
            <Ionicons name="sunny-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerBonjour}> BONJOUR 👋</Text>
          </View>
          <Text style={S.headerNom}>{user?.prenom} {user?.nom}</Text>
          <View style={S.headerRoleRow}>
            <Ionicons name="construct-outline" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerRole}> AGENT DE PRODUCTION</Text>
          </View>
          <TouchableOpacity style={S.notifBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color={COLORS.white} />
            {notifCount > 0 && (
              <View style={S.notifBadge}>
                <Text style={S.notifBadgeTxt}>{notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Stats cliquables — 4 tuiles ── */}
        <View style={S.statsRow}>
          {[
            {
              label:  'En attente',
              value:  stats.en_attente,
              color:  COLORS.statut.en_attente,
              icon:   'time-outline',
              filtre: 'en_attente',
            },
            {
              label:  'Consignées',
              value:  stats.consigne,
              color:  COLORS.statut.validee,
              icon:   'lock-closed-outline',
              filtre: 'consigne',
            },
            {
              // ✅ [NOUVEAU] Tuile déconsignation
              label:  'Déconsign.',
              value:  stats.deconsignee,
              color:  '#7C3AED',
              icon:   'unlock-outline',
              filtre: 'deconsignee',
            },
            {
              label:  'En cours',
              value:  stats.en_cours,
              color:  COLORS.statut.en_cours,
              icon:   'sync-outline',
              filtre: 'en_cours',
            },
          ].map((s, i) => (
            <TouchableOpacity
              key={i}
              style={S.statCard}
              onPress={() => allerMesDemandes(s.filtre)}
              activeOpacity={0.75}
            >
              <Ionicons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
              <Text style={[S.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={S.statLbl}>{s.label}</Text>
              <View style={[S.statArrow, { borderColor: s.color + '40' }]}>
                <Ionicons name="chevron-forward" size={10} color={s.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Actions rapides ── */}
        <Text style={S.sectionTitle}>Actions rapides</Text>
        <View style={S.actionsGrid}>
          {[
            { icon: 'add-circle-outline',   label: 'Nouvelle demande', sub: 'Créer une consignation', screen: 'NouvelleDemande' },
            { icon: 'list-outline',          label: 'Mes demandes',     sub: 'Voir tout',               screen: 'MesDemandes'     },
            { icon: 'notifications-outline', label: 'Notifications',    sub: `${notifCount} non lues`,  screen: 'Notifications'   },
            { icon: 'person-outline',        label: 'Mon profil',       sub: 'Mes informations',        screen: 'Profil'          },
          ].map((a, i) => (
            <TouchableOpacity
              key={i}
              style={S.actionCard}
              onPress={() => navigation.navigate(a.screen)}
              activeOpacity={0.8}
            >
              <View style={[S.actionIcon, { backgroundColor: COLORS.greenPale }]}>
                <Ionicons name={a.icon} size={22} color={COLORS.green} />
              </View>
              <Text style={S.actionLabel}>{a.label}</Text>
              <Text style={S.actionSub}>{a.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Dernières demandes ── */}
        <View style={S.sectionRow}>
          <Text style={[S.sectionTitle, { marginHorizontal: 0, marginBottom: 0 }]}>
            Mes dernières demandes
          </Text>
          <Text style={S.sectionCount}>{demandes.length} au total</Text>
        </View>

        {/* ── Barre de recherche ── */}
        <View style={[S.searchBar, searchFocus && S.searchBarFocus]}>
          <Ionicons name="search-outline" size={18} color={searchFocus ? COLORS.green : COLORS.gray} />
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

        {/* ── Liste (2 dernières) ── */}
        {demandesFiltrees.length === 0 ? (
          <View style={S.emptyWrap}>
            <Ionicons name="document-text-outline" size={48} color={COLORS.grayMedium} />
            <Text style={S.emptyTitle}>{recherche ? 'Aucun résultat' : 'Aucune demande'}</Text>
            <Text style={S.emptySub}>
              {recherche
                ? `Aucune demande ne correspond à « ${recherche} »`
                : 'Créez votre première demande de consignation'}
            </Text>
            {!recherche && (
              <TouchableOpacity style={S.emptyBtn} onPress={() => navigation.navigate('NouvelleDemande')}>
                <Ionicons name="add-circle-outline" size={18} color={COLORS.white} />
                <Text style={S.emptyBtnTxt}>Nouvelle demande</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          demandesFiltrees.slice(0, 2).map((d, i) => {
            const cfg = STATUT_CONFIG[d.statut] || STATUT_CONFIG.en_attente;
            const isDeconsigne = STATUTS_DECONSIGNE.includes(d.statut);
            return (
              <TouchableOpacity
                key={i}
                style={S.demandeCard}
                onPress={() => navigation.navigate('DetailDemandes', { demande: d })}
                activeOpacity={0.8}
              >
                <View style={[S.demandeIconWrap, { backgroundColor: isDeconsigne ? '#EDE9FE' : COLORS.greenPale }]}>
                  <Ionicons
                    name={isDeconsigne ? 'unlock-outline' : 'document-text-outline'}
                    size={22}
                    color={isDeconsigne ? '#7C3AED' : COLORS.green}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: SPACE.md }}>
                  <Text style={S.demandeNumero}>{d.numero_ordre}</Text>
                  <View style={S.demandeTagRow}>
                    <Ionicons name="hardware-chip-outline" size={11} color={COLORS.green} />
                    <Text style={S.demandeTag}>
                      {d.tag || ''}{d.equipement_nom ? ` — ${d.equipement_nom}` : ''}
                    </Text>
                  </View>
                  {d.lot_code && <Text style={S.demandeLot}>LOT : {d.lot_code}</Text>}
                  {/* ✅ [NOUVEAU] Sous-label spécial pour les déconsignations */}
                  {isDeconsigne && (
                    <Text style={[S.demandeSubLabel, { color: cfg.color }]}>
                      🔓 {cfg.label} — Intervention terminée
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Ionicons name="calendar-outline" size={11} color={COLORS.gray} />
                    <Text style={S.demandeDate}> {fmtDate(d.created_at)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: SPACE.sm }}>
                  <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon} size={10} color={cfg.color} />
                    <Text style={[S.statutTxt, { color: cfg.color }]}> {cfg.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.green} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {demandes.length > 2 && !recherche && (
          <TouchableOpacity style={S.voirToutBtn} onPress={() => navigation.navigate('MesDemandes')}>
            <Text style={S.voirToutTxt}>Voir toutes les demandes ({demandes.length})</Text>
            <Ionicons name="arrow-forward-outline" size={16} color={COLORS.green} />
          </TouchableOpacity>
        )}

        <View style={{ height: SPACE.xxxl }} />
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    paddingTop: 50, paddingBottom: 30,
    paddingHorizontal: SPACE.base,
    borderBottomLeftRadius: RADIUS.xxl,
    borderBottomRightRadius: RADIUS.xxl,
    overflow: 'hidden',
  },
  headerDecoCircle: {
    position: 'absolute', bottom: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerGreetRow: { flexDirection: 'row', alignItems: 'center' },
  headerBonjour:  { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, letterSpacing: 1 },
  headerNom: {
    color: COLORS.white, fontSize: FONTS.size.xxl,
    fontWeight: FONTS.weight.extrabold, marginVertical: 2,
  },
  headerRoleRow: { flexDirection: 'row', alignItems: 'center' },
  headerRole:    { color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, letterSpacing: 1 },
  notifBtn: {
    position: 'absolute', top: 52, right: SPACE.base,
    width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: COLORS.error, borderRadius: RADIUS.full,
    width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeTxt: { color: COLORS.white, fontSize: 9, fontWeight: FONTS.weight.black },

  statsRow: {
    flexDirection: 'row', gap: SPACE.xs,
    marginHorizontal: SPACE.base,
    marginTop: -20, marginBottom: SPACE.base,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.sm,
    alignItems: 'center',
    ...SHADOW.md,
  },
  statVal:   { fontSize: FONTS.size.xl, fontWeight: FONTS.weight.black },
  statLbl:   { fontSize: 9, color: COLORS.gray, marginTop: 2, textAlign: 'center' },
  statArrow: {
    position: 'absolute', bottom: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACE.base, marginTop: SPACE.xs, marginBottom: SPACE.sm,
  },
  sectionTitle: {
    fontSize: FONTS.size.base, fontWeight: FONTS.weight.bold,
    color: COLORS.grayDeep,
    marginHorizontal: SPACE.base, marginBottom: SPACE.sm, marginTop: SPACE.xs,
  },
  sectionCount: { fontSize: FONTS.size.xs, color: COLORS.gray },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACE.base, marginBottom: SPACE.sm,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
    borderWidth: 1.5, borderColor: COLORS.grayMedium,
    ...SHADOW.sm,
  },
  searchBarFocus: { borderColor: COLORS.green },
  searchInput: {
    flex: 1, marginLeft: SPACE.sm,
    fontSize: FONTS.size.sm, color: COLORS.grayDeep, paddingVertical: 0,
  },
  searchResult: {
    fontSize: FONTS.size.xs, color: COLORS.gray,
    marginHorizontal: SPACE.base, marginBottom: SPACE.sm, fontStyle: 'italic',
  },

  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: SPACE.base, gap: SPACE.sm, marginBottom: SPACE.base,
  },
  actionCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACE.base, width: '47%', alignItems: 'center', ...SHADOW.sm,
  },
  actionIcon: {
    width: 46, height: 46, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm,
  },
  actionLabel: {
    fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold,
    color: COLORS.grayDeep, textAlign: 'center',
  },
  actionSub: { fontSize: FONTS.size.xs, color: COLORS.gray, textAlign: 'center', marginTop: 2 },

  demandeCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACE.base, marginHorizontal: SPACE.base, marginBottom: SPACE.sm,
    flexDirection: 'row', alignItems: 'center', ...SHADOW.sm,
  },
  demandeIconWrap: {
    width: 46, height: 46, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  demandeNumero: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDeep },
  demandeTagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  demandeTag:    { fontSize: FONTS.size.xs, color: COLORS.green, fontWeight: FONTS.weight.semibold },
  demandeLot:    { fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 1 },
  demandeSubLabel: { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.bold, marginTop: 2 },
  demandeDate:   { fontSize: FONTS.size.xs, color: COLORS.gray },

  statutBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.full, paddingHorizontal: SPACE.sm, paddingVertical: 3,
  },
  statutTxt: { fontSize: 9, fontWeight: FONTS.weight.bold, letterSpacing: 0.5 },

  voirToutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACE.sm, marginHorizontal: SPACE.base,
    marginTop: SPACE.xs, marginBottom: SPACE.sm,
    backgroundColor: COLORS.greenPale, borderRadius: RADIUS.lg,
    paddingVertical: SPACE.md, borderWidth: 1, borderColor: '#A5D6A7',
  },
  voirToutTxt: { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.bold, color: COLORS.green },

  emptyWrap: { alignItems: 'center', paddingVertical: SPACE.xl, paddingHorizontal: SPACE.xl },
  emptyTitle: {
    fontSize: FONTS.size.base, fontWeight: FONTS.weight.bold,
    color: COLORS.grayDark, marginTop: SPACE.md,
  },
  emptySub: {
    fontSize: FONTS.size.sm, color: COLORS.gray,
    textAlign: 'center', marginTop: SPACE.sm, lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.green, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
    marginTop: SPACE.lg, gap: SPACE.sm,
  },
  emptyBtnTxt: { color: COLORS.white, fontWeight: FONTS.weight.bold, fontSize: FONTS.size.md },
});