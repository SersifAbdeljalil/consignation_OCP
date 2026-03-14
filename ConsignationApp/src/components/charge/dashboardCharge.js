// src/components/charge/dashboardCharge.js
// ✅ Structure ORIGINALE préservée (4 actions rapides avec Profil)
// ✅ Stat "À déconsigner" cliquable → ListeDeconsignation (#7C3AED gardé)
// ✅ Auto-refresh 30s
// ✅ Bannière déconsignation urgente

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDemandesAConsigner, getDemandesADeconsigner } from '../../api/charge.api';
import { getNotificationsNonLues } from '../../api/notification.api';
import { getMe } from '../../api/auth.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const STATUT_CONFIG = {
  en_attente:       { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',   icon: 'time-outline'        },
  en_cours:         { color: '#2d6a4f', bg: '#d8f3dc', label: 'EN COURS',     icon: 'sync-outline'        },
  consigne_charge:  { color: '#1565C0', bg: '#E3F2FD', label: 'ATT. PROCESS', icon: 'time-outline'        },
  consigne_process: { color: '#6A1B9A', bg: '#F3E5F5', label: 'ATT. CHARGÉ',  icon: 'time-outline'        },
  consigne:         { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉ ✓',   icon: 'lock-closed-outline' },
  rejetee:          { color: '#EF4444', bg: '#FEE2E2', label: 'REFUSÉE',      icon: 'close-circle-outline'},
  cloturee:         { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',     icon: 'archive-outline'     },
};

const REFRESH_INTERVAL_MS = 30000;

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

export default function DashboardCharge({ navigation }) {
  const [user,          setUser]          = useState(null);
  const [demandes,      setDemandes]      = useState([]);
  const [demandesDecon, setDemandesDecon] = useState([]);
  const [notifCount,    setNotifCount]    = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const intervalRef  = useRef(null);
  const isMountedRef = useRef(true);

  const charger = useCallback(async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));

      const meRes = await getMe();
      if (meRes?.success && meRes?.data) {
        setUser(meRes.data);
        await AsyncStorage.setItem('user', JSON.stringify(meRes.data));
      }

      const [demandesRes, deconRes, notifsRes] = await Promise.all([
        getDemandesAConsigner(),
        getDemandesADeconsigner(),
        getNotificationsNonLues(),
      ]);
      if (demandesRes?.success)  setDemandes(demandesRes.data || []);
      if (deconRes?.success)     setDemandesDecon(deconRes.data || []);
      if (notifsRes?.success)    setNotifCount(notifsRes.data?.length || 0);
    } catch (e) {
      console.error('Dashboard charge error:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const chargerSilencieux = useCallback(async () => {
    try {
      const [demandesRes, deconRes, notifsRes] = await Promise.all([
        getDemandesAConsigner(),
        getDemandesADeconsigner(),
        getNotificationsNonLues(),
      ]);
      if (!isMountedRef.current) return;
      if (demandesRes?.success)  setDemandes(demandesRes.data || []);
      if (deconRes?.success)     setDemandesDecon(deconRes.data || []);
      if (notifsRes?.success)    setNotifCount(notifsRes.data?.length || 0);
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

  const stats = {
    en_attente:    demandes.filter(d => d.statut === 'en_attente').length,
    en_cours:      demandes.filter(d => d.statut === 'en_cours').length,
    total:         demandes.length,
    a_deconsigner: demandesDecon.length,
  };

  const allerMesDemandes = (filtre) => {
    navigation.navigate('MesDemandesCharge', { filtreInitial: filtre });
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />
        }
      >
        {/* ── Header ── */}
        <View style={[S.header, { backgroundColor: CFG.couleur }]}>
          <View style={S.headerDecoCircle} />
          <View style={S.headerGreetRow}>
            <Ionicons name="sunny-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerBonjour}> BONJOUR 👋</Text>
          </View>
          <Text style={S.headerNom}>{user?.prenom} {user?.nom}</Text>
          <View style={S.headerRoleRow}>
            <Ionicons name="shield-checkmark-outline" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerRole}> CHARGÉ DE CONSIGNATION</Text>
          </View>
          <TouchableOpacity
            style={S.notifBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {notifCount > 0 && (
              <View style={S.notifBadge}>
                <Text style={S.notifBadgeTxt}>{notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Stats (4 tuiles originales) ── */}
        <View style={S.statsRow}>
          {[
            {
              label:   'En attente',
              value:   stats.en_attente,
              color:   '#F59E0B',
              icon:    'time-outline',
              onPress: () => allerMesDemandes('en_attente'),
            },
            {
              label:   'En cours',
              value:   stats.en_cours,
              color:   CFG.couleur,
              icon:    'sync-outline',
              onPress: () => allerMesDemandes('en_cours'),
            },
            {
              label:   'Total',
              value:   stats.total,
              color:   '#6B7280',
              icon:    'list-circle-outline',
              onPress: () => allerMesDemandes(null),
            },
            {
              label:     'À déconsigner',
              value:     stats.a_deconsigner,
              color:     '#7C3AED',
              icon:      'lock-open-outline',
              onPress:   () => navigation.navigate('ListeDeconsignation'),
              highlight: stats.a_deconsigner > 0,
            },
          ].map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[
                S.statCard,
                s.highlight && { borderWidth: 2, borderColor: s.color + '60' },
              ]}
              onPress={s.onPress}
              activeOpacity={0.75}
            >
              <Ionicons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
              <Text style={[S.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={S.statLbl}>{s.label}</Text>
              {s.highlight && s.value > 0 && (
                <View style={[S.urgentDot, { backgroundColor: s.color }]} />
              )}
              <View style={[S.statArrow, { borderColor: s.color + '40' }]}>
                <Ionicons name="chevron-forward" size={10} color={s.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Bannière déconsignation urgente (#7C3AED) ── */}
        {stats.a_deconsigner > 0 && (
          <TouchableOpacity
            style={S.deconBanner}
            onPress={() => navigation.navigate('ListeDeconsignation')}
            activeOpacity={0.85}
          >
            <View style={S.deconBannerIcon}>
              <Ionicons name="lock-open-outline" size={22} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.deconBannerTitle}>
                {stats.a_deconsigner} demande{stats.a_deconsigner > 1 ? 's' : ''} à déconsigner
              </Text>
              <Text style={S.deconBannerSub}>
                Des équipes attendent votre déconsignation électrique
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#7C3AED" />
          </TouchableOpacity>
        )}

        {/* ── Actions rapides ORIGINALES (avec Profil) ── */}
        <Text style={S.sectionTitle}>Actions rapides</Text>
        <View style={S.actionsGrid}>
          {[
            {
              icon:   'list-outline',
              label:  'Mes demandes',
              sub:    `${demandes.length} à traiter`,
              screen: 'MesDemandesCharge',
              params: {},
            },
            {
              icon:   'time-outline',
              label:  'Historique',
              sub:    'Mes consignations',
              screen: 'Historique',
              params: {},
            },
            {
              icon:   'notifications-outline',
              label:  'Notifications',
              sub:    `${notifCount} non lues`,
              screen: 'Notifications',
              params: {},
            },
            {
              icon:   'person-outline',
              label:  'Mon profil',
              sub:    'Mes informations',
              screen: 'Profil',
              params: {},
            },
          ].map((a, i) => (
            <TouchableOpacity
              key={i}
              style={S.actionCard}
              onPress={() => navigation.navigate(a.screen, a.params)}
              activeOpacity={0.8}
            >
              <View style={[S.actionIcon, { backgroundColor: CFG.bgPale }]}>
                <Ionicons name={a.icon} size={22} color={CFG.couleur} />
              </View>
              <Text style={S.actionLabel}>{a.label}</Text>
              <Text style={S.actionSub}>{a.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Dernières demandes ── */}
        <View style={S.sectionRow}>
          <Text style={[S.sectionTitle, { marginHorizontal: 0, marginBottom: 0 }]}>
            Dernières demandes
          </Text>
          <Text style={S.sectionCount}>{demandes.length} au total</Text>
        </View>

        {demandes.length === 0 ? (
          <View style={S.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={48} color={CFG.bg} />
            <Text style={S.emptyTitle}>Aucune demande en attente</Text>
            <Text style={S.emptySub}>Toutes les demandes ont été traitées</Text>
          </View>
        ) : (
          demandes.slice(0, 2).map((d, i) => {
            const cfg = STATUT_CONFIG[d.statut] || STATUT_CONFIG.en_attente;
            return (
              <TouchableOpacity
                key={i}
                style={S.demandeCard}
                onPress={() => navigation.navigate('DetailConsignation', { demande: d })}
                activeOpacity={0.8}
              >
                <View style={[S.demandeIconWrap, { backgroundColor: CFG.bgPale }]}>
                  <Ionicons name="lock-closed-outline" size={22} color={CFG.couleur} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.demandeNumero}>{d.numero_ordre}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
                    <Text style={S.demandeTag}>
                      {d.tag || ''}{d.equipement_nom ? ` — ${d.equipement_nom}` : ''}
                    </Text>
                  </View>
                  {d.lot_code && <Text style={S.demandeLot}>LOT : {d.lot_code}</Text>}
                  <Text style={S.demandeDemandeur}>Par : {d.demandeur_nom}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Ionicons name="calendar-outline" size={11} color="#BDBDBD" />
                    <Text style={S.demandeDate}> {fmtDate(d.created_at)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg.icon} size={10} color={cfg.color} />
                    <Text style={[S.statutTxt, { color: cfg.color }]}> {cfg.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {demandes.length > 2 && (
          <TouchableOpacity
            style={S.voirToutBtn}
            onPress={() => navigation.navigate('MesDemandesCharge', { filtreInitial: null })}
          >
            <Text style={S.voirToutTxt}>Voir toutes les demandes ({demandes.length})</Text>
            <Ionicons name="arrow-forward-outline" size={16} color={CFG.couleur} />
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    paddingTop: 50, paddingBottom: 30, paddingHorizontal: 16,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden',
  },
  headerDecoCircle: {
    position: 'absolute', bottom: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerGreetRow: { flexDirection: 'row', alignItems: 'center' },
  headerBonjour:  { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 1 },
  headerNom:      { color: '#fff', fontSize: 22, fontWeight: '800', marginVertical: 2 },
  headerRoleRow:  { flexDirection: 'row', alignItems: 'center' },
  headerRole:     { color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 1 },
  notifBtn: {
    position: 'absolute', top: 52, right: 16,
    width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#EF4444', borderRadius: 8,
    width: 16, height: 16, alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },

  statsRow: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: 16, marginTop: -20, marginBottom: 12,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 10,
    alignItems: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    position: 'relative',
  },
  statVal:   { fontSize: 20, fontWeight: '900' },
  statLbl:   { fontSize: 8, color: '#9E9E9E', marginTop: 2, textAlign: 'center' },
  statArrow: {
    position: 'absolute', bottom: 5, right: 5,
    width: 14, height: 14, borderRadius: 7, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  urgentDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
  },

  deconBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EDE9FE', borderRadius: 14,
    marginHorizontal: 16, marginBottom: 12,
    padding: 14, gap: 12,
    borderWidth: 1.5, borderColor: '#7C3AED',
    elevation: 3, shadowColor: '#7C3AED', shadowOpacity: 0.15, shadowRadius: 6,
  },
  deconBannerIcon: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: '#DDD6FE', alignItems: 'center', justifyContent: 'center',
  },
  deconBannerTitle: { fontSize: 13, fontWeight: '800', color: '#5B21B6' },
  deconBannerSub:   { fontSize: 11, color: '#7C3AED', marginTop: 2 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 4, marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: '#424242',
    marginHorizontal: 16, marginBottom: 10, marginTop: 4,
  },
  sectionCount: { fontSize: 11, color: '#9E9E9E' },

  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 16, gap: 10, marginBottom: 16,
  },
  actionCard: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, width: '47%', alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6,
  },
  actionIcon: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  actionLabel: { fontSize: 13, fontWeight: '700', color: '#212121', textAlign: 'center' },
  actionSub:   { fontSize: 10, color: '#9E9E9E', textAlign: 'center', marginTop: 2 },

  demandeCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6,
  },
  demandeIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  demandeNumero:    { fontSize: 13, fontWeight: '800', color: '#212121' },
  demandeTag:       { fontSize: 11, color: '#2d6a4f', fontWeight: '600', marginLeft: 4 },
  demandeLot:       { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  demandeDemandeur: { fontSize: 10, color: '#9E9E9E' },
  demandeDate:      { fontSize: 10, color: '#BDBDBD' },

  statutBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  statutTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  voirToutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    backgroundColor: '#d8f3dc', borderRadius: 14,
    paddingVertical: 12, borderWidth: 1, borderColor: '#A5D6A7',
  },
  voirToutTxt: { fontSize: 13, fontWeight: '700', color: '#2d6a4f' },

  emptyWrap:  { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#424242', marginTop: 12 },
  emptySub:   { fontSize: 12, color: '#9E9E9E', marginTop: 6, textAlign: 'center' },
});