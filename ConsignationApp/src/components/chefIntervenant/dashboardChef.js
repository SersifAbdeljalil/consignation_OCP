// src/components/chefIntervenant/dashboardChef.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SPACE } from '../../styles/variables.css';
import { getMesDemandes } from '../../api/intervenant.api';
import { getNotificationsNonLues } from '../../api/notification.api';
import { getMe } from '../../api/auth.api';

// ✅ Couleur FIXE bleue pour TOUS les chefs — indépendant du type_metier
const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
};

// Label du métier (texte seulement, pas de couleur)
const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Travaux Mécaniques',
  electrique:  'Travaux Électriques',
  process:     'Process',
};

const STATUT_CONFIG = {
  en_attente:  { color: COLORS.warning,  bg: '#FFF8E1',        label: 'EN ATTENTE'  },
  validee:     { color: COLORS.green,    bg: COLORS.greenPale, label: 'VALIDÉE'     },
  rejetee:     { color: COLORS.error,    bg: '#FFEBEE',        label: 'REJETÉE'     },
  en_cours:    { color: COLORS.blue,     bg: COLORS.bluePale,  label: 'EN COURS'    },
  deconsignee: { color: '#6A1B9A',       bg: '#F3E5F5',        label: 'DÉCONSIGNÉE' },
  cloturee:    { color: COLORS.grayDark, bg: COLORS.grayLight, label: 'CLÔTURÉE'    },
};

