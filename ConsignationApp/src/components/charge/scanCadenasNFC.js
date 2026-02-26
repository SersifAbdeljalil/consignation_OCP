// src/components/charge/scanCadenasNFC.js
//
// ✅ Mode avec points prédéfinis : sauvegarde via /points/:id/cadenas
// ✅ Mode libre (sans plan HSE) : sauvegarde via /cadenas-libre
// Format QR cadenas attendu : CAD-2026-001::MCC-A01  (sans préfixe CADENAS::)
//
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
  const { demande, points, badge_id } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Liste des cadenas (initialisée depuis les points existants)
  const [cadenasList, setCadenasList] = useState(
    points.map(p => ({
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
    if (points.length === 0) return -1;
    return points.findIndex(p => !p.numero_cadenas);
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

  // ── Scan QR cadenas ──────────────────────────
  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || saving) return;

    const qrData = data.trim();

    // ── Format accepté :
    // Simple  : CAD-2026-001              → mcc_ref = ''
    // Complet : CAD-2026-001::MCC-A01     → mcc_ref = 'MCC-A01'
    if (!qrData || qrData.length < 3) {
      Alert.alert('QR invalide', `QR vide ou trop court.\nLu : ${qrData}`, [{ text: 'Réessayer' }]);
      return;
    }

    const parts          = qrData.includes('::') ? qrData.split('::') : [qrData];
    const numero_cadenas = parts[0].trim();
    const mcc_ref        = parts[1]?.trim() || '';

    console.log('[ScanCadenas] QR scanné → numero:', numero_cadenas, '| mcc:', mcc_ref);

    setScanned(true);
    Vibration.vibrate(200);

    if (currentIndex >= 0) {
      // Mode avec points prédéfinis
      await saveCadenasAvecPoint(currentIndex, numero_cadenas, mcc_ref);
    } else {
      // Mode libre — sauvegarde en BDD via /cadenas-libre
      await saveCadenasLibre(numero_cadenas, mcc_ref);
    }
  };

  // ── Mode avec points prédéfinis ───────────────
  const saveCadenasAvecPoint = async (index, numero_cadenas, mcc_ref) => {
    const point = cadenasList[index];

    if (!point?.point_id) {
      setCadenasList(prev => prev.map((c, i) =>
        i === index ? { ...c, numero_cadenas, mcc_ref, saved: true } : c
      ));
      setCameraOpen(false);
      setScanned(false);
      const next = cadenasList.findIndex((c, i) => i > index && !c.saved);
      setCurrentIndex(next >= 0 ? next : -2);
      return;
    }

    setSaving(true);
    try {
      const res = await scannerCadenas(point.point_id, { numero_cadenas, mcc_ref });
      if (res?.success) {
        setCadenasList(prev => prev.map((c, i) =>
          i === index ? { ...c, numero_cadenas, mcc_ref, saved: true } : c
        ));
        setCameraOpen(false);
        setScanned(false);
        // ✅ Trouver automatiquement le prochain point non scanné
        const updatedList = cadenasList.map((c, i) =>
          i === index ? { ...c, saved: true } : c
        );
        const next = updatedList.findIndex((c, i) => i > index && !c.saved);
        setCurrentIndex(next >= 0 ? next : -2);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible de sauvegarder le cadenas');
        setScanned(false);
      }
    } catch (e) {
      Alert.alert('Erreur', 'Erreur de connexion. Vérifiez votre réseau.');
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  // ── Mode libre (pas de points en BDD) ────────
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
      });

      if (res?.success) {
        const newItem = {
          point_id:      res.data?.point_id || null,
          repere:        `Point-${cadenasList.length + 1}`,
          localisation:  demande.equipement_localisation || '—',
          dispositif:    'Cadenas',
          numero_cadenas,
          mcc_ref,
          saved:         true,
        };
        setCadenasList(prev => [...prev, newItem]);
        setCameraOpen(false);
        setScanned(false);
      } else {
        Alert.alert('Erreur', res?.message || 'Impossible de sauvegarder le cadenas');
        setScanned(false);
      }
    } catch (e) {
      Alert.alert('Erreur', 'Erreur de connexion. Vérifiez votre réseau.');
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  const tousConsignes = cadenasList.length > 0 && cadenasList.every(c => c.numero_cadenas);
  const nbConsignes   = cadenasList.filter(c => c.numero_cadenas).length;

  const handleSuivant = () => {
    navigation.navigate('PrendrePhoto', {
      demande,
      points: cadenasList.map(c => ({
        ...c,
        numero_cadenas: c.numero_cadenas,
        mcc_ref:        c.mcc_ref,
      })),
      badge_id,
    });
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
        <Text style={S.permTitle}>Accès caméra requis</Text>
        <TouchableOpacity style={[S.permBtn, { backgroundColor: CFG.couleur }]} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── VUE CAMÉRA ────────────────────────────────
  if (cameraOpen) {
    const ptEnCours = currentIndex >= 0 && cadenasList[currentIndex]
      ? cadenasList[currentIndex]
      : null;

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={S.header}>
          <TouchableOpacity
            style={S.backBtn}
            onPress={() => { setCameraOpen(false); setScanned(false); }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>Étape 2 / 4</Text>
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
          <View style={[S.instructCard, scanned && { backgroundColor: saving ? '#D97706' : '#10B981' }]}>
            <Ionicons
              name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'lock-open-outline'}
              size={24} color="#fff"
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>
                {saving
                  ? 'Sauvegarde en cours...'
                  : scanned
                    ? '✅ Cadenas enregistré en BDD !'
                    : 'Scannez le QR du cadenas'
                }
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

  // ── VUE LISTE ─────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header2, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn2} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle2}>Étape 2 / 4</Text>
          <Text style={S.hSub2}>Pose des cadenas</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Barre de progression */}
      {cadenasList.length > 0 && (
        <View style={S.progressContainer}>
          <View style={S.progressBar}>
            <View style={[S.progressFill, {
              width: `${(nbConsignes / cadenasList.length) * 100}%`,
              backgroundColor: tousConsignes ? '#10B981' : CFG.couleur,
            }]} />
          </View>
          <Text style={S.progressLbl}>
            {nbConsignes} / {cadenasList.length} cadenas posés et enregistrés
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }}>

        {/* Infos badge + équipement */}
        <View style={S.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="card-outline" size={14} color={CFG.couleur} />
            <Text style={{ fontSize: 12, color: '#9E9E9E' }}>Badge vérifié : </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: CFG.couleur }}>{badge_id}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="hardware-chip-outline" size={14} color={CFG.couleur} />
            <Text style={{ fontSize: 12, color: '#9E9E9E' }}>Équipement : </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#212121', flex: 1 }}>
              {demande.tag} — {demande.equipement_nom}
            </Text>
          </View>
        </View>

        {/* Liste des points prédéfinis */}
        {cadenasList.length > 0 && points.length > 0 ? (
          <View style={[S.card, { marginTop: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Ionicons name="lock-closed-outline" size={16} color={CFG.couleur} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#212121' }}>Points à consigner</Text>
            </View>

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
                        {c.numero_cadenas} | MCC: {c.mcc_ref}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 10, color: '#BDBDBD' }}>En attente de scan</Text>
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
        ) : (
          /* Mode libre */
          <View style={[S.card, { marginTop: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Ionicons name="lock-closed-outline" size={16} color={CFG.couleur} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#212121' }}>
                Cadenas posés ({cadenasList.length}) — Enregistrés en BDD ✅
              </Text>
            </View>

            {cadenasList.length === 0 && (
              <View style={{ alignItems: 'center', padding: 20 }}>
                <Ionicons name="lock-open-outline" size={48} color="#BDBDBD" />
                <Text style={{ color: '#9E9E9E', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                  Aucun cadenas scanné pour l'instant.{'\n'}Appuyez sur le bouton ci-dessous pour commencer.
                </Text>
              </View>
            )}

            {cadenasList.map((c, i) => (
              <View key={i} style={[S.pointRow, { borderLeftColor: CFG.couleur, borderLeftWidth: 3 }]}>
                <View style={[S.pointIcon, { backgroundColor: CFG.bgPale }]}>
                  <Ionicons name="lock-closed" size={16} color={CFG.couleur} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={S.pointRepere}>{c.repere}</Text>
                  <Text style={{ fontSize: 11, color: CFG.couleur, fontWeight: '700' }}>
                    {c.numero_cadenas} | MCC: {c.mcc_ref}
                  </Text>
                  <Text style={{ fontSize: 9, color: '#10B981', marginTop: 1 }}>✅ Sauvegardé en BDD</Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color={CFG.couleur} />
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Boutons bas */}
      <View style={S.bottomBar}>
        {/* Ajouter cadenas (mode libre) */}
        {points.length === 0 && (
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
          style={[S.btnSuivant, {
            backgroundColor: (tousConsignes || (points.length === 0 && cadenasList.length > 0))
              ? CFG.couleur : '#BDBDBD'
          }]}
          onPress={handleSuivant}
          disabled={!(tousConsignes || (points.length === 0 && cadenasList.length > 0))}
          activeOpacity={0.85}
        >
          <Ionicons name="camera-outline" size={22} color="#fff" />
          <Text style={S.btnSuivantTxt}>
            {tousConsignes || cadenasList.length > 0
              ? `SUIVANT → PRENDRE PHOTO (${nbConsignes} cadenas)`
              : `Scannez les ${points.length - nbConsignes} cadenas restants`
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
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1a14', padding: 30, gap: 16 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn:   { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnTxt:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  header:  { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  header2:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn2: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle2:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub2:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  progressContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  progressBar:  { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 4, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLbl:  { fontSize: 11, color: '#9E9E9E', textAlign: 'right' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },

  pointRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere: { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:  { fontSize: 11, color: '#9E9E9E', marginTop: 1 },

  scanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2d6a4f', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  scanBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  overlay:      { ...StyleSheet.absoluteFillObject },
  overlayTop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayRow:   { flexDirection: 'row', height: FRAME },
  overlaySide:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame:    { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },

  corner:    { position: 'absolute', width: 24, height: 24, borderColor: '#2d6a4f', borderWidth: 3 },
  cornerTL:  { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },

  scanLine:      { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.8, borderRadius: 1 },
  successOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.3)', alignItems: 'center', justifyContent: 'center' },

  instructions:  { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  instructCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45,106,79,0.9)', borderRadius: 14, padding: 14 },
  instrTitle:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:      { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },

  bottomBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10, gap: 8 },
  btnSecondary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  btnSecondaryTxt: { fontSize: 13, fontWeight: '700' },
  btnSuivant:      { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnSuivantTxt:   { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
});