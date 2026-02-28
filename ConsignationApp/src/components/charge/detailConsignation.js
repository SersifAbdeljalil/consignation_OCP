// src/components/charge/detailConsignation.js
// Workflow : Commencer -> ScanCadenasNFC -> PrendrePhoto -> ValiderConsignation (avec badge)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, TextInput,
  StatusBar, ActivityIndicator, Alert, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getDemandeDetail,
  demarrerConsignation,
  refuserDemande,
  suspendreDemande,
} from '../../api/charge.api';

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
  genie_civil: 'Genie Civil',
  mecanique:   'Mecanique',
  electrique:  'Electrique',
  process:     'Process',
};

const STATUT_CONFIG = {
  en_attente: { color: '#F59E0B', bg: '#FFF8E1', label: 'EN ATTENTE',  icon: 'time-outline'         },
  en_cours:   { color: '#2d6a4f', bg: '#d8f3dc', label: 'EN COURS',    icon: 'sync-outline'         },
  consigne:   { color: '#10B981', bg: '#D1FAE5', label: 'CONSIGNE',    icon: 'lock-closed-outline'  },
  rejetee:    { color: '#EF4444', bg: '#FEE2E2', label: 'REFUSEE',     icon: 'close-circle-outline' },
  cloturee:   { color: '#6B7280', bg: '#F3F4F6', label: 'CLOTUREE',    icon: 'archive-outline'      },
};

