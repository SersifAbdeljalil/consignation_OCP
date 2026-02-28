// src/components/charge/scanBadgeNFC.js
// ✅ Étape 3 / 4 — Badge après la photo
// ✅ Navigue vers ValiderConsignation avec photo_path + badge_id
// ✅ FIX Android : SafeAreaView sur les instructions bas
//
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated,
  Platform, SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
};

export default function ScanBadgeNFC({ navigation, route }) {
  const { demande, points, photo_path } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,      setScanned]      = useState(false);
  const [userBadgeId,  setUserBadgeId]  = useState(null);
  const [userName,     setUserName]     = useState('');
  const [statusMsg,    setStatusMsg]    = useState(null);

  const pulseAnim    = useRef(new Animated.Value(1)).current;
  const statusAnim   = useRef(new Animated.Value(0)).current;
  const scanCooldown = useRef(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => ScreenOrientation.unlockAsync();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          const badgeId = user.badge_ocp_id || user.matricule || null;
          setUserBadgeId(badgeId);
          setUserName(`${user.prenom || ''} ${user.nom || ''}`.trim());
        }
      } catch (e) {
        console.error('Erreur chargement user:', e);
      }
    })();
  }, []);

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

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const showBandeau = (type, text) => {
    setStatusMsg({ type, text });
    statusAnim.setValue(0);
    Animated.timing(statusAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(statusAnim, { toValue: 0, duration: 280, useNativeDriver: true })
        .start(() => setStatusMsg(null));
    }, 2500);
  };

  const resetScan = (delayMs = 1800) => {
    setTimeout(() => {
      scanCooldown.current = false;
      setScanned(false);
    }, delayMs);
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned || scanCooldown.current) return;
    scanCooldown.current = true;
    setScanned(true);

    const badgeScanne = data.trim();

    if (!badgeScanne) {
      Vibration.vibrate([0, 80, 60, 80]);
      showBandeau('err', 'QR invalide — badge vide');
      resetScan(2000);
      return;
    }

    if (userBadgeId && userBadgeId.toUpperCase() !== badgeScanne.toUpperCase()) {
      Vibration.vibrate([0, 200, 100, 200]);
      showBandeau('err', `❌ Badge incorrect — votre badge : ${userBadgeId}`);
      resetScan(2500);
      return;
    }

    if (!userBadgeId) {
      Vibration.vibrate(150);
      showBandeau('warn', `⚠️ Profil sans badge_ocp_id — scanné : ${badgeScanne}`);
      Alert.alert(
        '⚠️ Badge non configuré',
        `Badge scanné : ${badgeScanne}\n\nVotre profil n'a pas de badge_ocp_id. Continuer quand même ?`,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => resetScan(300) },
          {
            text: 'Continuer',
            onPress: () => navigation.navigate('ValiderConsignation', {
              demande, points, photo_path,
              badge_id:     badgeScanne,
              badge_valide: true,
            }),
          },
        ]
      );
      return;
    }

    // ✅ Badge validé → ValiderConsignation
    Vibration.vibrate(200);
    showBandeau('ok', `✅ Badge validé — ${userName}`);

    setTimeout(() => {
      navigation.navigate('ValiderConsignation', {
        demande, points, photo_path,
        badge_id:     badgeScanne,
        badge_valide: true,
      });
    }, 1000);
  };

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
        <TouchableOpacity style={[S.permBtn, { backgroundColor: CFG.couleur }]} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const bandColor =
    statusMsg?.type === 'ok'   ? '#10B981' :
    statusMsg?.type === 'warn' ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Étape 3 / 4 — Badge</Text>
          <Text style={S.hSub}>Scannez votre badge personnel</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper Cadenas✅ Photo✅ Badge🔵 Valider */}
      <View style={S.stepper}>
        {['Cadenas', 'Photo', 'Badge', 'Valider'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[
              S.stepCircle,
              i < 2 && { backgroundColor: '#10B981' },
              i === 2 && { backgroundColor: CFG.couleur },
            ]}>
              {i < 2
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={[S.stepNum, i === 2 && { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[S.stepLbl, i === 2 && { color: 'rgba(255,255,255,0.9)', fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      {/* Caméra */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Overlay */}
      <View style={S.overlay} pointerEvents="none">
        <View style={S.overlayTop} />
        <View style={S.overlayRow}>
          <View style={S.overlaySide} />
          <Animated.View style={[S.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[S.corner, S.cornerTL]} />
            <View style={[S.corner, S.cornerTR]} />
            <View style={[S.corner, S.cornerBL]} />
            <View style={[S.corner, S.cornerBR]} />
            <ScanLine color={CFG.couleur} />
          </Animated.View>
          <View style={S.overlaySide} />
        </View>
        <View style={S.overlayBottom} />
      </View>

      {/* Bandeau feedback */}
      {statusMsg && (
        <Animated.View pointerEvents="none" style={[S.bandeau, { backgroundColor: bandColor, opacity: statusAnim }]}>
          <Text style={S.bandeauTxt}>{statusMsg.text}</Text>
        </Animated.View>
      )}

      {/* ✅ FIX Android : SafeAreaView sur les instructions du bas */}
      <SafeAreaView style={S.instructionsSafe}>
        {userBadgeId && (
          <View style={S.infoStrip}>
            <Ionicons name="person-circle-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={S.infoStripTxt}>
              Votre badge :{' '}
              <Text style={{ fontWeight: '700', color: '#fff' }}>{userBadgeId}</Text>
            </Text>
          </View>
        )}
        <View style={S.instructCard}>
          <Ionicons name="card-outline" size={24} color="#fff" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.instrTitle}>Scannez votre badge OCP</Text>
            <Text style={S.instrSub}>Identification finale avant validation</Text>
          </View>
        </View>
        <View style={S.infoStrip}>
          <Ionicons name="hardware-chip-outline" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={S.infoStripTxt}>{demande.tag} — {demande.lot_code || demande.lot}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

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
const S = StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1a14', padding: 30, gap: 16 },
  waitTxt:    { color: '#6b8f71', fontSize: 14 },
  permTitle:  { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn:    { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  permBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  hTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hSub:   { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  stepper: {
    position: 'absolute', top: 106, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'center',
    paddingVertical: 10, gap: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  stepItem:   { alignItems: 'center', gap: 3 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepLbl:    { fontSize: 8, color: 'rgba(255,255,255,0.5)' },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },

  scanFrame: { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  corner:   { position: 'absolute', width: 26, height: 26, borderColor: '#2d6a4f', borderWidth: 3 },
  cornerTL: { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },
  scanLine: { position: 'absolute', left: 8, right: 8, height: 2, opacity: 0.85, borderRadius: 1 },

  bandeau: {
    position: 'absolute', zIndex: 20,
    top: '44%', left: 20, right: 20,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 10, elevation: 12,
  },
  bandeauTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  // ✅ FIX Android
  instructionsSafe: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  instructCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45,106,79,0.92)', borderRadius: 14, padding: 14 },
  instrTitle:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  infoStrip:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 },
  infoStripTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },
});