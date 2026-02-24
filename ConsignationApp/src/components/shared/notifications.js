// src/components/shared/notifications.js
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

const COLORS = {
  green:     '#2E7D32',
  greenDark: '#1B5E20',
  greenPale: '#E8F5E9',
  gray:      '#9E9E9E',
};

// ── Config visuelle par type ──────────────────
const TYPE_CONFIG = {
  demande:        { icon: 'document-text-outline',    color: '#3B82F6', bg: '#EFF6FF' },
  validation:     { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#ECFDF5' },
  rejet:          { icon: 'close-circle-outline',     color: '#EF4444', bg: '#FEF2F2' },
  plan:           { icon: 'clipboard-outline',         color: '#8B5CF6', bg: '#F5F3FF' },
  execution:      { icon: 'flash-outline',             color: '#F59E0B', bg: '#FFFBEB' },
  autorisation:   { icon: 'shield-checkmark-outline', color: '#06B6D4', bg: '#ECFEFF' },
  intervention:   { icon: 'people-outline',            color: '#6366F1', bg: '#EEF2FF' },
  deconsignation: { icon: 'unlock-outline',            color: '#EC4899', bg: '#FDF2F8' },
  remise_service: { icon: 'power-outline',             color: '#14B8A6', bg: '#F0FDFA' },
};

// ── Parser lien_ref "demande/5" → { type, id } ─
const parseLienRef = (lienRef) => {
  if (!lienRef) return null;
  const parts = lienRef.split('/');
  if (parts.length !== 2) return null;
  const id = parseInt(parts[1]);
  if (isNaN(id)) return null;
  return { type: parts[0], id };
};

// ── Format date relative ──────────────────────
const formatDate = (d) => {
  if (!d) return '';
  const now  = new Date();
  const date = new Date(d);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60)    return 'À l\'instant';
  if (diff < 3600)  return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800)return `Il y a ${Math.floor(diff / 86400)} j`;

  return `${date.getDate().toString().padStart(2,'0')}/${
    (date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
};

export default function Notifications({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  // ── Charger notifications ─────────────────
  const charger = async () => {
    try {
      const res = await getNotifications();
      if (res.success) setNotifications(res.data);
    } catch (e) {
      console.error('charger notifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { charger(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger();
  }, []);

  // ── Clic notification → marquer lue + naviguer ─
  const handlePress = async (item) => {
    // 1. Marquer comme lue localement + API
    if (!item.lu) {
      try {
        await marquerCommeLue(item.id);
        setNotifications(prev =>
          prev.map(n => n.id === item.id ? { ...n, lu: 1 } : n)
        );
      } catch (e) {
        console.error('marquerCommeLue:', e);
      }
    }

    // 2. Parser le lien de référence
    if (!item.lien_ref) return;
    const parsed = parseLienRef(item.lien_ref);
    if (!parsed) return;

    // 3. Navigation selon le type
    // ✅ FIX : navigation directe dans le même stack
    switch (parsed.type) {
      case 'demande':
      case 'validation':
      case 'rejet':
      case 'execution':
      case 'deconsignation':
      case 'remise_service':
        navigation.navigate('DetailDemande', { id: parsed.id });
        break;

      case 'plan':
        // Si vous avez un écran DetailPlan, sinon fallback DetailDemande
        navigation.navigate('DetailDemande', { id: parsed.id });
        break;

      case 'autorisation':
      case 'intervention':
        // Si vous avez un écran DetailAutorisation, sinon fallback
        navigation.navigate('DetailDemande', { id: parsed.id });
        break;

      default:
        navigation.navigate('DetailDemande', { id: parsed.id });
    }
  };

  // ── Marquer toutes lues ───────────────────
  const handleToutesLues = async () => {
    try {
      await marquerToutesLues();
      setNotifications(prev => prev.map(n => ({ ...n, lu: 1 })));
    } catch (e) {
      console.error('marquerToutesLues:', e);
    }
  };

  // ── Supprimer (appui long) ────────────────
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
              console.error('supprimerNotification:', e);
            }
          },
        },
      ]
    );
  };

  const nonLues = notifications.filter(n => !n.lu).length;

  // ── Rendu d'une carte ─────────────────────
  const renderItem = ({ item }) => {
    const cfg    = TYPE_CONFIG[item.type] || TYPE_CONFIG.demande;
    const parsed = parseLienRef(item.lien_ref);
    const lienLabel = parsed
      ? `Voir ${parsed.type === 'demande' ? 'la demande' : parsed.type} #${parsed.id}`
      : null;

    return (
      <TouchableOpacity
        style={[S.card, !item.lu && S.cardNonLue, { borderLeftColor: cfg.color }]}
        onPress={() => handlePress(item)}
        onLongPress={() => handleSupprimer(item.id)}
        activeOpacity={0.75}
      >
        {/* Icône */}
        <View style={[S.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>

        {/* Contenu */}
        <View style={S.content}>
          {/* Ligne titre + date */}
          <View style={S.topRow}>
            <Text
              style={[S.titre, !item.lu && S.titreNonLu]}
              numberOfLines={1}
            >
              {item.titre}
            </Text>
            <Text style={S.date}>{formatDate(item.created_at)}</Text>
          </View>

          {/* Message */}
          <Text style={S.message} numberOfLines={2}>
            {item.message}
          </Text>

          {/* Lien cliquable */}
          {lienLabel && (
            <View style={S.lienRow}>
              <Ionicons
                name="arrow-forward-circle-outline"
                size={13}
                color={cfg.color}
              />
              <Text style={[S.lienText, { color: cfg.color }]}>
                {lienLabel}
              </Text>
            </View>
          )}
        </View>

        {/* Point non lu */}
        {!item.lu && (
          <View style={[S.dot, { backgroundColor: cfg.color }]} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      {/* ══ HEADER ══ */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Notifications</Text>
          <Text style={S.headerSub}>
            {nonLues > 0
              ? `${nonLues} non lue${nonLues > 1 ? 's' : ''}`
              : 'Tout est lu ✓'}
          </Text>
        </View>

        {/* Bouton tout marquer lu */}
        {nonLues > 0 ? (
          <TouchableOpacity style={S.toutLuBtn} onPress={handleToutesLues}>
            <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* ══ CONTENU ══ */}
      {loading ? (
        <View style={S.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={S.loadingText}>Chargement...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={S.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.green]}
              tintColor={COLORS.green}
            />
          }
          ListHeaderComponent={
            notifications.length > 0 ? (
              <Text style={S.hint}>
                💡 Appuyez longuement sur une notification pour la supprimer
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={S.empty}>
              <View style={S.emptyIconWrap}>
                <Ionicons name="notifications-off-outline" size={50} color="#BDBDBD" />
              </View>
              <Text style={S.emptyTitle}>Aucune notification</Text>
              <Text style={S.emptySub}>
                Vous serez notifié ici des mises à jour de vos demandes de consignation
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  // Header
  header: {
    backgroundColor: COLORS.green,
    paddingTop: 50, paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  toutLuBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub:   { color: '#A5D6A7', fontSize: 10, letterSpacing: 0.5, marginTop: 1 },

  // Loading
  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: COLORS.gray, fontSize: 13 },

  // Liste
  listContent: { padding: 14, paddingBottom: 40 },

  hint: {
    fontSize: 11, color: '#BDBDBD',
    textAlign: 'center',
    marginBottom: 12,
  },

  // Carte notification
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardNonLue: {
    backgroundColor: '#FAFFFE',
    elevation: 4,
    shadowOpacity: 0.08,
  },

  // Icône
  iconWrap: {
    width: 46, height: 46,
    borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // Contenu texte
  content: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  titre: {
    fontSize: 13, fontWeight: '600',
    color: '#616161', flex: 1,
  },
  titreNonLu: {
    fontWeight: '800', color: '#212121',
  },
  date: { fontSize: 10, color: '#BDBDBD', flexShrink: 0, marginTop: 1 },
  message: {
    fontSize: 12, color: '#757575',
    lineHeight: 17, marginBottom: 4,
  },

  // Lien navigation
  lienRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, marginTop: 4,
  },
  lienText: { fontSize: 11, fontWeight: '700' },

  // Point non lu
  dot: {
    width: 9, height: 9,
    borderRadius: 5,
    alignSelf: 'center',
    marginLeft: 4,
    flexShrink: 0,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 30,
  },
  emptyIconWrap: {
    width: 90, height: 90,
    borderRadius: 45,
    backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17, fontWeight: '700',
    color: '#424242', marginBottom: 8,
  },
  emptySub: {
    fontSize: 13, color: '#9E9E9E',
    textAlign: 'center', lineHeight: 20,
  },
});