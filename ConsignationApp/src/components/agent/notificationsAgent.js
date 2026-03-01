// src/components/agent/notificationsAgent.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  StyleSheet, Modal, ScrollView, Animated,
  TouchableWithoutFeedback, Dimensions, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import {
  getNotifications,
  marquerLue,
  marquerToutesLues,
  supprimerNotification,
} from '../../api/notification.api';

const { height: SCREEN_H } = Dimensions.get('window');

const TYPE_CONFIG = {
  demande:      { icon: 'document-text-outline',    color: COLORS.green,              bg: COLORS.greenPale },
  validation:   { icon: 'checkmark-circle-outline', color: COLORS.statut.validee,     bg: '#D1FAE5'        },
  execution:    { icon: 'flash-outline',            color: COLORS.statut.en_attente,  bg: '#FFF3CD'        },
  autorisation: { icon: 'shield-checkmark-outline', color: COLORS.green,              bg: COLORS.greenPale },
  intervention: { icon: 'hammer-outline',           color: '#8B5CF6',                 bg: '#EDE9FE'        },
  rejet:        { icon: 'close-circle-outline',     color: COLORS.statut.rejetee,     bg: '#FEE2E2'        },
  plan:         { icon: 'clipboard-outline',        color: COLORS.statut.en_cours,    bg: COLORS.bluePale  },
};

const fmtDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const dt   = new Date(d);
  const diff = Math.floor((now - dt) / 1000);
  if (diff < 60)    return "À l'instant";
  if (diff < 3600)  return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
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
  const cfg     = TYPE_CONFIG[notif.type] || TYPE_CONFIG.demande;
  const hasLien = (notif.lien_ref || notif.lien || '').startsWith('demande/');

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
              <Ionicons name="time-outline" size={11} color={COLORS.gray} />
              <Text style={MS.mDate}>{fmtDate(notif.created_at)}</Text>
              {!notif.lu && (
                <View style={[MS.mBadge, { backgroundColor: COLORS.green }]}>
                  <Text style={MS.mBadgeTxt}>NON LUE</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={MS.mCloseBtn}>
            <Ionicons name="close" size={20} color={COLORS.gray} />
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
              style={[MS.btnPrimary, { backgroundColor: COLORS.green }]}
              onPress={() => onNavigate(notif)}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
              <Text style={MS.btnPrimaryTxt}>Voir le détail</Text>
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
export default function NotificationsAgent({ navigation }) {
  const [notifs,        setNotifs]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [marquantTout,  setMarquantTout]  = useState(false);
  const [navLoading,    setNavLoading]    = useState(null);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [modalVisible,  setModalVisible]  = useState(false);

  const itemAnims = useRef({});
  const getAnim = (id) => {
    if (!itemAnims.current[id]) itemAnims.current[id] = new Animated.Value(0);
    return itemAnims.current[id];
  };

  const charger = useCallback(async () => {
    try {
      const res = await getNotifications();
      if (res?.success) {
        const data = res.data || [];
        setNotifs(data);
        data.forEach((item, i) => {
          const a = getAnim(item.id);
          a.setValue(0);
          Animated.timing(a, { toValue: 1, duration: 280, delay: i * 45, useNativeDriver: true }).start();
        });
      }
    } catch (e) {
      console.error('NotificationsAgent error:', e?.message);
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
    setSelectedNotif({ ...notif, lu: 1 });
    setModalVisible(true);
  };

  const handleModalNavigate = (notif) => {
    setModalVisible(false);
    const lien = notif.lien_ref || notif.lien || '';
    if (!lien.startsWith('demande/')) return;
    const demandeId = parseInt(lien.split('/')[1]);
    if (!demandeId || isNaN(demandeId)) return;
    navigation.navigate('DetailDemandes', { demande: { id: demandeId } });
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.green} />
      </View>
    );
  }

  const renderItem = ({ item }) => {
    const cfg          = TYPE_CONFIG[item.type] || TYPE_CONFIG.demande;
    const isNavLoading = navLoading === item.id;
    const anim         = getAnim(item.id);
    const hasLien      = (item.lien_ref || item.lien || '').startsWith('demande/');

    return (
      <Animated.View style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [18,0] }) }],
      }}>
        <TouchableOpacity
          style={[S.notifCard, !item.lu && S.notifCardUnread, isNavLoading && { opacity: 0.6 }]}
          onPress={() => handlePress(item)}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={450}
          activeOpacity={0.82}
          disabled={isNavLoading}
        >
          <View style={[S.notifIcon, { backgroundColor: cfg.bg }]}>
            {isNavLoading
              ? <ActivityIndicator size="small" color={cfg.color} />
              : <Ionicons name={cfg.icon} size={20} color={cfg.color} />
            }
          </View>
          <View style={{ flex: 1, marginLeft: SPACE.md }}>
            <Text style={[S.notifTitre, !item.lu && S.notifTitreUnread]} numberOfLines={1}>{item.titre}</Text>
            <Text style={S.notifMsg} numberOfLines={2}>{item.message}</Text>
            <View style={S.notifMeta}>
              <Ionicons name="time-outline" size={11} color={COLORS.gray} />
              <Text style={S.notifDate}>{fmtDate(item.created_at)}</Text>
              {hasLien && (
                <View style={S.lienBadge}>
                  <Ionicons name="arrow-forward-circle-outline" size={11} color={COLORS.green} />
                  <Text style={S.lienBadgeTxt}>Voir détail</Text>
                </View>
              )}
            </View>
          </View>
          {!item.lu && <View style={S.dot} />}
          <Ionicons name="chevron-forward" size={14} color={item.lu ? COLORS.grayMedium : COLORS.green} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Notifications</Text>
          {nonLues > 0 && <Text style={S.hSub}>{nonLues} non lue{nonLues > 1 ? 's' : ''}</Text>}
        </View>
        {nonLues > 0 ? (
          <TouchableOpacity style={S.markAllBtn} onPress={handleMarquerTout} disabled={marquantTout}>
            {marquantTout
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Ionicons name="checkmark-done-outline" size={20} color={COLORS.white} />
            }
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      <View style={[S.statsBar, { backgroundColor: COLORS.green }]}>
        {[
          { lbl: 'Total',    val: notifs.length           },
          { lbl: 'Non lues', val: nonLues                 },
          { lbl: 'Lues',     val: notifs.length - nonLues },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      <View style={S.tipRow}>
        <Ionicons name="information-circle-outline" size={13} color={COLORS.grayMedium} />
        <Text style={S.tipTxt}>Tapez pour voir • Appui long pour supprimer</Text>
      </View>

      {notifs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-off-outline" size={56} color={COLORS.grayMedium} />
          <Text style={{ color: COLORS.gray, marginTop: SPACE.md, fontSize: FONTS.size.base }}>Aucune notification</Text>
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); charger(); }} colors={[COLORS.green]} />}
          contentContainerStyle={{ padding: SPACE.base, gap: SPACE.sm, paddingBottom: 40 }}
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
  header:     { paddingTop: 50, paddingBottom: 14, paddingHorizontal: SPACE.base, flexDirection: 'row', alignItems: 'center' },
  backBtn:    { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  hTitle:     { color: COLORS.white, fontSize: FONTS.size.xl, fontWeight: FONTS.weight.bold },
  hSub:       { color: 'rgba(255,255,255,0.75)', fontSize: FONTS.size.xs, marginTop: 2 },
  markAllBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  statsBar:   { flexDirection: 'row', paddingVertical: SPACE.md, paddingHorizontal: SPACE.xl },
  statItem:   { flex: 1, alignItems: 'center' },
  statVal:    { color: COLORS.white, fontSize: FONTS.size.xxl, fontWeight: FONTS.weight.black },
  statLbl:    { color: 'rgba(255,255,255,0.75)', fontSize: FONTS.size.xs - 1, marginTop: 2 },
  tipRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACE.base, paddingVertical: SPACE.sm },
  tipTxt:     { fontSize: FONTS.size.xs - 1, color: COLORS.grayMedium, fontStyle: 'italic' },
  notifCard:         { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.base, flexDirection: 'row', alignItems: 'center', ...SHADOW.sm },
  notifCardUnread:   { borderLeftWidth: 3, borderLeftColor: COLORS.green },
  notifIcon:         { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  notifTitre:        { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep },
  notifTitreUnread:  { fontWeight: FONTS.weight.extrabold },
  notifMsg:          { fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 3, lineHeight: 16 },
  notifMeta:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.xs },
  notifDate:         { fontSize: FONTS.size.xs - 1, color: COLORS.gray, flex: 1 },
  dot:               { width: 8, height: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.green, marginLeft: SPACE.sm },
  lienBadge:         { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.greenPale, borderRadius: RADIUS.full, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  lienBadgeTxt:      { fontSize: 9, fontWeight: FONTS.weight.bold, color: COLORS.green },
});

