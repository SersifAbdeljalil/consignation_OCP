// src/components/charge/scanCadenasNFC.js
// Le charge scanne UNIQUEMENT les points charge_type='electricien'
// Les points charge_type='process' sont affiches en lecture seule (grises)
// Workflow : Cadenas -> Photo -> Valider (avec badge integre)
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { scannerCadenas, scannerCadenasLibre } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bgPale:      '#d8f3dc',
};

export default function ScanCadenasNFC({ navigation, route }) {
  const { demande, points } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Separer les points : electricien (scannables) vs process (lecture seule)
  const pointsElec    = points.filter(p => p.charge_type === 'electricien' || !p.charge_type);
  const pointsProcess = points.filter(p => p.charge_type === 'process');
  const modeLibre     = points.length === 0;

  const [cadenasList, setCadenasList] = useState(
    (modeLibre ? [] : pointsElec).map(p => ({
      point_id:       p.id,
      repere:         p.repere_point,
      localisation:   p.localisation,
      dispositif:     p.dispositif_condamnation,
      charge_type:    p.charge_type || 'electricien',
      numero_cadenas: p.numero_cadenas || null,
      mcc_ref:        p.mcc_ref        || null,
      saved:          !!p.numero_cadenas,
    }))
  );

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (modeLibre) return -1;
    return pointsElec.findIndex(p => !p.numero_cadenas);
  });

  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || saving) return;
    const qrData = data.trim();
    if (!qrData || qrData.length < 3) {
      Alert.alert('QR invalide', `QR vide ou trop court.\nLu : ${qrData}`, [{ text: 'Reessayer' }]);
      return;
    }
    const parts          = qrData.includes('::') ? qrData.split('::') : [qrData];
    const numero_cadenas = parts[0].trim();
    const mcc_ref        = parts[1]?.trim() || '';

    setScanned(true);
    Vibration.vibrate(200);

    if (currentIndex >= 0) {
      await saveCadenasAvecPoint(currentIndex, numero_cadenas, mcc_ref);
    } else {
      await saveCadenasLibre(numero_cadenas, mcc_ref);
    }
  };

  const saveCadenasAvecPoint = async (index, numero_cadenas, mcc_ref) => {
    const point = cadenasList[index];
    if (!point?.point_id) {
      const updated = cadenasList.map((c, i) =>
        i === index ? { ...c, numero_cadenas, mcc_ref, saved: true } : c
      );
      setCadenasList(updated);
      setCameraOpen(false);
      setScanned(false);
      const next = updated.findIndex((c, i) => i > index && !c.saved);
      setCurrentIndex(next >= 0 ? next : -2);
      return;
    }
    setSaving(true);
    try {
      const res = await scannerCadenas(point.point_id, { numero_cadenas, mcc_ref });
      if (res?.success) {
        const updated = cadenasList.map((c, i) =>
          i === index ? { ...c, numero_cadenas, mcc_ref, saved: true } : c
        );
        setCadenasList(updated);
        setCameraOpen(false);
        setScanned(false);
        const next = updated.findIndex((c, i) => i > index && !c.saved);
        setCurrentIndex(next >= 0 ? next : -2);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible de sauvegarder');
        setScanned(false);
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion.');
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  const saveCadenasLibre = async (numero_cadenas, mcc_ref) => {
    setSaving(true);
    try {
      const res = await scannerCadenasLibre({
        demande_id:   demande.id,
        numero_cadenas,
        mcc_ref,
        repere:       `Point-${cadenasList.length + 1}`,
        localisation: demande.equipement_localisation || demande.tag,
        dispositif:   'Cadenas',
        etat_requis:  'ouvert',
        charge_type:  'electricien',
      });
      if (res?.success) {
        setCadenasList(prev => [...prev, {
          point_id:      res.data?.point_id || null,
          repere:        `Point-${prev.length + 1}`,
          localisation:  demande.equipement_localisation || '—',
          dispositif:    'Cadenas',
          charge_type:   'electricien',
          numero_cadenas,
          mcc_ref,
          saved:         true,
        }]);
        setCameraOpen(false);
        setScanned(false);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible de sauvegarder');
        setScanned(false);
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion.');
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  const nbElecTotal    = modeLibre ? 0 : pointsElec.length;
  const nbElecConsigne = cadenasList.filter(c => c.numero_cadenas).length;
  const tousElecDone   = modeLibre
    ? cadenasList.length > 0
    : cadenasList.length > 0 && cadenasList.every(c => c.numero_cadenas);

  const handleSuivant = () => {
    const allPoints = [
      ...cadenasList,
      ...pointsProcess.map(p => ({
        point_id:       p.id,
        repere:         p.repere_point,
        localisation:   p.localisation,
        dispositif:     p.dispositif_condamnation,
        charge_type:    'process',
        numero_cadenas: p.numero_cadenas || null,
        mcc_ref:        p.mcc_ref        || null,
        saved:          !!p.numero_cadenas,
      })),
    ];
    navigation.navigate('PrendrePhoto', { demande, points: allPoints });
  };

  const ouvrirScan = (index) => {
    setCurrentIndex(index);
    setScanned(false);
    setCameraOpen(true);
  };

  if (!permission?.granted) {
    return (
      <View style={S.center}>
        <Ionicons name="camera-off-outline" size={64} color="#EF4444" />
        <Text style={S.permTitle}>Acces camera requis</Text>
        <TouchableOpacity style={[S.permBtn, { backgroundColor: CFG.couleur }]} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Vue camera
  if (cameraOpen) {
    const ptEnCours = currentIndex >= 0 && cadenasList[currentIndex] ? cadenasList[currentIndex] : null;
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={S.header}>
          <TouchableOpacity style={S.backBtn} onPress={() => { setCameraOpen(false); setScanned(false); }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>Etape 1 / 3 — Cadenas</Text>
            <Text style={S.hSub}>
              {ptEnCours
                ? `Point ${currentIndex + 1} / ${cadenasList.length}`
                : `Cadenas libre ${cadenasList.length + 1}`
              }
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />

        <View style={S.overlay} pointerEvents="none">
          <View style={S.overlayTop} />
          <View style={S.overlayRow}>
            <View style={S.overlaySide} />
            <Animated.View style={[S.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
              <View style={[S.corner, S.cornerTL]} />
              <View style={[S.corner, S.cornerTR]} />
              <View style={[S.corner, S.cornerBL]} />
              <View style={[S.corner, S.cornerBR]} />
              {!scanned && <ScanLine color={CFG.couleur} />}
              {scanned && (
                <View style={S.successOverlay}>
                  {saving
                    ? <Ionicons name="sync-outline" size={64} color="#F59E0B" />
                    : <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                  }
                </View>
              )}
            </Animated.View>
            <View style={S.overlaySide} />
          </View>
          <View style={S.overlayBottom} />
        </View>

        <View style={S.instructions}>
          <View style={S.elecBadge}>
            <Ionicons name="flash-outline" size={14} color="#fff" />
            <Text style={S.elecBadgeTxt}>Cadenas electrique — Charge de consignation</Text>
          </View>
          <View style={[S.instructCard, scanned && { backgroundColor: saving ? '#D97706' : '#10B981' }]}>
            <Ionicons
              name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'lock-open-outline'}
              size={24} color="#fff"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>
                {saving ? 'Sauvegarde...' : scanned ? 'Cadenas enregistre !' : 'Scannez le QR du cadenas'}
              </Text>
              {ptEnCours && !scanned && (
                <Text style={S.instrSub}>{ptEnCours.repere} — {ptEnCours.dispositif}</Text>
              )}
              {!scanned && (
                <Text style={S.instrSub}>Format : CAD-2026-001 ou CAD-2026-001::MCC-A01</Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Vue liste
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header2, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn2} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle2}>Etape 1 / 3 — Cadenas</Text>
          <Text style={S.hSub2}>Pose des cadenas electriques</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={S.stepper}>
        {['Cadenas', 'Photo', 'Valider'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[S.stepCircle, i === 0 && { backgroundColor: CFG.couleur }]}>
              <Text style={[S.stepNum, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[S.stepLbl, i === 0 && { color: CFG.couleur, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      {/* Progression points electrique */}
      {!modeLibre && cadenasList.length > 0 && (
        <View style={S.progressContainer}>
          <View style={S.progressBar}>
            <View style={[S.progressFill, {
              width: `${(nbElecConsigne / nbElecTotal) * 100}%`,
              backgroundColor: tousElecDone ? '#10B981' : CFG.couleur,
            }]} />
          </View>
          <Text style={S.progressLbl}>
            {nbElecConsigne} / {nbElecTotal} cadenas electriques poses
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 130 }}>

        {/* Info equipement */}
        <View style={S.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="hardware-chip-outline" size={14} color={CFG.couleur} />
            <Text style={{ fontSize: 12, color: '#9E9E9E' }}>Equipement : </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#212121', flex: 1 }}>
              {demande.tag} — {demande.equipement_nom}
            </Text>
          </View>
        </View>

        {/* Points ELECTRICIEN - scannables */}
        {(cadenasList.length > 0 || modeLibre) && (
          <View style={[S.card, { marginTop: 12 }]}>
            <View style={S.sectionHeader}>
              <View style={[S.sectionBadge, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="flash-outline" size={13} color="#4F46E5" />
                <Text style={[S.sectionBadgeTxt, { color: '#4F46E5' }]}>Electrique — Votre responsabilite</Text>
              </View>
              {!modeLibre && (
                <Text style={{ fontSize: 11, color: '#9E9E9E' }}>{nbElecConsigne}/{nbElecTotal}</Text>
              )}
            </View>

            {cadenasList.length === 0 && modeLibre && (
              <View style={{ alignItems: 'center', padding: 20 }}>
                <Ionicons name="lock-open-outline" size={48} color="#BDBDBD" />
                <Text style={{ color: '#9E9E9E', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                  Aucun cadenas scanne.{'\n'}Appuyez sur le bouton ci-dessous pour commencer.
                </Text>
              </View>
            )}

            {cadenasList.map((c, i) => (
              <View key={i} style={[S.pointRow, c.saved && { borderLeftColor: CFG.couleur, borderLeftWidth: 3 }]}>
                <View style={[S.pointIcon, { backgroundColor: c.saved ? CFG.bgPale : '#F5F5F5' }]}>
                  <Ionicons
                    name={c.saved ? 'lock-closed' : 'lock-open-outline'}
                    size={16} color={c.saved ? CFG.couleur : '#BDBDBD'}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={S.pointRepere}>{c.repere}</Text>
                  <Text style={S.pointLocal}>{c.localisation}</Text>
                  {c.saved ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Ionicons name="checkmark-circle" size={11} color={CFG.couleur} />
                      <Text style={{ fontSize: 10, color: CFG.couleur, fontWeight: '700' }}>
                        {c.numero_cadenas}{c.mcc_ref ? ` | MCC: ${c.mcc_ref}` : ''}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 10, color: '#BDBDBD', marginTop: 1 }}>En attente de scan</Text>
                  )}
                </View>
                {!c.saved ? (
                  <TouchableOpacity
                    style={[S.scanBtn, { backgroundColor: CFG.couleur }]}
                    onPress={() => ouvrirScan(i)}
                  >
                    <Ionicons name="qr-code-outline" size={16} color="#fff" />
                    <Text style={S.scanBtnTxt}>Scan</Text>
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="checkmark-circle" size={22} color={CFG.couleur} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Points PROCESS - lecture seule */}
        {pointsProcess.length > 0 && (
          <View style={[S.card, { marginTop: 12, opacity: 0.75 }]}>
            <View style={S.sectionHeader}>
              <View style={[S.sectionBadge, { backgroundColor: '#FFF3CD' }]}>
                <Ionicons name="cog-outline" size={13} color="#B45309" />
                <Text style={[S.sectionBadgeTxt, { color: '#B45309' }]}>Process — Chef Process</Text>
              </View>
              <Text style={{ fontSize: 11, color: '#9E9E9E' }}>
                {pointsProcess.filter(p => p.numero_cadenas).length}/{pointsProcess.length}
              </Text>
            </View>

            <View style={S.processInfoBanner}>
              <Ionicons name="information-circle-outline" size={15} color="#B45309" />
              <Text style={S.processInfoTxt}>
                Ces points sont consignes par le Chef Process. Vous n'avez pas a les scanner.
              </Text>
            </View>

            {pointsProcess.map((pt, i) => {
              const fait = !!pt.numero_cadenas;
              return (
                <View key={i} style={S.pointRowGris}>
                  <View style={[S.pointIcon, { backgroundColor: fait ? '#FFF3CD' : '#F5F5F5' }]}>
                    <Ionicons
                      name={fait ? 'lock-closed' : 'lock-open-outline'}
                      size={16} color={fait ? '#B45309' : '#BDBDBD'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[S.pointRepere, { color: '#9E9E9E' }]}>{pt.repere_point}</Text>
                    <Text style={S.pointLocal}>{pt.localisation}</Text>
                    {fait
                      ? <Text style={{ fontSize: 10, color: '#B45309', fontWeight: '700', marginTop: 2 }}>{pt.numero_cadenas}</Text>
                      : <Text style={{ fontSize: 10, color: '#BDBDBD', marginTop: 1 }}>En attente du Chef Process</Text>
                    }
                  </View>
                  <View style={S.lockBadge}>
                    <Ionicons name="lock-closed-outline" size={12} color="#9E9E9E" />
                    <Text style={S.lockBadgeTxt}>Process</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>

      {/* Boutons bas */}
      <View style={S.bottomBar}>
        {modeLibre && (
          <TouchableOpacity
            style={[S.btnSecondary, { borderColor: CFG.couleur }]}
            onPress={() => { setCurrentIndex(-1); setScanned(false); setCameraOpen(true); }}
          >
            <Ionicons name="add-circle-outline" size={18} color={CFG.couleur} />
            <Text style={[S.btnSecondaryTxt, { color: CFG.couleur }]}>
              {cadenasList.length === 0 ? 'Scanner le premier cadenas' : 'Ajouter un cadenas'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[S.btnSuivant, { backgroundColor: tousElecDone ? CFG.couleur : '#BDBDBD' }]}
          onPress={handleSuivant}
          disabled={!tousElecDone}
          activeOpacity={0.85}
        >
          <Ionicons name="camera-outline" size={22} color="#fff" />
          <Text style={S.btnSuivantTxt}>
            {tousElecDone
              ? `SUIVANT — PRENDRE PHOTO  (${nbElecConsigne} cadenas)`
              : modeLibre
                ? 'Scannez au moins 1 cadenas'
                : `${nbElecTotal - nbElecConsigne} cadenas restant(s)`
            }
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ScanLine({ color }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
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
const S = StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1a14', padding: 30, gap: 16 },
  permTitle:  { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn:    { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  header:  { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  header2:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn2: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle2:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub2:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  stepper:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 28, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 12, fontWeight: '800', color: '#9E9E9E' },
  stepLbl:    { fontSize: 9, color: '#9E9E9E' },

  progressContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  progressBar:  { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 4, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLbl:  { fontSize: 11, color: '#9E9E9E', textAlign: 'right' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },

  sectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  sectionBadgeTxt: { fontSize: 11, fontWeight: '700' },

  processInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  processInfoTxt: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 },

  pointRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointRowGris:{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9F9', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0', borderStyle: 'dashed' },
  pointIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere: { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:  { fontSize: 11, color: '#9E9E9E', marginTop: 1 },

  lockBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  lockBadgeTxt: { fontSize: 10, color: '#9E9E9E', fontWeight: '600' },

  scanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  scanBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  elecBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(79,70,229,0.85)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  elecBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame:     { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },

  corner:    { position: 'absolute', width: 24, height: 24, borderColor: '#2d6a4f', borderWidth: 3 },
  cornerTL:  { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },

  scanLine:      { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.8, borderRadius: 1 },
  successOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.3)', alignItems: 'center', justifyContent: 'center' },

  instructions:  { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  instructCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45,106,79,0.9)', borderRadius: 14, padding: 14 },
  instrTitle:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:      { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },

  bottomBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10, gap: 8 },
  btnSecondary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  btnSecondaryTxt: { fontSize: 13, fontWeight: '700' },
  btnSuivant:      { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnSuivantTxt:   { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
});