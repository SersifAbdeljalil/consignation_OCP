// src/components/process/deconsignationProcess.js
// ✅ Déconsignation chargé — TRACE EN BDD chaque cadenas re-scanné
//
// FLUX :
//   1. Liste des demandes (deconsignation_demandee = 1, équipes sorties)
//   2. Détail → liste des vannes process du plan (charge_type='process')
//   3. Scan QR cadenas un par un :
//      • Vérification stricte locale : QR === numero_cadenas en BDD
//      • Si OK → POST /process/deconsigner-point/:pointId  ← trace BDD
//      • points_consignation.statut = 'deconsigne' + ligne deconsignations
//   4. Tous tracés → Scan badge OCP pour signature
//   5. POST /process/valider-deconsignation-finale/:id → PDF F-HSE-SEC-22-01
//   6. Écran succès
//
// NOUVEAUX ENDPOINTS REQUIS (à ajouter dans charge.controller.js + routes) :
//   GET  /process/a-deconsigner               → getDemandesADeconsigner()
//   POST /process/deconsigner-point/:pointId  → deconsignerPointCharge()
//   POST /process/valider-deconsignation-finale/:id → validerDeconsignationFinale()

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, FlatList,
  StatusBar, RefreshControl, ActivityIndicator, StyleSheet,
  Animated, Vibration, Alert, Platform, SafeAreaView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── À ajouter dans ../../api/charge.api ──────────────────────────
// export const getDemandesADeconsigner      = () => api.get('/process/a-deconsigner');
// export const deconsignerPointCharge       = (pointId, data) => api.post(`/process/deconsigner-point/${pointId}`, data);
// export const validerDeconsignationFinale  = (id) => api.post(`/process/valider-deconsignation-finale/${id}`);
import {
  getDemandesADeconsignerProcess,
  getDemandeDetailProcess,
  deconsignerPointProcess,
  validerDeconsignationFinaleProcess,
} from '../../api/process.api';

// ════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════
const CFG = {
  couleur:     '#b45309',
  couleurDark: '#92400e',
  bgPale:      '#fde68a',
  bgMedium:    '#fef3c7',
  violet:      '#7C3AED',
  violetPale:  '#EDE9FE',
  amber:       '#B45309',
  amberPale:   '#FEF3C7',
};

const STATUT_CONFIG = {
  deconsigne_gc:        { color: '#92400E', bg: '#FEF3C7', label: 'DÉCONS. GC',   icon: 'business-outline'  },
  deconsigne_mec:       { color: '#1e40af', bg: '#dbeafe', label: 'DÉCONS. MEC',  icon: 'build-outline'     },
  deconsigne_elec:      { color: '#6d28d9', bg: '#ede9fe', label: 'DÉCONS. ÉLEC', icon: 'cog-outline'     },
  deconsigne_intervent: { color: '#7C3AED', bg: '#EDE9FE', label: 'DÉCONS. ÉQ.',  icon: 'people-outline'    },
  deconsigne_charge:    { color: '#1d4ed8', bg: '#dbeafe', label: 'ATT. PROCESS', icon: 'hourglass-outline' },
  deconsigne_process:   { color: '#b45309', bg: '#fde68a', label: 'ATT. CHARGÉ',  icon: 'hourglass-outline' },
  consigne:             { color: '#2E7D32', bg: '#E8F5E9', label: 'CONSIGNÉ',      icon: 'cog-outline'},
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  const p  = (n) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};

const FRAME = 230;

// ════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS CAMÉRA
// ════════════════════════════════════════════════════════════════════
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
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME - 4] });
  return <Animated.View style={[SC.scanLine, { backgroundColor: color, transform: [{ translateY: ty }] }]} />;
}

