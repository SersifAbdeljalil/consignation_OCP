// src/components/chefIntervenant/notifications.js
// ══════════════════════════════════════════════════════════════
// MODIFICATION : handleModalNavigate gère maintenant 2 types de liens :
//   - demande/:id  → DetailConsignation
//   - equipe/:id   → ScanBadge (nouveau flux enregistrement équipe)
// FIX HEURE : fmtDate utilise timeZone: 'Africa/Casablanca' pour l'heure Maroc
// ══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, Modal, ScrollView, Animated,
  TouchableWithoutFeedback, Dimensions, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotifications,
  marquerCommeLue,
  marquerToutesLues,
  supprimerNotification,
} from '../../api/notification.api';
import { getMesDemandes } from '../../api/intervenant.api';

const { height: SCREEN_H } = Dimensions.get('window');

const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bgPale:      '#E3F2FD',
  bgMedium:    '#BBDEFB',
};

const TYPE_CONFIG = {
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

// ✅ FIX HEURE MAROC : durées relatives + date absolue en fuseau Africa/Casablanca
const fmtDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const dt   = new Date(d);
  const diff = Math.floor((now - dt) / 1000);
  if (diff < 60)    return "À l'instant";
  if (diff < 3600)  return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return new Date(d).toLocaleString('fr-MA', { timeZone: 'Africa/Casablanca' });
};

