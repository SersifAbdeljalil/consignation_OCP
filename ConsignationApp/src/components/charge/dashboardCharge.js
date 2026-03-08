// src/components/charge/dashboardCharge.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDemandesAConsigner } from '../../api/charge.api';
import { getNotificationsNonLues } from '../../api/notification.api';
import { getMe } from '../../api/auth.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const STATUT_CONFIG = {
  en_attente:      { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE' },
  en_cours:        { color: '#2d6a4f', bg: '#d8f3dc', label: 'EN COURS'   },
  consigne_charge: { color: '#1565C0', bg: '#E3F2FD', label: 'CONSIGNÉ'   },
  consigne_process:{ color: '#6A1B9A', bg: '#F3E5F5', label: 'PROCESS'    },
  consigne:        { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉ ✓' },
  cloturee:        { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE'   },
};

// ✅ Formate la date : 24/03/2025
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
};

// ✅ Formate l'heure : 14:32:07
const fmtHeure = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`;
};

export default function DashboardCharge({ navigation }) {
  const [user, setUser]             = useState(null);
  const [demandes, setDemandes]     = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const chargerDonnees = useCallback(async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));

      const meRes = await getMe();
      if (meRes?.success && meRes?.data) {
        setUser(meRes.data);
        await AsyncStorage.setItem('user', JSON.stringify(meRes.data));
      }

      const [demandesRes, notifsRes] = await Promise.all([
        getDemandesAConsigner(),
        getNotificationsNonLues(),
      ]);

      if (demandesRes?.success) setDemandes(demandesRes.data   || []);
      if (notifsRes?.success)   setNotifCount(notifsRes.data?.length || 0);
    } catch (e) {
      console.error('Dashboard charge error:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    chargerDonnees();
    const interval = setInterval(async () => {
      try {
        const res = await getNotificationsNonLues();
        if (res?.success) setNotifCount(res.data?.length || 0);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [chargerDonnees]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', chargerDonnees);
    return unsub;
  }, [navigation, chargerDonnees]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    chargerDonnees();
  }, [chargerDonnees]);

  const stats = {
    en_attente: demandes.filter(d => d.statut === 'en_attente').length,
    en_cours:   demandes.filter(d => d.statut === 'en_cours').length,
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />
        }
      >
        {/* ── Header ── */}
        <View style={[S.header, { backgroundColor: CFG.couleur }]}>
          <View style={S.headerDecoCircle} />
          <View style={S.headerGreetRow}>
            <Ionicons name="sunny-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={S.headerBonjour}> BONJOUR</Text>
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

        {/* ── Stats ── */}
        <View style={S.statsRow}>
          {[
            { label: 'En attente', value: stats.en_attente, color: '#F59E0B', icon: 'time-outline'          },
            { label: 'En cours',   value: stats.en_cours,   color: CFG.couleur, icon: 'sync-outline'        },
            { label: 'Total',      value: demandes.length,  color: '#6B7280',   icon: 'list-circle-outline' },
          ].map((s, i) => (
            <View key={i} style={S.statCard}>
              <Ionicons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
              <Text style={[S.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={S.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Actions rapides ── */}
        <Text style={S.sectionTitle}>Actions rapides</Text>
        <View style={S.actionsGrid}>
          {[
            { icon: 'list-outline',          label: 'Demandes',      sub: `${demandes.length} à traiter`,  screen: 'DashboardCharge' },
            { icon: 'time-outline',          label: 'Historique',    sub: 'Mes consignations',              screen: 'Historique'      },
            { icon: 'notifications-outline', label: 'Notifications', sub: `${notifCount} non lues`,         screen: 'Notifications'   },
            { icon: 'person-outline',        label: 'Mon profil',    sub: 'Mes informations',               screen: 'Profil'          },
          ].map((a, i) => (
            <TouchableOpacity
              key={i}
              style={S.actionCard}
              onPress={() => navigation.navigate(a.screen)}
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

        {/* ── Liste demandes ── */}
        <Text style={S.sectionTitle}>Demandes à consigner</Text>

        {demandes.length === 0 ? (
          <View style={S.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={48} color={CFG.bg} />
            <Text style={S.emptyTxt}>Aucune demande en attente</Text>
          </View>
        ) : (
          demandes.map((d, i) => {
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
                  <Text style={S.demandeTag}>{d.tag} — {d.equipement_nom}</Text>
                  <Text style={S.demandeLot}>LOT : {d.lot_code}</Text>
                  <Text style={S.demandeDemandeur}>Par : {d.demandeur_nom}</Text>

                  {/* ✅ Date + Heure sur deux lignes */}
                  <View style={S.dateHeureWrap}>
                    <Ionicons name="calendar-outline" size={10} color="#BDBDBD" />
                    <Text style={S.demandeDate}> {fmtDate(d.created_at)}</Text>
                    <View style={S.separateur} />
                    <Ionicons name="time-outline" size={10} color="#BDBDBD" />
                    <Text style={S.demandeHeure}> {fmtHeure(d.created_at)}</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[S.statutTxt, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    paddingTop: 50, paddingBottom: 30,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
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
    width: 16, height: 16, alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },

  statsRow: {
    flexDirection: 'row', gap: 10,
    marginHorizontal: 16, marginTop: -20, marginBottom: 16,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    alignItems: 'center', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  statVal: { fontSize: 22, fontWeight: '900' },
  statLbl: { fontSize: 9, color: '#9E9E9E', marginTop: 2, textAlign: 'center' },

  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: '#424242',
    marginHorizontal: 16, marginBottom: 10, marginTop: 4,
  },

  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: 16, gap: 10, marginBottom: 16,
  },
  actionCard: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 14, width: '47%', alignItems: 'center',
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
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
    elevation: 3, shadowColor: '#000',
    shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  demandeIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  demandeNumero:    { fontSize: 13, fontWeight: '800', color: '#212121' },
  demandeTag:       { fontSize: 11, color: '#424242', marginTop: 2 },
  demandeLot:       { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  demandeDemandeur: { fontSize: 10, color: '#9E9E9E' },

  // ✅ Ligne date + heure inline
  dateHeureWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 4, flexWrap: 'wrap',
  },
  demandeDate:  { fontSize: 10, color: '#BDBDBD' },
  demandeHeure: { fontSize: 10, color: '#BDBDBD', fontWeight: '600' },
  separateur: {
    width: 1, height: 10,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 6,
  },

  statutBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statutTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt:  { color: '#9E9E9E', marginTop: 12, fontSize: 14 },
});