function CameraScanner({ titre, sousTitre, instruction, instructionSub, badgeStrip, couleur, onScan, onBack }) {
  const [scanned, setScanned]             = useState(false);
  const [permission, requestPermission]   = useCameraPermissions();
  const [statusMsg, setStatusMsg]         = useState(null);
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const cooldown   = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  useEffect(() => {
    const p = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.06, duration: 850, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 850, useNativeDriver: true }),
    ]));
    p.start();
    return () => p.stop();
  }, []);

  const showBandeau = (type, text) => {
    setStatusMsg({ type, text });
    statusAnim.setValue(0);
    Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(statusAnim, { toValue: 0, duration: 260, useNativeDriver: true })
        .start(() => setStatusMsg(null));
    }, 2600);
  };

  const handleBarCode = ({ data }) => {
    if (scanned || cooldown.current) return;
    if (!data?.trim()) { showBandeau('err', 'QR invalide — code vide'); return; }
    cooldown.current = true;
    setScanned(true);
    Vibration.vibrate(200);
    onScan(data.trim(), showBandeau, () => {
      setTimeout(() => { cooldown.current = false; setScanned(false); }, 1800);
    });
  };

  const bandColor = statusMsg?.type === 'ok' ? '#10B981' : statusMsg?.type === 'warn' ? '#F59E0B' : '#EF4444';

  if (!permission?.granted) {
    return (
      <View style={SC.permContainer}>
        <Ionicons name="camera-off-outline" size={64} color="#EF4444" />
        <Text style={SC.permTitle}>Accès caméra requis</Text>
        <TouchableOpacity style={[SC.permBtn, { backgroundColor: couleur }]} onPress={requestPermission}>
          <Text style={SC.permBtnTxt}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={SC.camHeader}>
        <TouchableOpacity style={SC.camBack} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={SC.camTitle}>{titre}</Text>
          <Text style={SC.camSub}>{sousTitre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCode}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      <View style={SC.overlay} pointerEvents="none">
        <View style={SC.overlayTop} />
        <View style={SC.overlayRow}>
          <View style={SC.overlaySide} />
          <Animated.View style={[SC.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[SC.corner, SC.cornerTL, { borderColor: couleur }]} />
            <View style={[SC.corner, SC.cornerTR, { borderColor: couleur }]} />
            <View style={[SC.corner, SC.cornerBL, { borderColor: couleur }]} />
            <View style={[SC.corner, SC.cornerBR, { borderColor: couleur }]} />
            {!scanned && <ScanLine color={couleur} />}
            {scanned && (
              <View style={SC.successOverlay}>
                <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              </View>
            )}
          </Animated.View>
          <View style={SC.overlaySide} />
        </View>
        <View style={SC.overlayBottom} />
      </View>

      {statusMsg && (
        <Animated.View pointerEvents="none" style={[SC.bandeau, { backgroundColor: bandColor, opacity: statusAnim }]}>
          <Text style={SC.bandeauTxt}>{statusMsg.text}</Text>
        </Animated.View>
      )}

      <SafeAreaView style={[SC.camInstructions, { paddingBottom: Platform.OS === 'android' ? 24 : 16 }]}>
        {badgeStrip && (
          <View style={SC.infoStrip}>
            <Ionicons name="person-circle-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={SC.infoStripTxt}>{badgeStrip}</Text>
          </View>
        )}
        <View style={[SC.instructCard, { backgroundColor: `${couleur}ee` }]}>
          <Ionicons name="cog-outline" size={24} color="#fff" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={SC.instrTitle}>{instruction}</Text>
            {instructionSub ? <Text style={SC.instrSub}>{instructionSub}</Text> : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ════════════════════════════════════════════════════════════════════
export default function DeconsignationProcess({ navigation }) {
  // Navigation interne : 'liste' | 'detail' | 'scan' | 'badge' | 'succes'
  const [vue, setVue] = useState('liste');

  // ── Liste ──
  const [demandes,   setDemandes]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Demande sélectionnée ──
  const [selectedDemande, setSelectedDemande] = useState(null);
  const [detailLoading,   setDetailLoading]   = useState(false);
  const [allPoints,       setAllPoints]       = useState([]);

  // ── État scan par point ──
  // Chaque élément : { point_id, repere, localisation, dispositif, numero_cadenas, confirmed, saving }
  const [cadensScanned, setCadensScanned] = useState([]);
  const [scanIndex,     setScanIndex]     = useState(0);

  // ── Badge ──
  const [user,        setUser]        = useState(null);
  const [badgeValide, setBadgeValide] = useState(false);
  const [badgeId,     setBadgeId]     = useState(null);

  // ── Validation finale ──
  const [validating,    setValidating]    = useState(false);
  const [nouveauStatut, setNouveauStatut] = useState(null);

  const isMountedRef = useRef(true);

  // ── Charger user ──
  useEffect(() => {
    (async () => {
      try {
        const str = await AsyncStorage.getItem('user');
        if (str) setUser(JSON.parse(str));
      } catch {}
    })();
  }, []);

  // ── Charger liste déconsignations ──
  const charger = useCallback(async () => {
    try {
      const res = await getDemandesADeconsigner();
      if (res?.success && isMountedRef.current) setDemandes(res.data || []);
    } catch (e) {
      console.error('DeconsignationProcess charger:', e?.message);
    } finally {
      if (isMountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    charger();
    return () => { isMountedRef.current = false; };
  }, [charger]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', charger);
    return unsub;
  }, [navigation, charger]);

  const onRefresh = useCallback(() => { setRefreshing(true); charger(); }, [charger]);

  // ── Ouvrir une demande ──
  const ouvrirDemande = async (demande) => {
    setDetailLoading(true);
    setSelectedDemande(demande);
    try {
      const res = await getDemandeDetail(demande.id);
      if (res?.success) {
        const pts = res.data?.points || [];
        setAllPoints(pts);
        // Initialiser uniquement les points électriques (à déconsigner par le chargé)
        const elec = pts.filter(p => p.charge_type === 'process');
        setCadensScanned(elec.map(p => ({
          point_id:       p.id,
          repere:         p.repere_point,
          localisation:   p.localisation,
          dispositif:     p.dispositif_condamnation,
          numero_cadenas: p.numero_cadenas || null,  // cadenas posé lors consignation
          confirmed:      false,
          saving:         false,
        })));
      }
    } catch (e) {
      console.error('DeconsignationProcess ouvrirDemande:', e?.message);
    } finally {
      setDetailLoading(false);
      setBadgeValide(false);
      setBadgeId(null);
      setVue('detail');
    }
  };

  // ── Dérivées ──
  const pointsElecReadOnly = allPoints.filter(p => p.charge_type === 'electricien' || !p.charge_type);
  const nbTotal       = cadensScanned.length;
  const nbConfirmes   = cadensScanned.filter(c => c.confirmed).length;
  const tousConfirmes = nbTotal === 0 || nbConfirmes === nbTotal;
  const anySaving     = cadensScanned.some(c => c.saving);

  // ════════════════════════════════════════════════════════════════
  // HANDLER SCAN CADENAS — vérification stricte + appel BDD
  // ════════════════════════════════════════════════════════════════
  const handleScanCadenas = async (data, showBandeau, resetFn) => {
    const cadenas = cadensScanned[scanIndex];
    if (!cadenas) { showBandeau('err', 'Erreur : point introuvable'); resetFn(); return; }

    // ① Vérification stricte locale avant réseau
    if (
      cadenas.numero_cadenas &&
      data.trim().toUpperCase() !== cadenas.numero_cadenas.trim().toUpperCase()
    ) {
      Vibration.vibrate([0, 150, 80, 150]);
      showBandeau('err', `❌ QR incorrect — attendu : ${cadenas.numero_cadenas}`);
      resetFn();
      return;
    }

    // ② Marquer saving=true pendant l'appel réseau
    setCadensScanned(prev =>
      prev.map((c, i) => i === scanIndex ? { ...c, saving: true } : c)
    );

    try {
      // ③ Appel BDD — trace la déconsignation de ce point
      const res = await deconsignerPointCharge(cadenas.point_id, { numero_cadenas: data.trim() });

      if (!res?.success) {
        // Rejet serveur (double vérification stricte côté backend aussi)
        setCadensScanned(prev =>
          prev.map((c, i) => i === scanIndex ? { ...c, saving: false } : c)
        );
        Vibration.vibrate([0, 200, 100, 200]);
        showBandeau('err', res?.message || 'Erreur serveur — scan rejeté');
        resetFn();
        return;
      }

      // ④ Succès — confirmer ce point
      showBandeau('ok', `✓ ${data} — tracé en BDD`);
      setCadensScanned(prev =>
        prev.map((c, i) =>
          i === scanIndex
            ? { ...c, numero_cadenas: data.trim(), confirmed: true, saving: false }
            : c
        )
      );

      // ⑤ Enchaîner sur le suivant ou retour détail
      setTimeout(() => {
        const nextIndex = cadensScanned.findIndex((c, i) => i > scanIndex && !c.confirmed);
        if (nextIndex >= 0) {
          setScanIndex(nextIndex);
          resetFn(); // reste en vue scan, réinitialise la caméra
        } else {
          setVue('detail'); // tous faits → retour
        }
      }, 900);

    } catch (e) {
      console.error('handleScanCadenas réseau:', e?.message);
      setCadensScanned(prev =>
        prev.map((c, i) => i === scanIndex ? { ...c, saving: false } : c)
      );
      showBandeau('err', 'Erreur de connexion — réessayez');
      resetFn();
    }
  };

  // ════════════════════════════════════════════════════════════════
  // HANDLER SCAN BADGE
  // ════════════════════════════════════════════════════════════════
  const handleScanBadge = (data, showBandeau, resetFn) => {
    const userBadgeId = user?.badge_ocp_id || user?.matricule;
    if (userBadgeId && data.trim().toUpperCase() !== userBadgeId.toUpperCase()) {
      Vibration.vibrate([0, 200, 100, 200]);
      showBandeau('err', `❌ Badge incorrect — votre badge : ${userBadgeId}`);
      resetFn();
      return;
    }
    const nom = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Chargé';
    showBandeau('ok', `✓ Identité confirmée — ${nom}`);
    setTimeout(() => { setBadgeId(data.trim()); setBadgeValide(true); setVue('detail'); }, 900);
  };

  // ════════════════════════════════════════════════════════════════
  // VALIDATION FINALE
  // ════════════════════════════════════════════════════════════════
  const handleValider = () => {
    if (!tousConfirmes) {
      Alert.alert('Cadenas manquants', `${nbTotal - nbConfirmes} cadenas n'ont pas encore été scannés et tracés.`);
      return;
    }
    if (!badgeValide) {
      Alert.alert('Badge requis', 'Scannez votre badge OCP avant de valider.');
      return;
    }
    Alert.alert(
      'Confirmer la déconsignation',
      `Valider la déconsignation électrique de ${selectedDemande?.tag} ?\n\n` +
      `• ${nbTotal} cadenas tracés en BDD ✓\n` +
      `• Badge OCP vérifié ✓\n\n` +
      `Le PDF F-HSE-SEC-22-01 sera mis à jour avec votre nom et la date.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'VALIDER',
          onPress: async () => {
            setValidating(true);
            try {
              const res = await validerDeconsignationFinale(selectedDemande.id);
              if (res?.success) {
                setNouveauStatut(res.data?.nouveau_statut || 'deconsignee');
                setVue('succes');
                charger(); // rafraîchir liste
              } else {
                Alert.alert('Erreur', res?.message || 'Impossible de valider la déconsignation.');
              }
            } catch {
              Alert.alert('Erreur de connexion', 'Vérifiez votre réseau et réessayez.');
            } finally {
              setValidating(false);
            }
          },
        },
      ]
    );
  };

  // ════════════════════════════════════════════════════════════════
  // RENDU — VUE SCAN CADENAS
  // ════════════════════════════════════════════════════════════════
  if (vue === 'scan') {
    const pt = cadensScanned[scanIndex];
    return (
      <CameraScanner
        titre={`Cadenas ${scanIndex + 1} / ${nbTotal}`}
        sousTitre={pt?.saving ? 'Enregistrement BDD...' : 'Scannez le cadenas à retirer'}
        instruction={pt ? `${pt.repere} — ${pt.dispositif}` : 'Placez le QR dans le cadre'}
        instructionSub={
          pt?.numero_cadenas
            ? `QR attendu : ${pt.numero_cadenas}`
            : 'Format : CAD-2026-001'
        }
        couleur={CFG.couleur}
        onScan={handleScanCadenas}
        onBack={() => setVue('detail')}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDU — VUE SCAN BADGE
  // ════════════════════════════════════════════════════════════════
  if (vue === 'badge') {
    const userBadgeId = user?.badge_ocp_id || user?.matricule;
    return (
      <CameraScanner
        titre="Signature — Badge OCP"
        sousTitre="Confirmation d'identité finale"
        instruction="Scannez votre badge personnel"
        instructionSub="Identification avant validation définitive"
        badgeStrip={userBadgeId ? `Badge attendu : ${userBadgeId}` : null}
        couleur={CFG.violet}
        onScan={handleScanBadge}
        onBack={() => setVue('detail')}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDU — VUE SUCCÈS
  // ════════════════════════════════════════════════════════════════
  if (vue === 'succes') {
    const estComplet = nouveauStatut === 'deconsignee';
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <View style={[S.successCircle, { backgroundColor: estComplet ? CFG.bgPale : CFG.violetPale }]}>
            <Ionicons
              name={estComplet ? 'cog' : 'cog-outline'}
              size={80}
              color={estComplet ? CFG.couleur : CFG.violet}
            />
          </View>
          <Text style={[S.successTitre, { color: estComplet ? CFG.couleur : CFG.violet }]}>
            {estComplet ? 'Déconsignation complète !' : 'Points électriques déconsignés !'}
          </Text>
          <Text style={S.successSub}>
            {estComplet
              ? `Le départ ${selectedDemande?.tag} est entièrement déconsigné.\nPDF F-HSE-SEC-22-01 mis à jour.`
              : `Vos points sont déconsignés et tracés.\nEn attente de la validation du chef process.`
            }
          </Text>
          <View style={{ width: '100%', gap: 10, marginTop: 16 }}>
            {[
              { icon: 'cog-outline',    txt: `${nbTotal} cadenas tracés en BDD`    },
              { icon: 'card-outline',          txt: `Signé par badge : ${badgeId || '—'}` },
              { icon: 'document-text-outline', txt: 'PDF F-HSE-SEC-22-01 mis à jour'     },
              { icon: 'notifications-outline', txt: 'Notifications envoyées'             },
            ].map((item, i) => (
              <View key={i} style={[S.notifRow, { backgroundColor: '#fff' }]}>
                <Ionicons name={item.icon} size={15} color={CFG.couleur} />
                <Text style={S.notifRowTxt}>{item.txt}</Text>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              </View>
            ))}
          </View>
        </View>
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnPrimary, { backgroundColor: CFG.couleur }]}
            onPress={() => { setVue('liste'); setSelectedDemande(null); setAllPoints([]); setCadensScanned([]); }}
          >
            <Ionicons name="list-outline" size={20} color="#fff" />
            <Text style={S.btnPrimaryTxt}>RETOUR À LA LISTE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.btnSecondary} onPress={() => navigation.navigate('DashboardProcess')}>
            <Ionicons name="home-outline" size={18} color={CFG.couleur} />
            <Text style={[S.btnSecondaryTxt, { color: CFG.couleur }]}>Tableau de bord</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDU — VUE DÉTAIL
  // ════════════════════════════════════════════════════════════════
  if (vue === 'detail' && selectedDemande) {
    const peutValider = tousConfirmes && nbTotal > 0 && badgeValide;
    const userNom = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '';

    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

        {/* ── Header ── */}
        <View style={[S.header, { backgroundColor: CFG.couleur }]}>
          <TouchableOpacity style={S.backBtn} onPress={() => setVue('liste')}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>Déconsignation process</Text>
            <Text style={S.hSub}>{selectedDemande.numero_ordre} — {selectedDemande.tag}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Barre progression BDD ── */}
        <View style={[S.progressHeader, { backgroundColor: CFG.couleur }]}>
          <View style={{ flex: 1 }}>
            <View style={S.progressTrack}>
              <View style={[S.progressFill, {
                width:           nbTotal > 0 ? `${(nbConfirmes / nbTotal) * 100}%` : '0%',
                backgroundColor: tousConfirmes ? '#10B981' : '#A7F3D0',
              }]} />
            </View>
          </View>
          <Text style={S.progressTxt}>
            {nbConfirmes}/{nbTotal} tracés BDD
          </Text>
        </View>

        {detailLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={CFG.couleur} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 170 }}>

            {/* ── Infos demande ── */}
            <View style={S.card}>
              <View style={S.cardTitleRow}>
                <Ionicons name="information-circle-outline" size={16} color={CFG.couleur} />
                <Text style={S.cardTitle}>Informations</Text>
              </View>
              {[
                { lbl: 'TAG',        val: selectedDemande.tag              },
                { lbl: 'Équipement', val: selectedDemande.equipement_nom   },
                { lbl: 'LOT',        val: selectedDemande.lot_code || selectedDemande.lot },
                { lbl: 'Raison',     val: selectedDemande.raison           },
              ].map((r, i) => (
                <View key={i} style={[S.infoRow, i < 3 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }]}>
                  <Text style={S.infoLbl}>{r.lbl}</Text>
                  <Text style={S.infoVal} numberOfLines={2}>{r.val || '—'}</Text>
                </View>
              ))}
            </View>

            {/* ── Cadenas électriques ── */}
            <View style={[S.card, { marginTop: 14 }]}>
              <View style={S.cardTitleRow}>
                <Ionicons name="cog-outline" size={16} color={CFG.couleur} />
                <Text style={S.cardTitle}>Vannes process à déconsigner ({nbTotal})</Text>
                <View style={[S.badge, { backgroundColor: tousConfirmes && nbTotal > 0 ? '#D1FAE5' : CFG.bgPale }]}>
                  <Text style={[S.badgeTxt, { color: tousConfirmes && nbTotal > 0 ? '#065F46' : CFG.couleurDark }]}>
                    {nbConfirmes}/{nbTotal}
                  </Text>
                </View>
              </View>

              {/* Bannière sécurité */}
              {nbTotal > 0 && (
                <View style={S.securiteBanner}>
                  <Ionicons name="shield-checkmark-outline" size={13} color={CFG.couleur} />
                  <Text style={S.securiteTxt}>
                    Vérification stricte : le QR scanné doit correspondre exactement au cadenas posé. Chaque scan est tracé en BDD.
                  </Text>
                </View>
              )}

              {nbTotal === 0 && (
                <View style={S.emptySmall}>
                  <Ionicons name="information-circle-outline" size={18} color="#BDBDBD" />
                  <Text style={S.emptySmallTxt}>Aucun point électrique dans ce plan.</Text>
                </View>
              )}

              {cadensScanned.map((c, i) => (
                <View key={i} style={[
                  S.pointRow,
                  c.confirmed && { borderLeftWidth: 3, borderLeftColor: '#10B981' },
                  c.saving    && { opacity: 0.65 },
                ]}>
                  <View style={[S.pointIcon, {
                    backgroundColor: c.confirmed ? '#D1FAE5' : c.saving ? '#F0F9FF' : CFG.amberPale,
                  }]}>
                    {c.saving
                      ? <ActivityIndicator size="small" color={CFG.couleur} />
                      : <Ionicons
                          name={c.confirmed ? 'cog' : 'cog-outline'}
                          size={18}
                          color={c.confirmed ? '#10B981' : CFG.amber}
                        />
                    }
                  </View>

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={S.pointRepere}>{c.repere}</Text>
                    <Text style={S.pointLocal}>{c.localisation}</Text>

                    {/* Cadenas attendu (avant scan) */}
                    {c.numero_cadenas && !c.confirmed && !c.saving && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <Ionicons name="qr-code-outline" size={10} color={CFG.amber} />
                        <Text style={{ fontSize: 10, color: CFG.amber, fontWeight: '700' }}>
                          Attendu : {c.numero_cadenas}
                        </Text>
                      </View>
                    )}

                    {/* Confirmation BDD */}
                    {c.confirmed && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                        <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>
                          Tracé BDD — {c.numero_cadenas}
                        </Text>
                      </View>
                    )}

                    {/* Saving */}
                    {c.saving && (
                      <Text style={{ fontSize: 10, color: CFG.couleur, marginTop: 3 }}>
                        Enregistrement en base...
                      </Text>
                    )}
                  </View>

                  {/* Bouton scan ou check */}
                  {!c.confirmed && !c.saving ? (
                    <TouchableOpacity
                      style={[S.scanBtn, { backgroundColor: CFG.couleur }]}
                      onPress={() => { setScanIndex(i); setVue('scan'); }}
                      disabled={anySaving}
                    >
                      <Ionicons name="qr-code-outline" size={15} color="#fff" />
                      <Text style={S.scanBtnTxt}>Scan</Text>
                    </TouchableOpacity>
                  ) : c.confirmed ? (
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  ) : null}
                </View>
              ))}

              {/* Bouton "scanner le suivant" */}
              {nbTotal > 0 && nbConfirmes < nbTotal && !anySaving && (
                <TouchableOpacity
                  style={[S.btnScanAll, { borderColor: CFG.couleur }]}
                  onPress={() => {
                    const first = cadensScanned.findIndex(c => !c.confirmed);
                    if (first >= 0) { setScanIndex(first); setVue('scan'); }
                  }}
                >
                  <Ionicons name="qr-code-outline" size={16} color={CFG.couleur} />
                  <Text style={[S.btnScanAllTxt, { color: CFG.couleur }]}>
                    Scanner le suivant — {nbTotal - nbConfirmes} restant{nbTotal - nbConfirmes > 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Message "tous tracés" */}
              {tousConfirmes && nbTotal > 0 && (
                <View style={S.allDoneBanner}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={S.allDoneTxt}>
                    Tous les cadenas sont tracés en BDD — scannez votre badge pour continuer
                  </Text>
                </View>
              )}
            </View>

            {/* ── Points électriques (lecture seule) ── */}
            {pointsElecReadOnly.length > 0 && (
              <View style={[S.card, { marginTop: 14, opacity: 0.7 }]}>
                <View style={S.cardTitleRow}>
                  <Ionicons name="cog-outline" size={16} color={CFG.amber} />
                  <Text style={[S.cardTitle, { color: CFG.amber }]}>
                    Points électriques ({pointsElecReadOnly.length}) — Chargé de consignation
                  </Text>
                </View>
                <View style={S.processInfoBanner}>
                  <Ionicons name="information-circle-outline" size={14} color={CFG.amber} />
                  <Text style={S.processInfoTxt}>
                    Ces cadenas sont déconsignés indépendamment par le Chargé de consignation. Hors de votre périmètre.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Signature badge ── */}
            <View style={[S.card, { marginTop: 14 }]}>
              <View style={S.cardTitleRow}>
                <Ionicons name="card-outline" size={16} color={badgeValide ? '#10B981' : CFG.violet} />
                <Text style={[S.cardTitle, { color: badgeValide ? '#065F46' : '#212121' }]}>
                  {badgeValide ? 'Badge confirmé — Signature ✓' : 'Signature requise'}
                </Text>
              </View>
              {!badgeValide ? (
                <>
                  <Text style={S.badgeInfo}>
                    Une fois tous les cadenas tracés, scannez votre badge OCP pour signer officiellement.
                  </Text>
                  <TouchableOpacity
                    style={[S.scanBadgeBtn, { backgroundColor: tousConfirmes && nbTotal > 0 ? CFG.violet : '#BDBDBD' }]}
                    onPress={() => setVue('badge')}
                    disabled={!tousConfirmes || nbTotal === 0}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="qr-code-outline" size={20} color="#fff" />
                    <Text style={S.scanBadgeBtnTxt}>
                      {tousConfirmes && nbTotal > 0
                        ? 'SCANNER MON BADGE'
                        : `Tracez d'abord les ${nbTotal - nbConfirmes} cadenas`}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={[S.badgeOkBox, { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[S.badgeOkNom, { color: '#065F46' }]}>{userNom}</Text>
                    <Text style={[S.badgeOkId,  { color: '#047857' }]}>{badgeId}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setBadgeValide(false); setBadgeId(null); }}>
                    <Ionicons name="refresh-outline" size={18} color="#047857" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Note PDF ── */}
            <View style={[S.pdfInfo, { borderColor: CFG.couleur, marginTop: 14 }]}>
              <Ionicons name="document-text-outline" size={18} color={CFG.couleur} />
              <Text style={S.pdfInfoTxt}>
                La validation remplira la colonne « Déconsigné par » du formulaire F-HSE-SEC-22-01 avec votre nom et la date du jour.
              </Text>
            </View>

          </ScrollView>
        )}

        {/* ── Barre boutons bas ── */}
        <View style={S.bottomBar}>
          {/* Checklist résumée */}
          <View style={S.checklistBar}>
            {[
              { ok: tousConfirmes && nbTotal > 0, txt: `${nbConfirmes}/${nbTotal} BDD` },
              { ok: badgeValide,                  txt: 'Badge ✓'                       },
            ].map((c, i) => (
              <View key={i} style={S.checklistItem}>
                <Ionicons
                  name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={c.ok ? '#10B981' : '#BDBDBD'}
                />
                <Text style={[S.checklistTxt, { color: c.ok ? '#065F46' : '#9E9E9E' }]}>{c.txt}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[S.btnPrimary, { backgroundColor: peutValider ? CFG.couleur : '#BDBDBD' }, validating && { opacity: 0.7 }]}
            onPress={handleValider}
            disabled={!peutValider || validating}
            activeOpacity={0.85}
          >
            {validating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                <Text style={S.btnPrimaryTxt}>
                  {peutValider
                    ? 'VALIDER LA DÉCONSIGNATION'
                    : !tousConfirmes || nbTotal === 0
                      ? `Tracez ${nbTotal - nbConfirmes} cadenas d'abord`
                      : 'Scannez votre badge d\'abord'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // RENDU — VUE LISTE
  // ════════════════════════════════════════════════════════════════
  const renderCard = ({ item }) => {
    const cfg = STATUT_CONFIG[item.statut] || STATUT_CONFIG.consigne;
    return (
      <TouchableOpacity style={S.demandeCard} onPress={() => ouvrirDemande(item)} activeOpacity={0.82}>
        <View style={[S.demandeIconWrap, { backgroundColor: CFG.bgPale }]}>
          <Ionicons name="cog-outline" size={22} color={CFG.couleur} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={S.demandeNumero}>{item.numero_ordre}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Ionicons name="hardware-chip-outline" size={11} color={CFG.couleur} />
            <Text style={S.demandeTag}> {item.tag || ''}{item.equipement_nom ? ` — ${item.equipement_nom}` : ''}</Text>
          </View>
          {item.lot_code && <Text style={S.demandeLot}>LOT : {item.lot_code}</Text>}
          <Text style={S.demandeDemandeur}>Par : {item.demandeur_nom || '—'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <Ionicons name="calendar-outline" size={11} color="#BDBDBD" />
            <Text style={S.demandeDate}> {fmtDate(item.updated_at)}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <View style={[S.statutBadge, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={10} color={cfg.color} />
            <Text style={[S.statutTxt, { color: cfg.color }]}> {cfg.label}</Text>
          </View>
          <View style={S.urgentBadge}>
            <Ionicons name="alert-circle-outline" size={10} color={CFG.amber} />
            <Text style={S.urgentTxt}> Action requise</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Déconsignations process</Text>
          <Text style={S.hSub}>{demandes.length} demande{demandes.length !== 1 ? 's' : ''} en attente</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stats */}
      <View style={[S.statsBar, { backgroundColor: CFG.couleur }]}>
        {[
          { val: demandes.length,                                                    lbl: 'Total'         },
          { val: demandes.filter(d => d.statut === 'deconsigne_intervent').length,   lbl: 'Équipes sorties'},
          { val: demandes.filter(d => d.statut === 'deconsigne_process').length,     lbl: 'Process fait'  },
        ].map((s, i) => (
          <View key={i} style={S.statItem}>
            <Text style={S.statVal}>{s.val}</Text>
            <Text style={S.statLbl}>{s.lbl}</Text>
          </View>
        ))}
      </View>

      {/* Info */}
      <View style={S.infoBanner}>
        <Ionicons name="shield-checkmark-outline" size={14} color={CFG.amber} />
        <Text style={S.infoBannerTxt}>
          Scan strict — chaque QR scanné doit correspondre exactement au cadenas posé lors de la consignation. Chaque retrait est tracé en BDD.
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={CFG.couleur} />
        </View>
      ) : demandes.length === 0 ? (
        <View style={S.emptyWrap}>
          <Ionicons name="cog-outline" size={56} color={CFG.bgMedium} />
          <Text style={S.emptyTitle}>Aucune déconsignation en attente</Text>
          <Text style={S.emptySub}>
            Les demandes apparaîtront ici une fois que{'\n'}toutes les équipes auront quitté le chantier.
          </Text>
        </View>
      ) : (
        <FlatList
          data={demandes}
          keyExtractor={item => item.id.toString()}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[CFG.couleur]} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════
const S = StyleSheet.create({
  header:   { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:  { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  statsBar:  { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14 },
  statItem:  { flex: 1, alignItems: 'center' },
  statVal:   { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLbl:   { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 2 },

  progressHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  progressTrack:  { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden', flex: 1 },
  progressFill:   { height: 6, borderRadius: 3 },
  progressTxt:    { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700', minWidth: 100 },

  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: CFG.amberPale, padding: 12, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  infoBannerTxt: { flex: 1, fontSize: 11, color: CFG.amber, lineHeight: 16 },

  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#212121', flex: 1 },
  badge:        { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt:     { fontSize: 11, fontWeight: '800' },

  infoRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLbl:  { fontSize: 12, color: '#9E9E9E' },
  infoVal:  { fontSize: 12, fontWeight: '700', color: '#212121', textAlign: 'right', flex: 1, marginLeft: 8 },

  securiteBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 9, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: CFG.couleur },
  securiteTxt:    { flex: 1, fontSize: 10, color: '#166534', lineHeight: 15 },

  pointRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere: { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:  { fontSize: 11, color: '#9E9E9E', marginTop: 1 },

  scanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  scanBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  btnScanAll:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  btnScanAllTxt: { fontSize: 12, fontWeight: '700' },

  allDoneBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D1FAE5', borderRadius: 10, padding: 10, marginTop: 8 },
  allDoneTxt:    { flex: 1, fontSize: 11, color: '#065F46', fontWeight: '600' },

  processInfoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: CFG.amberPale, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: CFG.amber },
  processInfoTxt:    { flex: 1, fontSize: 11, color: CFG.amber, lineHeight: 16 },

  badgeInfo:       { fontSize: 12, color: '#9E9E9E', lineHeight: 17, marginBottom: 12 },
  scanBadgeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, paddingVertical: 14 },
  scanBadgeBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  badgeOkBox:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14 },
  badgeOkNom:      { fontSize: 14, fontWeight: '800' },
  badgeOkId:       { fontSize: 12, marginTop: 2 },

  pdfInfo:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, borderWidth: 1, backgroundColor: '#F0FDF4' },
  pdfInfoTxt: { flex: 1, fontSize: 12, lineHeight: 18, color: '#166534' },

  emptySmall:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  emptySmallTxt: { fontSize: 12, color: '#9E9E9E' },
  emptyWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 14 },
  emptySub:      { fontSize: 13, color: '#9E9E9E', marginTop: 6, textAlign: 'center', lineHeight: 19 },

  demandeCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  demandeIconWrap: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  demandeNumero:   { fontSize: 13, fontWeight: '800', color: '#212121' },
  demandeTag:      { fontSize: 11, color: CFG.couleur, fontWeight: '600' },
  demandeLot:      { fontSize: 10, color: '#9E9E9E', marginTop: 1 },
  demandeDemandeur:{ fontSize: 10, color: '#9E9E9E' },
  demandeDate:     { fontSize: 10, color: '#BDBDBD' },

  statutBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statutTxt:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: CFG.amberPale },
  urgentTxt:   { fontSize: 8, fontWeight: '700', color: CFG.amber },

  bottomBar:     { padding: 16, paddingBottom: 24, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10, gap: 10 },
  checklistBar:  { flexDirection: 'row', gap: 20, paddingHorizontal: 4, marginBottom: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checklistTxt:  { fontSize: 11, fontWeight: '600' },

  btnPrimary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, height: 52 },
  btnPrimaryTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  btnSecondary:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, height: 44, backgroundColor: CFG.bgPale, borderWidth: 1, borderColor: '#A5D6A7' },
  btnSecondaryTxt: { fontSize: 13, fontWeight: '700' },

  successCircle: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitre:  { fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  successSub:    { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  notifRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  notifRowTxt:   { flex: 1, fontSize: 13, color: '#424242' },
});

// ── Styles caméra ─────────────────────────────────────────────────
const SC = StyleSheet.create({
  permContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f1a14', padding: 30, gap: 16 },
  permTitle:  { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn:    { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  permBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  camHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  camBack:   { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  camTitle:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  camSub:    { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },

  scanFrame:     { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  corner:        { position: 'absolute', width: 24, height: 24, borderWidth: 3 },
  cornerTL:      { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:      { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:      { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:      { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },
  scanLine:      { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.85, borderRadius: 1 },
  successOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.25)', alignItems: 'center', justifyContent: 'center' },

  bandeau:    { position: 'absolute', zIndex: 20, top: '44%', left: 20, right: 20, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 12 },
  bandeauTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  camInstructions: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  instructCard:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14 },
  instrTitle:      { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:        { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  infoStrip:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 10 },
  infoStripTxt:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, flex: 1 },
});