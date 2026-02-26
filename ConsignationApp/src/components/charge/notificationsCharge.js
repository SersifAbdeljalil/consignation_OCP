// src/components/charge/notificationsCharge.js
// MODIFIÉ : clic notif → redirection vers DetailConsignation si lien_ref = demande/<id>
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotifications,
  marquerLue,
  marquerToutesLues,
} from '../../api/notification.api';
import { getDemandesAConsigner, getDemandeDetail } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const TYPE_CONFIG = {
  demande:      { icon: 'document-text-outline',    color: '#2d6a4f', bg: '#d8f3dc' },
  validation:   { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#D1FAE5' },
  execution:    { icon: 'flash-outline',            color: '#F59E0B', bg: '#FFF3CD' },
  autorisation: { icon: 'shield-checkmark-outline', color: '#2d6a4f', bg: '#d8f3dc' },
  intervention: { icon: 'hammer-outline',           color: '#8B5CF6', bg: '#EDE9FE' },
  rejet:        { icon: 'close-circle-outline',     color: '#EF4444', bg: '#FEE2E2' },
  plan:         { icon: 'clipboard-outline',        color: '#3B82F6', bg: '#DBEAFE' },
};

const fmtDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const dt   = new Date(d);
  const diff = Math.floor((now - dt) / 60000);
  if (diff < 1)    return 'À l\'instant';
  if (diff < 60)   return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

export default function NotificationsCharge({ navigation }) {
  const [notifs,       setNotifs]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [marquantTout, setMarquantTout] = useState(false);
  const [navLoading,   setNavLoading]   = useState(null); // id notif en cours de navigation

  const charger = useCallback(async () => {
    try {
      const notifsRes = await getNotifications();
      if (notifsRes?.success) setNotifs(notifsRes.data || []);
    } catch (e) {
      console.error('NotificationsCharge error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // ── Clic sur une notification → naviguer vers le bon écran ──
  const handlePress = async (notif) => {
    // 1. Marquer comme lue
    if (!notif.lu) {
      try {
        await marquerLue(notif.id);
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lu: 1 } : n));
      } catch {}
    }

    // 2. Extraire l'ID de demande depuis lien_ref ("demande/42" ou "demande/42")
    const lien = notif.lien_ref || notif.lien || '';
    if (!lien.startsWith('demande/')) return; // pas de lien vers une demande

    const demandeId = parseInt(lien.split('/')[1]);
    if (!demandeId || isNaN(demandeId)) return;

    // 3. Charger le détail de la demande puis naviguer
    setNavLoading(notif.id);
    try {
      const res = await getDemandeDetail(demandeId);
      if (res?.success && res?.data?.demande) {
        navigation.navigate('DetailConsignation', { demande: res.data.demande });
      } else {
        // Fallback : naviguer avec juste l'ID si la requête échoue
        navigation.navigate('DetailConsignation', { demande: { id: demandeId } });
      }
    } catch (e) {
      console.error('Nav notif error:', e?.message);
      navigation.navigate('DetailConsignation', { demande: { id: demandeId } });
    } finally {
      setNavLoading(null);
    }
  };

  const handleMarquerTout = async () => {
    setMarquantTout(true);
    try {
      await marquerToutesLues();
      setNotifs(prev => prev.map(n => ({ ...n, lu: 1 })));
    } catch {}
    setMarquantTout(false);
  };

  const nonLues = notifs.filter(n => !n.lu).length;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  const renderItem = ({ item }) => {
    const cfg          = TYPE_CONFIG[item.type] || TYPE_CONFIG.demande;
    const isNavLoading = navLoading === item.id;
    const hasLien      = (item.lien_ref || item.lien || '').startsWith('demande/');

    return (
      <TouchableOpacity
        style={[
          S.notifCard,
          !item.lu && { borderLeftWidth: 3, borderLeftColor: CFG.couleur },
          isNavLoading && { opacity: 0.7 },
        ]}
        onPress={() => handlePress(item)}
        activeOpacity={0.85}
        disabled={isNavLoading}
      >
        {/* Icône type */}
        <View style={[S.notifIcon, { backgroundColor: cfg.bg }]}>
          {isNavLoading
            ? <ActivityIndicator size="small" color={cfg.color} />
            : <Ionicons name={cfg.icon} size={20} color={cfg.color} />
          }
        </View>

        {/* Contenu */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[S.notifTitre, !item.lu && { fontWeight: '800' }]}>{item.titre}</Text>
          <Text style={S.notifMsg} numberOfLines={2}>{item.message}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
            <Text style={S.notifDate}>{fmtDate(item.created_at)}</Text>
            {/* Indicateur "Voir détail" si lien disponible */}
            {hasLien && (
              <View style={S.lienBadge}>
                <Ionicons name="arrow-forward-circle-outline" size={11} color={CFG.couleur} />
                <Text style={S.lienBadgeTxt}>Voir détail</Text>
              </View>
            )}
          </View>
        </View>

        {!item.lu && <View style={[S.dot, { backgroundColor: CFG.couleur }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Notifications</Text>
          {nonLues > 0 && <Text style={S.hSub}>{nonLues} non lue{nonLues > 1 ? 's' : ''}</Text>}
        </View>
        {nonLues > 0 ? (
          <TouchableOpacity style={S.markAllBtn} onPress={handleMarquerTout} disabled={marquantTout}>
            {marquantTout
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
            }
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      {/* Stats */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { lbl: 'Total',    val: notifs.length },
          { lbl: 'Non lues', val: nonLues        },
          { lbl: 'Lues',     val: notifs.length - nonLues },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {notifs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-off-outline" size={56} color={CFG.bg} />
          <Text style={{ color: '#9E9E9E', marginTop: 12, fontSize: 15 }}>Aucune notification</Text>
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); charger(); }}
              colors={[CFG.couleur]}
            />
          }
          contentContainerStyle={{ padding: 14, gap: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  header:     { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:    { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  markAllBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  statsBar:  { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20 },
  statItem:  { flex: 1, alignItems: 'center' },
  statVal:   { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLbl:   { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 },

  notifCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 1 },
  },
  notifIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitre: { fontSize: 13, fontWeight: '600', color: '#212121' },
  notifMsg:   { fontSize: 11, color: '#9E9E9E', marginTop: 3, lineHeight: 16 },
  notifDate:  { fontSize: 10, color: '#BDBDBD' },
  dot:        { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },

  // ── NOUVEAU : badge "Voir détail" ──
  lienBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: CFG.bgPale, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  lienBadgeTxt: { fontSize: 9, fontWeight: '700', color: CFG.couleur },
});