// ── Modale preview ─────────────────────────────────────────────
function NotifModal({ notif, visible, onClose, onNavigate }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!notif) return null;
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.default;

  const lien    = notif.lien_ref || notif.lien || '';
  const hasLien = lien.startsWith('demande/') || lien.startsWith('equipe/');

  const btnLabel = lien.startsWith('equipe/')
    ? '👷 Enregistrer mon équipe'
    : 'Voir le détail';
  const btnIcon = lien.startsWith('equipe/')
    ? 'people-outline'
    : 'arrow-forward-circle-outline';

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[MS.backdrop, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View style={[MS.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={MS.handle} />

        <View style={[MS.mHeader, { backgroundColor: cfg.bg }]}>
          <View style={[MS.mIconWrap, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={28} color={cfg.color} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[MS.mTitre, { color: cfg.color }]} numberOfLines={2}>{notif.titre}</Text>
            <View style={MS.mDateRow}>
              <Ionicons name="time-outline" size={11} color="#9E9E9E" />
              <Text style={MS.mDate}>{fmtDate(notif.created_at)}</Text>
              {!notif.lu && (
                <View style={[MS.mBadge, { backgroundColor: CFG.couleur }]}>
                  <Text style={MS.mBadgeTxt}>NON LUE</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={MS.mCloseBtn}>
            <Ionicons name="close" size={20} color="#9E9E9E" />
          </TouchableOpacity>
        </View>

        <ScrollView style={MS.mScroll} contentContainerStyle={MS.mScrollContent} showsVerticalScrollIndicator={false}>
          <View style={MS.section}>
            <Text style={MS.sectionLabel}>MESSAGE</Text>
            <Text style={MS.sectionContent}>{notif.message}</Text>
          </View>
          <View style={MS.section}>
            <Text style={MS.sectionLabel}>TYPE</Text>
            <View style={[MS.typePill, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
              <Ionicons name={cfg.icon} size={13} color={cfg.color} />
              <Text style={[MS.typePillTxt, { color: cfg.color }]}>
                {notif.type?.replace(/_/g, ' ').toUpperCase() || 'GÉNÉRAL'}
              </Text>
            </View>
          </View>
          {(notif.lien_ref || notif.lien) && (
            <View style={MS.section}>
              <Text style={MS.sectionLabel}>RÉFÉRENCE</Text>
              <Text style={MS.sectionContent}>{notif.lien_ref || notif.lien}</Text>
            </View>
          )}
          <View style={MS.section}>
            <Text style={MS.sectionLabel}>DATE</Text>
            <Text style={MS.sectionContent}>{fmtDate(notif.created_at)}</Text>
          </View>
        </ScrollView>

        <View style={MS.mActions}>
          {hasLien && (
            <TouchableOpacity
              style={[MS.btnPrimary, { backgroundColor: lien.startsWith('equipe/') ? '#2E7D32' : CFG.couleur }]}
              onPress={() => onNavigate(notif)}
              activeOpacity={0.85}
            >
              <Ionicons name={btnIcon} size={18} color="#fff" />
              <Text style={MS.btnPrimaryTxt}>{btnLabel}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={MS.btnSecondary} onPress={onClose}>
            <Text style={MS.btnSecondaryTxt}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── Composant principal ────────────────────────────────────────
export default function NotificationsChef({ navigation }) {
  const [notifs,        setNotifs]        = useState([]);
  const [demandes,      setDemandes]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [marquantTout,  setMarquantTout]  = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [modalVisible,  setModalVisible]  = useState(false);

  const itemAnims = useRef({});
  const getAnim = (id) => {
    if (!itemAnims.current[id]) itemAnims.current[id] = new Animated.Value(0);
    return itemAnims.current[id];
  };

  const charger = useCallback(async () => {
    try {
      const [notifsRes, demandesRes] = await Promise.all([
        getNotifications(),
        getMesDemandes(),
      ]);
      if (notifsRes?.success) {
        const data = notifsRes.data || [];
        setNotifs(data);
        data.forEach((item, i) => {
          const a = getAnim(item.id);
          a.setValue(0);
          Animated.timing(a, { toValue: 1, duration: 280, delay: i * 45, useNativeDriver: true }).start();
        });
      }
      if (demandesRes?.success) setDemandes(demandesRes.data || []);
    } catch (e) {
      console.error('NotificationsChef error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation]);

  const handlePress = async (notif) => {
    if (!notif.lu) {
      try {
        await marquerCommeLue(notif.id);
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lu: 1 } : n));
      } catch {}
    }
    setSelectedNotif({ ...notif, lu: 1 });
    setModalVisible(true);
  };

  const handleModalNavigate = (notif) => {
    setModalVisible(false);
    const lien = notif.lien_ref || notif.lien || '';

    // ── Cas 1 : lien vers enregistrement équipe ──────────────
    if (lien.startsWith('equipe/')) {
      const demandeId = parseInt(lien.replace('equipe/', ''), 10);
      if (!demandeId) return;

      const demandeComplete = demandes.find(d => d.id == demandeId);
      if (demandeComplete) {
        navigation.navigate('GestionEquipe', { demande: demandeComplete });
      } else {
        navigation.navigate('GestionEquipe', { demande: { id: demandeId } });
      }
      return;
    }

    // ── Cas 2 : lien vers détail consignation ────────────────
    if (lien.startsWith('demande/')) {
      const demandeId = parseInt(lien.replace('demande/', ''), 10);
      if (!demandeId) return;

      const demandeComplete = demandes.find(d => d.id == demandeId);
      if (demandeComplete) {
        navigation.navigate('DetailConsignation', { demande: demandeComplete });
      } else {
        Alert.alert(
          'Information',
          "Cette consignation ne concerne pas votre corps de métier ou n'est plus disponible.",
          [{ text: 'OK' }]
        );
      }
      return;
    }
  };

  const handleLongPress = (notif) => {
    Alert.alert(
      'Supprimer la notification',
      'Êtes-vous sûr de vouloir supprimer cette notification ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const anim = getAnim(notif.id);
            Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(async () => {
              try { await supprimerNotification(notif.id); } catch {}
              setNotifs(prev => prev.filter(n => n.id !== notif.id));
            });
          },
        },
      ]
    );
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
    const cfg      = TYPE_CONFIG[item.type] || TYPE_CONFIG.default;
    const anim     = getAnim(item.id);
    const lien     = item.lien_ref || item.lien || '';
    const hasLien  = lien.startsWith('demande/') || lien.startsWith('equipe/');
    const isEquipe = lien.startsWith('equipe/');

    return (
      <Animated.View style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}>
        <TouchableOpacity
          style={[S.notifCard, !item.lu && { borderLeftWidth: 3, borderLeftColor: CFG.couleur, backgroundColor: '#F8FBFF' }]}
          onPress={() => handlePress(item)}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={450}
          activeOpacity={0.82}
        >
          {!item.lu && <View style={[S.unreadDot, { backgroundColor: CFG.couleur }]} />}
          <View style={[S.notifIcon, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[S.notifTitre, !item.lu && { color: '#212121', fontWeight: '800' }]} numberOfLines={1}>
              {item.titre}
            </Text>
            <Text style={S.notifMsg} numberOfLines={2}>{item.message}</Text>
            <View style={S.notifMeta}>
              <Ionicons name="time-outline" size={11} color="#BDBDBD" />
              <Text style={S.notifDate}>{fmtDate(item.created_at)}</Text>
              {hasLien && (
                <View style={[S.lienBadge, { backgroundColor: isEquipe ? '#E8F5E9' : CFG.bgPale }]}>
                  <Ionicons
                    name={isEquipe ? 'people-outline' : 'arrow-forward-circle-outline'}
                    size={11}
                    color={isEquipe ? '#2E7D32' : CFG.couleur}
                  />
                  <Text style={[S.lienBadgeTxt, { color: isEquipe ? '#2E7D32' : CFG.couleur }]}>
                    {isEquipe ? 'Entrer équipe' : 'Voir détail'}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={item.lu ? '#BDBDBD' : CFG.couleur} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </Animated.View>
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
          { lbl: 'Total',           val: notifs.length },
          { lbl: 'Non lues',        val: nonLues },
          { lbl: '⚡ Consignations', val: notifs.filter(n => n.type === 'intervention').length },
          { lbl: 'Lues',            val: notifs.filter(n => n.lu).length },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      <View style={S.tipRow}>
        <Ionicons name="information-circle-outline" size={13} color="#BDBDBD" />
        <Text style={S.tipTxt}>Tapez pour voir • Appui long pour supprimer</Text>
      </View>

      {notifs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <View style={[S.emptyCircle, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="notifications-off-outline" size={40} color={CFG.couleur} />
          </View>
          <Text style={S.emptyTitle}>Aucune notification</Text>
          <Text style={S.emptySub}>
            Vous serez notifié ⚡ dès qu'une consignation{'\n'}concerne votre corps de métier
          </Text>
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
              tintColor={CFG.couleur}
            />
          }
          contentContainerStyle={{ padding: 14, paddingBottom: 50 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <NotifModal
        notif={selectedNotif}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onNavigate={handleModalNavigate}
      />
    </View>
  );
}

const S = StyleSheet.create({
  header:       { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  backBtn:      { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:       { color: '#fff', fontSize: 19, fontWeight: '800' },
  hSub:         { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  markAllBtn:   { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statsBar:     { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 18, paddingTop: 4 },
  statItem:     { flex: 1, alignItems: 'center', gap: 3 },
  statVal:      { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLbl:      { color: 'rgba(255,255,255,0.7)', fontSize: 8, textAlign: 'center' },
  tipRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8 },
  tipTxt:       { fontSize: 10, color: '#BDBDBD', fontStyle: 'italic' },
  notifCard:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, position: 'relative' },
  unreadDot:    { position: 'absolute', top: 10, right: 12, width: 8, height: 8, borderRadius: 4 },
  notifIcon:    { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifTitre:   { fontSize: 14, fontWeight: '700', color: '#424242', marginBottom: 3 },
  notifMsg:     { fontSize: 13, color: '#616161', lineHeight: 18 },
  notifMeta:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  notifDate:    { fontSize: 10, color: '#BDBDBD' },
  lienBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  lienBadgeTxt: { fontSize: 9, fontWeight: '700' },
  emptyCircle:  { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:   { fontSize: 17, fontWeight: '700', color: '#424242' },
  emptySub:     { fontSize: 13, color: '#9E9E9E', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});

const MS = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_H * 0.82, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } }, android: { elevation: 16 } }) },
  handle:         { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  mHeader:        { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, margin: 14, marginBottom: 8 },
  mIconWrap:      { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mTitre:         { fontSize: 15, fontWeight: '800' },
  mDateRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  mDate:          { fontSize: 11, color: '#9E9E9E', flex: 1 },
  mBadge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  mBadgeTxt:      { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  mCloseBtn:      { width: 30, height: 30, backgroundColor: '#F5F5F5', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  mScroll:        { flex: 1 },
  mScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  section:        { marginBottom: 18 },
  sectionLabel:   { fontSize: 10, fontWeight: '800', color: '#BDBDBD', letterSpacing: 1, marginBottom: 6 },
  sectionContent: { fontSize: 13, color: '#424242', lineHeight: 21, backgroundColor: '#F8F8F8', borderRadius: 10, padding: 12 },
  typePill:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  typePillTxt:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  mActions:       { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  btnPrimary:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  btnPrimaryTxt:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnSecondary:   { alignItems: 'center', borderRadius: 14, paddingVertical: 12, backgroundColor: '#F5F5F5' },
  btnSecondaryTxt:{ fontSize: 14, fontWeight: '600', color: '#757575' },
});