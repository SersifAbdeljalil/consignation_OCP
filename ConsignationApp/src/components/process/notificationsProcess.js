// src/components/process/notificationsProcess.js
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
import { getDemandeDetailProcess } from '../../api/process.api';

const CFG = {
  couleur:     '#b45309',
  couleurDark: '#92400e',
  bg:          '#fef3c7',
  bgPale:      '#fde68a',
};

const TYPE_CONFIG = {
  demande:      { icon: 'document-text-outline',    color: '#b45309', bg: '#fef3c7' },
  validation:   { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#D1FAE5' },
  execution:    { icon: 'flash-outline',            color: '#F59E0B', bg: '#FFF3CD' },
  autorisation: { icon: 'shield-checkmark-outline', color: '#b45309', bg: '#fef3c7' },
  intervention: { icon: 'cog-outline',              color: '#b45309', bg: '#fef3c7' },
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

export default function NotificationsProcess({ navigation }) {
  const [notifs,       setNotifs]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [marquantTout, setMarquantTout] = useState(false);
  const [navLoading,   setNavLoading]   = useState(null);

  const charger = useCallback(async () => {
    try {
      const notifsRes = await getNotifications();
      if (notifsRes?.success) setNotifs(notifsRes.data || []);
    } catch (e) {
      console.error('NotificationsProcess error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const handlePress = async (notif) => {
    if (!notif.lu) {
      try {
        await marquerLue(notif.id);
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lu: 1 } : n));
      } catch {}
    }
    const lien = notif.lien_ref || notif.lien || '';
    if (!lien.startsWith('demande/')) return;
    const demandeId = parseInt(lien.split('/')[1]);
    if (!demandeId || isNaN(demandeId)) return;

    setNavLoading(notif.id);
    try {
      const res = await getDemandeDetailProcess(demandeId);
      if (res?.success && res?.data?.demande) {
        navigation.navigate('DetailConsignationProcess', { demande: res.data.demande });
      } else {
        navigation.navigate('DetailConsignationProcess', { demande: { id: demandeId } });
      }
    } catch {
      navigation.navigate('DetailConsignationProcess', { demande: { id: demandeId } });
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
        <View style={[S.notifIcon, { backgroundColor: cfg.bg }]}>
          {isNavLoading
            ? <ActivityIndicator size="small" color={cfg.color} />
            : <Ionicons name={cfg.icon} size={20} color={cfg.color} />
          }
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[S.notifTitre, !item.lu && { fontWeight: '800' }]}>{item.titre}</Text>
          <Text style={S.notifMsg} numberOfLines={2}>{item.message}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
            <Text style={S.notifDate}>{fmtDate(item.created_at)}</Text>
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
  statsBar:   { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20 },
  statItem:   { flex: 1, alignItems: 'center' },
  statVal:    { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLbl:    { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 },
  notifCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
  notifIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitre: { fontSize: 13, fontWeight: '600', color: '#212121' },
  notifMsg:   { fontSize: 11, color: '#9E9E9E', marginTop: 3, lineHeight: 16 },
  notifDate:  { fontSize: 10, color: '#BDBDBD' },
  dot:        { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  lienBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  lienBadgeTxt: { fontSize: 9, fontWeight: '700', color: '#b45309' },
});