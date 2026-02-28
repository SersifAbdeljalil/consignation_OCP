// src/components/process/dashboardProcess.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDemandesProcess } from '../../api/process.api';
import { getNotifications } from '../../api/notification.api';

const CFG = {
  couleur:     '#b45309',
  couleurDark: '#92400e',
  bg:          '#fef3c7',
  bgPale:      '#fde68a',
};

const STATUT_CONFIG = {
  en_attente: { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',  icon: 'time-outline'         },
  en_cours:   { color: '#b45309', bg: '#fde68a', label: 'EN COURS',    icon: 'sync-outline'         },
  consigne:   { color: '#10B981', bg: '#D1FAE5', label: 'CONSIGNÉ',    icon: 'lock-closed-outline'  },
  rejetee:    { color: '#EF4444', bg: '#FEE2E2', label: 'REFUSÉE',     icon: 'close-circle-outline' },
  cloturee:   { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',    icon: 'archive-outline'      },
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

export default function DashboardProcess({ navigation }) {
  const [demandes,   setDemandes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user,       setUser]       = useState(null);
  const [notifCount, setNotifCount] = useState(0);
  const [filtre,     setFiltre]     = useState(null);

  const charger = useCallback(async () => {
    try {
      const [resD, resN, userStr] = await Promise.all([
        getDemandesProcess(),
        getNotifications(),
        AsyncStorage.getItem('user'),
      ]);
      if (resD?.success) setDemandes(resD.data || []);
      if (resN?.success) setNotifCount((resN.data || []).filter(n => !n.lu).length);
      if (userStr) setUser(JSON.parse(userStr));
    } catch (e) {
      console.error('DashboardProcess error:', e?.message || e);
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

  const onRefresh = () => { setRefreshing(true); charger(); };

  const donneesFiltrees = filtre
    ? demandes.filter(d => d.statut === filtre)
    : demandes;

  const stats = {
    total:     demandes.length,
    enAttente: demandes.filter(d => d.statut === 'en_attente').length,
    enCours:   demandes.filter(d => d.statut === 'en_cours').length,
    consigne:  demandes.filter(d => d.statut === 'consigne').length,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  const renderCard = ({ item }) => {
    const cfg = STATUT_CONFIG[item.statut] || STATUT_CONFIG.en_attente;
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailConsignationProcess', { demande: item })}
      >
        <View style={S.cardTop}>
          <View style={S.cardLeft}>
            <View style={[S.cardIcon, { backgroundColor: CFG.bg }]}>
              <Ionicons name="cog-outline" size={18} color={CFG.couleur} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={S.cardNumero}>{item.numero_ordre}</Text>
              <Text style={S.cardTag}>{item.tag} — {item.equipement_nom}</Text>
            </View>
          </View>
          <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={10} color={cfg.color} style={{ marginRight: 3 }} />
            <Text style={[S.statutTxt, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        <View style={S.infoRow}>
          <Ionicons name="layers-outline" size={12} color="#9E9E9E" />
          <Text style={S.infoTxt}>LOT : {item.lot_code || '—'}</Text>
          <View style={S.sep} />
          <Ionicons name="person-outline" size={12} color="#9E9E9E" />
          <Text style={S.infoTxt} numberOfLines={1}>{item.demandeur_nom || '—'}</Text>
        </View>

        <View style={S.infoRow}>
          <Ionicons name="calendar-outline" size={12} color="#9E9E9E" />
          <Text style={S.infoTxt}>{fmtDate(item.created_at)}</Text>
        </View>

        {item.types_intervenants?.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {item.types_intervenants.map((t, i) => (
              <View key={i} style={[
                S.typeChip,
                t === 'process' && { backgroundColor: CFG.bg, borderColor: CFG.couleur },
              ]}>
                <Text style={[
                  S.typeChipTxt,
                  t === 'process' && { color: CFG.couleur },
                ]}>{TYPE_LABEL[t] || t}</Text>
              </View>
            ))}
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
        <View style={S.headerDecoCircle} />
        <View style={S.headerGreetRow}>
          <Ionicons name="sunny-outline" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={S.headerBonjour}> BONJOUR</Text>
        </View>
        <Text style={S.headerNom}>{user?.prenom} {user?.nom}</Text>
        <View style={S.headerRoleRow}>
          <Ionicons name="cog-outline" size={11} color="rgba(255,255,255,0.7)" />
          <Text style={S.headerRole}> CHEF PROCESS</Text>
        </View>
        <TouchableOpacity
          style={S.notifBtn}
          onPress={() => navigation.navigate('NotificationsProcess')}
        >
          <Ionicons name="notifications-outline" size={22} color="#fff" />
          {notifCount > 0 && (
            <View style={S.notifBadge}>
              <Text style={S.notifBadgeTxt}>{notifCount > 9 ? '9+' : notifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={S.statsRow}>
        {[
          { label: 'En attente', value: stats.enAttente, color: '#F59E0B', icon: 'time-outline'          },
          { label: 'En cours',   value: stats.enCours,   color: CFG.couleur, icon: 'sync-outline'        },
          { label: 'Total',      value: stats.total,     color: '#6B7280',   icon: 'list-circle-outline' },
        ].map((s, i) => (
          <View key={i} style={S.statCard}>
            <Ionicons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
            <Text style={[S.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={S.statLbl}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Actions rapides */}
      <Text style={S.sectionTitle}>Actions rapides</Text>
      <View style={S.actionsGrid}>
        {[
          { icon: 'list-outline',          label: 'Demandes',      sub: `${demandes.length} à traiter`,  screen: 'DashboardProcess'    },
          { icon: 'time-outline',          label: 'Historique',    sub: 'Mes interventions',              screen: 'HistoriqueProcess'   },
          { icon: 'notifications-outline', label: 'Notifications', sub: `${notifCount} non lues`,         screen: 'NotificationsProcess'},
          { icon: 'person-outline',        label: 'Mon profil',    sub: 'Mes informations',               screen: 'Profil'              },
        ].map((a, i) => (
          <TouchableOpacity
            key={i}
            style={S.actionCard}
            onPress={() => navigation.navigate(a.screen)}
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

      {/* Filtres */}
      <View style={S.filtresWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8, flexDirection: 'row', paddingVertical: 10 }}>
          {[
            { key: null,         label: 'Tout',      icon: 'list-outline'         },
            { key: 'en_attente', label: 'Attente',   icon: 'time-outline'         },
            { key: 'en_cours',   label: 'En cours',  icon: 'sync-outline'         },
            { key: 'consigne',   label: 'Consignés', icon: 'lock-closed-outline'  },
          ].map(f => (
            <TouchableOpacity
              key={f.key ?? 'all'}
              style={[S.chip, filtre === f.key && { backgroundColor: CFG.couleur, borderColor: CFG.couleur }]}
              onPress={() => setFiltre(f.key)}
            >
              <Ionicons name={f.icon} size={12} color={filtre === f.key ? '#fff' : '#9E9E9E'} style={{ marginRight: 4 }} />
              <Text style={[S.chipTxt, filtre === f.key && { color: '#fff' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Liste demandes */}
      <Text style={[S.sectionTitle, { marginTop: 8 }]}>Demandes process</Text>

      {donneesFiltrees.length === 0 ? (
        <View style={S.emptyWrap}>
          <Ionicons name="cog-outline" size={56} color={CFG.bg} />
          <Text style={S.emptyTitle}>Aucune demande process</Text>
          <Text style={S.emptySub}>Les demandes avec points process apparaîtront ici</Text>
        </View>
      ) : (
        <FlatList
          data={donneesFiltrees}
          keyExtractor={item => item.id.toString()}
          renderItem={renderCard}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />}
          showsVerticalScrollIndicator={false}
        />
      )}
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

  filtresWrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  chip:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#fff' },
  chipTxt:     { fontSize: 12, fontWeight: '600', color: '#9E9E9E' },

  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  cardLeft:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10, marginRight: 8 },
  cardIcon:    { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardNumero:  { fontSize: 13, fontWeight: '800', color: '#212121' },
  cardTag:     { fontSize: 11, color: '#424242', marginTop: 2 },
  statutBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  statutTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  infoTxt:     { fontSize: 11, color: '#9E9E9E' },
  sep:         { width: 1, height: 10, backgroundColor: '#E0E0E0', marginHorizontal: 6 },
  typeChip:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#F5F5F5' },
  typeChipTxt: { fontSize: 10, fontWeight: '700', color: '#9E9E9E' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingTop: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});