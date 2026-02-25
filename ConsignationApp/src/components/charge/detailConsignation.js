// src/components/charge/detailConsignation.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDemandeDetail, demarrerConsignation } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

export default function DetailConsignation({ navigation, route }) {
  const { demande: demandeParam } = route.params;
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [starting, setStarting] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await getDemandeDetail(demandeParam.id);
      if (res?.success) setDetail(res.data);
    } catch (e) {
      console.error('DetailConsignation error:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [demandeParam.id]);

  useEffect(() => { charger(); }, [charger]);

  const dem    = detail?.demande || demandeParam;
  const points = detail?.points  || [];

  // ── Chargé commence directement — sans plan HSE requis ──
  const handleCommencer = async () => {
    Alert.alert(
      'Démarrer la consignation',
      `Démarrer la consignation de ${dem.tag} ?\n\nÉtapes :\n1. Scan badge personnel\n2. Pose cadenas + scan NFC\n3. Photo du départ\n4. Validation`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Démarrer',
          onPress: async () => {
            setStarting(true);
            try {
              await demarrerConsignation(demandeParam.id);
              navigation.navigate('ScanBadgeNFC', {
                demande: dem,
                points,
              });
            } catch (e) {
              Alert.alert('Erreur', 'Impossible de démarrer la consignation');
            } finally {
              setStarting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  const pointsConsignes = points.filter(p => p.numero_cadenas).length;
  const progress        = points.length > 0 ? pointsConsignes / points.length : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Détail Consignation</Text>
          <Text style={S.hSub}>{dem.numero_ordre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Infos demande ── */}
        <View style={S.card}>
          {[
            { icon: 'layers-outline',        lbl: 'LOT',          val: dem.lot_code || dem.lot       },
            { icon: 'hardware-chip-outline', lbl: 'TAG',          val: dem.tag                       },
            { icon: 'cube-outline',          lbl: 'Équipement',   val: dem.equipement_nom             },
            { icon: 'location-outline',      lbl: 'Localisation', val: dem.equipement_localisation    },
            { icon: 'person-outline',        lbl: 'Demandeur',    val: dem.demandeur_nom              },
            { icon: 'calendar-outline',      lbl: 'Date',         val: fmtDate(dem.created_at)        },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Ionicons name={r.icon} size={14} color={CFG.couleur} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal} numberOfLines={2}>{r.val || '—'}</Text>
            </View>
          ))}

          {/* Raison */}
          <View style={[S.raisonBox, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="document-text-outline" size={14} color={CFG.couleur} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[S.raisonLbl, { color: CFG.couleur }]}>Raison de l'intervention</Text>
              <Text style={S.raisonTxt}>{dem.raison || '—'}</Text>
            </View>
          </View>

          {/* Types intervenants */}
          {dem.types_intervenants?.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {dem.types_intervenants.map((t, i) => (
                <View key={i} style={[S.typeChip, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
                  <Text style={[S.typeChipTxt, { color: CFG.couleur }]}>{TYPE_LABEL[t] || t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Statut ── */}
        <View style={[S.card, { marginTop: 14 }]}>
          <View style={S.cardTitleRow}>
            <Ionicons name="pulse-outline" size={16} color={CFG.couleur} />
            <Text style={S.cardTitle}>Statut de la demande</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[S.statutDot, {
              backgroundColor: dem.statut === 'en_cours' ? '#10B981' : '#F59E0B',
            }]} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: dem.statut === 'en_cours' ? '#10B981' : '#F59E0B' }}>
              {dem.statut === 'en_cours' ? 'En cours de consignation' : 'En attente de consignation'}
            </Text>
          </View>
        </View>

        {/* ── Points de consignation (si existants en BDD) ── */}
        {points.length > 0 ? (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={S.cardTitleRow}>
                <Ionicons name="lock-closed-outline" size={16} color={CFG.couleur} />
                <Text style={S.cardTitle}>Points à consigner</Text>
              </View>
              <View style={[S.progressBadge, { backgroundColor: CFG.bgPale }]}>
                <Text style={[S.progressTxt, { color: CFG.couleur }]}>
                  {pointsConsignes}/{points.length}
                </Text>
              </View>
            </View>
            <View style={S.progressBar}>
              <View style={[S.progressFill, {
                width: `${progress * 100}%`,
                backgroundColor: progress === 1 ? '#10B981' : CFG.couleur,
              }]} />
            </View>
            {points.map((pt, i) => {
              const fait = !!pt.numero_cadenas;
              return (
                <View key={i} style={[S.pointRow, fait && { borderLeftColor: CFG.couleur, borderLeftWidth: 3 }]}>
                  <View style={[S.pointIcon, { backgroundColor: fait ? CFG.bgPale : '#F5F5F5' }]}>
                    <Ionicons
                      name={fait ? 'lock-closed' : 'lock-open-outline'}
                      size={16}
                      color={fait ? CFG.couleur : '#BDBDBD'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={S.pointRepere}>{pt.repere_point} — {pt.dispositif_condamnation}</Text>
                    <Text style={S.pointLocal}>{pt.localisation}</Text>
                    <Text style={S.pointEtat}>État requis : {pt.etat_requis}</Text>
                    {fait && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="checkmark-circle" size={11} color={CFG.couleur} />
                        <Text style={[S.pointCadenas, { color: CFG.couleur }]}>
                          {pt.numero_cadenas} | MCC: {pt.mcc_ref}
                        </Text>
                      </View>
                    )}
                  </View>
                  {fait
                    ? <Ionicons name="checkmark-circle" size={20} color={CFG.couleur} />
                    : <Ionicons name="ellipse-outline"  size={20} color="#BDBDBD" />
                  }
                </View>
              );
            })}
          </View>
        ) : (
          /* Aucun point prédéfini — le chargé les saisit lui-même */
          <View style={[S.card, S.infoCard, { marginTop: 14 }]}>
            <Ionicons name="create-outline" size={18} color={CFG.couleur} />
            <Text style={S.infoCardTxt}>
              Vous saisirez les références cadenas et MCC lors de l'étape de scan NFC.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ── Bouton COMMENCER — toujours visible, sans condition plan ── */}
      <View style={S.bottomBar}>
        <TouchableOpacity
          style={[S.btnCommencer, { backgroundColor: CFG.couleur }, starting && { opacity: 0.65 }]}
          onPress={handleCommencer}
          disabled={starting}
          activeOpacity={0.85}
        >
          {starting
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="play-circle-outline" size={22} color="#fff" />
                <Text style={S.btnCommencerTxt}>COMMENCER LA CONSIGNATION</Text>
              </>
            )
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  card: {
    backgroundColor: '#fff', marginHorizontal: 14,
    borderRadius: 16, padding: 16, elevation: 3,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#212121' },

  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:  { fontSize: 12, color: '#9E9E9E', width: 90 },
  infoVal:  { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },

  raisonBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, padding: 10, marginTop: 10 },
  raisonLbl: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  raisonTxt: { fontSize: 13, color: '#424242', lineHeight: 19 },

  typeChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 11, fontWeight: '700' },

  statutDot: { width: 10, height: 10, borderRadius: 5 },

  progressBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  progressTxt:   { fontSize: 12, fontWeight: '700' },
  progressBar:   { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },

  pointRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8,
  },
  pointIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere:  { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:   { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  pointEtat:    { fontSize: 10, color: '#BDBDBD' },
  pointCadenas: { fontSize: 10, fontWeight: '700' },

  infoCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FDF4' },
  infoCardTxt: { flex: 1, fontSize: 12, color: '#166534', lineHeight: 18 },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', padding: 16,
    borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10,
  },
  btnCommencer: {
    borderRadius: 14, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    elevation: 4, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  btnCommencerTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
});