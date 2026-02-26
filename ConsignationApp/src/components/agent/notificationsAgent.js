// src/components/agent/notificationsAgent.js
// Navigation : clic notif → DetailDemande si lien_ref = demande/<id>
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, RADIUS, SHADOW } from '../../styles/variables.css';
import {
  getNotifications,
  marquerLue,
  marquerToutesLues,
} from '../../api/notification.api';
import { getDemandeById } from '../../api/demande.api';

// ── Config types notifs ───────────────────────
const TYPE_CONFIG = {
  demande:      { icon: 'document-text-outline',    color: COLORS.green,              bg: COLORS.greenPale },
  validation:   { icon: 'checkmark-circle-outline', color: COLORS.statut.validee,     bg: '#D1FAE5'         },
  execution:    { icon: 'flash-outline',            color: COLORS.statut.en_attente,  bg: '#FFF3CD'         },
  autorisation: { icon: 'shield-checkmark-outline', color: COLORS.green,              bg: COLORS.greenPale  },
  intervention: { icon: 'hammer-outline',           color: '#8B5CF6',                 bg: '#EDE9FE'         },
  rejet:        { icon: 'close-circle-outline',     color: COLORS.statut.rejetee,     bg: '#FEE2E2'         },
  plan:         { icon: 'clipboard-outline',        color: COLORS.statut.en_cours,    bg: COLORS.bluePale   },
};

const fmtDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const dt   = new Date(d);
  const diff = Math.floor((now - dt) / 60000);
  if (diff < 1)    return "À l'instant";
  if (diff < 60)   return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

export default function NotificationsAgent({ navigation }) {
  const [notifs,       setNotifs]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [marquantTout, setMarquantTout] = useState(false);
  const [navLoading,   setNavLoading]   = useState(null); // id notif en cours

  const charger = useCallback(async () => {
    try {
      const res = await getNotifications();
      if (res?.success) setNotifs(res.data || []);
    } catch (e) {
      console.error('NotificationsAgent error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  // ── Clic notif → naviguer vers DetailDemande ──
  const handlePress = async (notif) => {
    // 1. Marquer comme lue
    if (!notif.lu) {
      try {
        await marquerLue(notif.id);
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, lu: 1 } : n));
      } catch {}
    }

    // 2. Extraire ID demande depuis lien_ref
    const lien = notif.lien_ref || notif.lien || '';
    if (!lien.startsWith('demande/')) return;

    const demandeId = parseInt(lien.split('/')[1]);
    if (!demandeId || isNaN(demandeId)) return;

    setNavLoading(notif.id);
    try {
      const res = await getDemandeById(demandeId);
      if (res?.success && res?.data) {
        navigation.navigate('DetailDemandes', { demande: res.data });
      } else {
        // Fallback : naviguer avec juste l'ID, le composant chargera lui-même
        navigation.navigate('DetailDemandes', { demande: { id: demandeId } });
      }
    } catch (e) {
      console.error('Nav notif agent error:', e?.message);
      navigation.navigate('DetailDemandes', { demande: { id: demandeId } });
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.green} />
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
          !item.lu && S.notifCardUnread,
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
        <View style={{ flex: 1, marginLeft: SPACE.md }}>
          <Text style={[S.notifTitre, !item.lu && S.notifTitreUnread]}>
            {item.titre}
          </Text>
          <Text style={S.notifMsg} numberOfLines={2}>{item.message}</Text>
          <View style={S.notifMeta}>
            <Ionicons name="time-outline" size={11} color={COLORS.gray} />
            <Text style={S.notifDate}>{fmtDate(item.created_at)}</Text>
            {/* Badge "Voir détail" si lien disponible */}
            {hasLien && (
              <View style={S.lienBadge}>
                <Ionicons name="arrow-forward-circle-outline" size={11} color={COLORS.green} />
                <Text style={S.lienBadgeTxt}>Voir détail</Text>
              </View>
            )}
          </View>
        </View>

        {/* Point non lu */}
        {!item.lu && <View style={S.dot} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: COLORS.green }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Notifications</Text>
          {nonLues > 0 && (
            <Text style={S.hSub}>{nonLues} non lue{nonLues > 1 ? 's' : ''}</Text>
          )}
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

      {/* ── Stats bar ── */}
      <View style={[S.statsBar, { backgroundColor: COLORS.green }]}>
        {[
          { lbl: 'Total',    val: notifs.length,          icon: 'notifications-outline'  },
          { lbl: 'Non lues', val: nonLues,                icon: 'ellipse'                },
          { lbl: 'Lues',     val: notifs.length - nonLues, icon: 'checkmark-done-outline' },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* ── Liste ── */}
      {notifs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-off-outline" size={56} color={COLORS.grayMedium} />
          <Text style={{ color: COLORS.gray, marginTop: SPACE.md, fontSize: FONTS.size.base }}>
            Aucune notification
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
              colors={[COLORS.green]}
            />
          }
          contentContainerStyle={{ padding: SPACE.base, gap: SPACE.sm, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  // ── Header ──────────────────────────────────
  header: {
    paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: SPACE.base,
    flexDirection: 'row', alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  hTitle:     { color: COLORS.white, fontSize: FONTS.size.xl, fontWeight: FONTS.weight.bold },
  hSub:       { color: 'rgba(255,255,255,0.75)', fontSize: FONTS.size.xs, marginTop: 2 },
  markAllBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Stats bar ────────────────────────────────
  statsBar: {
    flexDirection: 'row',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal:  { color: COLORS.white, fontSize: FONTS.size.xxl, fontWeight: FONTS.weight.black },
  statLbl:  { color: 'rgba(255,255,255,0.75)', fontSize: FONTS.size.xs - 1, marginTop: 2 },

  // ── Notif card ───────────────────────────────
  notifCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.base,
    flexDirection: 'row', alignItems: 'center',
    ...SHADOW.sm,
  },
  notifCardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
  },
  notifIcon: {
    width: 44, height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
  },
  notifTitre:      { fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep },
  notifTitreUnread:{ fontWeight: FONTS.weight.extrabold },
  notifMsg:        { fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 3, lineHeight: 16 },
  notifMeta:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.xs },
  notifDate:       { fontSize: FONTS.size.xs - 1, color: COLORS.gray, flex: 1 },
  dot: {
    width: 8, height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.green,
    marginLeft: SPACE.sm,
  },

  // ── Badge "Voir détail" ──────────────────────
  lienBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.greenPale,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.sm, paddingVertical: 2,
  },
  lienBadgeTxt: { fontSize: 9, fontWeight: FONTS.weight.bold, color: COLORS.green },
});