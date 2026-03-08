// src/components/chefIntervenant/ScanCadenasEquipe.js
// ✅ FIXES APPLIQUÉS :
//  1. Pattern scan identique au chargé : feedback visuel ✅ dans viseur + setTimeout(500) avant navigation
//  2. Suppression des Alert bloquants dans le handler de scan → remplacé par bandeau animé
//  3. Fix décalage stepper : onLayout sur header → top dynamique (plus de valeur fixe)
//  4. showBandeau() pour feedback erreur/succès dans le viseur caméra
//  5. Corrections bugs précédents conservées (intervenantChoisiRef, modeChoix)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated, FlatList,
  ActivityIndicator, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import client from '../../api/client';
import { getIntervenantsDispos, verifierCadenas } from '../../api/equipeIntervention.api';

const C = {
  primary:      '#1565C0',
  primaryDark:  '#0D47A1',
  primaryLight: '#E3F2FD',
  vert:         '#2E7D32',
  vertLight:    '#E8F5E9',
  rouge:        '#C62828',
  rougeLight:   '#FFEBEE',
  orange:       '#F57C00',
  blanc:        '#FFFFFF',
  fond:         '#F0F4F8',
  gris:         '#9E9E9E',
  grisDark:     '#424242',
  card:         '#FFFFFF',
  border:       '#E8EDF2',
};

const norm = (v) => (v || '').trim().toLowerCase().replace(/[\s-]/g, '');

