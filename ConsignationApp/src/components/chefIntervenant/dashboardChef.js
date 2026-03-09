// src/components/chefIntervenant/dashboardChef.js
// ✅ Layout aligné sur dashboardCharge.js
// ✅ Couleurs Chef Intervenant conservées (bleu #1565C0)
// ✅ Stats cliquables → MesConsignationsChef
// ✅ Actions rapides + Dernières consignations
// ✅ Refresh silencieux toutes les 30s
// ✅ FIX : 3 nouveaux statuts déconsignés
//    deconsigne_intervent | deconsigne_charge | deconsigne_process

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMesDemandes } from '../../api/intervenant.api';
import { getNotificationsNonLues } from '../../api/notification.api';
import { getMe } from '../../api/auth.api';

const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
  bgPale:      '#BBDEFB',
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Travaux Mécaniques',
  electrique:  'Travaux Électriques',
  process:     'Process',
};

// ✅ Ajout des 3 nouveaux statuts déconsignés
const STATUT_CONFIG = {
  en_attente:            { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',        icon: 'time-outline'             },
  validee:               { color: '#10B981', bg: '#D1FAE5', label: 'VALIDÉE',           icon: 'checkmark-circle-outline' },
  rejetee:               { color: '#EF4444', bg: '#FEE2E2', label: 'REJETÉE',           icon: 'close-circle-outline'     },
  en_cours:              { color: '#1565C0', bg: '#E3F2FD', label: 'EN COURS',          icon: 'sync-outline'             },
  consigne:              { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉE',         icon: 'lock-closed-outline'      },
  consigne_charge:       { color: '#1565C0', bg: '#E3F2FD', label: 'CONSIG. CHARGÉ',   icon: 'flash-outline'            },
  consigne_process:      { color: '#6A1B9A', bg: '#F3E5F5', label: 'CONSIG. PROCESS',  icon: 'cog-outline'              },
  deconsigne_intervent:  { color: '#6A1B9A', bg: '#F3E5F5', label: 'DÉCONSIG. INTERV', icon: 'lock-open-outline'        },
  deconsigne_charge:     { color: '#0277BD', bg: '#E1F5FE', label: 'DÉCONSIG. CHARGÉ', icon: 'flash-outline'            },
  deconsigne_process:    { color: '#558B2F', bg: '#F1F8E9', label: 'DÉCONSIG. PROCESS', icon: 'cog-outline'             },
  deconsignee:           { color: '#6A1B9A', bg: '#F3E5F5', label: 'DÉCONSIGNÉE',      icon: 'lock-open-outline'        },
  cloturee:              { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',          icon: 'archive-outline'          },
};

const STATUTS_EQUIPE     = ['consigne', 'consigne_charge', 'consigne_process'];
const STATUTS_DECONSIGNE = ['deconsigne_intervent', 'deconsigne_charge', 'deconsigne_process', 'deconsignee'];

const REFRESH_INTERVAL_MS = 30000;

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

export default function DashboardChef({ navigation }) {
  const [user,       setUser]       = useState(null);
  const [demandes,   setDemandes]   = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef  = useRef(null);
  const isMountedRef = useRef(true);

  const metierLabel = TYPE_LABEL[user?.type_metier] || 'Intervenant';

  const charger = useCallback(async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));

      const meRes = await getMe();
      if (meRes?.success && meRes?.data) {
        setUser(meRes.data);
        await AsyncStorage.setItem('user', JSON.stringify(meRes.data));
      }

      const [demandesRes, notifsRes] = await Promise.all([
        getMesDemandes(),
        getNotificationsNonLues(),
      ]);
      if (demandesRes?.success) setDemandes(demandesRes.data || []);
      if (notifsRes?.success)   setNotifCount(notifsRes.data?.length || 0);
    } catch (e) {
      console.error('DashboardChef error:', e?.message || e);
    } finally {
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

  const stats = {
    en_attente:   demandes.filter(d => d.statut === 'en_attente').length,
    consignees:   demandes.filter(d => STATUTS_EQUIPE.includes(d.statut)).length,
    deconsignees: demandes.filter(d => STATUTS_DECONSIGNE.includes(d.statut)).length,
    total:        demandes.length,
  };

  const allerConsignations = (filtre) => {
    navigation.navigate('MesConsignationsChef', { filtreInitial: filtre });
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
            <Ionicons name="people-outline" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerRole}> CHEF {metierLabel.toUpperCase()}</Text>
          </View>
          <TouchableOpacity
            style={S.notifBtn}
            onPress={() => navigation.navigate('NotificationsChef')}
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {notifCount > 0 && (
              <View style={S.notifBadge}>
                <Text style={S.notifBadgeTxt}>{notifCount > 9 ? '9+' : notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Stats cliquables (4 cartes) ── */}
        <View style={S.statsRow}>
          {[
            {
              label:  'En attente',
              value:  stats.en_attente,
              color:  '#F59E0B',
              icon:   'time-outline',
              filtre: 'en_attente',
            },
            {
              label:  'Consignées',
              value:  stats.consignees,
              color:  '#2E7D32',
              icon:   'lock-closed-outline',
              filtre: 'consigne',
            },
            {
              label:  'Déconsign.',
              value:  stats.deconsignees,
              color:  '#6A1B9A',
              icon:   'lock-open-outline',
              filtre: 'deconsigne_intervent',
            },
            {
              label:  'Total',
              value:  stats.total,
              color:  '#6B7280',
              icon:   'list-circle-outline',
              filtre: null,
            },
          ].map((s, i) => (
            <TouchableOpacity
              key={i}
              style={S.statCard}
              onPress={() => allerConsignations(s.filtre)}
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
            { icon: 'list-outline',          label: 'Consignations', sub: `${demandes.length} me concernant`,  screen: 'MesConsignationsChef', params: {} },
            { icon: 'people-outline',        label: 'Mon équipe',    sub: 'Gérer les intervenants',             screen: 'MonEquipe',            params: {} },
            { icon: 'notifications-outline', label: 'Notifications', sub: `${notifCount} non lues`,            screen: 'NotificationsChef',    params: {} },
            { icon: 'person-outline',        label: 'Mon profil',    sub: 'Mes informations',                   screen: 'Profil',               params: {} },
          ].map((a, i) => (
            <TouchableOpacity
              key={i}
              style={S.actionCard}
              onPress={() => navigation.navigate(a.screen, a.params)}
              activeOpacity={0.8}
            >
              <View style={[S.actionIcon, { backgroundColor: CFG.bg }]}>
                <Ionicons name={a.icon} size={22} color={CFG.couleur} />
              </View>
              <Text style={S.actionLabel}>{a.label}</Text>
              <Text style={S.actionSub}>{a.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Dernières consignations (2 max) ── */}
        <View style={S.sectionRow}>
          <Text style={[S.sectionTitle, { marginHorizontal: 0, marginBottom: 0 }]}>
            Dernières consignations
          </Text>
          <Text style={S.sectionCount}>{demandes.length} au total</Text>
        </View>

        {demandes.length === 0 ? (
          <View style={S.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={48} color={CFG.bg} />
            <Text style={S.emptyTitle}>Aucune consignation</Text>
            <Text style={S.emptySub}>Vos consignations apparaîtront ici</Text>
          </View>
        ) : (
          demandes.slice(0, 2).map((d, i) => {
            const cfg = STATUT_CONFIG[d.statut] || STATUT_CONFIG.en_attente;
            const isConsigne    = STATUTS_EQUIPE.includes(d.statut);
            const isDeconsigne  = STATUTS_DECONSIGNE.includes(d.statut);
            return (
              <TouchableOpacity
                key={i}
                style={S.demandeCard}
                onPress={() => navigation.navigate('DetailConsignation', { demande: d })}
                activeOpacity={0.8}
              >
                <View style={[S.demandeIconWrap, { backgroundColor: CFG.bg }]}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={CFG.couleur} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.demandeNumero}>{d.numero_ordre}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
                    <Text style={S.demandeTag}>
                      {d.tag || ''}{d.equipement_nom ? ` — ${d.equipement_nom}` : ''}
                    </Text>
                  </View>
                  {d.lot_code && (
                    <Text style={S.demandeLot}>LOT : {d.lot_code}</Text>
                  )}
                  {isConsigne && (
                    <Text style={S.demandeEquipe}>👷 Gérer l'équipe</Text>
                  )}
                  {isDeconsigne && (
                    <Text style={[S.demandeEquipe, { color: cfg.color }]}>
                      🔓 Intervention terminée
                    </Text>
                  )}
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
            onPress={() => navigation.navigate('MesConsignationsChef', { filtreInitial: null })}
          >
            <Text style={S.voirToutTxt}>Voir toutes les consignations ({demandes.length})</Text>
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
    width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#EF4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  notifBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },

  statsRow: {
    flexDirection: 'row', gap: 8,
    marginHorizontal: 16, marginTop: -20, marginBottom: 16,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 10,
    alignItems: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  statVal:   { fontSize: 20, fontWeight: '900' },
  statLbl:   { fontSize: 8, color: '#9E9E9E', marginTop: 2, textAlign: 'center' },
  statArrow: {
    position: 'absolute', bottom: 6, right: 6,
    width: 16, height: 16, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

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
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    width: '47%', alignItems: 'center',
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  actionIcon:  { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionLabel: { fontSize: 13, fontWeight: '700', color: '#212121', textAlign: 'center' },
  actionSub:   { fontSize: 10, color: '#9E9E9E', textAlign: 'center', marginTop: 2 },

  demandeCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  demandeIconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  demandeNumero:   { fontSize: 13, fontWeight: '800', color: '#212121' },
  demandeTag:      { fontSize: 11, color: '#1565C0', fontWeight: '600', marginLeft: 4 },
  demandeLot:      { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  demandeEquipe:   { fontSize: 10, color: '#2E7D32', fontWeight: '700', marginTop: 2 },
  demandeDate:     { fontSize: 10, color: '#BDBDBD' },

  statutBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  statutTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  voirToutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 8,
    backgroundColor: '#E3F2FD', borderRadius: 14,
    paddingVertical: 12, borderWidth: 1, borderColor: '#BBDEFB',
  },
  voirToutTxt: { fontSize: 13, fontWeight: '700', color: '#1565C0' },

  emptyWrap:  { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#424242', marginTop: 12 },
  emptySub:   { fontSize: 12, color: '#9E9E9E', marginTop: 6, textAlign: 'center' },
});