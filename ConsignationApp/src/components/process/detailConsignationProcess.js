// src/components/process/detailConsignationProcess.js
// Workflow : Commencer -> ScanCadenasProcess -> ValiderProcess (avec badge)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Alert, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDemandeDetailProcess, demarrerConsignationProcess } from '../../api/process.api';
import { API_URL } from '../../api/client';

const CFG = {
  couleur:     '#b45309',
  couleurDark: '#92400e',
  bg:          '#fef3c7',
  bgPale:      '#fde68a',
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

const STATUT_CONFIG = {
  en_attente: { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',  icon: 'time-outline'         },
  en_cours:   { color: '#b45309', bg: '#fde68a', label: 'EN COURS',    icon: 'sync-outline'         },
  consigne:   { color: '#10B981', bg: '#D1FAE5', label: 'CONSIGNÉ',    icon: 'lock-closed-outline'  },
  rejetee:    { color: '#EF4444', bg: '#FEE2E2', label: 'REFUSÉE',     icon: 'close-circle-outline' },
  cloturee:   { color: '#6B7280', bg: '#F3F4F6', label: 'CLÔTURÉE',    icon: 'archive-outline'      },
};

export default function DetailConsignationProcess({ navigation, route }) {
  const { demande: demandeParam } = route.params;
  const [detail,   setDetail]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [starting, setStarting] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDemandeDetailProcess(demandeParam.id);
      if (res?.success) setDetail(res.data);
    } catch (e) {
      console.error('DetailConsignationProcess error:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [demandeParam.id]);

  useEffect(() => { charger(); }, [charger]);

  // ✅ FIX : Recharger depuis l'API à chaque fois qu'on revient sur cet écran
  // Cela garantit que le statut 'consigne' est pris en compte après validation
  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const dem = detail?.demande ?? demandeParam;
  const points         = detail?.points  || [];
  const pointsProcess  = points.filter(p => p.charge_type === 'process');
  const pointsElec     = points.filter(p => p.charge_type !== 'process');
  const nbProcessFait  = pointsProcess.filter(p => p.numero_cadenas).length;
  const nbProcessTotal = pointsProcess.length;

  const handleCommencer = async () => {
    Alert.alert(
      'Démarrer la consignation process',
      `Démarrer les points process de ${dem.tag} ?\n\nÉtapes :\n1. Scanner les cadenas process\n2. Scanner votre badge et valider`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Démarrer',
          onPress: async () => {
            setStarting(true);
            try {
              await demarrerConsignationProcess(demandeParam.id);
              navigation.navigate('ScanCadenasProcess', { demande: dem, points });
            } catch {
              Alert.alert('Erreur', 'Impossible de démarrer');
            } finally {
              setStarting(false);
            }
          },
        },
      ]
    );
  };

  const ouvrirPDF = () => {
    navigation.navigate('PdfViewer', {
      url:   `${API_URL}/process/demandes/${dem.id}/pdf`,
      titre: dem.numero_ordre,
      role:  'process',
    });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CFG.bgPale }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  const statutCfg     = STATUT_CONFIG[dem.statut] || STATUT_CONFIG.en_attente;
  // ✅ FIX : peutCommencer et estConsigne se basent sur dem.statut (venant de l'API)
  const peutCommencer = ['en_attente', 'en_cours'].includes(dem.statut);
  const estConsigne   = dem.statut === 'consigne' || dem.statut === 'cloturee';

  return (
    <View style={{ flex: 1, backgroundColor: CFG.bgPale }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Détail — Process</Text>
          <Text style={S.hSub}>{dem.numero_ordre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* ── Statut ── */}
        <View style={[S.statutBar, { backgroundColor: statutCfg.bg }]}>
          <Ionicons name={statutCfg.icon} size={16} color={statutCfg.color} />
          <Text style={[S.statutTxt, { color: statutCfg.color }]}>{statutCfg.label}</Text>
          {estConsigne && (
            <View style={S.statutConsigneRight}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={S.statutConsigneTxt}>Consignation validée</Text>
            </View>
          )}
        </View>

        {/* ── Bouton PDF (si consigné) ── */}
        {estConsigne && (
          <View style={S.pdfSection}>
            <View style={[S.pdfCard, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
              <View style={[S.pdfIconWrap, { backgroundColor: CFG.couleur }]}>
                <Ionicons name="document-text" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[S.pdfCardTitre, { color: CFG.couleurDark }]}>Plan de consignation Process</Text>
                <Text style={[S.pdfCardSub, { color: CFG.couleur }]}>
                  {dem.numero_ordre} — Points process consignés
                </Text>
              </View>
              <TouchableOpacity
                style={[S.pdfOuvrirBtn, { backgroundColor: CFG.couleur }]}
                onPress={ouvrirPDF}
                activeOpacity={0.85}
              >
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={S.pdfOuvrirTxt}>Voir</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Workflow (si pas encore fait) ── */}
        {peutCommencer && (
          <View style={S.workflowCard}>
            <Text style={S.workflowTitle}>Votre workflow process</Text>
            <View style={S.workflowSteps}>
              {[
                { icon: 'lock-closed-outline',      label: 'Cadenas',  sub: `${nbProcessTotal} pts process`, color: CFG.couleur },
                { icon: 'checkmark-circle-outline', label: 'Valider',  sub: 'Badge + confirmation',          color: '#10B981'   },
              ].map((step, i) => (
                <View key={i} style={S.workflowStep}>
                  <View style={[S.workflowIcon, { backgroundColor: `${step.color}18` }]}>
                    <Ionicons name={step.icon} size={18} color={step.color} />
                  </View>
                  <Text style={S.workflowLbl}>{step.label}</Text>
                  <Text style={S.workflowSub}>{step.sub}</Text>
                  {i < 1 && <Ionicons name="chevron-forward" size={10} color="#BDBDBD" style={S.workflowArrow} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Infos demande ── */}
        <View style={S.card}>
          {[
            { icon: 'layers-outline',        lbl: 'LOT',          val: dem.lot_code               },
            { icon: 'hardware-chip-outline', lbl: 'TAG',          val: dem.tag                    },
            { icon: 'cube-outline',          lbl: 'Équipement',   val: dem.equipement_nom          },
            { icon: 'location-outline',      lbl: 'Localisation', val: dem.equipement_localisation },
            { icon: 'person-outline',        lbl: 'Demandeur',    val: dem.demandeur_nom           },
            { icon: 'calendar-outline',      lbl: 'Date',         val: fmtDate(dem.created_at)    },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Ionicons name={r.icon} size={14} color={CFG.couleur} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal} numberOfLines={2}>{r.val || '—'}</Text>
            </View>
          ))}

          <View style={[S.raisonBox, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="document-text-outline" size={14} color={CFG.couleur} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[S.raisonLbl, { color: CFG.couleur }]}>Raison de l'intervention</Text>
              <Text style={S.raisonTxt}>{dem.raison || '—'}</Text>
            </View>
          </View>

          {dem.types_intervenants?.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {dem.types_intervenants.map((t, i) => (
                <View key={i} style={[
                  S.typeChip,
                  t === 'process' && { backgroundColor: CFG.bgPale, borderColor: CFG.couleur },
                ]}>
                  <Text style={[S.typeChipTxt, t === 'process' && { color: CFG.couleur }]}>
                    {TYPE_LABEL[t] || t}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Points PROCESS — ma mission ── */}
        {pointsProcess.length > 0 && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={S.cardTitleRow}>
                <Ionicons name="cog-outline" size={16} color={CFG.couleur} />
                <Text style={S.cardTitle}>Cadenas process — ma mission</Text>
              </View>
              <View style={[S.progressBadge, { backgroundColor: CFG.bgPale }]}>
                <Text style={[S.progressTxt, { color: CFG.couleur }]}>{nbProcessFait}/{nbProcessTotal}</Text>
              </View>
            </View>
            {nbProcessTotal > 0 && (
              <View style={S.progressBar}>
                <View style={[S.progressFill, {
                  width: `${(nbProcessFait / nbProcessTotal) * 100}%`,
                  backgroundColor: nbProcessFait === nbProcessTotal ? '#10B981' : CFG.couleur,
                }]} />
              </View>
            )}
            {pointsProcess.map((pt, i) => {
              const fait = !!pt.numero_cadenas;
              return (
                <View key={i} style={[S.pointRow, fait && { borderLeftColor: CFG.couleur, borderLeftWidth: 3 }]}>
                  <View style={[S.pointIcon, { backgroundColor: fait ? CFG.bgPale : '#F5F5F5' }]}>
                    <Ionicons name={fait ? 'lock-closed' : 'lock-open-outline'} size={16} color={fait ? CFG.couleur : '#BDBDBD'} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={S.pointRepere}>{pt.repere_point} — {pt.dispositif_condamnation}</Text>
                    <Text style={S.pointLocal}>{pt.localisation}</Text>
                    {fait && (
                      <Text style={[S.pointCadenas, { color: CFG.couleur }]}>
                        {pt.numero_cadenas}{pt.mcc_ref ? ` | MCC: ${pt.mcc_ref}` : ''}
                      </Text>
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
        )}

        {/* ── Points ÉLECTRIQUE — lecture seule ── */}
        {pointsElec.length > 0 && (
          <View style={[S.card, { marginTop: 14, opacity: 0.75 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={S.cardTitleRow}>
                <Ionicons name="flash-outline" size={16} color="#6B7280" />
                <Text style={[S.cardTitle, { color: '#6B7280' }]}>Points Électricien</Text>
              </View>
            </View>
            <View style={S.elecInfo}>
              <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
              <Text style={S.elecInfoTxt}>Gérés par le Chargé de consignation — hors de votre périmètre</Text>
            </View>
            {pointsElec.map((pt, i) => (
              <View key={i} style={S.pointRowGris}>
                <View style={[S.pointIcon, { backgroundColor: '#F3F4F6' }]}>
                  <Ionicons name={pt.numero_cadenas ? 'lock-closed' : 'lock-open-outline'} size={16} color="#9E9E9E" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[S.pointRepere, { color: '#9E9E9E' }]}>{pt.repere_point}</Text>
                  <Text style={S.pointLocal}>{pt.localisation}</Text>
                </View>
                <View style={S.lockBadge}><Text style={S.lockBadgeTxt}>Élec</Text></View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* ── Bouton bas : commencer OU voir PDF ── */}
      {peutCommencer && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnCommencer, { backgroundColor: CFG.couleur }, starting && { opacity: 0.65 }]}
            onPress={handleCommencer}
            disabled={starting}
          >
            {starting
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Ionicons name="cog-outline" size={22} color="#fff" />
                  <Text style={S.btnCommencerTxt}>
                    {dem.statut === 'en_cours' ? 'CONTINUER MES POINTS PROCESS' : 'COMMENCER MES POINTS PROCESS'}
                  </Text>
                </>
              )
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ✅ FIX : Ce bloc s'affiche dès que statut === 'consigne' ou 'cloturee' */}
      {estConsigne && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnCommencer, { backgroundColor: CFG.couleur }]}
            onPress={ouvrirPDF}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={22} color="#fff" />
            <Text style={S.btnCommencerTxt}>VOIR LE PDF DE CONSIGNATION</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  statutBar:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  statutTxt:          { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  statutConsigneRight:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  statutConsigneTxt:  { fontSize: 11, color: '#10B981', fontWeight: '600' },

  pdfSection: { marginHorizontal: 14, marginTop: 12 },
  pdfCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, borderWidth: 1.5,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  pdfIconWrap:   { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pdfCardTitre:  { fontSize: 13, fontWeight: '800' },
  pdfCardSub:    { fontSize: 11, marginTop: 2 },
  pdfOuvrirBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  pdfOuvrirTxt:  { color: '#fff', fontSize: 12, fontWeight: '700' },

  workflowCard:  { marginHorizontal: 14, marginTop: 10, backgroundColor: '#fff', borderRadius: 16, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  workflowTitle: { fontSize: 11, fontWeight: '700', color: '#9E9E9E', marginBottom: 12, textTransform: 'uppercase' },
  workflowSteps: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 60 },
  workflowStep:  { alignItems: 'center', position: 'relative' },
  workflowIcon:  { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  workflowLbl:   { fontSize: 11, fontWeight: '700', color: '#212121', textAlign: 'center' },
  workflowSub:   { fontSize: 9, color: '#9E9E9E', textAlign: 'center', marginTop: 2 },
  workflowArrow: { position: 'absolute', right: -28, top: 10 },

  card:         { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 10, borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#212121' },

  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:  { fontSize: 12, color: '#9E9E9E', width: 90 },
  infoVal:  { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },
  raisonBox:{ flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, padding: 10, marginTop: 10 },
  raisonLbl:{ fontSize: 11, fontWeight: '700', marginBottom: 3 },
  raisonTxt:{ fontSize: 13, color: '#424242', lineHeight: 19 },

  typeChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#F5F5F5' },
  typeChipTxt: { fontSize: 11, fontWeight: '700', color: '#9E9E9E' },

  progressBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  progressTxt:   { fontSize: 12, fontWeight: '700' },
  progressBar:   { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 12, marginTop: 4, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },

  pointRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointRowGris: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0', borderStyle: 'dashed' },
  pointIcon:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere:  { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:   { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  pointCadenas: { fontSize: 10, fontWeight: '700', marginTop: 2 },

  elecInfo:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3F4F6', borderRadius: 8, padding: 8, marginBottom: 10 },
  elecInfoTxt: { flex: 1, fontSize: 11, color: '#6B7280' },
  lockBadge:   { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  lockBadgeTxt:{ fontSize: 9, color: '#6B7280', fontWeight: '700' },

  bottomBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10 },
  btnCommencer:    { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 4 },
  btnCommencerTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
});