function ScanLine({ color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return <Animated.View style={[S.scanLine, { backgroundColor: color, transform: [{ translateY }] }]} />;
}

const FRAME = 220;

export default function ScanCadenasEquipe({ navigation, route }) {
  const { demande, userMetier, scanParams } = route.params;
  const params = scanParams || {};

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]        = useState(false);
  const [saving,     setSaving]         = useState(false);

  // ── État dédié pour l'intervenant choisi ─────────────────────────
  const [intervenantChoisi, setIntervenantChoisi] = useState(
    params.intervenantChoisi || null
  );
  const intervenantChoisiRef = useRef(params.intervenantChoisi || null);

  const setIntervenant = (interv) => {
    intervenantChoisiRef.current = interv;
    setIntervenantChoisi(interv);
  };

  const [cameraOpen, setCameraOpen] = useState(
    !!(params.membreId || params.intervenantChoisi)
  );
  const [modeChoix,   setModeChoix]   = useState(
    !params.membreId && !params.intervenantChoisi
  );
  const [intervenants, setIntervenants] = useState([]);
  const [loadingList,  setLoadingList]  = useState(false);

  // ── ✅ NOUVEAU : bandeau feedback dans la caméra ──────────────────
  const [statusMsg,  setStatusMsg]  = useState(null);
  const statusAnim  = useRef(new Animated.Value(0)).current;

  // ── ✅ NOUVEAU : headerH pour position dynamique du stepper ───────
  const [headerH, setHeaderH] = useState(
    Platform.OS === 'ios' ? 106 : 90
  );

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cooldown  = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    if (cameraOpen) pulse.start();
    return () => pulse.stop();
  }, [cameraOpen]);

  useEffect(() => {
    if (modeChoix) chargerIntervenants();
  }, []);

  const chargerIntervenants = async () => {
    setLoadingList(true);
    try {
      const res = await getIntervenantsDispos(demande.id);
      if (res.success) setIntervenants(res.data || []);
    } catch {}
    finally { setLoadingList(false); }
  };

  const resetCam = () => {
    cooldown.current = false;
    setScanned(false);
    setSaving(false);
  };

  // ── ✅ NOUVEAU : bandeau animé (même pattern que validerConsignation chargé) ──
  const showBandeau = (type, text) => {
    setStatusMsg({ type, text });
    statusAnim.setValue(0);
    Animated.timing(statusAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(statusAnim, { toValue: 0, duration: 280, useNativeDriver: true })
        .start(() => setStatusMsg(null));
    }, 2000);
  };

  // ── Handler scan ──────────────────────────────────────────────────
  const handleBarCodeScanned = useCallback(async ({ data }) => {
    if (scanned || cooldown.current || saving) return;

    // ✅ Bloquer IMMÉDIATEMENT — même pattern que le chargé
    cooldown.current = true;
    setScanned(true);
    Vibration.vibrate(200);

    const cad = data.trim();
    if (!cad || cad.length < 2) {
      showBandeau('err', 'QR invalide — code trop court');
      setTimeout(resetCam, 2200);
      return;
    }

    // ── CAS 1 : Refaire scan d'un membre existant ───────────────────
    if (params.membreId) {
      // ✅ Feedback vert + délai 500ms avant navigation (pattern chargé)
      showBandeau('ok', `Cadenas scanné ✅`);
      setTimeout(() => {
        setCameraOpen(false);
        cooldown.current = false;
        setScanned(false);
        navigation.replace('ScanBadgeEquipe', {
          demande, userMetier,
          scanParams: { ...params, cadenas: cad },
        });
      }, 500);
      return;
    }

    // ── CAS 2 : Intervenant choisi depuis la liste ──────────────────
    const interv = intervenantChoisiRef.current;
    if (interv) {
      const attendu = interv.cad_id || interv.numero_cadenas;

      // ✅ Mauvais cadenas → bandeau rouge (plus d'Alert bloquant)
      if (attendu && norm(cad) !== norm(attendu)) {
        showBandeau('err', `❌ Cadenas incorrect — attendu : ${attendu}`);
        setTimeout(resetCam, 2500);
        return;
      }

      // ✅ Cadenas OK → feedback vert + sauvegarde en arrière-plan
      showBandeau('ok', `Cadenas confirmé ✅ — ${interv.nom}`);
      setSaving(true);

      try {
        const formData = new FormData();
        formData.append('demande_id', String(demande.id));
        formData.append('nom',        interv.nom);
        formData.append('cad_id',     cad);
        if (interv.badge_ocp_id)   formData.append('badge_ocp_id',   interv.badge_ocp_id);
        if (interv.matricule)      formData.append('matricule',      interv.matricule);
        if (interv.numero_cadenas) formData.append('numero_cadenas', interv.numero_cadenas);

        const r = await client.post('/equipe-intervention/membre', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (r.data.success) {
          // ✅ Même délai 500ms que le chargé avant navigation
          setTimeout(() => {
            setCameraOpen(false);
            navigation.navigate('GestionEquipe', { demande, userMetier, refresh: Date.now() });
            Alert.alert('Ajouté ✅', `${interv.nom} rejoint l'équipe.`);
          }, 500);
        } else {
          showBandeau('err', r.data.message || 'Enregistrement impossible');
          setTimeout(resetCam, 2200);
        }
      } catch (e) {
        showBandeau('err', e?.response?.data?.message || 'Problème réseau');
        setTimeout(resetCam, 2200);
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── CAS 3 : Nouveau membre inconnu → vérification base ─────────
    try {
      const res = await verifierCadenas({ cad_id: cad });
      if (res.success && res.data.found) {
        const mb = res.data.membre;
        // ✅ Membre reconnu : feedback + Alert de confirmation (hors viseur)
        showBandeau('warn', `Membre reconnu : ${mb.nom}`);
        setTimeout(() => {
          Alert.alert(
            'Membre reconnu 👤',
            `${mb.nom} a déjà été dans une équipe.\nRéactiver ce membre ?`,
            [
              { text: 'Annuler', style: 'cancel', onPress: resetCam },
              {
                text: 'Réactiver',
                onPress: async () => {
                  setSaving(true);
                  try {
                    const formData = new FormData();
                    formData.append('demande_id', String(demande.id));
                    formData.append('nom',        mb.nom);
                    if (mb.matricule)      formData.append('matricule',      mb.matricule);
                    if (mb.badge_ocp_id)   formData.append('badge_ocp_id',   mb.badge_ocp_id);
                    if (mb.numero_cadenas) formData.append('numero_cadenas', mb.numero_cadenas);
                    formData.append('cad_id', cad);

                    const r = await client.post('/equipe-intervention/membre', formData, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    if (r.data.success) {
                      setCameraOpen(false);
                      navigation.navigate('GestionEquipe', { demande, userMetier, refresh: Date.now() });
                      Alert.alert('Réactivé ✅', `${mb.nom} rejoint l'équipe.`);
                    } else {
                      Alert.alert('Erreur', r.data.message);
                    }
                  } catch (e) {
                    Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
                  } finally {
                    setSaving(false);
                    resetCam();
                  }
                },
              },
            ]
          );
        }, 800); // ✅ Laisser le bandeau s'afficher avant l'Alert
        return;
      }
    } catch {}

    // ✅ Nouveau inconnu → feedback vert + délai 500ms avant navigation
    showBandeau('ok', 'Cadenas scanné ✅');
    setTimeout(() => {
      setCameraOpen(false);
      cooldown.current = false;
      setScanned(false);
      navigation.replace('ScanBadgeEquipe', {
        demande, userMetier,
        scanParams: { ...params, cadenas: cad },
      });
    }, 500);

  }, [scanned, saving, params, demande, navigation]);

  // ── Vue caméra ────────────────────────────────────────────────────
  if (cameraOpen) {
    if (!permission?.granted) return (
      <View style={[S.center, { flex: 1, backgroundColor: '#0A0E1A' }]}>
        <Ionicons name="camera-off-outline" size={64} color={C.rouge} />
        <Text style={S.permTitle}>Accès caméra requis</Text>
        <TouchableOpacity style={[S.permBtn, { backgroundColor: C.primary }]} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );

    const intervActuel = intervenantChoisi;
    const stepLabels   = intervActuel ? ['Cadenas'] : ['Cadenas', 'Badge', 'Photo'];
    const titre        = params.membreId
      ? `Refaire — ${params.nomExist}`
      : intervActuel
        ? `Vérification — ${intervActuel.nom}`
        : 'Nouveau membre';

    // ✅ Couleur bandeau selon type
    const bandColor =
      statusMsg?.type === 'ok'   ? C.vert :
      statusMsg?.type === 'warn' ? C.orange : C.rouge;

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* ✅ onLayout pour mesurer la hauteur réelle du header */}
        <View
          style={S.header}
          onLayout={e => setHeaderH(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity style={S.backBtn} onPress={() => { setCameraOpen(false); resetCam(); }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>{titre}</Text>
            <Text style={S.hSub}>
              {intervActuel ? 'Confirmation identité' : 'Étape 1 / 3 — Cadenas'}
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* ✅ Stepper positionné dynamiquement sous le header */}
        <View style={[S.stepperCam, { top: headerH }]}>
          {stepLabels.map((lbl, i) => (
            <View key={i} style={S.stepItem}>
              <View style={[S.stepCircle, i === 0 && { backgroundColor: C.primary }]}>
                <Text style={[S.stepNum, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
              </View>
              <Text style={[S.stepLbl, i === 0 && { color: '#fff', fontWeight: '700' }]}>{lbl}</Text>
            </View>
          ))}
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
        />

        {/* Overlay viseur */}
        <View style={S.overlay} pointerEvents="none">
          <View style={S.overlayTop} />
          <View style={S.overlayRow}>
            <View style={S.overlaySide} />
            <Animated.View style={[S.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
              <View style={[S.corner, S.cornerTL, { borderColor: C.primary }]} />
              <View style={[S.corner, S.cornerTR, { borderColor: C.primary }]} />
              <View style={[S.corner, S.cornerBL, { borderColor: C.primary }]} />
              <View style={[S.corner, S.cornerBR, { borderColor: C.primary }]} />
              {!scanned && <ScanLine color={C.primary} />}
              {/* ✅ Feedback visuel dans le viseur — identique au chargé */}
              {scanned && (
                <View style={S.successOverlay}>
                  <Ionicons
                    name={saving ? 'sync-outline' : 'checkmark-circle'}
                    size={64}
                    color={saving ? C.orange : C.vert}
                  />
                </View>
              )}
            </Animated.View>
            <View style={S.overlaySide} />
          </View>
          <View style={S.overlayBottom} />
        </View>

        {/* ✅ Bandeau feedback animé (pattern identique au chargé) */}
        {statusMsg && (
          <Animated.View
            pointerEvents="none"
            style={[S.bandeau, { backgroundColor: bandColor, opacity: statusAnim }]}
          >
            <Text style={S.bandeauTxt}>{statusMsg.text}</Text>
          </Animated.View>
        )}

        {/* Instructions bas */}
        <View style={S.instructions}>
          {intervActuel && (
            <View style={[S.elecBadge, { backgroundColor: `${C.primary}CC` }]}>
              <Ionicons name="person-circle-outline" size={14} color="#fff" />
              <Text style={S.elecBadgeTxt}>Intervenant connu · {intervActuel.nom}</Text>
            </View>
          )}
          <View style={[
            S.instructCard,
            scanned && { backgroundColor: saving ? C.orange : C.vert },
          ]}>
            <Ionicons
              name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'lock-open-outline'}
              size={24} color="#fff"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>
                {saving ? 'Traitement...' : scanned ? 'Cadenas scanné !' : 'Scannez le cadenas personnel'}
              </Text>
              {intervActuel && !scanned && (
                <Text style={S.instrSub}>
                  Attendu : {intervActuel.cad_id || intervActuel.numero_cadenas || 'Non renseigné'}
                </Text>
              )}
              {!scanned && !intervActuel && (
                <Text style={S.instrSub}>Format : CAD-2026-001 ou QR code du cadenas</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── Vue liste / choix ─────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.fond }}>
      <StatusBar barStyle="light-content" backgroundColor={C.primaryDark} />

      <View style={[S.header2, { backgroundColor: C.primary }]}>
        <TouchableOpacity style={S.backBtn2} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle2}>Ajouter un membre</Text>
          <Text style={S.hSub2}>{demande?.numero_ordre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={S.stepper}>
        {['Cadenas', 'Badge', 'Photo'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[S.stepCircle, i === 0 && { backgroundColor: C.primary }]}>
              <Text style={[S.stepNum, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[S.stepLbl, i === 0 && { color: C.primary, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={S.choixRow}>
        <TouchableOpacity
          style={[S.choixBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
          onPress={() => { setModeChoix(true); chargerIntervenants(); }}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={22} color={C.primary} />
          <Text style={[S.choixBtnTxt, { color: C.primary }]}>Depuis la liste</Text>
          <Text style={[S.choixBtnSub, { color: C.primary }]}>Intervenant connu</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.choixBtn, { backgroundColor: C.primary }]}
          onPress={() => {
            setModeChoix(false);
            setIntervenant(null);
            setCameraOpen(true);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="scan-outline" size={22} color="#fff" />
          <Text style={[S.choixBtnTxt, { color: '#fff' }]}>Nouveau scan</Text>
          <Text style={[S.choixBtnSub, { color: 'rgba(255,255,255,0.75)' }]}>Inconnu</Text>
        </TouchableOpacity>
      </View>

      {modeChoix && (
        loadingList ? (
          <View style={[S.center, { flex: 1 }]}>
            <ActivityIndicator color={C.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={intervenants}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={[S.center, { marginTop: 40 }]}>
                <Ionicons name="people-outline" size={40} color={C.gris} />
                <Text style={{ color: C.gris, marginTop: 8 }}>Aucun intervenant disponible</Text>
              </View>
            }
            ListHeaderComponent={
              <View style={S.infoBox}>
                <Ionicons name="information-circle-outline" size={14} color={C.primary} />
                <Text style={S.infoTxt}>
                  Sélectionnez un intervenant puis scannez son cadenas pour confirmer son identité.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={S.intervCard}
                onPress={() => {
                  setIntervenant(item);
                  setCameraOpen(true);
                }}
                activeOpacity={0.78}
              >
                <View style={[S.avatar, { backgroundColor: C.primaryLight }]}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: C.primary }}>
                    {(item.nom || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.intervNom}>{item.nom}</Text>
                  <Text style={S.intervMeta}>
                    {item.badge_ocp_id || item.matricule || '—'}
                    {item.numero_cadenas ? `  ·  🔒 ${item.numero_cadenas}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                    {item.badge_ocp_id && (
                      <View style={[S.chip, { backgroundColor: C.primaryLight }]}>
                        <Ionicons name="card" size={9} color={C.primary} />
                        <Text style={[S.chipTxt, { color: C.primary }]}>Badge ✓</Text>
                      </View>
                    )}
                    {(item.cad_id || item.numero_cadenas) && (
                      <View style={[S.chip, { backgroundColor: C.vertLight }]}>
                        <Ionicons name="lock-closed" size={9} color={C.vert} />
                        <Text style={[S.chipTxt, { color: C.vert }]}>Cadenas ✓</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.primary} />
              </TouchableOpacity>
            )}
          />
        )
      )}
    </View>
  );
}

const S = StyleSheet.create({
  center:     { alignItems: 'center', justifyContent: 'center' },
  permTitle:  { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  permBtn:    { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 },
  permBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Header caméra (position absolute)
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  // Header liste
  header2:  { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn2: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle2:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub2:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  stepper: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 28, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },

  // ✅ Stepper caméra : top géré dynamiquement via headerH (plus de valeur fixe)
  stepperCam: {
    position: 'absolute', left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'center',
    paddingVertical: 12, gap: 28,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepLbl:    { fontSize: 9, color: 'rgba(255,255,255,0.5)' },

  choixRow:    { flexDirection: 'row', gap: 12, padding: 14 },
  choixBtn:    { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1.5, elevation: 2 },
  choixBtnTxt: { fontWeight: '800', fontSize: 13 },
  choixBtnSub: { fontSize: 10, fontWeight: '600' },

  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, marginBottom: 10 },
  infoTxt: { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 17 },

  intervCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', padding: 14, elevation: 2, borderWidth: 1.5, borderColor: '#E8EDF2' },
  avatar:     { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  intervNom:  { fontSize: 14, fontWeight: '700', color: '#424242' },
  intervMeta: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  chipTxt:    { fontSize: 9, fontWeight: '700' },

  // Overlay caméra
  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame:     { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },

  corner:         { position: 'absolute', width: 24, height: 24, borderWidth: 3 },
  cornerTL:       { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:       { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:       { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:       { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },
  scanLine:       { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.8, borderRadius: 1 },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(46,125,50,0.3)', alignItems: 'center', justifyContent: 'center' },

  // ✅ Bandeau feedback — identique au pattern chargé
  bandeau: {
    position: 'absolute', zIndex: 20,
    top: '44%', left: 20, right: 20,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 12,
  },
  bandeauTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  instructions:  { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  elecBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  elecBadgeTxt:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  instructCard:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, backgroundColor: 'rgba(21,101,192,0.9)' },
  instrTitle:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:      { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
});