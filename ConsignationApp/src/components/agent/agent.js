// src/components/agent/agent.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SPACE } from '../../styles/variables.css';
import { getMesDemandes } from '../../api/demande.api';
import { getNotificationsNonLues } from '../../api/notification.api';

// ── Couleurs statuts ──────────────────────────
const STATUT_CONFIG = {
  en_attente:  { color: COLORS.warning,  bg: '#FFF8E1', label: 'EN ATTENTE' },
  validee:     { color: COLORS.green,    bg: COLORS.greenPale, label: 'VALIDÉE' },
  rejetee:     { color: COLORS.error,    bg: '#FFEBEE', label: 'REJETÉE' },
  en_cours:    { color: COLORS.blue,     bg: COLORS.bluePale,  label: 'EN COURS' },
  deconsignee: { color: '#6A1B9A',       bg: '#F3E5F5', label: 'DÉCONSIGNÉE' },
  cloturee:    { color: COLORS.grayDark, bg: COLORS.grayLight, label: 'CLÔTURÉE' },
};

export default function Agent({ navigation }) {
  const [user, setUser]             = useState(null);
  const [demandes, setDemandes]     = useState([]);
  const [notifCount, setNotifCount] = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Charger données ─────────────────────────
  const chargerDonnees = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) setUser(JSON.parse(userStr));

      const [demandesRes, notifsRes] = await Promise.all([
        getMesDemandes(),
        getNotificationsNonLues(),
      ]);

      if (demandesRes.success) setDemandes(demandesRes.data);
      if (notifsRes.success)   setNotifCount(notifsRes.data?.length || 0);
    } catch (e) {
      console.error('Erreur chargement:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    chargerDonnees();
    // Polling notifications toutes les 30s
    const interval = setInterval(async () => {
      try {
        const res = await getNotificationsNonLues();
        if (res.success) setNotifCount(res.data?.length || 0);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    chargerDonnees();
  }, []);

  // ── Stats ────────────────────────────────────
  const stats = {
    en_attente: demandes.filter(d => d.statut === 'en_attente').length,
    validee:    demandes.filter(d => d.statut === 'validee').length,
    en_cours:   demandes.filter(d => d.statut === 'en_cours').length,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.green} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.green]} />}
      >
        {/* ── Header ── */}
        <View style={{
          backgroundColor: COLORS.green,
          paddingTop: 50, paddingBottom: 30,
          paddingHorizontal: SPACE.base,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
          overflow: 'hidden',
        }}>
          {/* Déco */}
          <View style={{ position: 'absolute', bottom: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.blue, opacity: 0.15 }} />

          <Text style={{ color: '#A5D6A7', fontSize: FONTS.size.xs, letterSpacing: 1 }}>BONJOUR 👋</Text>
          <Text style={{ color: COLORS.white, fontSize: FONTS.size.xxl, fontWeight: FONTS.weight.extrabold, marginVertical: 2 }}>
            {user?.prenom} {user?.nom}
          </Text>
          <Text style={{ color: '#A5D6A7', fontSize: FONTS.size.xs, letterSpacing: 1 }}>AGENT DE PRODUCTION</Text>

          {/* Bouton notif */}
          <TouchableOpacity
            style={{ position: 'absolute', top: 52, right: SPACE.base, width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color={COLORS.white} />
            {notifCount > 0 && (
              <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: COLORS.error, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: COLORS.white, fontSize: 9, fontWeight: '900' }}>{notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginHorizontal: SPACE.base, marginTop: -20, marginBottom: SPACE.base }}>
          {[
            { label: 'En attente', value: stats.en_attente, color: COLORS.warning },
            { label: 'Validées',   value: stats.validee,    color: COLORS.green },
            { label: 'En cours',   value: stats.en_cours,   color: COLORS.blue },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
              <Text style={{ fontSize: FONTS.size.xxl, fontWeight: FONTS.weight.black, color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 9, color: COLORS.gray, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Actions rapides ── */}
        <Text style={{ fontSize: FONTS.size.base, fontWeight: FONTS.weight.bold, color: COLORS.grayDeep, marginHorizontal: SPACE.base, marginBottom: SPACE.sm }}>
          Actions rapides
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: SPACE.base, gap: SPACE.sm, marginBottom: SPACE.base }}>
          {[
            { icon: 'add-circle-outline',     label: 'Nouvelle demande',  sub: 'Créer une consignation', color: COLORS.greenPale, screen: 'NouvelleDemande' },
            { icon: 'list-outline',            label: 'Mes demandes',      sub: 'Suivre l\'avancement',   color: COLORS.bluePale,  screen: 'MesDemandes' },
            { icon: 'notifications-outline',   label: 'Notifications',     sub: `${notifCount} non lues`, color: '#FFF8E1',         screen: 'Notifications' },
            { icon: 'person-outline',          label: 'Mon profil',        sub: 'Mes informations',       color: '#F3E5F5',         screen: 'Profil' },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              style={{ backgroundColor: COLORS.surface, borderRadius: 14, padding: SPACE.base, width: '47%', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.8}
            >
              <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: action.color, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm }}>
                <Ionicons name={action.icon} size={22} color={COLORS.green} />
              </View>
              <Text style={{ fontSize: FONTS.size.sm, fontWeight: FONTS.weight.semibold, color: COLORS.grayDeep, textAlign: 'center' }}>{action.label}</Text>
              <Text style={{ fontSize: FONTS.size.xs, color: COLORS.gray, textAlign: 'center', marginTop: 2 }}>{action.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Dernières demandes ── */}
        <Text style={{ fontSize: FONTS.size.base, fontWeight: FONTS.weight.bold, color: COLORS.grayDeep, marginHorizontal: SPACE.base, marginBottom: SPACE.sm }}>
          Dernières demandes
        </Text>
        {demandes.slice(0, 3).map((d, i) => {
          const cfg = STATUT_CONFIG[d.statut] || STATUT_CONFIG.en_attente;
          return (
            <TouchableOpacity
              key={i}
              style={{ backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACE.base, marginHorizontal: SPACE.base, marginBottom: SPACE.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
              onPress={() => navigation.navigate('MesDemandes')}
            >
              <View>
                <Text style={{ fontSize: FONTS.size.sm, fontWeight: FONTS.weight.extrabold, color: COLORS.grayDark }}>{d.numero_ordre}</Text>
                <Text style={{ fontSize: FONTS.size.xs, color: COLORS.gray, marginTop: 2 }}>{d.equipement_nom || 'Équipement'}</Text>
              </View>
              <View style={{ backgroundColor: cfg.bg, paddingHorizontal: SPACE.sm, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ fontSize: 9, fontWeight: FONTS.weight.bold, color: cfg.color, letterSpacing: 0.5 }}>{cfg.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {demandes.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: SPACE.xl }}>
            <Ionicons name="document-outline" size={40} color={COLORS.grayMedium} />
            <Text style={{ color: COLORS.gray, marginTop: SPACE.sm }}>Aucune demande pour le moment</Text>
          </View>
        )}

        <View style={{ height: SPACE.xxxl }} />
      </ScrollView>
    </View>
  );
}