export default function DashboardChef({ navigation }) {
  const [user, setUser]             = useState(null);
  const [demandes, setDemandes]     = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Label affiché dans le header selon le métier
  const metierLabel = TYPE_LABEL[user?.type_metier] || 'Intervenant';

  const chargerDonnees = useCallback(async () => {
    try {
      // Étape 1 : affichage immédiat depuis AsyncStorage
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));

      // Étape 2 : user frais depuis le serveur (source de vérité)
      const meRes = await getMe();
      if (meRes?.success && meRes?.data) {
        setUser(meRes.data);
        await AsyncStorage.setItem('user', JSON.stringify(meRes.data));
      }

      // Étape 3 : autres APIs en parallèle
      const [demandesRes, notifsRes] = await Promise.all([
        getMesDemandes(),
        getNotificationsNonLues(),
      ]);

      if (demandesRes?.success) setDemandes(demandesRes.data        || []);
      if (notifsRes?.success)   setNotifCount(notifsRes.data?.length || 0);

    } catch (e) {
      console.error('Erreur chargement dashboard:', e?.message || e);
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
    const unsubscribe = navigation.addListener('focus', chargerDonnees);
    return unsubscribe;
  }, [navigation, chargerDonnees]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    chargerDonnees();
  }, [chargerDonnees]);

  const stats = {
    en_attente: demandes.filter(d => d.statut === 'en_attente').length,
    validee:    demandes.filter(d => d.statut === 'validee').length,
    en_cours:   demandes.filter(d => d.statut === 'en_cours').length,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />
        }
      >
        {/* ── Header ── */}
        <View style={{
          backgroundColor: CFG.couleur,
          paddingTop: 50, paddingBottom: 30,
          paddingHorizontal: SPACE.base,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
          overflow: 'hidden',
        }}>
          <View style={{
            position: 'absolute', bottom: -30, right: -30,
            width: 120, height: 120, borderRadius: 60,
            backgroundColor: 'rgba(255,255,255,0.15)',
          }} />

          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, letterSpacing: 1 }}>
            BONJOUR 👋
          </Text>
          <Text style={{ color: COLORS.white, fontSize: FONTS.size.xxl, fontWeight: FONTS.weight.extrabold, marginVertical: 2 }}>
            {user?.prenom} {user?.nom}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FONTS.size.xs, letterSpacing: 1 }}>
            CHEF {metierLabel.toUpperCase()}
          </Text>

          {/* Bouton notifications */}
          <TouchableOpacity
            style={{
              position: 'absolute', top: 52, right: SPACE.base,
              width: 40, height: 40,
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: 12, alignItems: 'center', justifyContent: 'center',
            }}
            onPress={() => navigation.navigate('NotificationsChef')}
          >
            <Ionicons name="notifications-outline" size={22} color={COLORS.white} />
            {notifCount > 0 && (
              <View style={{
                position: 'absolute', top: -3, right: -3,
                backgroundColor: COLORS.error,
                borderRadius: 8, width: 16, height: 16,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: COLORS.white, fontSize: 9, fontWeight: '900' }}>
                  {notifCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={{
          flexDirection: 'row', gap: SPACE.sm,
          marginHorizontal: SPACE.base,
          marginTop: -20, marginBottom: SPACE.base,
        }}>
          {[
            { label: 'En attente', value: stats.en_attente, color: COLORS.warning },
            { label: 'Validées',   value: stats.validee,    color: COLORS.green   },
            { label: 'En cours',   value: stats.en_cours,   color: COLORS.blue    },
          ].map((s, i) => (
            <View key={i} style={{
              flex: 1, backgroundColor: COLORS.surface,
              borderRadius: 14, padding: 12, alignItems: 'center',
              elevation: 5, shadowColor: '#000',
              shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
            }}>
              <Text style={{ fontSize: FONTS.size.xxl, fontWeight: FONTS.weight.black, color: s.color }}>
                {s.value}
              </Text>
              <Text style={{ fontSize: 9, color: COLORS.gray, marginTop: 2, textAlign: 'center' }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Actions rapides ── */}
        <Text style={{
          fontSize: FONTS.size.base, fontWeight: FONTS.weight.bold,
          color: COLORS.grayDeep, marginHorizontal: SPACE.base, marginBottom: SPACE.sm,
        }}>
          Actions rapides
        </Text>

        <View style={{
          flexDirection: 'row', flexWrap: 'wrap',
          marginHorizontal: SPACE.base, gap: SPACE.sm, marginBottom: SPACE.base,
        }}>
          {[
            {
              icon: 'people-outline',
              label: 'Mon Équipe',
              sub: 'Gérer les intervenants',
              color: CFG.bg,
              screen: 'MonEquipe',
            },
            {
              icon: 'list-outline',
              label: 'Consignations',
              sub: `${demandes.length} me concernant`,
              color: COLORS.bluePale,
              screen: 'DashboardChef',
            },
            {
              icon: 'notifications-outline',
              label: 'Notifications',
              sub: `${notifCount} non lues`,
              color: '#FFF8E1',
              screen: 'NotificationsChef',
            },
            {
              icon: 'person-outline',
              label: 'Mon profil',
              sub: 'Mes informations',
              color: '#F3E5F5',
              screen: 'Profil',
            },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              style={{
                backgroundColor: COLORS.surface, borderRadius: 14,
                padding: SPACE.base, width: '47%', alignItems: 'center',
                elevation: 3, shadowColor: '#000',
                shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
              }}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.8}
            >
              <View style={{
                width: 46, height: 46, borderRadius: 23,
                backgroundColor: action.color,
                alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm,
              }}>
                <Ionicons name={action.icon} size={22} color={CFG.couleur} />
              </View>
              <Text style={{
                fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold,
                color: COLORS.grayDeep, textAlign: 'center',
              }}>{action.label}</Text>
              <Text style={{
                fontSize: FONTS.size.xs, color: COLORS.gray,
                textAlign: 'center', marginTop: 2,
              }}>{action.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Dernières consignations ── */}
        <Text style={{
          fontSize: FONTS.size.base, fontWeight: FONTS.weight.bold,
          color: COLORS.grayDeep, marginHorizontal: SPACE.base, marginBottom: SPACE.sm,
        }}>
          Dernières consignations
        </Text>

        {demandes.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: SPACE.xl }}>
            <Ionicons name="document-outline" size={40} color={COLORS.grayMedium} />
            <Text style={{ color: COLORS.gray, marginTop: SPACE.sm }}>
              Aucune consignation pour le moment
            </Text>
          </View>
        ) : (
          demandes.slice(0, 3).map((d, i) => {
            const cfgStatut = STATUT_CONFIG[d.statut] || STATUT_CONFIG.en_attente;
            return (
              <TouchableOpacity
                key={i}
                style={{
                  backgroundColor: COLORS.surface, borderRadius: 12,
                  padding: SPACE.base,
                  marginHorizontal: SPACE.base, marginBottom: SPACE.sm,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  elevation: 2, shadowColor: '#000',
                  shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
                }}
                onPress={() => navigation.navigate('DetailConsignation', { demande: d })}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{
                    fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDark,
                  }}>{d.numero_ordre}</Text>
                  <Text style={{
                    fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 2,
                  }} numberOfLines={1}>{d.equipement_nom || 'Équipement'}</Text>
                </View>
                <View style={{
                  backgroundColor: cfgStatut.bg,
                  paddingHorizontal: SPACE.sm, paddingVertical: 3, borderRadius: 10,
                }}>
                  <Text style={{
                    fontSize: 9, fontWeight: FONTS.weight.bold,
                    color: cfgStatut.color, letterSpacing: 0.5,
                  }}>{cfgStatut.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: SPACE.xxxl }} />
      </ScrollView>
    </View>
  );
}