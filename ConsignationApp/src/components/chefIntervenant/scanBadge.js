// src/components/chefIntervenant/scanBadge.js
// ══════════════════════════════════════════════════════════════
// FIX : Si la demande reçue est incomplète (juste { id } depuis notif),
//       charger les infos complètes depuis getMesDemandes()
// ══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Vibration, Animated,
  Platform, SafeAreaView, ScrollView,
  ActivityIndicator, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { getMesDemandes } from '../../api/intervenant.api';         // ✅ pour charger infos demande
import { enregistrerMembre, getEquipe, validerEquipe } from '../../api/equipeIntervention.api';

const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
  bgPale:      '#BBDEFB',
};

const FRAME = 220;

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
  return <Animated.View style={[S.scanLine, { backgroundColor: color, transform: [{ translateY: ty }] }]} />;
}

export default function ScanBadge({ navigation, route }) {
  const { demande } = route.params;

  // ✅ FIX : état local pour les infos demande (peut être enrichi après chargement)
  const [demandeInfo, setDemandeInfo] = useState(demande);

  const [membres,       setMembres]       = useState([]);
  const [equipeValidee, setEquipeValidee] = useState(false);
  const [loadingInit,   setLoadingInit]   = useState(true);

  const [etape, setEtape] = useState('liste');

  const [badgeScanne,     setBadgeScanne]     = useState('');
  const [cadenasScanne,   setCadenasScanne]   = useState('');
  const [nomMembre,       setNomMembre]       = useState('');
  const [matriculeMembre, setMatriculeMembre] = useState('');
  const [saving,          setSaving]          = useState(false);
  const [validating,      setValidating]      = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,    setScanned]        = useState(false);
  const [statusMsg,  setStatusMsg]      = useState(null);

  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const statusAnim = useRef(new Animated.Value(0)).current;
  const cooldown   = useRef(false);

  // ✅ FIX : charge les infos complètes si demande incomplète (vient d'une notif)
  const chargerEquipe = useCallback(async () => {
    try {
      setLoadingInit(true);

      // Si la demande reçue n'a pas de tag/numero_ordre → charger depuis API
      if (!demande.tag || !demande.numero_ordre) {
        try {
          const demandesRes = await getMesDemandes();
          if (demandesRes.success) {
            const found = demandesRes.data.find(d => d.id == demande.id);
            if (found) setDemandeInfo(found);
          }
        } catch (e) {
          console.warn('Impossible de charger infos demande:', e);
        }
      }

      // Charger membres équipe
      const res = await getEquipe(demande.id);
      if (res.success) {
        setMembres(res.data.membres || []);
        setEquipeValidee(res.data.equipe_validee === 1);
      }
    } catch (e) {
      if (e?.response?.status !== 404) console.error('getEquipe error:', e);
      setMembres([]);
      setEquipeValidee(false);
    } finally {
      setLoadingInit(false);
    }
  }, [demande.id]);

  useEffect(() => { chargerEquipe(); }, [chargerEquipe]);

  useEffect(() => {
    if (etape !== 'scanBadge' && etape !== 'scanCadenas') return;
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    p.start();
    return () => p.stop();
  }, [etape]);

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

  const resetScan = (ms = 1800) => {
    setTimeout(() => { cooldown.current = false; setScanned(false); }, ms);
  };

  const handleBadgeScan = ({ data }) => {
    if (scanned || cooldown.current) return;
    cooldown.current = true;
    setScanned(true);
    const badge = data.trim();
    if (!badge) {
      Vibration.vibrate([0, 80, 60, 80]);
      showBandeau('err', 'QR invalide — badge vide');
      resetScan(2000);
      return;
    }
    Vibration.vibrate(200);
    showBandeau('ok', `✅ Badge scanné : ${badge}`);
    setTimeout(() => {
      setBadgeScanne(badge);
      setScanned(false);
      cooldown.current = false;
      setEtape('scanCadenas');
    }, 900);
  };

  const handleCadenasScan = ({ data }) => {
    if (scanned || cooldown.current) return;
    cooldown.current = true;
    setScanned(true);
    const qrData = data.trim();
    if (!qrData || qrData.length < 2) {
      Vibration.vibrate([0, 80, 60, 80]);
      showBandeau('err', 'QR invalide');
      resetScan(2000);
      return;
    }
    const parts     = qrData.includes('::') ? qrData.split('::') : [qrData];
    const cadenas   = parts[0].trim();
    const matricule = parts[1]?.trim() || '';
    Vibration.vibrate(200);
    showBandeau('ok', `✅ Cadenas : ${cadenas}`);
    setTimeout(() => {
      setCadenasScanne(cadenas);
      if (matricule) setMatriculeMembre(matricule);
      setScanned(false);
      cooldown.current = false;
      setEtape('confirm');
    }, 900);
  };

  const handleEnregistrer = async () => {
    if (!nomMembre.trim()) {
      Alert.alert('Champ requis', 'Entrez le nom du membre.');
      return;
    }
    try {
      setSaving(true);
      const res = await enregistrerMembre({
        demande_id:     demande.id,
        nom:            nomMembre.trim(),
        matricule:      matriculeMembre.trim() || undefined,
        badge_ocp_id:   badgeScanne || undefined,
        numero_cadenas: cadenasScanne || undefined,
      });
      if (res.success) {
        setMembres(prev => [...prev, res.data]);
        setBadgeScanne(''); setCadenasScanne('');
        setNomMembre(''); setMatriculeMembre('');
        setEtape('liste');
        Alert.alert('✅ Succès', 'Membre enregistré dans l\'équipe.');
      } else {
        Alert.alert('Erreur', res.message || 'Impossible d\'enregistrer.');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
    } finally {
      setSaving(false);
    }
  };

  const handleValiderEquipe = () => {
    if (membres.length === 0) {
      Alert.alert('Attention', 'Enregistrez au moins un membre.');
      return;
    }
    Alert.alert(
      'Confirmer validation',
      `Valider l'équipe de ${membres.length} personne${membres.length > 1 ? 's' : ''} ?\nL'agent demandeur sera notifié.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: async () => {
            try {
              setValidating(true);
              const res = await validerEquipe(demande.id);
              if (res.success) {
                setEquipeValidee(true);
                Alert.alert(
                  '✅ Équipe validée !',
                  'L\'agent demandeur a été notifié. Le travail peut commencer.',
                  [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
              } else {
                Alert.alert('Erreur', res.message);
              }
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            } finally {
              setValidating(false);
            }
          },
        },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────
  // RENDU CAMÉRA
  // ─────────────────────────────────────────────────────────
  if (etape === 'scanBadge' || etape === 'scanCadenas') {
    const isBadge    = etape === 'scanBadge';
    const bandColor  = statusMsg?.type === 'ok' ? '#10B981' : '#EF4444';
    const stepActuel = isBadge ? 0 : 1;
    const stepLabels = ['Badge', 'Cadenas', 'Confirmer'];

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={S.camHeader}>
          <TouchableOpacity
            style={S.camBackBtn}
            onPress={() => { setScanned(false); cooldown.current = false; setEtape(isBadge ? 'liste' : 'scanBadge'); }}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.camTitle}>{isBadge ? 'Étape 1/3 — Badge membre' : 'Étape 2/3 — Cadenas membre'}</Text>
            <Text style={S.camSub}>{isBadge ? 'Scannez le badge OCP du membre' : 'Scannez le cadenas du membre'}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={S.stepperCam}>
          {stepLabels.map((s, i) => (
            <View key={i} style={S.stepItem}>
              <View style={[S.stepCircle, i < stepActuel && { backgroundColor: '#10B981' }, i === stepActuel && { backgroundColor: CFG.couleur }]}>
                {i < stepActuel
                  ? <Ionicons name="checkmark" size={12} color="#fff" />
                  : <Text style={[S.stepNum, i === stepActuel && { color: '#fff' }]}>{i + 1}</Text>}
              </View>
              <Text style={[S.stepLbl, i === stepActuel && { color: 'rgba(255,255,255,0.9)', fontWeight: '700' }]}>{s}</Text>
            </View>
          ))}
        </View>

        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : (isBadge ? handleBadgeScan : handleCadenasScan)}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />

        <View style={S.overlay} pointerEvents="none">
          <View style={S.overlayTop} />
          <View style={S.overlayRow}>
            <View style={S.overlaySide} />
            <Animated.View style={[S.scanFrame, { transform: [{ scale: pulseAnim }] }]}>
              <View style={[S.corner, S.cornerTL]} /><View style={[S.corner, S.cornerTR]} />
              <View style={[S.corner, S.cornerBL]} /><View style={[S.corner, S.cornerBR]} />
              {!scanned && <ScanLine color={CFG.couleur} />}
              {scanned && <View style={S.successOverlay}><Ionicons name="checkmark-circle" size={64} color="#10B981" /></View>}
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

        <SafeAreaView style={[S.instructionsSafe, { paddingBottom: Platform.OS === 'android' ? 24 : 16 }]}>
          {!isBadge && badgeScanne ? (
            <View style={S.infoStrip}>
              <Ionicons name="card-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={S.infoStripTxt}>Badge : <Text style={{ fontWeight: '700', color: '#fff' }}>{badgeScanne}</Text></Text>
            </View>
          ) : null}
          <View style={S.instructCard}>
            <Ionicons name={isBadge ? 'card-outline' : 'lock-closed-outline'} size={24} color="#fff" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={S.instrTitle}>{isBadge ? 'Scannez le badge OCP du membre' : 'Scannez le cadenas du membre'}</Text>
              <Text style={S.instrSub}>{isBadge ? 'QR Code sur le badge OCP de l\'intervenant' : 'Format : CAD-001 ou CAD-001::MATRICULE'}</Text>
            </View>
          </View>
          <View style={S.infoStrip}>
            <Ionicons name="hardware-chip-outline" size={14} color="rgba(255,255,255,0.6)" />
            {/* ✅ utilise demandeInfo à la place de demande */}
            <Text style={S.infoStripTxt}>{demandeInfo.tag || '—'} — {demandeInfo.lot_code || demandeInfo.lot || '—'}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDU CONFIRMATION
  // ─────────────────────────────────────────────────────────
  if (etape === 'confirm') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F5F7FA' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />
        <View style={[S.header, { backgroundColor: CFG.couleur }]}>
          <TouchableOpacity style={S.backBtn} onPress={() => setEtape('scanCadenas')}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={S.hTitle}>Étape 3/3 — Confirmer</Text>
            <Text style={S.hSub}>Saisir les infos du membre</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={S.stepperList}>
          {['Badge', 'Cadenas', 'Confirmer'].map((s, i) => (
            <View key={i} style={S.stepItem}>
              <View style={[S.stepCircleList, i < 2 && { backgroundColor: '#10B981' }, i === 2 && { backgroundColor: CFG.couleur }]}>
                {i < 2 ? <Ionicons name="checkmark" size={12} color="#fff" /> : <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{i + 1}</Text>}
              </View>
              <Text style={[S.stepLblList, i === 2 && { color: CFG.couleur, fontWeight: '700' }]}>{s}</Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
          <View style={S.card}>
            <Text style={S.cardTitle}>Données scannées ✅</Text>
            <View style={S.dataRow}>
              <Ionicons name="card-outline" size={15} color={CFG.couleur} />
              <Text style={S.dataLbl}>Badge OCP</Text>
              <Text style={S.dataVal}>{badgeScanne || '—'}</Text>
            </View>
            <View style={[S.dataRow, { borderBottomWidth: 0 }]}>
              <Ionicons name="lock-closed-outline" size={15} color={CFG.couleur} />
              <Text style={S.dataLbl}>N° Cadenas</Text>
              <Text style={S.dataVal}>{cadenasScanne || '—'}</Text>
            </View>
          </View>

          <View style={[S.card, { marginTop: 14 }]}>
            <Text style={S.cardTitle}>Informations du membre</Text>
            <Text style={S.fLbl}>Nom complet <Text style={{ color: '#EF4444' }}>*</Text></Text>
            <TextInput style={S.fInput} placeholder="ex: LAHMADI Oussama" placeholderTextColor="#BDBDBD" value={nomMembre} onChangeText={setNomMembre} autoCapitalize="characters" autoFocus />
            <Text style={S.fLbl}>Matricule <Text style={{ color: '#9E9E9E', fontSize: 11 }}>(optionnel)</Text></Text>
            <TextInput style={S.fInput} placeholder="ex: OCP-12345" placeholderTextColor="#BDBDBD" value={matriculeMembre} onChangeText={setMatriculeMembre} autoCapitalize="characters" />
          </View>
        </ScrollView>

        <View style={[S.bottomBar, { paddingBottom: Platform.OS === 'ios' ? 28 : 16 }]}>
          <TouchableOpacity style={[S.btnPrimary, { backgroundColor: CFG.couleur }, saving && { opacity: 0.6 }]} onPress={handleEnregistrer} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="person-add-outline" size={20} color="#fff" /><Text style={S.btnPrimaryTxt}>ENREGISTRER CE MEMBRE</Text></>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDU LISTE (écran principal)
  // ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.hTitle}>Enregistrement Équipe</Text>
          {/* ✅ utilise demandeInfo */}
          <Text style={S.hSub}>{demandeInfo.tag || '—'} — {demandeInfo.numero_ordre || '—'}</Text>
        </View>
        <View style={[S.memberCount, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{membres.length}</Text>
        </View>
      </View>

      {loadingInit ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={CFG.couleur} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 140 }}>
          <View style={S.card}>
            <View style={[S.statutBadge, { backgroundColor: equipeValidee ? '#E8F5E9' : CFG.bg, marginBottom: 12 }]}>
              <Ionicons name={equipeValidee ? 'checkmark-circle' : 'time-outline'} size={16} color={equipeValidee ? '#2E7D32' : CFG.couleur} />
              <Text style={[S.statutTxt, { color: equipeValidee ? '#2E7D32' : CFG.couleur }]}>
                {equipeValidee ? 'Équipe validée ✅' : 'Enregistrement en cours...'}
              </Text>
            </View>
            {[
              { icon: 'hardware-chip-outline', lbl: 'TAG',          val: demandeInfo.tag                     },
              { icon: 'layers-outline',        lbl: 'LOT',          val: demandeInfo.lot_code                },
              { icon: 'cube-outline',          lbl: 'Équipement',   val: demandeInfo.equipement_nom          },
              { icon: 'location-outline',      lbl: 'Localisation', val: demandeInfo.equipement_localisation },
            ].map((r, i) => (
              <View key={i} style={S.infoRow}>
                <Ionicons name={r.icon} size={13} color={CFG.couleur} />
                <Text style={S.infoLbl}>{r.lbl}</Text>
                <Text style={S.infoVal} numberOfLines={1}>{r.val || '—'}</Text>
              </View>
            ))}
          </View>

          {membres.length > 0 && (
            <View style={[S.card, { marginTop: 14 }]}>
              <Text style={S.cardTitle}>Membres enregistrés ({membres.length})</Text>
              {membres.map((m, i) => (
                <View key={m.id || i} style={[S.membreRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F0F0F0' }]}>
                  <View style={[S.avatar, { backgroundColor: CFG.bg }]}>
                    <Text style={[S.avatarTxt, { color: CFG.couleur }]}>{(m.nom || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={S.membreNom}>{m.nom}</Text>
                    <Text style={S.membreMeta}>Badge : {m.badge_ocp_id || '—'}</Text>
                    <Text style={S.membreMeta}>Cadenas : {m.numero_cadenas || '—'}</Text>
                  </View>
                  <View style={[S.presenceDot, { backgroundColor: '#10B981' }]} />
                </View>
              ))}
            </View>
          )}

          {!equipeValidee && (
            <TouchableOpacity
              style={[S.addBtn, { borderColor: CFG.couleur, marginTop: 14 }]}
              onPress={() => {
                setBadgeScanne(''); setCadenasScanne('');
                setNomMembre(''); setMatriculeMembre('');
                setScanned(false); cooldown.current = false;
                setEtape('scanBadge');
              }}
            >
              <View style={[S.addBtnIcon, { backgroundColor: CFG.bg }]}>
                <Ionicons name="person-add-outline" size={22} color={CFG.couleur} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.addBtnTxt, { color: CFG.couleur }]}>Ajouter un membre</Text>
                <Text style={S.addBtnSub}>Scanner badge OCP puis cadenas</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CFG.couleur} />
            </TouchableOpacity>
          )}

          {membres.length === 0 && !equipeValidee && (
            <View style={S.emptyBox}>
              <View style={[S.emptyCircle, { backgroundColor: CFG.bg }]}>
                <Ionicons name="people-outline" size={42} color={CFG.couleur} />
              </View>
              <Text style={S.emptyTitle}>Aucun membre enregistré</Text>
              <Text style={S.emptySub}>Ajoutez les membres de votre équipe{'\n'}en scannant leur badge OCP et leur cadenas</Text>
            </View>
          )}
        </ScrollView>
      )}

      {!equipeValidee && membres.length > 0 && (
        <View style={[S.bottomBar, { paddingBottom: Platform.OS === 'ios' ? 28 : 16 }]}>
          <TouchableOpacity style={[S.btnValider, validating && { opacity: 0.6 }]} onPress={handleValiderEquipe} disabled={validating} activeOpacity={0.85}>
            {validating
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="checkmark-done-circle" size={22} color="#fff" /><Text style={S.btnPrimaryTxt}>VALIDER L'ÉQUIPE ({membres.length} membre{membres.length > 1 ? 's' : ''})</Text></>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  header:      { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:     { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:      { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:        { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  memberCount: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepperList:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 28, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  stepCircleList: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepLblList:    { fontSize: 9, color: '#9E9E9E', marginTop: 3 },
  stepperCam: { position: 'absolute', top: 106, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  stepItem:   { alignItems: 'center', gap: 3 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepLbl:    { fontSize: 8, color: 'rgba(255,255,255,0.5)' },
  camHeader:  { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  camBackBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  camTitle:   { color: '#fff', fontSize: 15, fontWeight: '700' },
  camSub:     { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  scanFrame:      { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },
  corner:         { position: 'absolute', width: 26, height: 26, borderColor: '#1565C0', borderWidth: 3 },
  cornerTL:       { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6     },
  cornerTR:       { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6    },
  cornerBL:       { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6  },
  cornerBR:       { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },
  scanLine:       { position: 'absolute', left: 8, right: 8, height: 2, opacity: 0.85, borderRadius: 1 },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.3)', alignItems: 'center', justifyContent: 'center' },
  bandeau:    { position: 'absolute', zIndex: 20, top: '44%', left: 20, right: 20, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 12 },
  bandeauTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  instructionsSafe: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  instructCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(21,101,192,0.9)', borderRadius: 14, padding: 14 },
  instrTitle:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:         { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  infoStrip:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 },
  infoStripTxt:     { color: 'rgba(255,255,255,0.7)', fontSize: 11, flex: 1 },
  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12 },
  statutBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, gap: 8 },
  statutTxt:   { fontSize: 13, fontWeight: '700' },
  infoRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:     { fontSize: 12, color: '#9E9E9E', width: 75 },
  infoVal:     { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },
  membreRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  avatar:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { fontSize: 16, fontWeight: '800' },
  membreNom:   { fontSize: 14, fontWeight: '700', color: '#212121' },
  membreMeta:  { fontSize: 11, color: '#9E9E9E', marginTop: 1 },
  presenceDot: { width: 10, height: 10, borderRadius: 5 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1.5, borderStyle: 'dashed', elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, gap: 12 },
  addBtnIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addBtnTxt:  { fontSize: 14, fontWeight: '700' },
  addBtnSub:  { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  emptyBox:    { alignItems: 'center', paddingTop: 40, paddingHorizontal: 30 },
  emptyCircle: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: '#424242' },
  emptySub:    { fontSize: 13, color: '#9E9E9E', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  fLbl:    { fontSize: 13, fontWeight: '600', color: '#424242', marginTop: 14, marginBottom: 6 },
  fInput:  { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 14, height: 48, fontSize: 15, color: '#212121' },
  dataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  dataLbl: { fontSize: 12, color: '#9E9E9E', width: 80 },
  dataVal: { flex: 1, fontSize: 13, fontWeight: '700', color: '#212121', textAlign: 'right' },
  bottomBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 14, borderTopWidth: 1, borderTopColor: '#EEE', elevation: 8 },
  btnPrimary:   { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnValider:   { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#2E7D32', elevation: 4, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  btnPrimaryTxt:{ color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});