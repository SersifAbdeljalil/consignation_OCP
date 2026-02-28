// src/components/process/scanCadenasProcess.js
// Chef Process scanne UNIQUEMENT les points charge_type='process'
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { scannerCadenasProcess, scannerCadenasLibreProcess } from '../../api/process.api';

const CFG = {
  couleur:     '#b45309',
  couleurDark: '#92400e',
  bgPale:      '#fde68a',
};

export default function ScanCadenasProcess({ navigation, route }) {
  const { demande, points } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const pointsProcess = points.filter(p => p.charge_type === 'process');
  const pointsElec    = points.filter(p => p.charge_type !== 'process');
  const modeLibre     = pointsProcess.length === 0;

  const [cadenasList, setCadenasList] = useState(
    (modeLibre ? [] : pointsProcess).map(p => ({
      point_id:       p.id,
      repere:         p.repere_point,
      localisation:   p.localisation,
      dispositif:     p.dispositif_condamnation,
      numero_cadenas: p.numero_cadenas || null,
      mcc_ref:        p.mcc_ref        || null,
      saved:          !!p.numero_cadenas,
    }))
  );

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (modeLibre) return -1;
    return pointsProcess.findIndex(p => !p.numero_cadenas);
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
      Alert.alert('QR invalide', `QR vide ou trop court.\nLu : ${qrData}`, [{ text: 'Réessayer' }]);
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
      setCameraOpen(false); setScanned(false);
      const next = updated.findIndex((c, i) => i > index && !c.saved);
      setCurrentIndex(next >= 0 ? next : -2);
      return;
    }
    setSaving(true);
    try {
      const res = await scannerCadenasProcess(point.point_id, { numero_cadenas, mcc_ref });
      if (res?.success) {
        const updated = cadenasList.map((c, i) =>
          i === index ? { ...c, numero_cadenas, mcc_ref, saved: true } : c
        );
        setCadenasList(updated);
        setCameraOpen(false); setScanned(false);
        const next = updated.findIndex((c, i) => i > index && !c.saved);
        setCurrentIndex(next >= 0 ? next : -2);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible de sauvegarder');
        setScanned(false);
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion');
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  const saveCadenasLibre = async (numero_cadenas, mcc_ref) => {
    setSaving(true);
    try {
      const res = await scannerCadenasLibreProcess({
        demande_id:   demande.id,
        numero_cadenas,
        mcc_ref,
        repere:       `Point-P${cadenasList.length + 1}`,
        localisation: demande.equipement_localisation || demande.tag,
        dispositif:   'Dispositif+Cadenas',
        etat_requis:  'ferme',
      });
      if (res?.success) {
        setCadenasList(prev => [...prev, {
          point_id:      res.data?.point_id || null,
          repere:        `Point-P${prev.length + 1}`,
          localisation:  demande.equipement_localisation || '—',
          dispositif:    'Dispositif+Cadenas',
          numero_cadenas, mcc_ref, saved: true,
        }]);
        setCameraOpen(false); setScanned(false);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible de sauvegarder');
        setScanned(false);
      }
    } catch {
      Alert.alert('Erreur', 'Erreur de connexion');
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  const nbProcessTotal    = modeLibre ? 0 : pointsProcess.length;
  const nbProcessConsigne = cadenasList.filter(c => c.numero_cadenas).length;
  const tousProcessDone   = modeLibre
    ? cadenasList.length > 0
    : cadenasList.length > 0 && cadenasList.every(c => c.numero_cadenas);

  const handleSuivant = () => {
    navigation.navigate('ValiderProcess', { demande, cadenasList });
  };

  const ouvrirScan = (index) => {
    setCurrentIndex(index); setScanned(false); setCameraOpen(true);
  };

  if (!permission?.granted) {
    return (
      <View style={S.center}>
        <Ionicons name="camera-off-outline" size={64} color="#EF4444" />
        <Text style={S.permTitle}>Accès caméra requis</Text>
        <TouchableOpacity style={[S.permBtn, { backgroundColor: CFG.couleur }]} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
            <Text style={S.hTitle}>Étape 1 / 2 — Cadenas Process</Text>
            <Text style={S.hSub}>
              {ptEnCours ? `Point ${currentIndex + 1} / ${cadenasList.length}` : `Cadenas libre ${cadenasList.length + 1}`}
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
                  {saving ? <Ionicons name="sync-outline" size={64} color="#F59E0B" /> : <Ionicons name="checkmark-circle" size={64} color="#10B981" />}
                </View>
              )}
            </Animated.View>
            <View style={S.overlaySide} />
          </View>
          <View style={S.overlayBottom} />
        </View>

        <View style={S.instructions}>
          <View style={S.processBadge}>
            <Ionicons name="cog-outline" size={14} color="#fff" />
            <Text style={S.processBadgeTxt}>Cadenas process — Chef Process</Text>
          </View>
          <View style={[S.instructCard, scanned && { backgroundColor: saving ? '#D97706' : '#10B981' }]}>
            <Ionicons name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'lock-open-outline'} size={24} color="#fff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>
                {saving ? 'Sauvegarde...' : scanned ? 'Cadenas enregistré !' : 'Scannez le QR du cadenas'}
              </Text>
              {ptEnCours && !scanned && <Text style={S.instrSub}>{ptEnCours.repere} — {ptEnCours.dispositif}</Text>}
              {!scanned && <Text style={S.instrSub}>Format : CAD-2026-001 ou CAD-2026-001::MCC-P01</Text>}
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header2, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn2} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle2}>Étape 1 / 2 — Cadenas</Text>
          <Text style={S.hSub2}>Pose des cadenas process</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={S.stepper}>
        {['Cadenas', 'Valider'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[S.stepCircle, i === 0 && { backgroundColor: CFG.couleur }]}>
              <Text style={[S.stepNum, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[S.stepLbl, i === 0 && { color: CFG.couleur, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      {!modeLibre && cadenasList.length > 0 && (
        <View style={S.progressContainer}>
          <View style={S.progressBar}>
            <View style={[S.progressFill, { width: `${(nbProcessConsigne / nbProcessTotal) * 100}%`, backgroundColor: tousProcessDone ? '#10B981' : CFG.couleur }]} />
          </View>
          <Text style={S.progressLbl}>{nbProcessConsigne} / {nbProcessTotal} cadenas process posés</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 130 }}>
        <View style={S.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="hardware-chip-outline" size={14} color={CFG.couleur} />
            <Text style={{ fontSize: 12, color: '#9E9E9E' }}>Équipement : </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#212121', flex: 1 }}>{demande.tag} — {demande.equipement_nom}</Text>
          </View>
        </View>

        <View style={[S.card, { marginTop: 12 }]}>
          <View style={S.sectionHeader}>
            <View style={[S.sectionBadge, { backgroundColor: CFG.bgPale }]}>
              <Ionicons name="cog-outline" size={13} color={CFG.couleur} />
              <Text style={[S.sectionBadgeTxt, { color: CFG.couleur }]}>Process — Votre responsabilité</Text>
            </View>
            {!modeLibre && <Text style={{ fontSize: 11, color: '#9E9E9E' }}>{nbProcessConsigne}/{nbProcessTotal}</Text>}
          </View>

          {cadenasList.length === 0 && modeLibre && (
            <View style={{ alignItems: 'center', padding: 20 }}>
              <Ionicons name="lock-open-outline" size={48} color="#BDBDBD" />
              <Text style={{ color: '#9E9E9E', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                Aucun cadenas scanné.{'\n'}Appuyez ci-dessous pour commencer.
              </Text>
            </View>
          )}

          {cadenasList.map((c, i) => (
            <View key={i} style={[S.pointRow, c.saved && { borderLeftColor: CFG.couleur, borderLeftWidth: 3 }]}>
              <View style={[S.pointIcon, { backgroundColor: c.saved ? CFG.bgPale : '#F5F5F5' }]}>
                <Ionicons name={c.saved ? 'lock-closed' : 'lock-open-outline'} size={16} color={c.saved ? CFG.couleur : '#BDBDBD'} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={S.pointRepere}>{c.repere}</Text>
                <Text style={S.pointLocal}>{c.localisation}</Text>
                {c.saved ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="checkmark-circle" size={11} color={CFG.couleur} />
                    <Text style={{ fontSize: 10, color: CFG.couleur, fontWeight: '700' }}>{c.numero_cadenas}{c.mcc_ref ? ` | ${c.mcc_ref}` : ''}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 10, color: '#BDBDBD', marginTop: 1 }}>En attente de scan</Text>
                )}
              </View>
              {!c.saved ? (
                <TouchableOpacity style={[S.scanBtn, { backgroundColor: CFG.couleur }]} onPress={() => ouvrirScan(i)}>
                  <Ionicons name="qr-code-outline" size={16} color="#fff" />
                  <Text style={S.scanBtnTxt}>Scan</Text>
                </TouchableOpacity>
              ) : (
                <Ionicons name="checkmark-circle" size={22} color={CFG.couleur} />
              )}
            </View>
          ))}
        </View>

        {pointsElec.length > 0 && (
          <View style={[S.card, { marginTop: 12, opacity: 0.75 }]}>
            <View style={S.sectionHeader}>
              <View style={[S.sectionBadge, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="flash-outline" size={13} color="#6B7280" />
                <Text style={[S.sectionBadgeTxt, { color: '#6B7280' }]}>Électricien — Chargé consignation</Text>
              </View>
            </View>
            <View style={S.elecInfoBanner}>
              <Ionicons name="information-circle-outline" size={15} color="#6B7280" />
              <Text style={S.elecInfoTxt}>Ces points sont gérés par le Chargé de consignation.</Text>
            </View>
            {pointsElec.map((pt, i) => (
              <View key={i} style={S.pointRowGris}>
                <View style={[S.pointIcon, { backgroundColor: '#F3F4F6' }]}>
                  <Ionicons name={pt.numero_cadenas ? 'lock-closed' : 'lock-open-outline'} size={16} color="#9E9E9E" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[S.pointRepere, { color: '#9E9E9E' }]}>{pt.repere_point || pt.repere}</Text>
                  <Text style={S.pointLocal}>{pt.localisation}</Text>
                </View>
                <View style={S.lockBadge}>
                  <Text style={S.lockBadgeTxt}>Élec</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

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
          style={[S.btnSuivant, { backgroundColor: tousProcessDone ? CFG.couleur : '#BDBDBD' }]}
          onPress={handleSuivant}
          disabled={!tousProcessDone}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
          <Text style={S.btnSuivantTxt}>
            {tousProcessDone ? `SUIVANT — VALIDER (${nbProcessConsigne} cadenas)` : modeLibre ? 'Scannez au moins 1 cadenas' : `${nbProcessTotal - nbProcessConsigne} restant(s)`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ScanLine({ color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 1500, useNativeDriver: true }),
    ])).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return <Animated.View style={[S.scanLine, { backgroundColor: color, transform: [{ translateY }] }]} />;
}

const FRAME = 220;
const S = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1628', padding: 30, gap: 16 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  header2: { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn2: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle2: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub2: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  stepper: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 48, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontWeight: '800', color: '#9E9E9E' },
  stepLbl: { fontSize: 9, color: '#9E9E9E' },
  progressContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  progressBar: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 4, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLbl: { fontSize: 11, color: '#9E9E9E', textAlign: 'right' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  sectionBadgeTxt: { fontSize: 11, fontWeight: '700' },
  elecInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 10, padding: 10, marginBottom: 12 },
  elecInfoTxt: { flex: 1, fontSize: 11, color: '#6B7280', lineHeight: 16 },
  pointRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointRowGris: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0', borderStyle: 'dashed' },
  pointIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere: { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal: { fontSize: 11, color: '#9E9E9E', marginTop: 1 },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  lockBadgeTxt: { fontSize: 10, color: '#9E9E9E', fontWeight: '600' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  scanBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  processBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(180,83,9,0.85)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  processBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayRow: { flexDirection: 'row', height: FRAME },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame: { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#b45309', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  scanLine: { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.8, borderRadius: 1 },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(180,83,9,0.25)', alignItems: 'center', justifyContent: 'center' },
  instructions: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  instructCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(180,83,9,0.9)', borderRadius: 14, padding: 14 },
  instrTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10, gap: 8 },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  btnSecondaryTxt: { fontSize: 13, fontWeight: '700' },
  btnSuivant: { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnSuivantTxt: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
});