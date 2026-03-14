// src/components/charge/listeDeconsignation.js
// ✅ Thème VERT unifié (#2d6a4f) — même couleur que tous les autres composants
// ✅ Navigation vers DetailDeconsignation au clic
// ✅ Auto-refresh 15s

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDemandesADeconsigner } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
  bgMedium:    '#b7e4c7',
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} | ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export default function ListeDeconsignation({ navigation }) {
  const [demandes,   setDemandes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef  = useRef(null);
  const isMountedRef = useRef(true);

  const charger = useCallback(async () => {
    try {
      const res = await getDemandesADeconsigner();
      if (res?.success && isMountedRef.current) setDemandes(res.data || []);
    } catch (e) {
      console.error('ListeDeconsignation error:', e?.message);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    charger();
    intervalRef.current = setInterval(charger, 15000);
    return () => {
      isMountedRef.current = false;
      clearInterval(intervalRef.current);
    };
  }, [charger]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    charger();
  }, [charger]);

  const renderCard = ({ item }) => {
    const estPret = [
      'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
      'deconsigne_intervent', 'deconsigne_process',
    ].includes(item.statut);

    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('DetailDeconsignation', { demande: item })}
      >
        <View style={S.cardTop}>
          <View style={[S.iconWrap, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="lock-open-outline" size={20} color={CFG.couleur} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.numero}>{item.numero_ordre}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
              <Text style={S.tag}>
                {item.tag || ''}{item.equipement_nom ? ` — ${item.equipement_nom}` : ''}
              </Text>
            </View>
            {item.lot_code && <Text style={S.lot}>LOT : {item.lot_code}</Text>}
            <Text style={S.demandeur}>Par : {item.demandeur_nom || '—'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="time-outline" size={11} color="#BDBDBD" />
              <Text style={S.date}> {fmtDate(item.updated_at)}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[S.statutBadge, {
              backgroundColor: estPret ? '#D1FAE5' : CFG.bgPale,
              borderColor:     estPret ? '#10B981' : CFG.couleur,
            }]}>
              <Ionicons
                name={estPret ? 'checkmark-circle-outline' : 'lock-open-outline'}
                size={10}
                color={estPret ? '#10B981' : CFG.couleur}
              />
              <Text style={[S.statutTxt, { color: estPret ? '#10B981' : CFG.couleur }]}>
                {estPret ? 'PRÊT' : 'À DÉCONSIGNER'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
          </View>
        </View>

        {item.types_intervenants?.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8, marginBottom: 4 }}>
            {item.types_intervenants.map((t, i) => (
              <View key={i} style={[S.typeChip, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
                <Text style={[S.typeChipTxt, { color: CFG.couleur }]}>
                  {t === 'genie_civil' ? 'GC' : t === 'mecanique' ? 'Méca' : t === 'electrique' ? 'Élec' : 'Process'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[S.actionBtn, { backgroundColor: CFG.couleur }]}
          onPress={() => navigation.navigate('DetailDeconsignation', { demande: item })}
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={16} color="#fff" />
          <Text style={S.actionBtnTxt}>Procéder à la déconsignation</Text>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Déconsignations</Text>
          <Text style={S.hSub}>
            {demandes.length} demande{demandes.length !== 1 ? 's' : ''} en attente
          </Text>
        </View>
        <TouchableOpacity
          style={S.refreshBtn}
          onPress={() => { setRefreshing(true); charger(); }}
        >
          <Ionicons name="refresh-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { lbl: 'En attente', val: demandes.length },
          { lbl: 'Demandées',  val: demandes.filter(d => d.deconsignation_demandee).length },
          { lbl: 'Prêtes',     val: demandes.filter(d => ['deconsigne_gc','deconsigne_mec','deconsigne_elec','deconsigne_intervent','deconsigne_process'].includes(d.statut)).length },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {demandes.length > 0 && (
        <View style={[S.infoBanner, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
          <Ionicons name="information-circle-outline" size={16} color={CFG.couleur} />
          <Text style={[S.infoBannerTxt, { color: CFG.couleurDark }]}>
            Scannez chaque cadenas électrique, puis validez avec votre badge.
          </Text>
        </View>
      )}

      {demandes.length === 0 ? (
        <View style={S.emptyWrap}>
          <View style={[S.emptyIcon, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="lock-open-outline" size={48} color={CFG.couleur} />
          </View>
          <Text style={S.emptyTitle}>Aucune déconsignation en attente</Text>
          <Text style={S.emptySub}>
            Les demandes de déconsignation apparaîtront ici dès que les agents les soumettent.
          </Text>
        </View>
      ) : (
        <FlatList
          data={demandes}
          keyExtractor={item => item.id.toString()}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  header:     { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:    { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:     { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  statsBar: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 20 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal:  { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLbl:  { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2, textAlign: 'center' },

  infoBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 10, borderRadius: 10, padding: 10, borderWidth: 1 },
  infoBannerTxt: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTop:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  iconWrap:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numero:    { fontSize: 13, fontWeight: '800', color: '#212121' },
  tag:       { fontSize: 11, color: '#2d6a4f', fontWeight: '600', marginLeft: 4 },
  lot:       { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  demandeur: { fontSize: 10, color: '#9E9E9E' },
  date:      { fontSize: 10, color: '#BDBDBD' },

  statutBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statutTxt:    { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  typeChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 9, fontWeight: '700' },

  actionBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  actionBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'center' },

  emptyWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyIcon:  { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#424242' },
  emptySub:   { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});