const MS = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_H * 0.82, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } }, android: { elevation: 16 } }) },
  handle:         { width: 40, height: 4, backgroundColor: COLORS.grayMedium, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  mHeader:        { flexDirection: 'row', alignItems: 'center', padding: SPACE.base, borderRadius: RADIUS.lg, margin: SPACE.base, marginBottom: SPACE.sm },
  mIconWrap:      { width: 52, height: 52, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  mTitre:         { fontSize: FONTS.size.md, fontWeight: FONTS.weight.extrabold },
  mDateRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  mDate:          { fontSize: FONTS.size.xs, color: COLORS.gray, flex: 1 },
  mBadge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.sm },
  mBadgeTxt:      { fontSize: 9, fontWeight: FONTS.weight.black, color: COLORS.white, letterSpacing: 0.5 },
  mCloseBtn:      { width: 30, height: 30, backgroundColor: COLORS.grayLight, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  mScroll:        { flex: 1 },
  mScrollContent: { paddingHorizontal: SPACE.base, paddingTop: SPACE.sm, paddingBottom: SPACE.base },
  section:        { marginBottom: SPACE.lg },
  sectionLabel:   { fontSize: FONTS.size.xs - 1, fontWeight: FONTS.weight.black, color: COLORS.grayMedium, letterSpacing: 1, marginBottom: SPACE.sm },
  sectionContent: { fontSize: FONTS.size.sm, color: COLORS.grayDark, lineHeight: 22, backgroundColor: COLORS.grayLight, borderRadius: RADIUS.md, padding: SPACE.md },
  typePill:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  typePillTxt:    { fontSize: FONTS.size.xs, fontWeight: FONTS.weight.bold, letterSpacing: 0.5 },
  mActions:       { padding: SPACE.base, gap: SPACE.sm, borderTopWidth: 1, borderTopColor: COLORS.grayLight },
  btnPrimary:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, borderRadius: RADIUS.lg, paddingVertical: 14 },
  btnPrimaryTxt:  { fontSize: FONTS.size.md, fontWeight: FONTS.weight.extrabold, color: COLORS.white },
  btnSecondary:   { alignItems: 'center', borderRadius: RADIUS.lg, paddingVertical: 12, backgroundColor: COLORS.grayLight },
  btnSecondaryTxt:{ fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.gray },
});