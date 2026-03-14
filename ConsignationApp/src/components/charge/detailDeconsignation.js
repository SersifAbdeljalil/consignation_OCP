// src/components/charge/detailDeconsignation.js
// ✅ Thème VERT unifié (#2d6a4f) — cohérent avec tous les autres écrans chargé
// ✅ Si statut = 'deconsignee' ou 'deconsigne_charge' déjà fait → écran récapitulatif + PDF
// ✅ Scan cadenas → POST /demandes/:id/scanner-decons-cadenas
// ✅ Scan badge → validerDeconsignationFinaleCharge (badge_id transmis)
// ✅ Après validation : écran succès avec PDF consultable

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
  Animated, Vibration, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDemandeDeconsignationDetail,
  scannerCadenasDeconsignation,
  validerDeconsignationFinaleCharge,
} from '../../api/charge.api';
import { API_URL } from '../../api/client';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bg:          '#b0f2b6',
  bgPale:      '#d8f3dc',
  vert:        '#10B981',
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

// ── Statuts considérés comme "déjà déconsigné côté chargé" ──
const STATUTS_DEJA_FAITS = ['deconsignee', 'deconsigne_charge', 'cloturee'];

export default function DetailDeconsignation({ navigation, route }) {
  const { demande: demandeParam } = route.params;

  const [detail,        setDetail]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [validating,    setValidating]    = useState(false);
  const [valide,        setValide]        = useState(false);
  const [nouveauStatut, setNouveauStatut] = useState(null);
  const [pdfPath,       setPdfPath]       = useState(null);

  // Mode scan cadenas
  const [modeScan,     setModeScan]     = useState(false);
  const [pointEnCours, setPointEnCours] = useState(null);
  const [scanResult,   setScanResult]   = useState(null);

  // Mode scan badge
  const [modeBadge,   setModeBadge]   = useState(false);
  const [badgeValide, setBadgeValide] = useState(false);
  const [badgeId,     setBadgeId]     = useState(null);
  const [userBadgeId, setUserBadgeId] = useState(null);
  const [userName,    setUserName]    = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]        = useState(false);
  const [statusMsg,  setStatusMsg]      = useState(null);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const cooldown   = useRef(false);
  const isMounted  = useRef(true);

  // Charger le user pour badge
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

  const charger = useCallback(async () => {
    try {
      const res = await getDemandeDeconsignationDetail(demandeParam.id);
      if (res?.success && isMounted.current) {
        setDetail(res.data);
        // Si la demande est déjà déconsignée côté chargé, on passe directement à l'écran récap
        const statut = res.data?.demande?.statut;
        if (STATUTS_DEJA_FAITS.includes(statut) && !valide) {
          setValide(true);
          setNouveauStatut(statut);
          setPdfPath(res.data?.demande?.pdf_path_final || res.data?.demande?.pdf_path_charge || null);
        }
      }
    } catch (e) {
      console.error('DetailDeconsignation charger:', e?.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [demandeParam.id, valide]);

  useEffect(() => {
    isMounted.current = true;
    charger();
    return () => { isMounted.current = false; };
  }, [charger]);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  // Pulse animation caméra
  useEffect(() => {
    if (!modeScan && !modeBadge) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [modeScan, modeBadge]);

  const showBandeau = (type, text) => {
    setStatusMsg({ type, text });
    statusAnim.setValue(0);
    Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(statusAnim, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setStatusMsg(null));
    }, 2500);
  };

  const resetScan = (ms = 1800) => {
    setTimeout(() => { cooldown.current = false; setScanned(false); }, ms);
  };

  const dem         = detail?.demande  || demandeParam;
  const points      = detail?.points   || [];
  const progression = detail?.progression || { total: 0, valides: 0, restants: 0, pourcentage: 0 };
  const pretAValider = detail?.pret_a_valider || false;

  const nbTotal = progression.total;
  const nbDecon = progression.valides;
  const tousDecon = pretAValider;

  // ── Ouvrir scan pour un point ──
  const ouvrirScanPoint = (point) => {
    if (point.decons_fait) return;
    setPointEnCours(point);
    setScanResult(null);
    setScanned(false);
    cooldown.current = false;
    setModeScan(true);
  };

  // ── Scan cadenas déconsignation ──
  const handleScanCadenas = async ({ data }) => {
    if (scanned || cooldown.current || !pointEnCours) return;
    cooldown.current = true;
    setScanned(true);
    const qr = data.trim();
    if (!qr) {
      Vibration.vibrate([0, 80, 60, 80]);
      showBandeau('err', 'QR invalide');
      resetScan(2000);
      return;
    }
    try {
      Vibration.vibrate(100);
      const res = await scannerCadenasDeconsignation(dem.id, pointEnCours.id, qr);
      if (res?.success) {
        Vibration.vibrate(200);
        setScanResult('ok');
        showBandeau('ok', `✅ Cadenas déconsigné !`);
        setTimeout(async () => {
          setModeScan(false);
          setPointEnCours(null);
          await charger();
        }, 1200);
      } else {
        Vibration.vibrate([0, 200, 100, 200]);
        setScanResult('err');
        showBandeau('err', res?.message || 'Cadenas incorrect ou ne correspond pas');
        resetScan(2500);
      }
    } catch (e) {
      Vibration.vibrate([0, 200, 100, 200]);
      setScanResult('err');
      const msg = e?.response?.data?.message || e?.message || 'Cadenas incorrect';
      showBandeau('err', msg);
      resetScan(2500);
    }
  };

  // ── Scan badge ──
  const handleScanBadge = ({ data }) => {
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
    Vibration.vibrate(200);
    showBandeau('ok', `✅ Badge validé — ${userName}`);
    setTimeout(() => {
      setBadgeId(badge);
      setBadgeValide(true);
      setModeBadge(false);
    }, 900);
  };

  // ── Valider déconsignation finale ──
  const handleValider = () => {
    if (!tousDecon) {
      Alert.alert('Cadenas manquants', `${nbTotal - nbDecon} cadenas n'ont pas encore été scannés.`);
      return;
    }
    if (!badgeValide) {
      Alert.alert('Badge requis', 'Veuillez scanner votre badge avant de valider.');
      setModeBadge(true);
      return;
    }
    Alert.alert(
      '🔓 Confirmer la déconsignation',
      `Confirmer la déconsignation du départ ${dem.tag} ?\n\nTous les cadenas ont été retirés et votre badge a été vérifié.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'VALIDER',
          onPress: async () => {
            setValidating(true);
            try {
              const res = await validerDeconsignationFinaleCharge(dem.id, badgeId);
              if (res?.success) {
                setNouveauStatut(res.data?.nouveau_statut || 'deconsignee');
                setPdfPath(res.data?.pdf_path || null);
                setValide(true);
              } else {
                Alert.alert('Erreur', res?.message || 'Erreur lors de la validation');
              }
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || e?.message || 'Erreur de connexion');
            } finally {
              setValidating(false);
            }
          },
        },
      ]
    );
  };

  // ══════════════════════════════════════════════════════════
  // ✅ ÉCRAN RÉCAPITULATIF — demande déconsignée (déjà faite OU vient d'être validée)
  // Affiché quand valide=true OU quand le statut est déjà 'deconsignee'/'deconsigne_charge'
  // ══════════════════════════════════════════════════════════
  if (valide || STATUTS_DEJA_FAITS.includes(dem.statut)) {
    const statut      = nouveauStatut || dem.statut;
    const estComplete = statut === 'deconsignee' || statut === 'cloturee';
    const pdfUrl      = pdfPath
      ? `${API_URL}/${pdfPath}`
      : dem.pdf_path_final
        ? `${API_URL}/${dem.pdf_path_final}`
        : null;

    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

        {/* Header */}
        <View style={[S.header, { backgroundColor: CFG.couleur }]}>
          <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>Déconsignation</Text>
            <Text style={S.hSub}>{dem.numero_ordre}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

          {/* Icône état */}
          <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 20 }}>
            <View style={[S.successCircle, { backgroundColor: CFG.bgPale }]}>
              <Ionicons
                name={estComplete ? 'lock-open' : 'lock-open-outline'}
                size={64}
                color={CFG.couleur}
              />
            </View>
            <Text style={[S.successTitre, { color: CFG.couleur }]}>
              {estComplete ? 'Déconsignation complète !' : 'Déconsignation chargé effectuée'}
            </Text>
            <Text style={S.successSub}>
              {estComplete
                ? `Le départ ${dem.tag} est entièrement déconsigné.\nL'agent a été notifié.`
                : `Déconsignation électrique effectuée.\nEn attente de la validation process.`
              }
            </Text>
          </View>

          {/* Infos demande */}
          <View style={S.card}>
            {[
              { icon: 'hardware-chip-outline', lbl: 'TAG',        val: dem.tag            },
              { icon: 'layers-outline',         lbl: 'LOT',        val: dem.lot_code       },
              { icon: 'cube-outline',           lbl: 'Équipement', val: dem.equipement_nom  },
              { icon: 'person-outline',         lbl: 'Demandeur',  val: dem.demandeur_nom   },
            ].map((r, i) => (
              <View key={i} style={S.infoRow}>
                <Ionicons name={r.icon} size={14} color={CFG.couleur} />
                <Text style={S.infoLbl}>{r.lbl}</Text>
                <Text style={S.infoVal} numberOfLines={1}>{r.val || '—'}</Text>
              </View>
            ))}
          </View>

          {/* Récapitulatif actions */}
          <View style={[S.card, { marginTop: 12 }]}>
            <Text style={[S.cardTitle, { marginBottom: 10 }]}>Récapitulatif</Text>
            {[
              {
                icon:  'lock-open-outline',
                txt:   nbTotal > 0 ? `${nbTotal} cadenas électrique${nbTotal > 1 ? 's' : ''} retirés` : 'Cadenas électriques retirés',
                ok:    true,
              },
              { icon: 'card-outline',          txt: `Badge chargé vérifié`,        ok: true  },
              { icon: 'document-text-outline', txt: 'PDF déconsignation généré',   ok: !!pdfUrl },
              { icon: 'notifications-outline', txt: 'Agent notifié',               ok: estComplete },
              {
                icon: 'cog-outline',
                txt:  estComplete ? 'Process déconsigné ✓' : 'Déconsignation process en attente',
                ok:   estComplete,
                warn: !estComplete,
              },
            ].map((item, i) => (
              <View key={i} style={[S.resultRow, { backgroundColor: item.warn ? '#FFFBEB' : '#fff' }]}>
                <Ionicons name={item.icon} size={16} color={item.ok ? CFG.couleur : item.warn ? '#B45309' : '#BDBDBD'} />
                <Text style={[S.resultRowTxt, { color: item.warn ? '#92400E' : '#424242' }]}>
                  {item.txt}
                </Text>
                <Ionicons
                  name={item.ok ? 'checkmark-circle' : item.warn ? 'time-outline' : 'ellipse-outline'}
                  size={16}
                  color={item.ok ? CFG.vert : item.warn ? '#F59E0B' : '#BDBDBD'}
                />
              </View>
            ))}
          </View>

          {/* ✅ Bouton PDF — toujours accessible */}
          {pdfUrl && (
            <TouchableOpacity
              style={[S.pdfBtn, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}
              onPress={() => navigation.navigate('PdfViewer', {
                url:   pdfUrl,
                titre: `Déconsignation — ${dem.numero_ordre}`,
                role:  'charge',
              })}
              activeOpacity={0.85}
            >
              <View style={[S.pdfIcon, { backgroundColor: CFG.couleur }]}>
                <Ionicons name="document-text" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[S.pdfTitle, { color: CFG.couleurDark }]}>F-HSE-SEC-22-01</Text>
                <Text style={[S.pdfSub, { color: CFG.couleur }]}>
                  Plan de consignation/déconsignation
                </Text>
              </View>
              <View style={[S.pdfOuvrir, { backgroundColor: CFG.couleur }]}>
                <Ionicons name="eye-outline" size={16} color="#fff" />
                <Text style={S.pdfOuvrirTxt}>Voir</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Bannière process en attente */}
          {!estComplete && (dem.types_intervenants || []).includes('process') && (
            <View style={[S.card, { marginTop: 12, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={16} color="#B45309" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E', flex: 1 }}>
                  Déconsignation process en attente
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: '#B45309', marginTop: 6, lineHeight: 17 }}>
                Le Chef Process doit encore déconsigner ses vannes process pour que la demande soit totalement terminée.
              </Text>
            </View>
          )}

        </ScrollView>

        {/* Bouton retour */}
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnPrimary, { backgroundColor: CFG.couleur }]}
            onPress={() => navigation.navigate('DashboardCharge')}
          >
            <Ionicons name="home-outline" size={20} color="#fff" />
            <Text style={S.btnPrimaryTxt}>RETOUR AU TABLEAU DE BORD</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════
  // Vue caméra : scan cadenas
  // ══════════════════════════════════════════════════════════
  if (modeScan) {
    const bandColor = statusMsg?.type === 'ok' ? '#10B981' : '#EF4444';
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={S.camHeader}>
          <TouchableOpacity style={S.camBackBtn} onPress={() => {
            setModeScan(false); setPointEnCours(null);
            setScanned(false); cooldown.current = false;
          }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.camTitle}>Scanner le cadenas</Text>
            <Text style={S.camSub}>{pointEnCours?.repere_point || 'Point à déconsigner'}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleScanCadenas}
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
                <View style={S.scanResultOverlay}>
                  <Ionicons
                    name={scanResult === 'ok' ? 'checkmark-circle' : 'close-circle'}
                    size={64}
                    color={scanResult === 'ok' ? '#10B981' : '#EF4444'}
                  />
                </View>
              )}
            </Animated.View>
            <View style={S.overlaySide} />
          </View>
          <View style={S.overlayBottom} />
        </View>

        {statusMsg && (
          <Animated.View pointerEvents="none" style={[S.bandeau, { backgroundColor: bandColor, opacity: statusAnim }]}>
            <Text style={S.bandeauTxt}>{statusMsg.text}</Text>
          </Animated.View>
        )}

        <View style={S.camInstr}>
          {pointEnCours?.cadenas_consigne && (
            <View style={S.infoStrip}>
              <Ionicons name="lock-closed-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={S.infoStripTxt}>
                Cadenas posé lors de la consignation :{' '}
                <Text style={{ fontWeight: '700', color: '#fff' }}>{pointEnCours.cadenas_consigne}</Text>
              </Text>
            </View>
          )}
          <View style={[S.instructCard, { backgroundColor: `${CFG.couleur}E6` }]}>
            <Ionicons name="qr-code-outline" size={24} color="#fff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>Scannez le QR du cadenas à retirer</Text>
              <Text style={S.instrSub}>
                {pointEnCours?.repere_point || ''} — {pointEnCours?.dispositif_condamnation || ''}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════
  // Vue caméra : scan badge
  // ══════════════════════════════════════════════════════════
  if (modeBadge) {
    const bandColor = statusMsg?.type === 'ok' ? '#10B981' : '#EF4444';
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={S.camHeader}>
          <TouchableOpacity style={S.camBackBtn} onPress={() => {
            setModeBadge(false); setScanned(false); cooldown.current = false;
          }}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.camTitle}>Scanner votre badge</Text>
            <Text style={S.camSub}>Identification avant déconsignation</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleScanBadge}
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
            </Animated.View>
            <View style={S.overlaySide} />
          </View>
          <View style={S.overlayBottom} />
        </View>

        {statusMsg && (
          <Animated.View pointerEvents="none" style={[S.bandeau, { backgroundColor: bandColor, opacity: statusAnim }]}>
            <Text style={S.bandeauTxt}>{statusMsg.text}</Text>
          </Animated.View>
        )}

        <View style={S.camInstr}>
          {userBadgeId && (
            <View style={S.infoStrip}>
              <Ionicons name="person-circle-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={S.infoStripTxt}>
                Votre badge : <Text style={{ fontWeight: '700', color: '#fff' }}>{userBadgeId}</Text>
              </Text>
            </View>
          )}
          <View style={[S.instructCard, { backgroundColor: `${CFG.couleur}E6` }]}>
            <Ionicons name="card-outline" size={24} color="#fff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>Scannez votre badge OCP</Text>
              <Text style={S.instrSub}>Identification obligatoire avant de valider</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════
  // Vue principale : liste des cadenas + progression
  // ══════════════════════════════════════════════════════════
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Déconsignation</Text>
          <Text style={S.hSub}>{dem.numero_ordre}</Text>
        </View>
        <TouchableOpacity style={S.refreshBtnSm} onPress={charger}>
          <Ionicons name="refresh-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 160 }}
      >
        {/* Infos demande */}
        <View style={S.card}>
          {[
            { icon: 'hardware-chip-outline', lbl: 'TAG',        val: dem.tag            },
            { icon: 'layers-outline',         lbl: 'LOT',        val: dem.lot_code       },
            { icon: 'cube-outline',           lbl: 'Équipement', val: dem.equipement_nom  },
            { icon: 'person-outline',         lbl: 'Demandeur',  val: dem.demandeur_nom   },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Ionicons name={r.icon} size={14} color={CFG.couleur} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal} numberOfLines={1}>{r.val || '—'}</Text>
            </View>
          ))}
        </View>

        {/* Progression cadenas */}
        <View style={[S.card, { marginTop: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="lock-open-outline" size={16} color={CFG.couleur} />
              <Text style={S.cardTitle}>Cadenas à retirer</Text>
            </View>
            <View style={[S.progressBadge, { backgroundColor: tousDecon ? '#D1FAE5' : CFG.bgPale }]}>
              <Text style={[S.progressBadgeTxt, { color: tousDecon ? '#10B981' : CFG.couleur }]}>
                {nbDecon}/{nbTotal}
              </Text>
            </View>
          </View>

          {nbTotal > 0 && (
            <View style={S.progressBar}>
              <View style={[S.progressFill, {
                width: `${progression.pourcentage}%`,
                backgroundColor: tousDecon ? '#10B981' : CFG.couleur,
              }]} />
            </View>
          )}

          {points.length === 0 ? (
            <View style={S.emptyPts}>
              <Ionicons name="information-circle-outline" size={20} color="#9E9E9E" />
              <Text style={S.emptyPtsTxt}>Aucun cadenas électrique à déconsigner</Text>
            </View>
          ) : (
            points.map((pt, i) => {
              const decon = pt.decons_fait;
              return (
                <View key={i} style={[S.pointRow, decon && { borderLeftColor: CFG.vert, borderLeftWidth: 3 }]}>
                  <View style={[S.pointIcon, { backgroundColor: decon ? '#D1FAE5' : '#F5F5F5' }]}>
                    <Ionicons
                      name={decon ? 'lock-open' : 'lock-closed-outline'}
                      size={16}
                      color={decon ? CFG.vert : '#BDBDBD'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={S.pointRepere}>{pt.repere_point} — {pt.dispositif_condamnation}</Text>
                    <Text style={S.pointLocal}>{pt.localisation}</Text>
                    {pt.cadenas_consigne && (
                      <Text style={{ fontSize: 10, color: '#9E9E9E', marginTop: 1 }}>
                        Posé : <Text style={{ fontWeight: '700' }}>{pt.cadenas_consigne}</Text>
                      </Text>
                    )}
                    {decon && (
                      <Text style={{ fontSize: 10, color: CFG.vert, fontWeight: '700', marginTop: 2 }}>
                        ✅ Retiré {pt.cadenas_decons ? `— ${pt.cadenas_decons}` : ''} {pt.date_decons ? `le ${fmtDate(pt.date_decons)}` : ''}
                      </Text>
                    )}
                  </View>
                  {decon ? (
                    <Ionicons name="checkmark-circle" size={24} color={CFG.vert} />
                  ) : (
                    <TouchableOpacity
                      style={[S.scanBtn, { backgroundColor: CFG.couleur }]}
                      onPress={() => ouvrirScanPoint(pt)}
                    >
                      <Ionicons name="qr-code-outline" size={14} color="#fff" />
                      <Text style={S.scanBtnTxt}>Scanner</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Badge */}
        <View style={[S.card, { marginTop: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Ionicons
              name="card-outline"
              size={16}
              color={badgeValide ? CFG.vert : CFG.couleur}
            />
            <Text style={[S.cardTitle, { color: badgeValide ? CFG.vert : '#212121' }]}>
              {badgeValide ? 'Badge validé ✅' : 'Scanner votre badge'}
            </Text>
          </View>

          {badgeValide ? (
            <View style={[S.badgeOkBox, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-circle" size={20} color={CFG.vert} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[S.badgeOkNom, { color: '#065F46' }]}>{userName}</Text>
                <Text style={[S.badgeOkId, { color: '#047857' }]}>{badgeId}</Text>
              </View>
              <TouchableOpacity onPress={() => {
                setBadgeValide(false); setBadgeId(null);
                setScanned(false); cooldown.current = false;
                setModeBadge(true);
              }}>
                <Ionicons name="refresh-outline" size={18} color="#047857" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[S.scanBadgeBtn, { backgroundColor: tousDecon ? CFG.couleur : '#BDBDBD' }]}
              onPress={() => {
                if (!tousDecon) {
                  Alert.alert('Cadenas manquants', `Veuillez scanner les ${nbTotal - nbDecon} cadenas restants avant de valider votre badge.`);
                  return;
                }
                setScanned(false); cooldown.current = false; setModeBadge(true);
              }}
            >
              <Ionicons name="qr-code-outline" size={18} color="#fff" />
              <Text style={S.scanBadgeBtnTxt}>
                {tousDecon ? 'SCANNER MON BADGE POUR SIGNER' : `${nbTotal - nbDecon} cadenas restant(s) à scanner`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info process */}
        {(dem.types_intervenants || []).includes('process') && (
          <View style={[S.card, { marginTop: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="information-circle-outline" size={16} color="#B45309" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E', flex: 1 }}>
                Points process — Chef Process
              </Text>
            </View>
            <Text style={{ fontSize: 11, color: '#B45309', marginTop: 6, lineHeight: 17 }}>
              Les vannes process seront déconsignées séparément par le Chef Process.
              Votre validation concerne uniquement les cadenas électriques.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bouton validation finale */}
      <View style={S.bottomBar}>
        <TouchableOpacity
          style={[S.btnPrimary, {
            backgroundColor: (tousDecon && badgeValide) ? CFG.couleur : '#BDBDBD',
          }, validating && { opacity: 0.65 }]}
          onPress={handleValider}
          disabled={!tousDecon || !badgeValide || validating}
        >
          {validating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-open-outline" size={22} color="#fff" />
              <Text style={S.btnPrimaryTxt}>
                {!tousDecon
                  ? `Scanner ${nbTotal - nbDecon} cadenas restant(s)`
                  : !badgeValide
                  ? "SCANNER VOTRE BADGE D'ABORD"
                  : 'VALIDER LA DÉCONSIGNATION'
                }
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Ligne de scan animée ──
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
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 216] });
  return <Animated.View style={[S.scanLine, { backgroundColor: color, transform: [{ translateY }] }]} />;
}

const FRAME = 220;
const S = StyleSheet.create({
  header:       { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:      { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  refreshBtnSm: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:       { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:         { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    marginBottom: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#212121' },

  infoRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:  { fontSize: 12, color: '#9E9E9E', width: 80 },
  infoVal:  { flex: 1, fontSize: 12, fontWeight: '600', color: '#212121', textAlign: 'right' },

  progressBadge:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  progressBadgeTxt: { fontSize: 12, fontWeight: '700' },
  progressBar:      { height: 8, backgroundColor: '#d8f3dc', borderRadius: 4, marginBottom: 12, overflow: 'hidden' },
  progressFill:     { height: 8, borderRadius: 4 },

  pointRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10, marginBottom: 8 },
  pointIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pointRepere: { fontSize: 12, fontWeight: '700', color: '#212121' },
  pointLocal:  { fontSize: 11, color: '#9E9E9E', marginTop: 1 },

  scanBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  scanBtnTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  emptyPts:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#F9F9F9', borderRadius: 10 },
  emptyPtsTxt: { fontSize: 12, color: '#9E9E9E' },

  badgeOkBox:  { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12 },
  badgeOkNom:  { fontSize: 14, fontWeight: '800' },
  badgeOkId:   { fontSize: 12, marginTop: 2 },
  scanBadgeBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, paddingVertical: 14 },
  scanBadgeBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  // Écran récap / succès
  successCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  successTitre:  { fontSize: 20, fontWeight: '900', marginBottom: 6, textAlign: 'center' },
  successSub:    { fontSize: 13, color: '#9E9E9E', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  resultRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#F0F0F0' },
  resultRowTxt:  { flex: 1, fontSize: 12, color: '#424242' },

  // PDF card
  pdfBtn:    { flexDirection: 'row', alignItems: 'center', marginTop: 14, borderRadius: 14, padding: 14, borderWidth: 1.5, elevation: 2 },
  pdfIcon:   { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pdfTitle:  { fontSize: 13, fontWeight: '800' },
  pdfSub:    { fontSize: 11, marginTop: 2 },
  pdfOuvrir: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pdfOuvrirTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Caméra
  camHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  camBackBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  camTitle:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  camSub:     { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  scanFrame:     { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },

  corner:    { position: 'absolute', width: 24, height: 24, borderColor: '#2d6a4f', borderWidth: 3 },
  cornerTL:  { top: 0,    left: 0,  borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0,    right: 0, borderLeftWidth: 0,  borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderRightWidth: 0, borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0,  borderTopWidth: 0,    borderBottomRightRadius: 6 },

  scanLine:          { position: 'absolute', left: 10, right: 10, height: 2, opacity: 0.8, borderRadius: 1 },
  scanResultOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },

  bandeau: {
    position: 'absolute', zIndex: 20, top: '44%', left: 20, right: 20,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 12,
  },
  bandeauTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  camInstr: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: Platform.OS === 'android' ? 24 : 16,
    gap: 8, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  instructCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14 },
  instrTitle:   { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  infoStrip:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 },
  infoStripTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },

  bottomBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 14, paddingBottom: Platform.OS === 'ios' ? 28 : 14, borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10 },
  btnPrimary:    { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 4 },
  btnPrimaryTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});