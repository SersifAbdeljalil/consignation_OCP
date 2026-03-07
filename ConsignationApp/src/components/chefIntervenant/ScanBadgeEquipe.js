// src/components/chefIntervenant/ScanBadgeEquipe.js
// Étape 2 — Scan badge (chef intervenant)
// Inspiré de scanBadgeNFC.js (chargé) — couleurs bleues #1565C0
//
// FIX : setScanned(true) EN PREMIÈRE LIGNE + setTimeout 300ms avant navigation
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated, Platform, SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { verifierBadge } from '../../api/equipeIntervention.api';

const C = {
  primary:     '#1565C0',
  primaryDark: '#0D47A1',
  vert:        '#2E7D32',
  rouge:       '#C62828',
  orange:      '#F57C00',
  blanc:       '#FFFFFF',
  gris:        '#9E9E9E',
};

function ScanLine({ color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME - 4] });
  return <Animated.View style={[S.scanLine, { backgroundColor: color, transform: [{ translateY }] }]} />;
}

const FRAME = 240;

export default function ScanBadgeEquipe({ navigation, route }) {
  const { demande, userMetier, scanParams } = route.params;
  const params = scanParams || {};

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cooldown  = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleBarCodeScanned = useCallback(async ({ data }) => {
    if (scanned || cooldown.current) return;

    // FIX : bloquer IMMÉDIATEMENT en première ligne
    cooldown.current = true;
    setScanned(true);
    Vibration.vibrate(200);
    setSaving(true);

    try {
      const badge = data.trim();
      if (!badge) {
        Alert.alert('QR invalide', 'Badge vide.', [{ text: 'Réessayer', onPress: resetCam }]);
        setSaving(false);
        return;
      }

      // Résolution nom/matricule via API
      let nomResolu = badge;
      let matricule = null;
      try {
        const check = await verifierBadge({ badge_ocp_id: badge });
        if (check.success && check.data.found) {
          nomResolu = `${check.data.user.prenom || ''} ${check.data.user.nom || ''}`.trim() || badge;
          matricule = check.data.user.matricule || null;
        }
      } catch {}

      setSaving(false);
      // FIX : setTimeout 300ms pour laisser la CameraView se démonter proprement
      setTimeout(() => {
        cooldown.current = false;
        setScanned(false);
        navigation.replace('PrendrePhotoEquipe', {
          demande, userMetier,
          scanParams: { ...params, badge, nomResolu, matricule },
        });
      }, 300);
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      resetCam();
    }
  }, [scanned, params, demande, navigation]);

  const resetCam = () => { cooldown.current = false; setScanned(false); setSaving(false); };

  if (!permission) return (
    <View style={S.center}>
      <Ionicons name="camera-outline" size={48} color={C.primary} />
      <Text style={{ color: C.gris, marginTop: 8 }}>Chargement caméra…</Text>
    </View>
  );
  if (!permission.granted) return (
    <View style={S.center}>
      <Ionicons name="camera-off-outline" size={64} color={C.rouge} />
      <Text style={S.permTitle}>Accès caméra requis</Text>
      <TouchableOpacity style={[S.permBtn, { backgroundColor: C.primary }]} onPress={requestPermission}>
        <Text style={S.permBtnTxt}>Autoriser la caméra</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>
            {params.membreId ? `Refaire — ${params.nomExist}` : 'Nouveau membre'}
          </Text>
          <Text style={S.hSub}>Étape 2 / 3 — Badge OCP</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper : Cadenas ✅ · Badge 🔵 · Photo */}
      <View style={S.stepper}>
        {['Cadenas', 'Badge', 'Photo'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[
              S.stepCircle,
              i < 1 && { backgroundColor: C.vert },
              i === 1 && { backgroundColor: C.primary },
            ]}>
              {i < 1
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={[S.stepNum, i === 1 && { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[S.stepLbl, i === 1 && { color: 'rgba(255,255,255,0.9)', fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      {/* Caméra */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
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
            {scanned && (
              <View style={S.successOverlay}>
                <Ionicons name={saving ? 'sync-outline' : 'checkmark-circle'} size={64} color={saving ? C.orange : C.vert} />
              </View>
            )}
          </Animated.View>
          <View style={S.overlaySide} />
        </View>
        <View style={S.overlayBottom} />
      </View>

      {/* Info cadenas déjà scanné */}
      {params.cadenas && (
        <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 162 : 148, left: 0, right: 0, zIndex: 10, alignItems: 'center' }}>
          <View style={[S.infoStrip, { backgroundColor: `${C.vert}CC` }]}>
            <Ionicons name="lock-closed" size={13} color="#fff" />
            <Text style={S.infoStripTxt}>
              Cadenas ✓  <Text style={{ fontWeight: '700', color: '#fff' }}>
                {(params.cadenas || '').substring(0, 16)}
              </Text>
            </Text>
          </View>
        </View>
      )}

      {/* Instructions bas */}
      <SafeAreaView style={S.instructionsSafe}>
        <View style={[S.instructCard, scanned && { backgroundColor: saving ? C.orange : C.vert }]}>
          <Ionicons
            name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'card-outline'}
            size={24} color="#fff"
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.instrTitle}>
              {saving ? 'Vérification...' : scanned ? 'Badge scanné !' : 'Scannez le badge OCP'}
            </Text>
            <Text style={S.instrSub}>Badge d'identification OCP personnel</Text>
          </View>
        </View>
        <View style={S.infoStrip}>
          <Ionicons name="hardware-chip-outline" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={S.infoStripTxt}>{demande.tag} — {demande.numero_ordre}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0E1A', padding: 30, gap: 16 },
  permTitle:  { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permBtn:    { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  permBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  header:  { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  backBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  stepper:    { position: 'absolute', top: Platform.OS === 'ios' ? 106 : 90, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  stepItem:   { alignItems: 'center', gap: 3 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepLbl:    { fontSize: 8, color: 'rgba(255,255,255,0.5)' },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  scanFrame:     { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },

  corner:    { position: 'absolute', width: 26, height: 26, borderWidth: 3 },
  cornerTL:  { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },
  scanLine:      { position: 'absolute', left: 8, right: 8, height: 2, opacity: 0.85, borderRadius: 1 },
  successOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.25)', alignItems: 'center', justifyContent: 'center' },

  instructionsSafe: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: Platform.OS === 'android' ? 24 : 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  instructCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(21,101,192,0.92)', borderRadius: 14, padding: 14 },
  instrTitle:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:         { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  infoStrip:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 },
  infoStripTxt:     { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },
});