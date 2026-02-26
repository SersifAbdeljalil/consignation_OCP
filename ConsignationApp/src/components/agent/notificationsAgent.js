

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator,
  Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getNotifications,
  marquerCommeLue,
  marquerToutesLues,
  supprimerNotification,
} from '../../api/notification.api';
import { getDemandeById } from '../../api/demande.api';

// ── Couleurs agent (même valeurs que variables.css, définies en interne) ──
const C = {
  green:     '#2E7D32',
  greenDark: '#1B5E20',
  greenPale: '#E8F5E9',
  blue:      '#1565C0',
  bluePale:  '#E3F2FD',
  gray:      '#9E9E9E',
  error:     '#C62828',
  warning:   '#F57F17',
  bg:        '#F5F7FA',
};

// ── Config visuelle par type (reprise de shared/notifications.js) ──
const TYPE_CONFIG = {
  demande:        { icon: 'document-text-outline',    color: C.blue,    bg: C.bluePale   },
  validation:     { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#ECFDF5'    },
  rejet:          { icon: 'close-circle-outline',     color: C.error,   bg: '#FFEBEE'    },
  plan:           { icon: 'clipboard-outline',        color: '#8B5CF6', bg: '#F5F3FF'    },
  execution:      { icon: 'flash-outline',            color: '#F59E0B', bg: '#FFFBEB'    },
  autorisation:   { icon: 'shield-checkmark-outline', color: '#06B6D4', bg: '#ECFEFF'    },
  intervention:   { icon: 'people-outline',           color: '#6366F1', bg: '#EEF2FF'    },
  deconsignation: { icon: 'unlock-outline',           color: '#EC4899', bg: '#FDF2F8'    },
  remise_service: { icon: 'power-outline',            color: '#14B8A6', bg: '#F0FDFA'    },
};

// ── Parser lien_ref "demande/5" → { type, id } (reprise de shared/notifications.js) ──
const parseLienRef = (lienRef) => {
  if (!lienRef) return null;
  const parts = lienRef.split('/');
  if (parts.length !== 2) return null;
  const id = parseInt(parts[1]);
  if (isNaN(id)) return null;
  return { type: parts[0], id };
};

// ── Format date relative (reprise de shared/notifications.js) ──
const formatDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const date = new Date(d);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)     return 'À l\'instant';
  if (diff < 3600)   return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
  return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
};

