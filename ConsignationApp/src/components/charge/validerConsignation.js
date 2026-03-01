// src/components/charge/validerConsignation.js
// Workflow : Cadenas -> Photo -> Valider
// Scan badge integre dans cet ecran (derniere etape avant validation)
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
  Animated, Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validerConsignation } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
};

const TYPE_LABEL = {
  genie_civil: 'Genie Civil',
  mecanique:   'Mecanique',
  electrique:  'Electrique',
  process:     'Process',
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

export default function ValiderConsignation({ navigation, route }) {
  const { demande, points, photo_path } = route.params;

  const [loading,       setLoading]       = useState(false);
  const [valide,        setValide]        = useState(false);
  // ✅ NOUVEAU : capture le nouveau_statut retourné par l'API
  const [nouveauStatut, setNouveauStatut] = useState('consigne');

  // Badge
  const [permission,  requestPermission] = useCameraPermissions();
  const [cameraOpen,  setCameraOpen]  = useState(false);
  const [badgeValide, setBadgeValide] = useState(false);
  const [badgeId,     setBadgeId]     = useState(null);
  const [userBadgeId, setUserBadgeId] = useState(null);
  const [userName,    setUserName]    = useState('');
  const [scanned,     setScanned]     = useState(false);
  const [statusMsg,   setStatusMsg]   = useState(null);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const cooldown   = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const str = await AsyncStorage.getItem('user');
        if (str) {
          const u = JSON.parse(str);
          setUserBadgeId(u.badge_ocp_id || u.matricule || null);
          setUserName(`${u.prenom || ''} ${u.nom || ''}`.trim());
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [cameraOpen]);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const showBandeau = (type, text) => {
    setStatusMsg({ type, text });
    statusAnim.setValue(0);
    Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(statusAnim, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setStatusMsg(null));
    }, 2200);
  };

  const resetScan = (ms = 1800) => {
    setTimeout(() => { cooldown.current = false; setScanned(false); }, ms);
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned || cooldown.current) return;
    cooldown.current = true;
    setScanned(true);

    const badge = data.trim();

    if (!badge) {
      Vibration.vibrate([0, 80, 60, 80]);
      showBandeau('err', 'QR invalide');
      resetScan(2000);
      return;
    }

    if (userBadgeId && userBadgeId.toUpperCase() !== badge.toUpperCase()) {
      Vibration.vibrate([0, 200, 100, 200]);
      showBandeau('err', `Badge incorrect — votre badge : ${userBadgeId}`);
      resetScan(2500);
      return;
    }

    // Badge OK
    Vibration.vibrate(200);
    showBandeau('ok', `Identite confirmee — ${userName}`);
    setTimeout(() => {
      setBadgeId(badge);
      setBadgeValide(true);
      setCameraOpen(false);
    }, 900);
  };

  const pointsElec    = points.filter(p => p.charge_type !== 'process');
  const pointsProcess = points.filter(p => p.charge_type === 'process');
  const tousElecOk    = pointsElec.length === 0 || pointsElec.every(p => p.numero_cadenas);
  const peutValider   = tousElecOk && !!photo_path && badgeValide;

  const handleValider = () => {
    Alert.alert(
      'Confirmer la validation',
      `Voulez-vous valider la consignation de ${demande.tag} ?\n\nLe PDF F-HSE-SEC-22-01 sera genere et les notifications envoyees.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'VALIDER',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await validerConsignation(demande.id);
              if (res?.success) {
                // ✅ Capturer le nouveau_statut retourné par l'API
                setNouveauStatut(res.data?.nouveau_statut || 'consigne');
                setValide(true);
              } else {
                Alert.alert('Erreur', res?.message || 'Erreur lors de la validation');
              }
            } catch {
              Alert.alert('Erreur', 'Erreur de connexion');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ── Ecran succes ──────────────────────────────
  if (valide) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <View style={[S.successCircle, { backgroundColor: CFG.bgPale }]}>
            <Ionicons name="checkmark-circle" size={90} color={CFG.couleur} />
          </View>
          <Text style={[S.successTitre, { color: CFG.couleur }]}>Consignation validee !</Text>

          {/* ✅ Message adapté selon le nouveau_statut */}
          {nouveauStatut === 'consigne_charge' ? (
            <Text style={S.successSub}>
              Vos points électriques sont consignés ✅{'\n'}
              En attente de la validation du chef process ⚙️
            </Text>
          ) : (
            <Text style={S.successSub}>
              Consignation complète ! Les deux équipes ont validé ✅{'\n'}
              Le PDF F-HSE-SEC-22-01 a été généré.
            </Text>
          )}

          {/* Afficher la boîte PDF seulement si consignation complète */}
          {nouveauStatut === 'consigne' && (
            <View style={[S.pdfBox, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
              <Ionicons name="document-text" size={28} color={CFG.couleur} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[S.pdfTitre, { color: CFG.couleur }]}>F-HSE-SEC-22-01</Text>
                <Text style={S.pdfSub}>{demande.numero_ordre} — genere</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={CFG.couleur} />
            </View>
          )}

          <View style={{ width: '100%', gap: 10, marginTop: 10 }}>
            {[
              { icon: 'person-outline',          txt: 'Demandeur notifie'                              },
              { icon: 'people-outline',           txt: 'Chefs intervenants notifies'                    },
              { icon: 'lock-closed-outline',      txt: `${pointsElec.length} cadenas electriques poses` },
              { icon: 'camera-outline',           txt: 'Photo du depart enregistree'                   },
              { icon: 'card-outline',             txt: `Badge signe : ${badgeId}`                      },
            ].map((item, i) => (
              <View key={i} style={[S.notifRow, { backgroundColor: '#fff' }]}>
                <Ionicons name={item.icon} size={16} color={CFG.couleur} />
                <Text style={S.notifRowTxt}>{item.txt}</Text>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              </View>
            ))}
          </View>
        </View>

        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btn, { backgroundColor: CFG.couleur }]}
            onPress={() => navigation.navigate('DashboardCharge')}
            activeOpacity={0.85}
          >
            <Ionicons name="home-outline" size={20} color="#fff" />
            <Text style={S.btnTxt}>RETOUR AU TABLEAU DE BORD</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Vue camera scan badge ─────────────────────
  if (cameraOpen) {
    const bandColor =
      statusMsg?.type === 'ok'   ? '#10B981' :
      statusMsg?.type === 'warn' ? '#F59E0B' : '#EF4444';

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={S.camHeader}>
          <TouchableOpacity
            style={S.camBackBtn}
            onPress={() => { setCameraOpen(false); setScanned(false); cooldown.current = false; }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.camTitle}>Identification par badge</Text>
            <Text style={S.camSub}>Scannez votre badge OCP pour signer</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Stepper overlay */}
        <View style={S.stepperCam}>
          {['Cadenas', 'Photo', 'Valider'].map((s, i) => (
            <View key={i} style={S.stepItem}>
              <View style={[
                S.stepCircle,
                i < 2 && { backgroundColor: '#10B981' },
                i === 2 && { backgroundColor: CFG.couleur },
              ]}>
                {i < 2
                  ? <Ionicons name="checkmark" size={12} color="#fff" />
                  : <Text style={[S.stepNum, { color: '#fff' }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[S.stepLbl, i === 2 && { color: '#fff', fontWeight: '700' }]}>{s}</Text>
            </View>
          ))}
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
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
              <ScanLine color={CFG.couleur} />
            </Animated.View>
            <View style={S.overlaySide} />
          </View>
          <View style={S.overlayBottom} />
        </View>

        {statusMsg && (
          <Animated.View
            pointerEvents="none"
            style={[S.bandeau, { backgroundColor: bandColor, opacity: statusAnim }]}
          >
            <Text style={S.bandeauTxt}>{statusMsg.text}</Text>
          </Animated.View>
        )}

        <View style={S.camInstructions}>
          {userBadgeId && (
            <View style={S.infoStrip}>
              <Ionicons name="person-circle-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={S.infoStripTxt}>
                Badge attendu :{' '}
                <Text style={{ fontWeight: '700', color: '#fff' }}>{userBadgeId}</Text>
              </Text>
            </View>
          )}
          <View style={S.instructCard}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>Confirmez votre identite</Text>
              <Text style={S.instrSub}>
                Placez votre badge OCP dans le cadre pour signer la consignation
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── Recapitulatif principal ───────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Etape 3 / 3 — Validation</Text>
          <Text style={S.hSub}>Verification finale</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={S.stepper}>
        {['Cadenas', 'Photo', 'Valider'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[
              S.stepCircle,
              i < 2 && { backgroundColor: '#10B981' },
              i === 2 && { backgroundColor: CFG.couleur },
            ]}>
              {i < 2
                ? <Ionicons name="checkmark" size={14} color="#fff" />
                : <Text style={[S.stepNum, { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[S.stepLbl, i === 2 && { color: CFG.couleur, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 130 }}>

        {/* Checklist */}
        <View style={S.card}>
          <View style={S.cardTitleRow}>
            <Ionicons name="checkbox-outline" size={16} color={CFG.couleur} />
            <Text style={S.cardTitle}>Verifications</Text>
          </View>
          {[
            { icon: 'lock-closed-outline', lbl: `${pointsElec.length} cadenas electriques scannes`, ok: tousElecOk   },
            { icon: 'camera-outline',      lbl: 'Photo du depart consigne prise',                  ok: !!photo_path  },
            { icon: 'card-outline',        lbl: badgeValide ? `Badge confirme : ${badgeId}` : 'Badge non encore scanne', ok: badgeValide },
          ].map((c, i) => (
            <View key={i} style={[S.checkRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }]}>
              <Ionicons name={c.icon} size={16} color={c.ok ? CFG.couleur : '#9E9E9E'} />
              <Text style={[S.checkLbl, { color: c.ok ? '#212121' : '#9E9E9E' }]}>{c.lbl}</Text>
              <Ionicons name={c.ok ? 'checkmark-circle' : 'close-circle'} size={20} color={c.ok ? '#10B981' : '#EF4444'} />
            </View>
          ))}
        </View>

        {/* Section badge */}
        <View style={[S.card, { marginTop: 14 }]}>
          <View style={S.cardTitleRow}>
            <Ionicons name="card-outline" size={16} color={badgeValide ? '#10B981' : CFG.couleur} />
            <Text style={[S.cardTitle, { color: badgeValide ? '#10B981' : '#212121' }]}>
              {badgeValide ? 'Badge confirme' : 'Identification par badge requise'}
            </Text>
          </View>

          {badgeValide ? (
            <View style={[S.badgeOkBox, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[S.badgeOkNom, { color: '#065F46' }]}>{userName}</Text>
                <Text style={[S.badgeOkId, { color: '#047857' }]}>{badgeId}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setBadgeValide(false);
                  setBadgeId(null);
                  setScanned(false);
                  cooldown.current = false;
                  setCameraOpen(true);
                }}
              >
                <Ionicons name="refresh-outline" size={18} color="#047857" />
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={S.badgeInfo}>
                Scannez votre badge OCP pour signer officiellement cette consignation avant de valider.
              </Text>
              <TouchableOpacity
                style={[S.scanBadgeBtn, { backgroundColor: CFG.couleur }]}
                onPress={() => { setScanned(false); cooldown.current = false; setCameraOpen(true); }}
                activeOpacity={0.85}
              >
                <Ionicons name="qr-code-outline" size={20} color="#fff" />
                <Text style={S.scanBadgeBtnTxt}>SCANNER MON BADGE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Recapitulatif demande */}
        <View style={[S.card, { marginTop: 14 }]}>
          <View style={S.cardTitleRow}>
            <Ionicons name="document-text-outline" size={16} color={CFG.couleur} />
            <Text style={S.cardTitle}>Recapitulatif demande</Text>
          </View>
          {[
            { lbl: 'N° ordre',   val: demande.numero_ordre           },
            { lbl: 'LOT',        val: demande.lot_code || demande.lot },
            { lbl: 'TAG',        val: demande.tag                    },
            { lbl: 'Equipement', val: demande.equipement_nom          },
            { lbl: 'Demandeur',  val: demande.demandeur_nom           },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal}>{r.val || '—'}</Text>
            </View>
          ))}
          {demande.types_intervenants?.length > 0 && (
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {demande.types_intervenants.map((t, i) => (
                <View key={i} style={[S.typeChip, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
                  <Text style={[S.typeChipTxt, { color: CFG.couleur }]}>{TYPE_LABEL[t] || t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Cadenas electriques */}
        {pointsElec.length > 0 && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={S.cardTitleRow}>
              <Ionicons name="lock-closed-outline" size={16} color={CFG.couleur} />
              <Text style={S.cardTitle}>Cadenas electriques ({pointsElec.length})</Text>
            </View>
            {pointsElec.map((pt, i) => (
              <View key={i} style={[S.pointRow, i < pointsElec.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }]}>
                <Ionicons name="lock-closed" size={14} color={CFG.couleur} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={S.pointRepere}>{pt.repere} — {pt.dispositif}</Text>
                  <Text style={S.pointCadenas}>
                    {pt.numero_cadenas}{pt.mcc_ref ? ` | MCC: ${pt.mcc_ref}` : ''}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              </View>
            ))}
          </View>
        )}

        {/* Points process */}
        {pointsProcess.length > 0 && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={S.cardTitleRow}>
              <Ionicons name="cog-outline" size={16} color="#B45309" />
              <Text style={[S.cardTitle, { color: '#B45309' }]}>Points Process ({pointsProcess.length})</Text>
            </View>
            <View style={S.processInfo}>
              <Ionicons name="information-circle-outline" size={14} color="#B45309" />
              <Text style={S.processInfoTxt}>Ces points sont geres par le Chef Process</Text>
            </View>
          </View>
        )}

        {/* Photo */}
        {photo_path && (
          <View style={[S.card, { marginTop: 14 }]}>
            <View style={S.cardTitleRow}>
              <Ionicons name="camera-outline" size={16} color={CFG.couleur} />
              <Text style={S.cardTitle}>Photo du depart consigne</Text>
            </View>
            <View style={[S.photoPreview, { backgroundColor: CFG.bgPale }]}>
              <Ionicons name="camera" size={32} color={CFG.couleur} />
              <Text style={[S.photoPreviewTxt, { color: CFG.couleur }]}>Photo enregistree</Text>
              <Ionicons name="checkmark-circle" size={20} color={CFG.couleur} />
            </View>
          </View>
        )}

        {/* Note PDF */}
        <View style={[S.pdfInfo, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur, marginTop: 14 }]}>
          <Ionicons name="document-text-outline" size={20} color={CFG.couleur} />
          <Text style={[S.pdfInfoTxt, { color: CFG.couleurDark }]}>
            En cliquant VALIDER, le formulaire F-HSE-SEC-22-01 sera genere automatiquement
            et les notifications envoyees au demandeur et aux chefs intervenants.
          </Text>
        </View>

      </ScrollView>

      {/* Boutons bas */}
      <View style={S.bottomBar}>
        {!badgeValide && (
          <TouchableOpacity
            style={[S.btnBadge, { backgroundColor: CFG.couleur }]}
            onPress={() => { setScanned(false); cooldown.current = false; setCameraOpen(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
            <Text style={S.btnBadgeTxt}>SCANNER MON BADGE D'ABORD</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[S.btn, { backgroundColor: peutValider ? CFG.couleur : '#BDBDBD' }, loading && { opacity: 0.65 }]}
          onPress={handleValider}
          disabled={!peutValider || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                <Text style={S.btnTxt}>
                  {peutValider ? 'VALIDER LA CONSIGNATION' : 'SCANNEZ VOTRE BADGE D\'ABORD'}
                </Text>
              </>
            )
          }
        </TouchableOpacity>
      </View>
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
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  stepper:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 28, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 12, fontWeight: '800', color: '#9E9E9E' },
  stepLbl:    { fontSize: 9, color: '#9E9E9E' },

  card: {
    backgroundColor: '#fff', marginHorizontal: 0,
    borderRadius: 16, padding: 16,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#212121' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  checkLbl: { flex: 1, fontSize: 13, fontWeight: '600' },

  badgeInfo:      { fontSize: 12, color: '#9E9E9E', lineHeight: 17, marginBottom: 12 },
  scanBadgeBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, paddingVertical: 14 },
  scanBadgeBtnTxt:{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  badgeOkBox:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14 },
  badgeOkNom:     { fontSize: 14, fontWeight: '800' },
  badgeOkId:      { fontSize: 12, marginTop: 2 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoLbl: { fontSize: 12, color: '#9E9E9E' },
  infoVal: { fontSize: 12, fontWeight: '700', color: '#212121', textAlign: 'right', flex: 1, marginLeft: 8 },

  typeChip:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 11, fontWeight: '700' },

  pointRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  pointRepere:  { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointCadenas: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  processInfo:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8 },
  processInfoTxt: { flex: 1, fontSize: 11, color: '#92400E' },

  photoPreview:    { height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  photoPreviewTxt: { fontSize: 13, fontWeight: '700' },

  pdfInfo:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, borderWidth: 1 },
  pdfInfoTxt: { flex: 1, fontSize: 12, lineHeight: 18 },

  // Camera
  camHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  camBackBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  camTitle:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  camSub:     { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  stepperCam: {
    position: 'absolute', top: 102, left: 0, right: 0, zIndex: 15,
    flexDirection: 'row', justifyContent: 'center', gap: 28,
    paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.4)',
  },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },

  scanFrame: { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  corner:    { position: 'absolute', width: 26, height: 26, borderColor: '#2d6a4f', borderWidth: 3 },
  cornerTL:  { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },
  scanLine:  { position: 'absolute', left: 8, right: 8, height: 2, opacity: 0.85, borderRadius: 1 },

  bandeau: {
    position: 'absolute', zIndex: 30,
    top: '44%', left: 20, right: 20, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 12,
  },
  bandeauTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  camInstructions: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  instructCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45,106,79,0.92)', borderRadius: 14, padding: 14 },
  instrTitle:      { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:        { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  infoStrip:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 },
  infoStripTxt:    { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },

  // Succes
  successCircle: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitre:  { fontSize: 24, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  successSub:    { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  pdfBox:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, padding: 14, width: '100%', marginBottom: 16 },
  pdfTitre:      { fontSize: 14, fontWeight: '800' },
  pdfSub:        { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  notifRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  notifRowTxt:   { flex: 1, fontSize: 13, color: '#424242' },

  bottomBar:   { padding: 16, paddingBottom: 24, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10, gap: 8 },
  btnBadge:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, height: 48 },
  btnBadgeTxt: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  btn:         { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTxt:      { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});