// src/components/charge/validerConsignation.js
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { validerConsignation } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

export default function ValiderConsignation({ navigation, route }) {
  const { demande, points, photo_path } = route.params;

  const [loading, setLoading] = useState(false);
  const [valide,  setValide]  = useState(false);

  const handleValider = () => {
    Alert.alert(
      'Confirmer la validation',
      `Voulez-vous valider définitivement la consignation de ${demande.tag} ?\n\nCette action générera le PDF officiel F-HSE-SEC-22-01 et notifiera le demandeur.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'VALIDER',
          style: 'default',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await validerConsignation(demande.id);
              if (res?.success) {
                setValide(true);
              } else {
                Alert.alert('Erreur', res?.message || 'Erreur lors de la validation');
              }
            } catch (e) {
              Alert.alert('Erreur', 'Erreur de connexion');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ── Écran succès ──────────────────────────────
  if (valide) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>

          <View style={[S.successCircle, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="checkmark-circle" size={90} color={CFG.couleur} />
          </View>
          <Text style={[S.successTitre, { color: CFG.couleur }]}>Consignation validée !</Text>
          <Text style={S.successSub}>
            Le PDF officiel F-HSE-SEC-22-01 a été généré et les notifications ont été envoyées.
          </Text>

          <View style={[S.pdfBox, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
            <Ionicons name="document-text" size={28} color={CFG.couleur} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[S.pdfTitre, { color: CFG.couleur }]}>F-HSE-SEC-22-01</Text>
              <Text style={S.pdfSub}>{demande.numero_ordre} — généré</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={CFG.couleur} />
          </View>

          <View style={{ width: '100%', gap: 10, marginTop: 10 }}>
            {[
              { icon: 'person-outline',       txt: 'Demandeur notifié'           },
              { icon: 'people-outline',        txt: 'Chefs intervenants notifiés' },
              { icon: 'lock-closed-outline',   txt: `${points.length} cadenas posés` },
              { icon: 'camera-outline',        txt: 'Photo du départ enregistrée' },
            ].map((item, i) => (
              <View key={i} style={[S.notifRow, { backgroundColor: '#fff' }]}>
                <Ionicons name={item.icon} size={16} color={CFG.couleur} />
                <Text style={S.notifRowTxt}>{item.txt}</Text>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              </View>
            ))}
          </View>
        </View>

        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btn, { backgroundColor: CFG.couleur }]}
            onPress={() => navigation.navigate('DashboardCharge')}
            activeOpacity={0.85}
          >
            <Ionicons name="home-outline" size={20} color="#fff" />
            <Text style={S.btnTxt}>RETOUR AU TABLEAU DE BORD</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Récapitulatif ─────────────────────────────
  const tousConsignes   = points.length === 0 || points.every(p => p.numero_cadenas);
  const peutValider     = tousConsignes && !!photo_path;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Étape 4 / 4</Text>
          <Text style={S.hSub}>Validation finale</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={S.stepper}>
        {['Badge', 'Cadenas', 'Photo', 'Valider'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[S.stepCircle,
              i < 3 && { backgroundColor: '#10B981' },
              i === 3 && { backgroundColor: CFG.couleur },
            ]}>
              {i < 3
                ? <Ionicons name="checkmark" size={14} color="#fff" />
                : <Text style={[S.stepNum, { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[S.stepLbl, i === 3 && { color: CFG.couleur, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 100 }}>

        {/* ── Checklist ── */}
        <View style={S.card}>
          <View style={S.cardTitleRow}>
            <Ionicons name="checkbox-outline" size={16} color={CFG.couleur} />
            <Text style={S.cardTitle}>Vérifications</Text>
          </View>
          {[
            { icon: 'card-outline',        lbl: 'Badge NFC vérifié',                     ok: true },
            { icon: 'lock-closed-outline', lbl: `${points.length} cadenas scannés`,        ok: tousConsignes },
            { icon: 'camera-outline',      lbl: 'Photo du départ consigné prise',          ok: !!photo_path  },
          ].map((c, i) => (
            <View key={i} style={[S.checkRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }]}>
              <Ionicons name={c.icon} size={16} color={c.ok ? CFG.couleur : '#9E9E9E'} />
              <Text style={[S.checkLbl, { color: c.ok ? '#212121' : '#9E9E9E' }]}>{c.lbl}</Text>
              <Ionicons
                name={c.ok ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={c.ok ? '#10B981' : '#EF4444'}
              />
            </View>
          ))}
        </View>

        {/* ── Récapitulatif demande ── */}
        <View style={[S.card, { marginTop: 14 }]}>
          <View style={S.cardTitleRow}>
            <Ionicons name="document-text-outline" size={16} color={CFG.couleur} />
            <Text style={S.cardTitle}>Récapitulatif demande</Text>
          </View>
          {[
            { lbl: 'N° ordre',   val: demande.numero_ordre           },
            { lbl: 'LOT',        val: demande.lot_code || demande.lot },
            { lbl: 'TAG',        val: demande.tag                    },
            { lbl: 'Équipement', val: demande.equipement_nom          },
            { lbl: 'Demandeur',  val: demande.demandeur_nom           },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal}>{r.val || '—'}</Text>
            </View>
          ))}

          {demande.types_intervenants?.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={[S.infoLbl, { marginBottom: 6 }]}>Types intervenants</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {demande.types_intervenants.map((t, i) => (
                  <View key={i} style={[S.typeChip, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
                    <Text style={[S.typeChipTxt, { color: CFG.couleur }]}>{TYPE_LABEL[t] || t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── Cadenas posés ── */}
        {points.length > 0 && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={S.cardTitleRow}>
              <Ionicons name="lock-closed-outline" size={16} color={CFG.couleur} />
              <Text style={S.cardTitle}>Cadenas posés ({points.length})</Text>
            </View>
            {points.map((pt, i) => (
              <View key={i} style={[S.pointRow, i < points.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }]}>
                <Ionicons name="lock-closed" size={14} color={CFG.couleur} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={S.pointRepere}>{pt.repere_point} — {pt.dispositif_condamnation}</Text>
                  <Text style={S.pointCadenas}>{pt.numero_cadenas} | MCC: {pt.mcc_ref}</Text>
                </View>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              </View>
            ))}
          </View>
        )}

        {/* ── Photo ── */}
        {photo_path && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={S.cardTitleRow}>
              <Ionicons name="camera-outline" size={16} color={CFG.couleur} />
              <Text style={S.cardTitle}>Photo du départ consigné</Text>
            </View>
            <View style={[S.photoPreview, { backgroundColor: CFG.bgPale }]}>
              <Ionicons name="camera" size={32} color={CFG.couleur} />
              <Text style={[S.photoPreviewTxt, { color: CFG.couleur }]}>Photo enregistrée</Text>
              <Ionicons name="checkmark-circle" size={20} color={CFG.couleur} />
            </View>
          </View>
        )}

        {/* ── Note PDF ── */}
        <View style={[S.pdfInfo, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur, marginTop: 14 }]}>
          <Ionicons name="document-text-outline" size={20} color={CFG.couleur} />
          <Text style={[S.pdfInfoTxt, { color: CFG.couleurDark }]}>
            En cliquant sur VALIDER, le formulaire officiel F-HSE-SEC-22-01 sera généré automatiquement
            et les notifications seront envoyées au demandeur et aux chefs intervenants.
          </Text>
        </View>

      </ScrollView>

      {/* ── Bouton VALIDER ── */}
      <View style={S.bottomBar}>
        <TouchableOpacity
          style={[S.btn, { backgroundColor: peutValider ? CFG.couleur : '#BDBDBD' }, loading && { opacity: 0.65 }]}
          onPress={handleValider}
          disabled={!peutValider || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                <Text style={S.btnTxt}>VALIDER LA CONSIGNATION</Text>
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

  stepper:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 20 },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 12, fontWeight: '800', color: '#9E9E9E' },
  stepLbl:    { fontSize: 9, color: '#9E9E9E' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 14,
    borderRadius: 16, padding: 16,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#212121' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  checkLbl: { flex: 1, fontSize: 13, fontWeight: '600' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoLbl: { fontSize: 12, color: '#9E9E9E' },
  infoVal: { fontSize: 12, fontWeight: '700', color: '#212121', textAlign: 'right', flex: 1, marginLeft: 8 },

  typeChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 11, fontWeight: '700' },

  pointRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  pointRepere:  { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointCadenas: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  photoPreview:    { height: 80, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  photoPreviewTxt: { fontSize: 14, fontWeight: '700' },

  pdfInfo:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, borderWidth: 1 },
  pdfInfoTxt: { flex: 1, fontSize: 12, lineHeight: 18 },

  successCircle: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitre:  { fontSize: 24, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  successSub:    { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  pdfBox:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, padding: 14, width: '100%', marginBottom: 16 },
  pdfTitre: { fontSize: 14, fontWeight: '800' },
  pdfSub:   { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  notifRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  notifRowTxt: { flex: 1, fontSize: 13, color: '#424242' },

  bottomBar: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10 },
  btn:    { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});