export default function NotificationsAgent({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [marquantTout,  setMarquantTout]  = useState(false);
  const [navLoading,    setNavLoading]    = useState(null); // id notif en cours

  // ── Charger ────────────────────────────────
  const charger = useCallback(async () => {
    try {
      const res = await getNotifications();
      if (res?.success) setNotifications(res.data || []);
    } catch (e) {
      console.error('NotificationsAgent charger:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger();
  }, [charger]);

  // ── Clic → marquer lue + naviguer ──────────
  const handlePress = async (item) => {
    // 1. Marquer comme lue
    if (!item.lu) {
      try {
        await marquerCommeLue(item.id);
        setNotifications(prev =>
          prev.map(n => n.id === item.id ? { ...n, lu: 1 } : n)
        );
      } catch (e) {
        console.error('marquerCommeLue:', e?.message);
      }
    }

    // 2. Parser le lien_ref
    if (!item.lien_ref) return;
    const parsed = parseLienRef(item.lien_ref);
    if (!parsed) return;

    // 3. Charger la demande depuis l'API puis naviguer
    setNavLoading(item.id);
    try {
      const res = await getDemandeById(parsed.id);
      if (res?.success && res?.data) {
        navigation.navigate('DetailDemande', { demande: res.data });
      } else {
        // Fallback : naviguer avec juste l'id
        navigation.navigate('DetailDemande', { id: parsed.id });
      }
    } catch {
      navigation.navigate('DetailDemande', { id: parsed.id });
    } finally {
      setNavLoading(null);
    }
  };

  // ── Appui long → supprimer (reprise de shared/notifications.js) ──
  const handleSupprimer = (id) => {
    Alert.alert(
      'Supprimer',
      'Supprimer cette notification ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerNotification(id);
              setNotifications(prev => prev.filter(n => n.id !== id));
            } catch (e) {
              console.error('supprimerNotification:', e?.message);
            }
          },
        },
      ]
    );
  };

  // ── Tout marquer lu ─────────────────────────
  const handleToutesLues = async () => {
    setMarquantTout(true);
    try {
      await marquerToutesLues();
      setNotifications(prev => prev.map(n => ({ ...n, lu: 1 })));
    } catch (e) {
      console.error('marquerToutesLues:', e?.message);
    } finally {
      setMarquantTout(false);
    }
  };

  const nonLues = notifications.filter(n => !n.lu).length;

  // ── Rendu carte (style notificationsCharge.js adapté) ──
  const renderItem = ({ item }) => {
    const cfg          = TYPE_CONFIG[item.type] || TYPE_CONFIG.demande;
    const parsed       = parseLienRef(item.lien_ref);
    const isNavLoading = navLoading === item.id;
    const lienLabel    = parsed
      ? `Voir ${parsed.type === 'demande' ? 'ma demande' : parsed.type} #${parsed.id}`
      : null;

    return (
      <TouchableOpacity
        style={[
          S.card,
          { borderLeftColor: cfg.color },
          !item.lu && S.cardNonLue,
          isNavLoading && { opacity: 0.7 },
        ]}
        onPress={() => handlePress(item)}
        onLongPress={() => handleSupprimer(item.id)}
        activeOpacity={0.8}
        disabled={isNavLoading}
      >
        {/* Icône */}
        <View style={[S.iconWrap, { backgroundColor: cfg.bg }]}>
          {isNavLoading
            ? <ActivityIndicator size="small" color={cfg.color} />
            : <Ionicons name={cfg.icon} size={22} color={cfg.color} />
          }
        </View>

        {/* Contenu */}
        <View style={S.content}>
          <View style={S.topRow}>
            <Text style={[S.titre, !item.lu && S.titreNonLu]} numberOfLines={1}>
              {item.titre}
            </Text>
            <Text style={S.date}>{formatDate(item.created_at)}</Text>
          </View>

          <Text style={S.message} numberOfLines={2}>{item.message}</Text>

          {/* Lien cliquable (style notificationsCharge) */}
          {lienLabel && (
            <View style={S.lienRow}>
              <Ionicons name="arrow-forward-circle-outline" size={13} color={C.green} />
              <Text style={S.lienTxt}>{lienLabel}</Text>
            </View>
          )}
        </View>

        {/* Point non-lu (couleur dynamique) */}
        {!item.lu && <View style={[S.dot, { backgroundColor: cfg.color }]} />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.greenDark} />

      {/* ── Header (style notificationsCharge) ── */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Notifications</Text>
          <Text style={S.hSub}>
            {nonLues > 0
              ? `${nonLues} non lue${nonLues > 1 ? 's' : ''}`
              : 'Tout est lu ✓'}
          </Text>
        </View>
        {nonLues > 0 ? (
          <TouchableOpacity style={S.markAllBtn} onPress={handleToutesLues} disabled={marquantTout}>
            {marquantTout
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
            }
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      {/* ── Stats bar (style notificationsCharge) ── */}
      <View style={S.statsBar}>
        {[
          { lbl: 'Total',    val: notifications.length           },
          { lbl: 'Non lues', val: nonLues                        },
          { lbl: 'Lues',     val: notifications.length - nonLues },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* ── Liste ou vide ── */}
      <FlatList
        data={notifications}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={S.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.green]} tintColor={C.green} />
        }
        ListHeaderComponent={
          notifications.length > 0
            ? <Text style={S.hint}>💡 Appuyez longuement pour supprimer</Text>
            : null
        }
        ListEmptyComponent={
          <View style={S.emptyWrap}>
            <View style={S.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={50} color="#BDBDBD" />
            </View>
            <Text style={S.emptyTitle}>Aucune notification</Text>
            <Text style={S.emptySub}>
              Vous serez notifié ici des mises à jour de vos demandes de consignation
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ══════════════════════════════════════════════
// STYLES — couleurs agent #2E7D32
// Structure identique à notificationsCharge.js
// ══════════════════════════════════════════════
const S = StyleSheet.create({
  // Header
  header: {
    backgroundColor: '#2E7D32',
    paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  hTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:       { color: '#A5D6A7', fontSize: 10, letterSpacing: 0.5, marginTop: 1 },
  markAllBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    paddingVertical: 12, paddingHorizontal: 20,
    backgroundColor: '#2E7D32',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal:  { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLbl:  { color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 },

  // Liste
  listContent: { padding: 14, paddingBottom: 40 },
  hint: { fontSize: 11, color: '#BDBDBD', textAlign: 'center', marginBottom: 12 },

  // Carte (même structure que notificationsCharge + shared/notifications)
  card: {
    backgroundColor: '#fff',
    borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 12, borderLeftWidth: 3, borderLeftColor: 'transparent',
    elevation: 2, shadowColor: '#000',
    shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardNonLue: { backgroundColor: '#FAFFFE', elevation: 4, shadowOpacity: 0.08 },

  iconWrap: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  content: { flex: 1 },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 4, gap: 8,
  },
  titre:      { fontSize: 13, fontWeight: '600', color: '#616161', flex: 1 },
  titreNonLu: { fontWeight: '800', color: '#212121' },
  date:       { fontSize: 10, color: '#BDBDBD', flexShrink: 0, marginTop: 1 },
  message:    { fontSize: 12, color: '#757575', lineHeight: 17, marginBottom: 4 },

  // Lien (style notificationsCharge lienBadge)
  lienRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  lienTxt: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },

  // Point non-lu
  dot: {
    width: 9, height: 9, borderRadius: 5,
    alignSelf: 'center', marginLeft: 4, flexShrink: 0,
  },

  // Empty state
  emptyWrap:     { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  emptyIconWrap: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#424242', marginBottom: 8 },
  emptySub:   { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20 },
});