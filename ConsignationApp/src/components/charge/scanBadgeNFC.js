// src/components/charge/scanBadgeNFC.js
//
// ✅ EXPO GO COMPATIBLE — Scan QR Code au lieu de NFC
// Format QR badge attendu : BADGE::OCP-CHG-0001
//
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bgPale:      '#d8f3dc',
};

export default function ScanBadgeNFC({ navigation, route }) {
  const { demande, points } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]   = useState(false);
  const [scanning, setScanning] = useState(true);
  const pulseAnim = new Animated.Value(1);

  // Animation pulsation cadre scan
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Demander la permission caméra
  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || !scanning) return;

    // ── Valider le format QR badge : BADGE::OCP-CHG-0001 ──
    if (!data.startsWith('BADGE::')) {
      Alert.alert(
        'QR invalide',
        `Ce QR n'est pas un badge OCP.\n\nFormat attendu : BADGE::badge_id\nLu : ${data}`,
        [{ text: 'Réessayer', onPress: () => setScanned(false) }]
      );
      setScanned(true);
      return;
    }

    const badgeId = data.split('::')[1];
    if (!badgeId) {
      Alert.alert('QR invalide', 'Badge ID manquant dans le QR.');
      setScanned(true);
      return;
    }

    setScanned(true);
    setScanning(false);
    Vibration.vibrate(200);

    // Vérifier que le badge correspond à l'utilisateur connecté
    try {
      const userStr = await AsyncStorage.getItem('user');
      const user    = userStr ? JSON.parse(userStr) : null;

      if (user?.badge_ocp_id && user.badge_ocp_id !== badgeId) {
        Alert.alert(
          'Badge incorrect',
          `Ce badge ne vous appartient pas.\n\nBadge scanné : ${badgeId}\nVotre badge : ${user.badge_ocp_id}`,
          [
            { text: 'Annuler', onPress: () => navigation.goBack(), style: 'cancel' },
            { text: 'Réessayer', onPress: () => { setScanned(false); setScanning(true); } },
          ]
        );
        return;
      }

      // Badge validé → navigation vers scan cadenas
      setTimeout(() => {
        navigation.navigate('ScanCadenasNFC', {
          demande,
          points,
          badge_id:     badgeId,
          badge_valide: true,
        });
      }, 600);

    } catch (e) {
      // Si pas de badge en BDD, on accepte quand même (mode test)
      setTimeout(() => {
        navigation.navigate('ScanCadenasNFC', {
          demande,
          points,
          badge_id:     badgeId,
          badge_valide: true,
        });
      }, 600);
    }
  };

  // ── Pas de permission caméra ──
  if (!permission) {
    return (
      <View style={S.center}>
        <Ionicons name="camera-outline" size={48} color={CFG.couleur} />
        <Text style={S.waitTxt}>Chargement caméra...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={S.center}>
        <Ionicons name="camera-off-outline" size={64} color="#EF4444" />
        <Text style={S.permTitle}>Accès caméra requis</Text>
        <Text style={S.permSub}>L'application a besoin de la caméra pour scanner les QR codes.</Text>
        <TouchableOpacity style={[S.permBtn, { backgroundColor: CFG.couleur }]} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header flottant */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Étape 1 / 4</Text>
          <Text style={S.hSub}>Scan badge personnel</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Caméra plein écran */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Overlay sombre avec trou central */}
      <View style={S.overlay} pointerEvents="none">
        {/* Haut */}
        <View style={S.overlayTop} />
        {/* Milieu */}
        <View style={S.overlayRow}>
          <View style={S.overlaySide} />
          {/* Cadre de scan */}
          <Animated.View style={[S.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
            {/* Coins du cadre */}
            <View style={[S.corner, S.cornerTL]} />
            <View style={[S.corner, S.cornerTR]} />
            <View style={[S.corner, S.cornerBL]} />
            <View style={[S.corner, S.cornerBR]} />
            {/* Ligne de scan animée */}
            {!scanned && <ScanLine color={CFG.couleur} />}
            {/* Succès */}
            {scanned && (
              <View style={S.successOverlay}>
                <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              </View>
            )}
          </Animated.View>
          <View style={S.overlaySide} />
        </View>
        {/* Bas */}
        <View style={S.overlayBottom} />
      </View>

      {/* Instructions bas */}
      <View style={S.instructions}>
        <View style={[S.instructCard, scanned && { backgroundColor: '#10B981' }]}>
          <Ionicons
            name={scanned ? 'checkmark-circle' : 'card-outline'}
            size={24}
            color="#fff"
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.instrTitle}>
              {scanned ? 'Badge validé !' : 'Scannez votre badge OCP'}
            </Text>
            <Text style={S.instrSub}>
              {scanned
                ? `Badge ${route.params?.badge_id || ''} — Redirection...`
                : 'Placez le QR code de votre badge dans le cadre'
              }
            </Text>
          </View>
        </View>

        {/* Infos équipement */}
        <View style={S.infoStrip}>
          <Ionicons name="hardware-chip-outline" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={S.infoStripTxt}>
            {demande.tag} — {demande.lot_code || demande.lot} — {demande.equipement_nom}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Ligne de scan animée ──────────────────────
function ScanLine({ color }) {
  const lineAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(lineAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const translateY = lineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return (
    <Animated.View style={[S.scanLine, { backgroundColor: color, transform: [{ translateY }] }]} />
  );
}

const FRAME = 220;

const S = StyleSheet.create({
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1a14', padding: 30, gap: 16 },
  waitTxt:   { color: '#6b8f71', fontSize: 14 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permSub:   { color: '#9E9E9E', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  permBtn:   { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  permBtnTxt:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  overlay:    { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayRow: { flexDirection: 'row', height: FRAME },
  overlaySide:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },

  scanFrame: {
    width: FRAME, height: FRAME,
    borderRadius: 16, overflow: 'hidden',
    position: 'relative',
  },

  corner:    { position: 'absolute', width: 24, height: 24, borderColor: '#2d6a4f', borderWidth: 3 },
  cornerTL:  { top: 0, left: 0,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0, right: 0, borderLeftWidth: 0,  borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0,  borderTopWidth: 0, borderBottomRightRadius: 6 },

  scanLine:  { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.8, borderRadius: 1 },

  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,185,129,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  instructions: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, gap: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  instructCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(45,106,79,0.9)',
    borderRadius: 14, padding: 14,
  },
  instrTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },

  infoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10,
  },
  infoStripTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },
});