export default function DetailConsignation({ navigation, route }) {
  const { demande: demandeParam } = route.params;
  const [detail,   setDetail]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [starting, setStarting] = useState(false);

  const [showRefuserModal,   setShowRefuserModal]   = useState(false);
  const [showSuspendreModal, setShowSuspendreModal] = useState(false);
  const [motifRefus,         setMotifRefus]         = useState('');
  const [motifSuspendre,     setMotifSuspendre]     = useState('');
  const [heureSuspendre,     setHeureSuspendre]     = useState('');
  const [actionLoading,      setActionLoading]      = useState(false);

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

  const dem           = detail?.demande || demandeParam;
  const points        = detail?.points  || [];
  const pointsElec    = points.filter(p => p.charge_type === 'electricien' || !p.charge_type);
  const pointsProcess = points.filter(p => p.charge_type === 'process');
  const nbElecFait    = pointsElec.filter(p => p.numero_cadenas).length;
  const nbElecTotal   = pointsElec.length;

  const handleCommencer = async () => {
    Alert.alert(
      'Demarrer la consignation',
      `Demarrer la consignation de ${dem.tag} ?\n\nEtapes :\n1. Scanner les cadenas electriques\n2. Prendre une photo\n3. Scanner votre badge et valider`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Demarrer',
          onPress: async () => {
            setStarting(true);
            try {
              await demarrerConsignation(demandeParam.id);
              navigation.navigate('ScanCadenasNFC', { demande: dem, points });
            } catch {
              Alert.alert('Erreur', 'Impossible de demarrer la consignation');
            } finally {
              setStarting(false);
            }
          },
        },
      ]
    );
  };

  const handleRefuser = async () => {
    if (!motifRefus.trim()) {
      Alert.alert('Motif requis', 'Veuillez indiquer la raison du refus');
      return;
    }
    setActionLoading(true);
    try {
      const res = await refuserDemande(demandeParam.id, motifRefus.trim());
      if (res?.success) {
        setShowRefuserModal(false);
        Alert.alert('Demande refusee', 'Le demandeur a ete notifie.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('Erreur', res?.message || 'Erreur lors du refus');
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendre = async () => {
    setActionLoading(true);
    try {
      const res = await suspendreDemande(
        demandeParam.id,
        motifSuspendre.trim() || 'Suspendu par le charge',
        heureSuspendre.trim() || null
      );
      if (res?.success) {
        setShowSuspendreModal(false);
        Alert.alert(
          'Consignation suspendue',
          `La demande a ete remise en attente.${heureSuspendre ? `\nReprise prevue : ${heureSuspendre}` : ''}`,
          [{ text: 'OK', onPress: () => { charger(); setDetail(null); setLoading(true); } }]
        );
      } else {
        Alert.alert('Erreur', res?.message || 'Erreur lors de la suspension');
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  const statutCfg     = STATUT_CONFIG[dem.statut] || STATUT_CONFIG.en_attente;
  const peutCommencer = ['en_attente', 'en_cours'].includes(dem.statut);
  const peutSuspendre = dem.statut === 'en_cours';

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Detail Consignation</Text>
          <Text style={S.hSub}>{dem.numero_ordre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>

        {/* Statut */}
        <View style={[S.statutBar, { backgroundColor: statutCfg.bg }]}>
          <Ionicons name={statutCfg.icon} size={16} color={statutCfg.color} />
          <Text style={[S.statutTxt, { color: statutCfg.color }]}>{statutCfg.label}</Text>
          {dem.statut === 'rejetee' && dem.commentaire_rejet && (
            <Text style={[S.statutSub, { color: statutCfg.color }]} numberOfLines={1}>
              {dem.commentaire_rejet}
            </Text>
          )}
        </View>

        {/* Workflow */}
        {peutCommencer && (
          <View style={S.workflowCard}>
            <Text style={S.workflowTitle}>Workflow de consignation</Text>
            <View style={S.workflowSteps}>
              {[
                { icon: 'lock-closed-outline',      label: 'Cadenas',  sub: `${nbElecTotal} pts electriques`, color: CFG.couleur },
                { icon: 'camera-outline',            label: 'Photo',    sub: 'Depart consigne',                color: '#6366F1'   },
                { icon: 'checkmark-circle-outline',  label: 'Valider',  sub: 'Badge + PDF',                    color: '#10B981'   },
              ].map((step, i) => (
                <View key={i} style={S.workflowStep}>
                  <View style={[S.workflowIcon, { backgroundColor: `${step.color}18` }]}>
                    <Ionicons name={step.icon} size={16} color={step.color} />
                  </View>
                  <Text style={S.workflowLbl}>{step.label}</Text>
                  <Text style={S.workflowSub}>{step.sub}</Text>
                  {i < 2 && <Ionicons name="chevron-forward" size={10} color="#BDBDBD" style={S.workflowArrow} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Infos demande */}
        <View style={S.card}>
          {[
            { icon: 'layers-outline',        lbl: 'LOT',          val: dem.lot_code || dem.lot       },
            { icon: 'hardware-chip-outline', lbl: 'TAG',          val: dem.tag                       },
            { icon: 'cube-outline',          lbl: 'Equipement',   val: dem.equipement_nom             },
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
                <View key={i} style={[S.typeChip, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
                  <Text style={[S.typeChipTxt, { color: CFG.couleur }]}>{TYPE_LABEL[t] || t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Points ELECTRICIEN */}
        {pointsElec.length > 0 && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={S.cardTitleRow}>
                <Ionicons name="flash-outline" size={16} color="#4F46E5" />
                <Text style={S.cardTitle}>Cadenas electriques — votre mission</Text>
              </View>
              <View style={[S.progressBadge, { backgroundColor: '#EEF2FF' }]}>
                <Text style={[S.progressTxt, { color: '#4F46E5' }]}>{nbElecFait}/{nbElecTotal}</Text>
              </View>
            </View>
            {nbElecTotal > 0 && (
              <View style={S.progressBar}>
                <View style={[S.progressFill, {
                  width: `${(nbElecFait / nbElecTotal) * 100}%`,
                  backgroundColor: nbElecFait === nbElecTotal ? '#10B981' : CFG.couleur,
                }]} />
              </View>
            )}
            {pointsElec.map((pt, i) => {
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

        {/* Points PROCESS */}
        {pointsProcess.length > 0 && (
          <View style={[S.card, { marginTop: 14, opacity: 0.8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={S.cardTitleRow}>
                <Ionicons name="cog-outline" size={16} color="#B45309" />
                <Text style={[S.cardTitle, { color: '#B45309' }]}>Points Process</Text>
              </View>
              <View style={[S.progressBadge, { backgroundColor: '#FFF3CD' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309' }}>
                  {pointsProcess.filter(p => p.numero_cadenas).length}/{pointsProcess.length}
                </Text>
              </View>
            </View>
            <View style={S.processInfo}>
              <Ionicons name="information-circle-outline" size={14} color="#B45309" />
              <Text style={S.processInfoTxt}>Geres par le Chef Process — hors de votre perimetre</Text>
            </View>
            {pointsProcess.map((pt, i) => {
              const fait = !!pt.numero_cadenas;
              return (
                <View key={i} style={S.pointRowGris}>
                  <View style={[S.pointIcon, { backgroundColor: '#FFF3CD' }]}>
                    <Ionicons name={fait ? 'lock-closed' : 'lock-open-outline'} size={16} color="#B45309" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[S.pointRepere, { color: '#9E9E9E' }]}>{pt.repere_point} — {pt.dispositif_condamnation}</Text>
                    <Text style={S.pointLocal}>{pt.localisation}</Text>
                    {fait && (
                      <Text style={{ fontSize: 10, color: '#B45309', fontWeight: '700', marginTop: 2 }}>
                        {pt.numero_cadenas}
                      </Text>
                    )}
                  </View>
                  <View style={S.lockBadge}>
                    <Text style={S.lockBadgeTxt}>Process</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {points.length === 0 && peutCommencer && (
          <View style={[S.card, S.infoCard, { marginTop: 14 }]}>
            <Ionicons name="create-outline" size={18} color={CFG.couleur} />
            <Text style={S.infoCardTxt}>
              Vous saisirez les references cadenas et MCC lors de l'etape de scan.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Boutons */}
      {peutCommencer && (
        <View style={S.bottomBar}>
          <View style={S.actionsRow}>
            <TouchableOpacity
              style={[S.btnSecondaire, { borderColor: '#EF4444', flex: 1 }]}
              onPress={() => { setMotifRefus(''); setShowRefuserModal(true); }}
            >
              <Ionicons name="close-circle-outline" size={18} color="#EF4444" />
              <Text style={[S.btnSecondaireTxt, { color: '#EF4444' }]}>REFUSER</Text>
            </TouchableOpacity>

            {peutSuspendre && (
              <TouchableOpacity
                style={[S.btnSecondaire, { borderColor: '#F59E0B', flex: 1, marginLeft: 8 }]}
                onPress={() => { setMotifSuspendre(''); setHeureSuspendre(''); setShowSuspendreModal(true); }}
              >
                <Ionicons name="pause-circle-outline" size={18} color="#F59E0B" />
                <Text style={[S.btnSecondaireTxt, { color: '#F59E0B' }]}>SUSPENDRE</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[S.btnCommencer, { backgroundColor: CFG.couleur }, starting && { opacity: 0.65 }]}
            onPress={handleCommencer}
            disabled={starting}
          >
            {starting
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Ionicons name="lock-closed-outline" size={22} color="#fff" />
                  <Text style={S.btnCommencerTxt}>
                    {dem.statut === 'en_cours' ? 'CONTINUER LA CONSIGNATION' : 'COMMENCER LA CONSIGNATION'}
                  </Text>
                </>
              )
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Modal Refuser */}
      <Modal visible={showRefuserModal} transparent animationType="slide" onRequestClose={() => setShowRefuserModal(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalBox}>
            <View style={S.modalHeader}>
              <Ionicons name="close-circle-outline" size={24} color="#EF4444" />
              <Text style={S.modalTitre}>Refuser la demande</Text>
            </View>
            <Text style={S.modalSub}>{dem.numero_ordre} — {dem.tag}</Text>
            <Text style={S.modalLabel}>Motif du refus *</Text>
            <TextInput
              style={S.modalInput}
              placeholder="Indiquez la raison du refus..."
              placeholderTextColor="#9E9E9E"
              multiline numberOfLines={3}
              value={motifRefus}
              onChangeText={setMotifRefus}
              textAlignVertical="top"
            />
            <View style={S.modalBtns}>
              <TouchableOpacity style={[S.modalBtn, { borderWidth: 1.5, borderColor: '#9E9E9E' }]} onPress={() => setShowRefuserModal(false)} disabled={actionLoading}>
                <Text style={{ color: '#424242', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.modalBtn, { backgroundColor: '#EF4444' }, actionLoading && { opacity: 0.6 }]} onPress={handleRefuser} disabled={actionLoading || !motifRefus.trim()}>
                {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>CONFIRMER</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Suspendre */}
      <Modal visible={showSuspendreModal} transparent animationType="slide" onRequestClose={() => setShowSuspendreModal(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalBox}>
            <View style={S.modalHeader}>
              <Ionicons name="pause-circle-outline" size={24} color="#F59E0B" />
              <Text style={S.modalTitre}>Suspendre la consignation</Text>
            </View>
            <Text style={S.modalSub}>{dem.numero_ordre} — {dem.tag}</Text>
            <Text style={S.modalLabel}>Motif de suspension</Text>
            <TextInput style={S.modalInput} placeholder="Raison (optionnel)..." placeholderTextColor="#9E9E9E" multiline numberOfLines={2} value={motifSuspendre} onChangeText={setMotifSuspendre} textAlignVertical="top" />
            <Text style={S.modalLabel}>Heure de reprise prevue</Text>
            <TextInput style={[S.modalInput, { height: 46, textAlignVertical: 'center' }]} placeholder="Ex: 14:30..." placeholderTextColor="#9E9E9E" value={heureSuspendre} onChangeText={setHeureSuspendre} />
            <View style={S.modalBtns}>
              <TouchableOpacity style={[S.modalBtn, { borderWidth: 1.5, borderColor: '#9E9E9E' }]} onPress={() => setShowSuspendreModal(false)} disabled={actionLoading}>
                <Text style={{ color: '#424242', fontWeight: '600' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.modalBtn, { backgroundColor: '#F59E0B' }, actionLoading && { opacity: 0.6 }]} onPress={handleSuspendre} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>SUSPENDRE</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  statutBar:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 4 },
  statutTxt:  { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  statutSub:  { flex: 1, fontSize: 11, marginLeft: 4 },

  workflowCard: { marginHorizontal: 14, marginTop: 10, backgroundColor: '#fff', borderRadius: 16, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  workflowTitle: { fontSize: 11, fontWeight: '700', color: '#9E9E9E', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  workflowSteps: { flexDirection: 'row', alignItems: 'flex-start' },
  workflowStep:  { flex: 1, alignItems: 'center', position: 'relative' },
  workflowIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  workflowLbl:   { fontSize: 10, fontWeight: '700', color: '#212121', textAlign: 'center' },
  workflowSub:   { fontSize: 8, color: '#9E9E9E', textAlign: 'center', marginTop: 2 },
  workflowArrow: { position: 'absolute', right: -4, top: 10 },

  card: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 10, borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#212121' },

  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:  { fontSize: 12, color: '#9E9E9E', width: 90 },
  infoVal:  { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },

  raisonBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, padding: 10, marginTop: 10 },
  raisonLbl: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  raisonTxt: { fontSize: 13, color: '#424242', lineHeight: 19 },

  typeChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 11, fontWeight: '700' },

  progressBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  progressTxt:   { fontSize: 12, fontWeight: '700' },
  progressBar:   { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 12, marginTop: 4, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },

  pointRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointRowGris:{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A', borderStyle: 'dashed' },
  pointIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere: { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:  { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  pointCadenas:{ fontSize: 10, fontWeight: '700', marginTop: 2 },

  lockBadge:    { backgroundColor: '#FFF3CD', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  lockBadgeTxt: { fontSize: 9, color: '#B45309', fontWeight: '700' },

  processInfo:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8, marginBottom: 10 },
  processInfoTxt: { flex: 1, fontSize: 11, color: '#92400E' },

  infoCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FDF4' },
  infoCardTxt: { flex: 1, fontSize: 12, color: '#166534', lineHeight: 18 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10, gap: 8 },
  actionsRow: { flexDirection: 'row' },

  btnSecondaire:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  btnSecondaireTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  btnCommencer:    { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 4, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  btnCommencerTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  modalTitre:   { fontSize: 17, fontWeight: '800', color: '#212121' },
  modalSub:     { fontSize: 12, color: '#9E9E9E', marginBottom: 20 },
  modalLabel:   { fontSize: 13, fontWeight: '700', color: '#424242', marginBottom: 8 },
  modalInput:   { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, padding: 12, fontSize: 13, color: '#212121', minHeight: 80, marginBottom: 14, backgroundColor: '#FAFAFA' },
  modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn:     { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});