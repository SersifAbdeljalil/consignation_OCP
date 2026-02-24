// src/components/chefIntervenant/notifications.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMe } from '../../api/auth.api';
import {
  getNotifications,
  marquerCommeLue,
  marquerToutesLues,
  supprimerNotification,
} from '../../api/notification.api';
import { getMesDemandes } from '../../api/intervenant.api';

// ✅ Couleur FIXE bleue pour TOUS les chefs
const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
  label:       'Intervenant',
};

const NOTIF_STYLE = {
  demande:        { icon: 'document-text-outline',    color: '#1565C0', bg: '#E3F2FD' },
  intervention:   { icon: 'flash-outline',            color: '#F57F17', bg: '#FFFDE7' },
  validation:     { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#ECFDF5' },
  rejet:          { icon: 'close-circle-outline',     color: '#EF4444', bg: '#FEF2F2' },
  plan:           { icon: 'clipboard-outline',        color: '#6A1B9A', bg: '#F3E5F5' },
  execution:      { icon: 'build-outline',            color: '#1565C0', bg: '#E3F2FD' },
  autorisation:   { icon: 'shield-checkmark-outline', color: '#2E7D32', bg: '#E8F5E9' },
  deconsignation: { icon: 'lock-open-outline',        color: '#E65100', bg: '#FFF3E0' },
  remise_service: { icon: 'power-outline',            color: '#2E7D32', bg: '#E8F5E9' },
  default:        { icon: 'notifications-outline',    color: '#9E9E9E', bg: '#F5F5F5' },
};

const fmtDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const dt   = new Date(d);
  const diff = Math.floor((now - dt) / 1000);
  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')} à ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

export default function NotificationsChef({ navigation }) {
  const [notifs, setNotifs]         = useState([]);
  const [demandes, setDemandes]     = useState([]); // ✅ cache des demandes complètes
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Chargement ──────────────────────────────
  const charger = async () => {
    try {
      const [notifsRes, demandesRes] = await Promise.all([
        getNotifications(),
        getMesDemandes(), // ✅ charger toutes les demandes pour la navigation
      ]);
      if (notifsRes?.success)   setNotifs(notifsRes.data     || []);
      if (demandesRes?.success) setDemandes(demandesRes.data || []);
    } catch (e) {
      console.error('Notifications error:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { charger(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation]);

  const onRefresh = useCallback(() => { setRefreshing(true); charger(); }, []);

  // ── Marquer une notif lue + navigation ──────
  const handleLire = async (notif) => {
    if (!notif.lu) {
      try {
        await marquerCommeLue(notif.id);
        setNotifs(p => p.map(n => n.id === notif.id ? { ...n, lu: 1 } : n));
      } catch (e) { console.error(e); }
    }

    // ✅ FIX : extraire l'ID depuis lien_ref et trouver la demande complète
    const lien = notif.lien || notif.lien_ref || '';
    if (lien) {
      const demandeId = parseInt(lien.replace('demande/', ''), 10);
      if (demandeId) {
        // Chercher la demande complète dans le cache local
        const demandeComplete = demandes.find(d => d.id === demandeId);
        if (demandeComplete) {
          navigation.navigate('DetailConsignation', { demande: demandeComplete });
        } else {
          // Demande pas dans mes demandes → afficher un message
          Alert.alert(
            'Information',
            'Cette consignation ne concerne pas votre corps de métier ou n\'est plus disponible.',
            [{ text: 'OK' }]
          );
        }
      }
    }
  };

  // ── Tout marquer lu ─────────────────────────
  const handleToutesLues = async () => {
    try {
      await marquerToutesLues();
      setNotifs(p => p.map(n => ({ ...n, lu: 1 })));
    } catch (e) { console.error(e); }
  };

  // ── Supprimer ───────────────────────────────
  const handleSupprimer = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette notification ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await supprimerNotification(id);
          setNotifs(p => p.filter(n => n.id !== id));
        } catch (e) { console.error(e); }
      }},
    ]);
  };

  const nonLues = notifs.filter(n => !n.lu).length;

  // ── Card ─────────────────────────────────────
  const renderNotif = ({ item }) => {
    const style = NOTIF_STYLE[item.type] || NOTIF_STYLE.default;
    const isNew = !item.lu;
    const lien  = item.lien || item.lien_ref || '';

    return (
      <TouchableOpacity
        style={[S.card, isNew && { borderLeftWidth: 3, borderLeftColor: CFG.couleur, backgroundColor: '#F8FBFF' }]}
        onPress={() => handleLire(item)}
        onLongPress={() => handleSupprimer(item.id)}
        activeOpacity={0.8}
      >
        {isNew && <View style={[S.unreadDot, { backgroundColor: CFG.couleur }]} />}

        <View style={[S.iconWrap, { backgroundColor: style.bg }]}>
          <Ionicons name={style.icon} size={22} color={style.color} />
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[S.notifTitre, isNew && { color: '#212121', fontWeight: '800' }]}>
            {item.titre}
          </Text>
          <Text style={S.notifMsg} numberOfLines={2}>{item.message}</Text>
          <Text style={S.notifDate}>{fmtDate(item.created_at)}</Text>
        </View>

        {lien ? (
          <Ionicons name="chevron-forward" size={16} color={CFG.couleur} style={{ marginLeft: 6 }} />
        ) : null}
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
          {nonLues > 0 && (
            <Text style={S.hSub}>{nonLues} non lue{nonLues > 1 ? 's' : ''}</Text>
          )}
        </View>
        {nonLues > 0 ? (
          <TouchableOpacity style={S.toutLuBtn} onPress={handleToutesLues}>
            <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Stats bar */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { val: notifs.length,                                        icon: 'notifications-outline',  lbl: 'Total'          },
          { val: nonLues,                                              icon: 'alert-circle-outline',   lbl: 'Non lues'       },
          { val: notifs.filter(n => n.type === 'intervention').length, icon: 'flash-outline',          lbl: '⚡ Consignations'},
          { val: notifs.filter(n => n.lu).length,                     icon: 'checkmark-done-outline', lbl: 'Lues'           },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Ionicons name={s.icon} size={13} color="rgba(255,255,255,0.75)" />
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Astuce */}
      {notifs.length > 0 && (
        <View style={S.tipRow}>
          <Ionicons name="hand-left-outline" size={12} color="#9E9E9E" />
          <Text style={S.tipTxt}>Appui long pour supprimer • Tapez pour voir le détail</Text>
        </View>
      )}

      {/* Liste */}
      {loading
        ? <ActivityIndicator color={CFG.couleur} size="large" style={{ marginTop: 50 }} />
        : <FlatList
            data={notifs}
            keyExtractor={i => i.id.toString()}
            renderItem={renderNotif}
            contentContainerStyle={{ padding: 14, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[CFG.couleur]}
                tintColor={CFG.couleur}
              />
            }
            ListEmptyComponent={
              <View style={S.emptyWrap}>
                <View style={[S.emptyCircle, { backgroundColor: CFG.bg }]}>
                  <Ionicons name="notifications-off-outline" size={40} color={CFG.couleur} />
                </View>
                <Text style={S.emptyTitle}>Aucune notification</Text>
                <Text style={S.emptySub}>
                  Vous serez notifié ⚡ dès qu'une consignation{'\n'}
                  concerne votre corps de métier
                </Text>
              </View>
            }
          />
      }
    </View>
  );
}

const S = StyleSheet.create({
  header:    { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:    { color: '#fff', fontSize: 19, fontWeight: '800' },
  hSub:      { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  toutLuBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statsBar:  { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 18, paddingTop: 4 },
  statItem:  { flex: 1, alignItems: 'center', gap: 3 },
  statVal:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLbl:   { color: 'rgba(255,255,255,0.7)', fontSize: 8, textAlign: 'center' },
  tipRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  tipTxt:    { fontSize: 11, color: '#BDBDBD', fontStyle: 'italic' },
  card:      { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, position: 'relative' },
  unreadDot: { position: 'absolute', top: 10, right: 12, width: 8, height: 8, borderRadius: 4 },
  iconWrap:  { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifTitre:{ fontSize: 14, fontWeight: '700', color: '#424242', marginBottom: 3 },
  notifMsg:  { fontSize: 13, color: '#616161', lineHeight: 18 },
  notifDate: { fontSize: 10, color: '#BDBDBD', marginTop: 5 },
  emptyWrap:   { alignItems: 'center', paddingTop: 70, paddingHorizontal: 36 },
  emptyCircle: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: '#424242' },
  emptySub:    { fontSize: 13, color: '#9E9E9E', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});