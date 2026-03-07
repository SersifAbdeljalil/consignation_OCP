// src/components/chefIntervenant/scanBadge.js
//
// ══════════════════════════════════════════════════════════════════════
// WORKFLOW VALIDATION ÉQUIPE
// ──────────────────────────────────────────────────────────────────────
//  Ajout depuis liste connue (badge + photo déjà enregistrés) :
//    [1] Sélection intervenant  →  [2] Scan cadenas (vérif identité uniquement)
//    → Si cadenas OK : réactivation directe sans re-scanner badge ni photo
//
//  Ajout nouveau membre inconnu :
//    [1] Scan cadenas  →  [2] Scan badge  →  [3] Photo
//
//  Sur chaque carte membre :
//    🔄 "Refaire scan"  → recommence depuis l'étape 1 (cadenas)
//    🗑️  "Retirer"       → suppression définitive (API DELETE)
//
//  Validation finale :
//    → membre par membre via le bouton ✅ sur chaque carte
//    → tous validés → bouton "VALIDER L'ÉQUIPE"
//
// WORKFLOW DÉCONSIGNATION (inchangé)
//    Scan cadenas → Scan badge → sortie → PDF
// ══════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, Platform, Animated,
  Vibration, FlatList, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import client from '../../api/client'; // ← import direct pour FormData multipart
import {
  getEquipe,
  getIntervenantsDispos,
  getStatutDeconsignation,
  supprimerMembre,
  verifierBadge,
  verifierCadenas,
  validerEquipe,
  marquerEntreeMembres,
  deconsignerMembre,
  validerDeconsignation,
} from '../../api/equipeIntervention.api';

// ─── Config ───────────────────────────────────────────────────────────
const BASE_URL = 'http://192.168.1.104:3000';

const C = {
  primary:      '#1565C0',
  primaryDark:  '#0D47A1',
  primaryLight: '#E3F2FD',
  primaryMid:   '#BBDEFB',
  vert:         '#2E7D32',
  vertLight:    '#E8F5E9',
  vertMid:      '#4CAF50',
  rouge:        '#C62828',
  rougeLight:   '#FFEBEE',
  orange:       '#F57C00',
  orangeLight:  '#FFF3E0',
  violet:       '#6A1B9A',
  violetLight:  '#F3E5F5',
  blanc:        '#FFFFFF',
  fond:         '#F0F4F8',
  gris:         '#9E9E9E',
  grisDark:     '#424242',
  card:         '#FFFFFF',
  border:       '#E8EDF2',
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

const fmtHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
};

const norm = (v) => (v || '').trim().toLowerCase().replace(/[\s-]/g, '');

const SCAN_INITIAL = {
  membreId:          null,
  nomExist:          null,
  intervenantChoisi: null,
  cadenas:           null,
  badge:             null,
  nomResolu:         null,
  matricule:         null,
  photoUri:          null,
};

// ══════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Ligne scan animée
// ══════════════════════════════════════════════════════════════════════
function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return (
    <Animated.View style={{
      position: 'absolute', left: 8, right: 8, height: 2,
      backgroundColor: C.primary, opacity: 0.9, borderRadius: 1,
      transform: [{ translateY: ty }],
      shadowColor: C.primary, shadowOpacity: 0.8, shadowRadius: 4,
    }} />
  );
}

// ══════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Stepper dynamique
// ══════════════════════════════════════════════════════════════════════
function StepBar({ etapeCourante, labels }) {
  return (
    <View style={SC.stepBar}>
      {labels.map((lbl, i) => {
        const n       = i + 1;
        const actif   = etapeCourante === n;
        const termine = etapeCourante > n;
        return (
          <React.Fragment key={i}>
            <View style={SC.stepItem}>
              <View style={[SC.stepCircle, (actif || termine) && SC.stepCircleOn]}>
                {termine
                  ? <Ionicons name="checkmark" size={11} color={C.blanc} />
                  : <Text style={[SC.stepNum, actif && { color: C.blanc }]}>{n}</Text>
                }
              </View>
              <Text style={[SC.stepLbl, actif && { color: C.blanc }]}>{lbl}</Text>
            </View>
            {i < labels.length - 1 && (
              <View style={[SC.stepLine, termine && SC.stepLineOn]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Écran caméra QR générique (cadenas OU badge)
// ══════════════════════════════════════════════════════════════════════
function EcranScan({
  titre, sousTitre, etape, stepLabels,
  badgePill, hint, hintSub, couleur,
  iconHint,    // icône affichée dans la carte instruction
  scanned, saving,
  onScanned, onBack,
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const [perm, demPerm] = useCameraPermissions();

  useEffect(() => { if (perm && !perm.granted) demPerm(); }, [perm]);

  useEffect(() => {
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]));
    p.start();
    return () => p.stop();
  }, []);

  if (!perm?.granted) return (
    <View style={SC.permWrap}>
      <View style={[SC.permIcon, { backgroundColor: C.rougeLight }]}>
        <Ionicons name="videocam-off-outline" size={52} color={C.rouge} />
      </View>
      <Text style={SC.permTitre}>Accès caméra requis</Text>
      <TouchableOpacity style={[SC.permBtn, { backgroundColor: couleur || C.primary }]} onPress={demPerm}>
        <Text style={SC.permBtnTxt}>Autoriser la caméra</Text>
      </TouchableOpacity>
    </View>
  );

  const hc = couleur || C.primary;
  const sl = stepLabels || ['Cadenas', 'Badge', 'Photo'];

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
      {/* Header */}
      <View style={SC.header}>
        <TouchableOpacity style={SC.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={SC.hTitre}>{titre}</Text>
          {sousTitre ? <Text style={SC.hSub}>{sousTitre}</Text> : null}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={SC.stepFloat}>
        <StepBar etapeCourante={etape} labels={sl} />
      </View>

      {/* Caméra */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
      />

      {/* Overlay viseur */}
      <View style={SC.overlay} pointerEvents="none">
        <View style={SC.overlayTop} />
        <View style={SC.overlayRow}>
          <View style={SC.overlaySide} />
          <Animated.View style={[SC.frame, { transform: [{ scale: pulse }] }]}>
            {[
              { top: 0,    left: 0,  borderTopWidth:    3, borderLeftWidth:  3 },
              { top: 0,    right: 0, borderTopWidth:    3, borderRightWidth: 3 },
              { bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth:  3 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((s, i) => (
              <View key={i} style={[SC.corner, s, { borderColor: hc }]} />
            ))}
            {!scanned && <ScanLine />}
            {scanned && (
              <View style={SC.successOverlay}>
                <Ionicons
                  name={saving ? 'sync-outline' : 'checkmark-circle'}
                  size={64}
                  color={saving ? C.orange : C.vertMid}
                />
              </View>
            )}
          </Animated.View>
          <View style={SC.overlaySide} />
        </View>
        <View style={SC.overlayBottom} />
      </View>

      {/* Instructions bas */}
      <View style={SC.instrWrap}>
        {badgePill && (
          <View style={[SC.pill, { backgroundColor: `${hc}CC` }]}>
            <Ionicons name="shield-checkmark-outline" size={12} color={C.blanc} />
            <Text style={SC.pillTxt}>{badgePill}</Text>
          </View>
        )}
        <View style={[SC.instrCard, scanned && { backgroundColor: saving ? C.orange : C.vert }]}>
          <View style={[SC.instrDot, { backgroundColor: `${hc}44` }]}>
            <Ionicons
              name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : (iconHint || 'scan-outline')}
              size={22} color={C.blanc}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={SC.instrTitre}>
              {saving ? 'Traitement...' : scanned ? 'Code scanné !' : hint}
            </Text>
            {hintSub && !scanned && <Text style={SC.instrSub}>{hintSub}</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Carte membre
// ══════════════════════════════════════════════════════════════════════
function MembreCard({
  m, equipeValidee, modeDeconsignation,
  onRetirer, onRefaire, onValiderMembre,
  onEntreeSite, onSortie, updatingId,
}) {
  const cfg = {
    en_attente: { color: C.orange,  bg: C.orangeLight, label: 'En attente', icon: 'time-outline'             },
    sur_site:   { color: C.primary, bg: C.primaryLight, label: 'Sur site',  icon: 'construct-outline'        },
    sortie:     { color: C.vert,    bg: C.vertLight,    label: 'Sorti',     icon: 'checkmark-circle-outline' },
  }[m.statut] || { color: C.gris, bg: '#F5F5F5', label: m.statut, icon: 'ellipse-outline' };

  const initiale  = (m.nom || '?')[0].toUpperCase();
  const cadenasOk = !!(m.cad_id || m.numero_cadenas);
  const badgeOk   = !!(m.badge_ocp_id);
  const photoOk   = !!(m.photo_path);
  const complet   = cadenasOk && badgeOk && photoOk;

  return (
    <View style={[
      MCS.card,
      !equipeValidee && complet   && MCS.cardComplet,
      !equipeValidee && !complet  && MCS.cardIncomplet,
      modeDeconsignation && m.statut === 'sur_site' && MCS.cardActif,
    ]}>
      <View style={[MCS.stripe, { backgroundColor: equipeValidee ? cfg.color : (complet ? C.vert : C.orange) }]} />

      {m.photo_path ? (
        <Image source={{ uri: `${BASE_URL}/${m.photo_path}` }} style={MCS.avatarImg} />
      ) : (
        <View style={[MCS.avatar, { backgroundColor: cfg.bg }]}>
          <Text style={[MCS.avatarTxt, { color: cfg.color }]}>{initiale}</Text>
        </View>
      )}

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={MCS.nom}>{m.nom || m.badge_ocp_id || '—'}</Text>
        <Text style={MCS.meta} numberOfLines={1}>
          {m.badge_ocp_id || m.matricule || '—'}
          {(m.cad_id || m.numero_cadenas) ? `  ·  ${m.cad_id || m.numero_cadenas}` : ''}
        </Text>

        {!equipeValidee && (
          <View style={MCS.chips}>
            {[
              { ok: cadenasOk, icon: cadenasOk ? 'lock-closed' : 'lock-open-outline', lbl: 'Cadenas' },
              { ok: badgeOk,   icon: badgeOk   ? 'card'        : 'card-outline',       lbl: 'Badge'   },
              { ok: photoOk,   icon: photoOk   ? 'camera'      : 'camera-outline',     lbl: 'Photo'   },
            ].map(({ ok, icon, lbl }, i) => (
              <View key={i} style={[MCS.chip, { backgroundColor: ok ? C.vertLight : '#F0F0F0' }]}>
                <Ionicons name={icon} size={10} color={ok ? C.vert : C.gris} />
                <Text style={[MCS.chipTxt, { color: ok ? C.vert : C.gris }]}>{lbl}</Text>
              </View>
            ))}
          </View>
        )}

        {m.heure_entree && (
          <Text style={[MCS.heure, { color: C.primary }]}>
            Entrée {fmtHeure(m.heure_entree)}
            {m.heure_sortie ? `  →  Sortie ${fmtHeure(m.heure_sortie)}` : ''}
          </Text>
        )}
      </View>

      <View style={MCS.actions}>
        {!equipeValidee && (
          <>
            <View style={[MCS.badge, { backgroundColor: complet ? C.vertLight : C.orangeLight }]}>
              <Ionicons name={complet ? 'checkmark-circle' : 'alert-circle-outline'} size={12} color={complet ? C.vert : C.orange} />
              <Text style={[MCS.badgeTxt, { color: complet ? C.vert : C.orange }]}>
                {complet ? 'Complet' : 'Incomplet'}
              </Text>
            </View>
            <View style={MCS.btnsRow}>
              <TouchableOpacity style={[MCS.btn, { backgroundColor: C.primaryLight }]} onPress={() => onRefaire?.(m)} activeOpacity={0.8}>
                <Ionicons name="refresh-outline" size={15} color={C.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={[MCS.btn, { backgroundColor: C.rougeLight }]} onPress={() => onRetirer?.(m)} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={15} color={C.rouge} />
              </TouchableOpacity>
            </View>
            {complet && (
              <TouchableOpacity
                style={[MCS.btnValider, updatingId && { opacity: 0.55 }]}
                onPress={() => onValiderMembre?.(m)}
                disabled={!!updatingId}
                activeOpacity={0.85}
              >
                {updatingId === m.id
                  ? <ActivityIndicator color={C.blanc} size="small" />
                  : <><Ionicons name="checkmark-done" size={13} color={C.blanc} /><Text style={MCS.btnValiderTxt}>Valider</Text></>
                }
              </TouchableOpacity>
            )}
          </>
        )}

        {equipeValidee && (
          <>
            <View style={[MCS.badge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={11} color={cfg.color} />
              <Text style={[MCS.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {!modeDeconsignation && m.statut === 'en_attente' && (
              <TouchableOpacity style={[MCS.btnRond, { backgroundColor: C.vert }]} onPress={() => onEntreeSite?.(m)} activeOpacity={0.8}>
                <Ionicons name="log-in-outline" size={16} color={C.blanc} />
              </TouchableOpacity>
            )}
            {modeDeconsignation && m.statut === 'sur_site' && (
              <TouchableOpacity style={[MCS.btnRond, { backgroundColor: C.rouge }]} onPress={() => onSortie?.(m)} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={16} color={C.blanc} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function ScanBadge({ route, navigation }) {
  const { demande, userMetier } = route.params || {};

  const [vue, setVue] = useState('liste');

  const [membres,        setMembres]        = useState([]);
  const [equipeValidee,  setEquipeValidee]  = useState(false);
  const [statut,         setStatut]         = useState(null);
  const [intervenants,   setIntervenants]   = useState([]);
  const [rapportGenere,  setRapportGenere]  = useState(null);

  const [scan, setScan] = useState(SCAN_INITIAL);

  const [deconsMembre,  setDeconsMembre]  = useState(null);
  const [deconsCadenas, setDeconsCadenas] = useState(null);

  const [loading,          setLoading]         = useState(true);
  const [loadingInterv,    setLoadingInterv]    = useState(false);
  const [validatingEquipe, setValidatingEquipe] = useState(false);
  const [loadingEntree,    setLoadingEntree]    = useState(false);
  const [loadingDeconsign, setLoadingDeconsign] = useState(false);
  const [updatingMembId,   setUpdatingMembId]   = useState(null);
  const [scanned,          setScanned]          = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [membresSelec,     setMembresSelec]     = useState([]);
  const [modalEntree,      setModalEntree]      = useState(false);

  // ── Chargement ──────────────────────────────────────────────────────
  const charger = useCallback(async () => {
    try {
      setLoading(true);
      const [resE, resS] = await Promise.all([
        getEquipe(demande.id),
        getStatutDeconsignation(demande.id),
      ]);
      if (resE.success) {
        setMembres(resE.data.membres || []);
        setEquipeValidee(resE.data.equipe_validee === 1);
      }
      if (resS.success) {
        setStatut(resS.data);
        if (resS.data?.rapport_pdf_path)
          setRapportGenere({ pdf_path: resS.data.rapport_pdf_path });
      }
    } catch { Alert.alert('Erreur', "Impossible de charger l'équipe."); }
    finally { setLoading(false); }
  }, [demande.id]);

  useEffect(() => { charger(); }, [charger]);

  const resetScan = () => { setScanned(false); setSaving(false); };
  const goListe   = () => { resetScan(); setScan(SCAN_INITIAL); setVue('liste'); };

  // ══════════════════════════════════════════════════════════════════
  // FLUX AJOUT
  // ══════════════════════════════════════════════════════════════════

  // Ouvre la liste des intervenants connus
  const lancerDepuisListe = async () => {
    setLoadingInterv(true);
    try {
      const res = await getIntervenantsDispos(demande.id);
      if (res.success) {
        setIntervenants(res.data || []);
        setScan(SCAN_INITIAL);
        resetScan();
        setVue('selectionIntervenant');
      } else Alert.alert('Erreur', res.message);
    } catch { Alert.alert('Erreur', 'Impossible de charger.'); }
    finally { setLoadingInterv(false); }
  };

  // Nouveau membre inconnu → scan direct
  const lancerNouveauMembre = () => {
    setScan(SCAN_INITIAL);
    resetScan();
    setVue('scanCadenas');
  };

  // Refaire scan d'un membre existant
  const lancerRefaire = (m) => {
    setScan({ ...SCAN_INITIAL, membreId: m.id, nomExist: m.nom });
    resetScan();
    setVue('scanCadenas');
  };

  // Sélection depuis la liste → scan cadenas UNIQUEMENT pour vérifier l'identité
  // Badge et photo déjà enregistrés → pas besoin de les re-scanner
  const choisirIntervenant = (item) => {
    setScan({
      ...SCAN_INITIAL,
      intervenantChoisi: item,
    });
    resetScan();
    setVue('scanCadenas');
  };

  // ── ÉTAPE 1 : Scan cadenas ─────────────────────────────────────────
  const onScanCadenas = useCallback(async ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(80);
    const cad = data.trim();

    // Cas : refaire scan → pas de vérif Option A
    if (scan.membreId) {
      setScan(p => ({ ...p, cadenas: cad }));
      resetScan();
      setVue('scanBadge');
      return;
    }

    // Cas : intervenant choisi depuis liste → vérif cadenas attendu UNIQUEMENT
    // Si OK → réactivation directe (badge + photo déjà enregistrés, pas besoin de les rescanner)
    if (scan.intervenantChoisi) {
      const interv  = scan.intervenantChoisi;
      const attendu = interv.cad_id || interv.numero_cadenas;

      const doReactivation = async (cadenas) => {
        setSaving(true);
        try {
          const formData = new FormData();
          formData.append('demande_id',   String(demande.id));
          formData.append('nom',          interv.nom);
          formData.append('cad_id',       cadenas);
          if (interv.badge_ocp_id)   formData.append('badge_ocp_id',   interv.badge_ocp_id);
          if (interv.matricule)      formData.append('matricule',      interv.matricule);
          if (interv.numero_cadenas) formData.append('numero_cadenas', interv.numero_cadenas);
          // Pas de photo → le backend garde la photo_path existante via COALESCE

          const r = await client.post('/equipe-intervention/membre', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (r.data.success) {
            await charger();
            goListe();
            Alert.alert('Ajouté ✅', `${interv.nom} rejoint l'équipe.`);
          } else {
            Alert.alert('Erreur', r.data.message);
            goListe();
          }
        } catch (e) {
          Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
          goListe();
        } finally { setSaving(false); }
      };

      if (attendu && norm(cad) !== norm(attendu)) {
        // Cadenas ne correspond pas → alerte
        Alert.alert(
          'Cadenas incorrect ⚠️',
          `Le cadenas scanné ne correspond pas à ${interv.nom}.\n\nScanné : ${cad}\nAttendu : ${attendu}`,
          [
            { text: 'Réessayer', style: 'cancel' },
            {
              text: 'Forcer quand même',
              style: 'destructive',
              onPress: () => doReactivation(cad),
            },
          ]
        );
        return;
      }

      // Cadenas OK (ou aucun cadenas attendu enregistré) → réactivation directe
      await doReactivation(cad);
      return;
    }

    // Cas : nouveau membre → Option A : cadenas déjà connu ?
    try {
      const res = await verifierCadenas({ cad_id: cad });
      if (res.success && res.data.found) {
        const mb = res.data.membre;
        Alert.alert(
          'Membre reconnu',
          `${mb.nom} a déjà été dans une équipe.\nRéactiver ce membre ?`,
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Réactiver',
              onPress: async () => {
                setSaving(true);
                try {
                  // FIX : FormData même pour la réactivation (pas de nouvelle photo)
                  const formData = new FormData();
                  formData.append('demande_id', String(demande.id));
                  formData.append('nom',            mb.nom);
                  if (mb.matricule)      formData.append('matricule',      mb.matricule);
                  if (mb.badge_ocp_id)   formData.append('badge_ocp_id',   mb.badge_ocp_id);
                  if (mb.numero_cadenas) formData.append('numero_cadenas', mb.numero_cadenas);
                  formData.append('cad_id', cad);

                  const r = await client.post('/equipe-intervention/membre', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  if (r.data.success) {
                    await charger();
                    goListe();
                    Alert.alert('Réactivé ✅', `${mb.nom} rejoint l'équipe.`);
                  } else {
                    Alert.alert('Erreur', r.data.message);
                  }
                } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
                finally { setSaving(false); }
              },
            },
          ]
        );
        return;
      }
    } catch {}

    // Nouveau inconnu → continuer vers badge
    setScan(p => ({ ...p, cadenas: cad }));
    resetScan();
    setVue('scanBadge');
  }, [scanned, scan, demande.id, charger]);

  // ── ÉTAPE 2 : Scan badge ───────────────────────────────────────────
  const onScanBadge = useCallback(async ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(120);
    setScanned(true);
    setSaving(true);

    try {
      const badge = data.trim();

      // Vérif badge si intervenant connu
      if (scan.intervenantChoisi?.badge_ocp_id) {
        if (norm(badge) !== norm(scan.intervenantChoisi.badge_ocp_id)) {
          Alert.alert(
            'Badge incorrect',
            `Ce badge ne correspond pas à ${scan.intervenantChoisi.nom}.`,
            [{ text: 'Réessayer', onPress: resetScan }]
          );
          setSaving(false);
          return;
        }
      }

      // Résolution du nom via API si pas déjà connu
      let nomResolu = scan.nomResolu || badge;
      let matricule = scan.matricule;
      if (!scan.nomResolu) {
        try {
          const check = await verifierBadge({ badge_ocp_id: badge });
          if (check.success && check.data.found) {
            nomResolu = `${check.data.user.prenom || ''} ${check.data.user.nom || ''}`.trim() || badge;
            matricule = check.data.user.matricule || undefined;
          }
        } catch {}
      }

      setScan(p => ({ ...p, badge, nomResolu, matricule }));
      setSaving(false);
      setScanned(false);
      setVue('prendrePhoto');
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      resetScan();
      setVue('scanCadenas');
    }
  }, [scanned, scan]);

  // ── ÉTAPE 3 : Photo (OBLIGATOIRE) ─────────────────────────────────
  const prendrePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'La photo est obligatoire. Autorisez la caméra.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.65, allowsEditing: false });
      if (result.canceled) {
        Alert.alert('Photo requise', "La photo est une étape obligatoire pour valider l'ajout.");
        return;
      }
      const uri = result.assets[0].uri;
      setScan(p => ({ ...p, photoUri: uri }));
      await enregistrerMembreFinal(uri);
    } catch {
      Alert.alert('Erreur', 'Impossible de prendre la photo.');
    }
  };

  // FIX PRINCIPAL : upload multipart/form-data au lieu de JSON avec URI locale
  const enregistrerMembreFinal = async (photoUri) => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('demande_id', String(demande.id));
      formData.append('nom',         scan.nomResolu || scan.badge);
      formData.append('badge_ocp_id', scan.badge);
      if (scan.matricule) formData.append('matricule', scan.matricule);
      if (scan.cadenas)   formData.append('cad_id',    scan.cadenas);
      if (scan.membreId)  formData.append('membre_id', String(scan.membreId));

      // Fichier photo → le backend multer crée le chemin sur le serveur
      formData.append('photo', {
        uri:  photoUri,
        name: `photo_membre_${Date.now()}.jpg`,
        type: 'image/jpeg',
      });

      const res = await client.post('/equipe-intervention/membre', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        await charger();
        const nom = scan.nomResolu || scan.badge;
        goListe();
        Alert.alert(
          scan.membreId ? 'Scan refait ✅' : 'Membre ajouté ✅',
          scan.membreId ? `${scan.nomExist} a été mis à jour.` : `${nom} rejoint l'équipe.`
        );
      } else {
        Alert.alert('Erreur', res.data.message || 'Enregistrement impossible.');
        goListe();
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      goListe();
    } finally { setSaving(false); }
  };

  // ══════════════════════════════════════════════════════════════════
  // RETIRER — FIX : supprimerMembre retourne réponse axios directement
  // ══════════════════════════════════════════════════════════════════
  const retirerMembre = (m) => {
    Alert.alert(
      '⚠️ Supprimer ce membre ?',
      `${m.nom} sera définitivement supprimé de l'équipe.\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerMembre(m.id);
              setMembres(p => p.filter(x => x.id !== m.id));
              Alert.alert('Supprimé ✅', `${m.nom} a été retiré de l'équipe.`);
            } catch (e) {
              const status = e?.response?.status;
              if (status === 200 || status === 204) {
                setMembres(p => p.filter(x => x.id !== m.id));
                Alert.alert('Supprimé ✅', `${m.nom} a été retiré de l'équipe.`);
              } else {
                Alert.alert('Erreur', e?.response?.data?.message || 'Impossible de supprimer ce membre.');
              }
            }
          },
        },
      ]
    );
  };

  // ══════════════════════════════════════════════════════════════════
  // VALIDER MEMBRE individuel
  // ══════════════════════════════════════════════════════════════════
  const validerUnMembre = (m) => {
    if (!(m.cad_id || m.numero_cadenas) || !m.badge_ocp_id || !m.photo_path) {
      Alert.alert('Incomplet', 'Ce membre doit avoir cadenas, badge et photo avant d\'être validé.');
      return;
    }
    Alert.alert('Membre prêt ✅', `${m.nom} sera inclus dans la validation de l'équipe.`);
  };

  // ══════════════════════════════════════════════════════════════════
  // VALIDER L'ÉQUIPE entière
  // ══════════════════════════════════════════════════════════════════
  const validerTouteEquipe = () => {
    if (!membres.length) { Alert.alert('Attention', 'Ajoutez au moins un membre.'); return; }
    const incomplets = membres.filter(m => !(m.cad_id || m.numero_cadenas) || !m.badge_ocp_id || !m.photo_path);
    if (incomplets.length) {
      Alert.alert(
        `${incomplets.length} membre(s) incomplet(s)`,
        `${incomplets.map(m => m.nom || '—').join(', ')}\n\nChaque membre doit avoir cadenas + badge + photo.`
      );
      return;
    }
    Alert.alert(
      "Valider l'équipe ?",
      `${membres.length} membre(s) vont passer en "En attente d'entrée".`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: async () => {
            try {
              setValidatingEquipe(true);
              const res = await validerEquipe(demande.id);
              if (res.success) { await charger(); Alert.alert('Équipe validée ✅', `${membres.length} membre(s) prêts à entrer.`); }
              else Alert.alert('Erreur', res.message);
            } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
            finally { setValidatingEquipe(false); }
          },
        },
      ]
    );
  };

  // ══════════════════════════════════════════════════════════════════
  // ENTRÉE SUR SITE
  // ══════════════════════════════════════════════════════════════════
  const handleEntreeSingle = (m) => {
    Alert.alert('Confirmer entrée', `Marquer ${m.nom} comme "Sur site" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          setUpdatingMembId(m.id);
          try {
            const res = await marquerEntreeMembres(demande.id, { membres_ids: [m.id] });
            if (res.success) setMembres(p => p.map(x => x.id === m.id ? { ...x, statut: 'sur_site', heure_entree: new Date().toISOString() } : x));
            else Alert.alert('Erreur', res.message);
          } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          finally { setUpdatingMembId(null); }
        },
      },
    ]);
  };

  const handleEntree = async (idsOuTous) => {
    setLoadingEntree(true);
    try {
      const body = idsOuTous === 'tous' ? { tous: true } : { membres_ids: idsOuTous };
      const res  = await marquerEntreeMembres(demande.id, body);
      if (res.success) { await charger(); setModalEntree(false); setMembresSelec([]); }
      else Alert.alert('Erreur', res.message);
    } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
    finally { setLoadingEntree(false); }
  };

  // ══════════════════════════════════════════════════════════════════
  // DÉCONSIGNATION
  // ══════════════════════════════════════════════════════════════════
  const lancerDeconsign = (m) => {
    setDeconsMembre(m);
    setDeconsCadenas(null);
    resetScan();
    setVue('deconsCadenas');
  };

  const onDeconsScanCadenas = ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(80);
    const cad     = data.trim();
    const attendu = deconsMembre?.cad_id || deconsMembre?.numero_cadenas;
    if (attendu && norm(cad) !== norm(attendu)) {
      Alert.alert('Cadenas incorrect', `Scanné : ${cad}\nAttendu : ${attendu}`, [
        { text: 'Réessayer', style: 'cancel' },
        { text: 'Continuer quand même', onPress: () => { setDeconsCadenas(cad); resetScan(); setVue('deconsBadge'); } },
      ]);
      return;
    }
    setDeconsCadenas(cad);
    resetScan();
    setVue('deconsBadge');
  };

  const onDeconsScanBadge = async ({ data }) => {
    if (scanned || !deconsMembre || !deconsCadenas) return;
    Vibration.vibrate(200);
    setScanned(true);
    setSaving(true);
    const badge   = data.trim();
    const attendu = deconsMembre?.badge_ocp_id;
    if (attendu && norm(badge) !== norm(attendu)) {
      Alert.alert('Badge incorrect', `Ce badge ne correspond pas à ${deconsMembre.nom}.`,
        [{ text: 'Réessayer', onPress: resetScan }]);
      setSaving(false);
      return;
    }
    try {
      setLoadingDeconsign(true);
      const res = await deconsignerMembre(deconsMembre.id, {
        cad_id:         deconsCadenas,
        numero_cadenas: deconsMembre.numero_cadenas || undefined,
        badge_ocp_id:   badge,
      });
      if (res.success) {
        const nom = deconsMembre.nom;
        setDeconsMembre(null); setDeconsCadenas(null); resetScan();
        await charger();
        setVue('liste');
        if (res.data.tous_sortis) {
          Alert.alert("Toute l'équipe est sortie !", `${res.data.total} membres ont quitté le chantier.`);
        } else {
          Alert.alert('Sortie enregistrée ✅', `${nom} — ${res.data.sortis}/${res.data.total} sortis.`);
        }
      } else {
        Alert.alert('Erreur', res.message);
        resetScan(); setDeconsCadenas(null); setVue('deconsCadenas');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      resetScan(); setDeconsCadenas(null); setVue('deconsCadenas');
    } finally { setLoadingDeconsign(false); }
  };

  const handleValiderDeconsignation = () => {
    Alert.alert('Valider la déconsignation ?', 'Un rapport PDF sera généré et archivé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Valider + PDF',
        onPress: async () => {
          setLoadingDeconsign(true);
          try {
            const res = await validerDeconsignation(demande.id);
            if (res.success) {
              setRapportGenere(res.data);
              await charger();
              Alert.alert('Déconsignation validée ✅', 'Rapport PDF généré.', [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Voir le rapport', onPress: () => ouvrirPdf(res.data.pdf_path) },
              ]);
            } else Alert.alert('Erreur', res.message);
          } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          finally { setLoadingDeconsign(false); }
        },
      },
    ]);
  };

  const ouvrirPdf = (pdfPath) => {
    if (!pdfPath) return;
    const url = `${BASE_URL}/${pdfPath}`.replace(/([^:]\/)\/+/g, '$1');
    navigation.navigate('PdfViewer', { url, titre: `Rapport — ${demande.numero_ordre}`, role: 'chef_equipe' });
  };

  // ── Dérivés ────────────────────────────────────────────────────────
  const membresEnAttente = membres.filter(m => m.statut === 'en_attente');
  const membresSurSite   = membres.filter(m => m.statut === 'sur_site');
  const peutDeconsigner  = statut?.peut_deconsigner === true;
  const nbComplets       = membres.filter(m => (m.cad_id || m.numero_cadenas) && m.badge_ocp_id && m.photo_path).length;
  const tousComplets     = membres.length > 0 && nbComplets === membres.length;

  const STEPS_AJOUT  = ['Cadenas', 'Badge', 'Photo'];
  const STEPS_DECONS = ['Cadenas', 'Badge'];

  // ══════════════════════════════════════════════════════════════════
  // RENDU
  // ══════════════════════════════════════════════════════════════════
  if (loading) return (
    <View style={[S.flex, S.center, { backgroundColor: C.fond }]}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={{ color: C.gris, marginTop: 12, fontSize: 14 }}>Chargement…</Text>
    </View>
  );

  // ── Sélection intervenant depuis liste ─────────────────────────────
  if (vue === 'selectionIntervenant') return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={goListe}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitre}>Choisir un intervenant</Text>
          <Text style={S.hSub}>{intervenants.length} disponible(s)</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {intervenants.length === 0 ? (
        <View style={[S.center, { flex: 1 }]}>
          <View style={S.emptyIconBox}><Ionicons name="people-outline" size={38} color={C.primary} /></View>
          <Text style={S.emptyTitre}>Aucun intervenant disponible</Text>
          <Text style={S.emptySub}>Utilisez "Nouveau scan" pour ajouter un inconnu</Text>
        </View>
      ) : (
        <FlatList
          data={intervenants}
          keyExtractor={i => i.id.toString()}
          contentContainerStyle={{ padding: 14 }}
          ListHeaderComponent={
            <View style={SI.infoBox}>
              <Ionicons name="information-circle-outline" size={15} color={C.primary} />
              <Text style={SI.infoTxt}>
                Sélectionnez un intervenant puis scannez son cadenas pour confirmer son identité.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={SI.card} onPress={() => choisirIntervenant(item)} activeOpacity={0.78}>
              <View style={[SI.avatar, { backgroundColor: C.primaryLight }]}>
                <Text style={[SI.avatarTxt, { color: C.primary }]}>{(item.nom || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={SI.nom}>{item.nom}</Text>
                <Text style={SI.meta}>
                  {item.badge_ocp_id || item.matricule || '—'}
                  {item.numero_cadenas ? `  ·  🔒 ${item.numero_cadenas}` : ''}
                </Text>
                <View style={SI.chips}>
                  {item.badge_ocp_id && (
                    <View style={[SI.chip, { backgroundColor: C.primaryLight }]}>
                      <Ionicons name="card" size={9} color={C.primary} />
                      <Text style={[SI.chipTxt, { color: C.primary }]}>Badge</Text>
                    </View>
                  )}
                  {(item.cad_id || item.numero_cadenas) && (
                    <View style={[SI.chip, { backgroundColor: C.vertLight }]}>
                      <Ionicons name="lock-closed" size={9} color={C.vert} />
                      <Text style={[SI.chipTxt, { color: C.vert }]}>Cadenas</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={SI.arrow}>
                <Ionicons name="chevron-forward" size={18} color={C.primary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );

  // ── Scan cadenas ───────────────────────────────────────────────────
  // Depuis la liste : 1 seule étape (vérif identité uniquement)
  // Nouveau membre / refaire : stepper 3 étapes
  if (vue === 'scanCadenas') return (
    <EcranScan
      titre={
        scan.membreId          ? `Refaire scan — ${scan.nomExist}` :
        scan.intervenantChoisi ? `Vérification — ${scan.intervenantChoisi.nom}` :
        'Nouveau membre'
      }
      sousTitre={
        scan.intervenantChoisi
          ? 'Scannez le cadenas pour confirmer l\'identité'
          : 'Étape 1 sur 3'
      }
      etape={1}
      stepLabels={scan.intervenantChoisi ? ['Cadenas'] : STEPS_AJOUT}
      iconHint="lock-open-outline"
      badgePill={
        scan.intervenantChoisi ? `Intervenant connu · ${scan.intervenantChoisi.nom}` :
        scan.membreId          ? `Mise à jour de ${scan.nomExist}` :
        `Équipe · ${TYPE_LABEL[userMetier] || 'Chef'}`
      }
      hint={
        scan.intervenantChoisi
          ? `Scannez le cadenas de ${scan.intervenantChoisi.nom}`
          : 'Scannez le cadenas du membre'
      }
      hintSub={
        scan.intervenantChoisi
          ? `Cadenas attendu : ${scan.intervenantChoisi.cad_id || scan.intervenantChoisi.numero_cadenas || 'Non renseigné'}`
          : 'QR code ou code-barres sur le cadenas personnel'
      }
      scanned={scanned} saving={saving}
      onScanned={onScanCadenas}
      onBack={() => {
        if (scan.intervenantChoisi) { resetScan(); setScan(SCAN_INITIAL); setVue('selectionIntervenant'); }
        else goListe();
      }}
    />
  );

  // ── Scan badge ─────────────────────────────────────────────────────
  if (vue === 'scanBadge') return (
    <EcranScan
      titre={scan.membreId ? `Refaire scan — ${scan.nomExist}` : 'Nouveau membre'}
      sousTitre="Étape 2 sur 3"
      etape={2}
      stepLabels={STEPS_AJOUT}
      iconHint="card-outline"
      badgePill={`Cadenas ✓  ${(scan.cadenas || '').substring(0, 12)}`}
      hint={scan.intervenantChoisi ? `Confirmez le badge de ${scan.intervenantChoisi.nom}` : 'Scannez le badge OCP'}
      hintSub={
        scan.intervenantChoisi
          ? `Badge attendu : ${scan.intervenantChoisi.badge_ocp_id || 'Non renseigné'}`
          : "Badge d'identification OCP"
      }
      scanned={scanned} saving={saving}
      onScanned={onScanBadge}
      onBack={() => { setScan(p => ({ ...p, cadenas: null })); resetScan(); setVue('scanCadenas'); }}
    />
  );

  // ── Photo ──────────────────────────────────────────────────────────
  if (vue === 'prendrePhoto') return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={[S.header, { backgroundColor: C.violet }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => { setScan(p => ({ ...p, badge: null })); resetScan(); setVue('scanBadge'); }}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitre}>{scan.membreId ? `Refaire scan — ${scan.nomExist}` : 'Nouveau membre'}</Text>
          <Text style={S.hSub}>Étape 3 sur 3 — Photo obligatoire</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ backgroundColor: C.violet, paddingBottom: 16, alignItems: 'center' }}>
        <StepBar etapeCourante={3} labels={STEPS_AJOUT} />
      </View>

      {/* Résumé */}
      <View style={PH.resumeCard}>
        <View style={[PH.resumeAvatar, { backgroundColor: C.primaryLight }]}>
          <Ionicons name="person" size={32} color={C.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={PH.resumeNom}>{scan.nomResolu || scan.badge || '—'}</Text>
          <View style={PH.chips}>
            <View style={[PH.chip, { backgroundColor: C.vertLight }]}>
              <Ionicons name="lock-closed" size={11} color={C.vert} />
              <Text style={[PH.chipTxt, { color: C.vert }]}>Cadenas ✓</Text>
            </View>
            <View style={[PH.chip, { backgroundColor: C.vertLight }]}>
              <Ionicons name="card" size={11} color={C.vert} />
              <Text style={[PH.chipTxt, { color: C.vert }]}>Badge ✓</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[S.flex, S.center]}>
        <View style={PH.iconWrap}>
          <Ionicons name="camera" size={52} color={C.violet} />
        </View>
        <Text style={PH.titrePh}>Photo du membre</Text>
        <Text style={PH.subPh}>
          La photo est obligatoire pour finaliser l'ajout.{'\n'}
          Assurez-vous que le visage est bien visible.
        </Text>
        <View style={[PH.chip, { backgroundColor: C.rougeLight, marginTop: 10 }]}>
          <Ionicons name="alert-circle-outline" size={12} color={C.rouge} />
          <Text style={[PH.chipTxt, { color: C.rouge }]}>Étape obligatoire</Text>
        </View>
      </View>

      <View style={PH.btnsBox}>
        {saving ? (
          <View style={[S.center, { padding: 20 }]}>
            <ActivityIndicator color={C.violet} size="large" />
            <Text style={{ color: C.gris, marginTop: 10 }}>Enregistrement…</Text>
          </View>
        ) : (
          <TouchableOpacity style={[PH.btnPhoto, { backgroundColor: C.violet }]} onPress={prendrePhoto} activeOpacity={0.85}>
            <Ionicons name="camera" size={24} color={C.blanc} />
            <Text style={PH.btnPhotoTxt}>PRENDRE LA PHOTO</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Sélection entrée ───────────────────────────────────────────────
  if (vue === 'selectionEntree') return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => setVue('liste')}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitre}>Qui entre maintenant ?</Text>
          <Text style={S.hSub}>{membresEnAttente.length} en attente</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={membresEnAttente}
        keyExtractor={m => m.id.toString()}
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const sel = membresSelec.includes(item.id);
          return (
            <TouchableOpacity
              style={[S.selecCard, sel && S.selecCardOn]}
              onPress={() => setMembresSelec(p => p.includes(item.id) ? p.filter(i => i !== item.id) : [...p, item.id])}
              activeOpacity={0.8}
            >
              <View style={[S.selecAv, { backgroundColor: sel ? C.vert : C.primaryLight }]}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: sel ? C.blanc : C.primary }}>
                  {(item.nom || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={S.intervNom}>{item.nom}</Text>
                <Text style={S.intervMeta}>{item.badge_ocp_id || '—'}</Text>
              </View>
              <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={sel ? C.vert : C.gris} />
            </TouchableOpacity>
          );
        }}
      />
      {membresSelec.length > 0 && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnPrinc, { backgroundColor: C.vert }, loadingEntree && S.btnDis]}
            onPress={() => handleEntree(membresSelec)} disabled={loadingEntree} activeOpacity={0.85}
          >
            {loadingEntree ? <ActivityIndicator color={C.blanc} /> : (
              <><Ionicons name="log-in-outline" size={18} color={C.blanc} /><Text style={S.btnPrincTxt}>ENTRER {membresSelec.length} MEMBRE(S)</Text></>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── Déconsignation — scan cadenas ──────────────────────────────────
  if (vue === 'deconsCadenas') return (
    <EcranScan
      titre="Sortie du chantier"
      sousTitre={deconsMembre?.nom}
      etape={1} stepLabels={STEPS_DECONS}
      iconHint="lock-open-outline"
      badgePill={`Sortie · ${deconsMembre?.nom || '—'}`}
      hint="Scannez le cadenas personnel"
      hintSub={`Cadenas de ${deconsMembre?.nom || 'ce membre'}`}
      couleur={C.rouge}
      scanned={scanned} saving={saving || loadingDeconsign}
      onScanned={onDeconsScanCadenas}
      onBack={() => { setDeconsMembre(null); setDeconsCadenas(null); resetScan(); setVue('liste'); }}
    />
  );

  // ── Déconsignation — scan badge ────────────────────────────────────
  if (vue === 'deconsBadge') return (
    <EcranScan
      titre="Sortie du chantier"
      sousTitre={deconsMembre?.nom}
      etape={2} stepLabels={STEPS_DECONS}
      iconHint="card-outline"
      badgePill={`Cadenas ✓  ·  ${deconsMembre?.nom || '—'}`}
      hint="Scannez le badge OCP"
      hintSub="Confirmation d'identité avant sortie"
      couleur={C.rouge}
      scanned={scanned} saving={saving || loadingDeconsign}
      onScanned={onDeconsScanBadge}
      onBack={() => { setDeconsCadenas(null); resetScan(); setVue('deconsCadenas'); }}
    />
  );

  // ══════════════════════════════════════════════════════════════════
  // VUE PRINCIPALE — LISTE
  // ══════════════════════════════════════════════════════════════════
  return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitre}>Équipe d'intervention</Text>
          <Text style={S.hSub}>{demande?.numero_ordre}  ·  TAG {demande?.tag || '—'}</Text>
        </View>
        <TouchableOpacity style={S.backBtn} onPress={charger}>
          <Ionicons name="refresh-outline" size={20} color={C.blanc} />
        </TouchableOpacity>
      </View>

      {peutDeconsigner && !rapportGenere && equipeValidee && (
        <TouchableOpacity style={S.bannerRouge} onPress={handleValiderDeconsignation} disabled={loadingDeconsign} activeOpacity={0.85}>
          <Ionicons name="lock-open-outline" size={20} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={S.bannerTitre}>Déconsignation possible</Text>
            <Text style={S.bannerSub}>Tous sortis — Générer le rapport PDF</Text>
          </View>
          {loadingDeconsign ? <ActivityIndicator color={C.blanc} size="small" /> : <Ionicons name="chevron-forward" size={18} color={C.blanc} />}
        </TouchableOpacity>
      )}

      {rapportGenere && (
        <TouchableOpacity style={[S.bannerRouge, { backgroundColor: C.vert }]} onPress={() => ouvrirPdf(rapportGenere.pdf_path)} activeOpacity={0.85}>
          <Ionicons name="document-text-outline" size={20} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={S.bannerTitre}>Rapport disponible</Text>
            <Text style={S.bannerSub}>Appuyez pour consulter le PDF</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={C.blanc} />
        </TouchableOpacity>
      )}

      <View style={S.statsRow}>
        {[
          { val: membres.length,              label: 'Total',      color: C.primary, bg: C.primaryLight },
          { val: nbComplets,                  label: 'Complets',   color: C.vert,    bg: C.vertLight    },
          { val: membres.length - nbComplets, label: 'Incomplets', color: C.orange,  bg: C.orangeLight  },
        ].map((s, i) => (
          <View key={i} style={[S.statBox, { borderColor: s.color, backgroundColor: s.bg }]}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {!equipeValidee && membres.length > 0 && (
        <View style={S.helpBox}>
          <Ionicons name="information-circle-outline" size={15} color={C.primary} />
          <Text style={S.helpTxt}>
            Chaque membre doit avoir <Text style={{ fontWeight: '800' }}>cadenas + badge + photo</Text>.{' '}
            Utilisez <Ionicons name="refresh-outline" size={12} color={C.primary} /> pour refaire ou{' '}
            <Ionicons name="trash-outline" size={12} color={C.rouge} /> pour supprimer.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
        {membres.length === 0 ? (
          <View style={[S.center, { marginTop: 60 }]}>
            <View style={S.emptyIconBox}><Ionicons name="people-outline" size={38} color={C.primary} /></View>
            <Text style={S.emptyTitre}>Aucun membre</Text>
            <Text style={S.emptySub}>Utilisez les boutons ci-dessous pour ajouter des membres</Text>
          </View>
        ) : (
          membres.map(m => (
            <MembreCard
              key={m.id} m={m}
              equipeValidee={equipeValidee}
              modeDeconsignation={equipeValidee && membresSurSite.length > 0}
              updatingId={updatingMembId}
              onRetirer={!equipeValidee ? retirerMembre : undefined}
              onRefaire={!equipeValidee ? lancerRefaire : undefined}
              onValiderMembre={!equipeValidee ? validerUnMembre : undefined}
              onEntreeSite={handleEntreeSingle}
              onSortie={lancerDeconsign}
            />
          ))
        )}
      </ScrollView>

      {/* Barre boutons bas */}
      <View style={S.bottomBar}>
        {!equipeValidee && (
          <>
            <View style={S.rowBtns}>
              <TouchableOpacity
                style={[S.btnSec, { flex: 1, marginRight: 6 }]}
                onPress={lancerDepuisListe} disabled={loadingInterv} activeOpacity={0.8}
              >
                {loadingInterv ? <ActivityIndicator color={C.primary} size="small" /> : <Ionicons name="people-outline" size={16} color={C.primary} />}
                <Text style={S.btnSecTxt}>Depuis la liste</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.btnSec, { flex: 1, marginLeft: 6 }]}
                onPress={lancerNouveauMembre} activeOpacity={0.8}
              >
                <Ionicons name="scan-outline" size={16} color={C.primary} />
                <Text style={S.btnSecTxt}>Nouveau scan</Text>
              </TouchableOpacity>
            </View>
            {membres.length > 0 && (
              <TouchableOpacity
                style={[S.btnPrinc, !tousComplets && S.btnDisabled, validatingEquipe && S.btnDis]}
                onPress={validerTouteEquipe} disabled={validatingEquipe} activeOpacity={0.85}
              >
                {validatingEquipe ? <ActivityIndicator color={C.blanc} /> : (
                  <><Ionicons name="checkmark-done-outline" size={18} color={C.blanc} /><Text style={S.btnPrincTxt}>VALIDER L'ÉQUIPE ({nbComplets}/{membres.length})</Text></>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {equipeValidee && membresEnAttente.length > 0 && (
          <TouchableOpacity
            style={[S.btnPrinc, { backgroundColor: C.primary }, loadingEntree && S.btnDis]}
            onPress={() => { setMembresSelec([]); setModalEntree(true); }}
            disabled={loadingEntree} activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={18} color={C.blanc} />
            <Text style={S.btnPrincTxt}>MARQUER ENTRÉE ({membresEnAttente.length})</Text>
          </TouchableOpacity>
        )}

        {equipeValidee && peutDeconsigner && !rapportGenere && (
          <TouchableOpacity
            style={[S.btnPrinc, { backgroundColor: C.rouge }, loadingDeconsign && S.btnDis]}
            onPress={handleValiderDeconsignation} disabled={loadingDeconsign} activeOpacity={0.85}
          >
            {loadingDeconsign ? <ActivityIndicator color={C.blanc} /> : (
              <><Ionicons name="lock-open-outline" size={18} color={C.blanc} /><Text style={S.btnPrincTxt}>VALIDER DÉCONSIGNATION + PDF</Text></>
            )}
          </TouchableOpacity>
        )}

        {rapportGenere && (
          <TouchableOpacity style={[S.btnPrinc, { backgroundColor: C.vert }]} onPress={() => ouvrirPdf(rapportGenere.pdf_path)} activeOpacity={0.85}>
            <Ionicons name="document-text-outline" size={18} color={C.blanc} />
            <Text style={S.btnPrincTxt}>VOIR LE RAPPORT PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal entrée site */}
      <Modal transparent visible={modalEntree} animationType="slide">
        <View style={S.modalBg}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitre}>Entrée sur chantier</Text>
            <Text style={S.modalSub}>Qui entre maintenant ?</Text>
            <TouchableOpacity style={S.modalOpt} onPress={() => handleEntree('tous')} disabled={loadingEntree} activeOpacity={0.8}>
              <View style={[S.modalOptIco, { backgroundColor: C.vertLight }]}>
                <Ionicons name="people" size={26} color={C.vert} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptTitre}>Toute l'équipe</Text>
                <Text style={S.modalOptSub}>{membresEnAttente.length} membre(s) en attente</Text>
              </View>
              {loadingEntree ? <ActivityIndicator color={C.vert} size="small" /> : <Ionicons name="chevron-forward" size={16} color={C.gris} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.modalOpt, { marginTop: 10 }]}
              onPress={() => { setModalEntree(false); setMembresSelec([]); setVue('selectionEntree'); }}
              disabled={loadingEntree} activeOpacity={0.8}
            >
              <View style={[S.modalOptIco, { backgroundColor: C.primaryLight }]}>
                <Ionicons name="person-add-outline" size={26} color={C.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptTitre}>Choisir des membres</Text>
                <Text style={S.modalOptSub}>Sélectionner qui entre maintenant</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.gris} />
            </TouchableOpacity>
            <TouchableOpacity style={S.modalAnnuler} onPress={() => setModalEntree(false)}>
              <Text style={{ fontSize: 14, color: C.gris, fontWeight: '600' }}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════
const SI = StyleSheet.create({
  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.primaryLight, borderRadius: 12, padding: 12, marginBottom: 10 },
  infoTxt:  { flex: 1, fontSize: 12, color: C.primary, lineHeight: 17 },
  card:     { backgroundColor: C.card, borderRadius: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, borderWidth: 1.5, borderColor: C.border },
  avatar:   { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:{ fontSize: 20, fontWeight: '800' },
  nom:      { fontSize: 14, fontWeight: '700', color: C.grisDark },
  meta:     { fontSize: 11, color: C.gris, marginTop: 2 },
  chips:    { flexDirection: 'row', gap: 4, marginTop: 6 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  chipTxt:  { fontSize: 9, fontWeight: '700' },
  arrow:    { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
});

const MCS = StyleSheet.create({
  card:        { backgroundColor: C.card, borderRadius: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardComplet: { borderWidth: 1.5, borderColor: C.vert },
  cardIncomplet:{ borderWidth: 1.5, borderColor: '#FFCC80' },
  cardActif:   { borderWidth: 1.5, borderColor: C.rouge },
  stripe:      { width: 4, alignSelf: 'stretch' },
  avatar:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  avatarImg:   { width: 48, height: 48, borderRadius: 24, marginLeft: 10 },
  avatarTxt:   { fontSize: 18, fontWeight: '800' },
  nom:         { fontSize: 14, fontWeight: '700', color: C.grisDark },
  meta:        { fontSize: 11, color: C.gris, marginTop: 2 },
  heure:       { fontSize: 11, marginTop: 3, fontWeight: '600' },
  chips:       { flexDirection: 'row', gap: 4, marginTop: 5 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  chipTxt:     { fontSize: 9, fontWeight: '700' },
  actions:     { alignItems: 'flex-end', paddingRight: 10, paddingVertical: 8 },
  badge:       { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, gap: 3 },
  badgeTxt:    { fontSize: 10, fontWeight: '700' },
  btnsRow:     { flexDirection: 'row', gap: 6, marginTop: 5 },
  btn:         { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btnValider:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.vert, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 5 },
  btnValiderTxt:{ color: C.blanc, fontSize: 11, fontWeight: '800' },
  btnRond:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});

const FRAME = 220;
const SC = StyleSheet.create({
  permWrap:      { flex: 1, backgroundColor: '#0A0E1A', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 },
  permIcon:      { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  permTitre:     { color: C.blanc, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permBtn:       { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13 },
  permBtnTxt:    { color: C.blanc, fontSize: 14, fontWeight: '700' },
  header:        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  backBtn:       { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitre:        { color: C.blanc, fontSize: 14, fontWeight: '700' },
  hSub:          { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  stepFloat:     { position: 'absolute', top: Platform.OS === 'ios' ? 110 : 94, left: 0, right: 0, zIndex: 20, alignItems: 'center' },
  stepBar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 30, paddingHorizontal: 16, paddingVertical: 10 },
  stepItem:      { alignItems: 'center', gap: 3 },
  stepCircle:    { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  stepCircleOn:  { backgroundColor: C.primary, borderColor: C.primary },
  stepNum:       { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.4)' },
  stepLbl:       { fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  stepLine:      { width: 28, height: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 6, marginBottom: 12 },
  stepLineOn:    { backgroundColor: C.primary },
  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  frame:         { width: FRAME, height: FRAME, borderRadius: 14, overflow: 'hidden' },
  corner:        { position: 'absolute', width: 22, height: 22 },
  successOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.22)', alignItems: 'center', justifyContent: 'center' },
  instrWrap:     { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  pillTxt:       { color: C.blanc, fontSize: 11, fontWeight: '700' },
  instrCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.primary}E0`, borderRadius: 14, padding: 14 },
  instrDot:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  instrTitre:    { color: C.blanc, fontSize: 13, fontWeight: '700' },
  instrSub:      { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 3 },
});

const PH = StyleSheet.create({
  resumeCard:  { margin: 16, marginTop: 0, backgroundColor: C.card, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  resumeAvatar:{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  resumeNom:   { fontSize: 15, fontWeight: '700', color: C.grisDark, marginBottom: 8 },
  chips:       { flexDirection: 'row', gap: 6 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  chipTxt:     { fontSize: 10, fontWeight: '700' },
  iconWrap:    { width: 96, height: 96, borderRadius: 48, backgroundColor: C.violetLight, alignItems: 'center', justifyContent: 'center' },
  titrePh:     { fontSize: 18, fontWeight: '700', color: C.grisDark, marginTop: 16, marginBottom: 8 },
  subPh:       { fontSize: 13, color: C.gris, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  btnsBox:     { padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20 },
  btnPhoto:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 17, gap: 10, elevation: 4, shadowColor: C.violet, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  btnPhotoTxt: { color: C.blanc, fontWeight: '800', fontSize: 15, letterSpacing: 0.4 },
});

const S = StyleSheet.create({
  flex:       { flex: 1 },
  center:     { alignItems: 'center', justifyContent: 'center' },
  header:     { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary },
  backBtn:    { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hTitre:     { color: C.blanc, fontWeight: '700', fontSize: 16 },
  hSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  bannerRouge:{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.rouge, margin: 14, marginBottom: 0, borderRadius: 16, padding: 14, elevation: 4, shadowColor: C.rouge, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bannerTitre:{ color: C.blanc, fontWeight: '800', fontSize: 13 },
  bannerSub:  { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  statsRow:   { flexDirection: 'row', margin: 14, marginBottom: 0, gap: 10 },
  statBox:    { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  statVal:    { fontSize: 22, fontWeight: '800' },
  statLbl:    { fontSize: 10, fontWeight: '600', marginTop: 2 },
  helpBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.primaryLight, borderRadius: 12, margin: 14, marginBottom: 0, padding: 10 },
  helpTxt:    { flex: 1, fontSize: 12, color: C.primary, lineHeight: 17 },
  emptyIconBox:{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitre: { fontSize: 15, fontWeight: '700', color: C.grisDark },
  emptySub:   { fontSize: 12, color: C.gris, marginTop: 6, textAlign: 'center' },
  intervNom:  { fontSize: 14, fontWeight: '700', color: C.grisDark },
  intervMeta: { fontSize: 11, color: C.gris, marginTop: 2 },
  selecCard:  { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  selecCardOn:{ borderWidth: 1.5, borderColor: C.vert, backgroundColor: '#F1FFF4' },
  selecAv:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bottomBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.blanc, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 16, borderTopWidth: 1, borderTopColor: C.border, elevation: 10, gap: 8 },
  rowBtns:    { flexDirection: 'row' },
  btnPrinc:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, gap: 8, elevation: 4, shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  btnPrincTxt:{ color: C.blanc, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  btnDis:     { opacity: 0.5 },
  btnDisabled:{ opacity: 0.45 },
  btnSec:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 11, borderWidth: 1.5, borderColor: C.primary, backgroundColor: C.primaryLight, gap: 6 },
  btnSecTxt:  { fontWeight: '700', fontSize: 12, color: C.primary },
  modalBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.blanc, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHandle:{ width: 38, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 18 },
  modalTitre: { fontSize: 18, fontWeight: '800', color: C.grisDark, marginBottom: 4 },
  modalSub:   { fontSize: 13, color: C.gris, marginBottom: 20 },
  modalOpt:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFB', borderRadius: 16, padding: 14 },
  modalOptIco:{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  modalOptTitre:{ fontSize: 14, fontWeight: '700', color: C.grisDark },
  modalOptSub:{ fontSize: 12, color: C.gris, marginTop: 2 },
  modalAnnuler:{ marginTop: 16, alignItems: 'center', paddingVertical: 12 },
});