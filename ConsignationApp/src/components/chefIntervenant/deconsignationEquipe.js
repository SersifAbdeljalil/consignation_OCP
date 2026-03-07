// src/screens/chef/deconsignationEquipe.js
// ══════════════════════════════════════════════════════════════════
// CHANGEMENTS vs version précédente :
//  1. deconsignerMembre envoie maintenant { cad_id, numero_cadenas, badge_ocp_id }
//     (plus seulement { numero_cadenas })
//  2. Vérification côté front sur cad_id en priorité (si renseigné)
//     puis numero_cadenas en fallback
//  3. Ajout bouton "Valider déconsignation + générer PDF"
//     → appelle validerDeconsignation(demande_id)
//     → navigue vers PdfViewer avec l'URL du rapport
//  4. Bannière "Rapport disponible" si rapport_genere === true
//  5. Import validerDeconsignation depuis l'API
// ══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform, Animated, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getStatutDeconsignation,
  deconsignerMembre,
  validerDeconsignation, // ✅ NOUVEAU
} from '../../api/equipeIntervention.api';

const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
  bgPale:      '#BBDEFB',
  vert:        '#388E3C',
  vertBg:      '#E8F5E9',
  rouge:       '#C62828',
  rougeBg:     '#FFEBEE',
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return <Animated.View style={[S.scanLine, { transform: [{ translateY }] }]} />;
}

function StepBar({ etapeCourante }) {
  return (
    <View style={S.stepBar}>
      <View style={S.stepItem}>
        <View style={[S.stepCircle, etapeCourante >= 1 && S.stepCircleActive]}>
          {etapeCourante > 1
            ? <Ionicons name="checkmark" size={14} color="#fff" />
            : <Text style={[S.stepNum, etapeCourante === 1 && S.stepNumActive]}>1</Text>
          }
        </View>
        <Text style={[S.stepLbl, etapeCourante === 1 && S.stepLblActive]}>Cadenas</Text>
      </View>
      <View style={[S.stepLine, etapeCourante >= 2 && S.stepLineActive]} />
      <View style={S.stepItem}>
        <View style={[S.stepCircle, etapeCourante >= 2 && S.stepCircleActive]}>
          <Text style={[S.stepNum, etapeCourante === 2 && S.stepNumActive]}>2</Text>
        </View>
        <Text style={[S.stepLbl, etapeCourante === 2 && S.stepLblActive]}>Badge OCP</Text>
      </View>
    </View>
  );
}

function ScanView({ titre, stepCourante, badge, infoIcone, infoTexte, infoSub, scanned, saving, onScanned, onBack }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => { if (!permission?.granted) requestPermission(); }, [permission]);
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

  if (!permission?.granted) {
    return (
      <View style={S.permCenter}>
        <Ionicons name="camera-off-outline" size={64} color="#EF4444" />
        <Text style={S.permTitle}>Accès caméra requis</Text>
        <TouchableOpacity style={S.permBtn} onPress={requestPermission}>
          <Text style={S.permBtnTxt}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={S.camHeader}>
        <TouchableOpacity style={S.camBackBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.camHTitle}>{titre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <View style={S.stepBarFloat}>
        <StepBar etapeCourante={stepCourante} />
      </View>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
      />
      <View style={S.overlay} pointerEvents="none">
        <View style={S.overlayTop} />
        <View style={S.overlayRow}>
          <View style={S.overlaySide} />
          <Animated.View style={[S.scanFrameWrap, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[S.corner, S.cornerTL]} />
            <View style={[S.corner, S.cornerTR]} />
            <View style={[S.corner, S.cornerBL]} />
            <View style={[S.corner, S.cornerBR]} />
            {!scanned && <ScanLine />}
            {scanned && (
              <View style={S.successOverlay}>
                {saving
                  ? <Ionicons name="sync-outline"     size={64} color="#F59E0B" />
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
        {badge && (
          <View style={S.metierBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
            <Text style={S.metierBadgeTxt}>{badge}</Text>
          </View>
        )}
        <View style={[S.instructCard, scanned && { backgroundColor: saving ? '#D97706' : '#10B981' }]}>
          <Ionicons
            name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : (infoIcone || 'scan-outline')}
            size={24} color="#fff"
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.instrTitle}>
              {saving ? 'Enregistrement...' : scanned ? 'Scanné !' : infoTexte}
            </Text>
            {infoSub && !scanned && <Text style={S.instrSub}>{infoSub}</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
export default function DeconsignationEquipe({ route, navigation }) {
  const { demande, userMetier } = route.params || {};
  const metierLabel = TYPE_LABEL[userMetier] || 'Chef';

  const [statut,               setStatut]               = useState(null);
  const [loading,              setLoading]               = useState(true);
  const [etape,                setEtape]                 = useState('liste');
  const [scanned,              setScanned]               = useState(false);
  const [saving,               setSaving]                = useState(false);
  const [membreActif,          setMembreActif]           = useState(null);
  const [cadenasScanne,        setCadenasScanne]         = useState(null); // cad_id scanné à l'étape 1
  const [loadingDeconsigner,   setLoadingDeconsigner]    = useState(false);
  const [loadingValiderDeconsign, setLoadingValiderDeconsign] = useState(false); // ✅ NOUVEAU

  const chargerStatut = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getStatutDeconsignation(demande.id);
      if (res.success) setStatut(res.data);
      else Alert.alert('Erreur', res.message);
    } catch { Alert.alert('Erreur', 'Impossible de charger le statut.'); }
    finally { setLoading(false); }
  }, [demande.id]);

  useEffect(() => { chargerStatut(); }, [chargerStatut]);

  const selectionnerMembre = (membre) => {
    if (membre.statut !== 'sur_site') {
      Alert.alert('Attention', `${membre.nom} n'est pas sur site.`);
      return;
    }
    // ✅ CHANGEMENT : accepte cad_id OU numero_cadenas
    if (!membre.numero_cadenas && !membre.cad_id) {
      Alert.alert('Attention', `Aucun cadenas enregistré pour ${membre.nom}.`);
      return;
    }
    setMembreActif(membre);
    setScanned(false);
    setSaving(false);
    setCadenasScanne(null);
    setEtape('scanCadenas');
  };

  const normaliser = (val) => (val || '').trim().toLowerCase().replace(/[\s-]/g, '');

  // ── ÉTAPE 1 : scan cadenas ─────────────────────────────────────
  const onScanCadenas = ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(100);
    const cad = data.trim();

    // ✅ CHANGEMENT : vérification cad_id en priorité, sinon numero_cadenas
    const attendu = membreActif?.cad_id || membreActif?.numero_cadenas || '';

    if (attendu && normaliser(cad) !== normaliser(attendu)) {
      Alert.alert(
        '⚠️ Cadenas incorrect',
        `Scanné : ${cad}\nAttendu : ${attendu}\n\nVérifiez le cadenas de ${membreActif?.nom}.`,
        [
          { text: 'Réessayer', style: 'cancel' },
          {
            text: 'Continuer quand même',
            onPress: () => { setCadenasScanne(cad); setEtape('scanBadge'); },
          },
        ]
      );
      return;
    }
    setCadenasScanne(cad);
    setEtape('scanBadge');
  };

  // ── ÉTAPE 2 : scan badge OCP ───────────────────────────────────
  const onScanBadge = async ({ data }) => {
    if (scanned || !membreActif || !cadenasScanne) return;
    Vibration.vibrate(200);
    setScanned(true);
    setSaving(true);

    const badgeScanné = data.trim();
    const badgeEnBase = membreActif?.badge_ocp_id || '';

    if (badgeEnBase && normaliser(badgeScanné) !== normaliser(badgeEnBase)) {
      Alert.alert(
        '❌ Badge incorrect',
        `Ce badge ne correspond pas à ${membreActif.nom}.\nScanné : ${badgeScanné}`,
        [{ text: 'Réessayer', onPress: () => { setScanned(false); setSaving(false); } }]
      );
      return;
    }

    try {
      setLoadingDeconsigner(true);
      // ✅ CHANGEMENT : envoi cad_id + numero_cadenas + badge_ocp_id
      const res = await deconsignerMembre(membreActif.id, {
        cad_id:         cadenasScanne,
        numero_cadenas: membreActif.numero_cadenas || undefined,
        badge_ocp_id:   badgeScanné,
      });
      if (res.success) {
        await chargerStatut();
        const nomSorti = membreActif.nom;
        setMembreActif(null);
        setCadenasScanne(null);
        setEtape('liste');
        if (res.data.tous_sortis) {
          Alert.alert(
            "🎉 Toute l'équipe est sortie !",
            `Tous les membres (${res.data.total}) ont quitté le chantier.\nVous pouvez maintenant valider la déconsignation.`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            '✅ Sortie enregistrée',
            `${nomSorti} a quitté le chantier.\n${res.data.sortis}/${res.data.total} membres sortis.`
          );
        }
      } else {
        Alert.alert('Erreur', res.message);
        setScanned(false);
        setSaving(false);
        setCadenasScanne(null);
        setEtape('scanCadenas');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      setScanned(false);
      setSaving(false);
      setCadenasScanne(null);
      setEtape('scanCadenas');
    } finally {
      setLoadingDeconsigner(false);
    }
  };

  // ── VALIDATION DÉCONSIGNATION FINALE ✅ NOUVEAU ────────────────
  const handleValiderDeconsignation = () => {
    Alert.alert(
      '🔓 Valider la déconsignation',
      'Tous les membres sont sortis.\n\nUn rapport PDF complet sera généré.\n\nConfirmer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider + Générer le rapport',
          onPress: async () => {
            try {
              setLoadingValiderDeconsign(true);
              const res = await validerDeconsignation(demande.id);
              if (res.success) {
                await chargerStatut();
                Alert.alert(
                  '✅ Déconsignation validée',
                  'Le rapport PDF a été généré.\nVoulez-vous le consulter ?',
                  [
                    { text: 'Plus tard', style: 'cancel' },
                    {
                      text: 'Voir le rapport',
                      onPress: () => {
                        const baseUrl = 'http://192.168.1.104:3000'; // adapter à votre config
                        const fullUrl = `${baseUrl}/${res.data.pdf_path}`.replace(/([^:]\/)\/+/g, '$1');
                        navigation.navigate('PdfViewer', {
                          url:   fullUrl,
                          titre: `Rapport — ${demande.numero_ordre}`,
                          role:  'chef_equipe',
                        });
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Erreur', res.message);
              }
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            } finally {
              setLoadingValiderDeconsign(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return (
    <View style={S.centered}>
      <ActivityIndicator size="large" color={CFG.couleur} />
      <Text style={S.loadingTxt}>Chargement...</Text>
    </View>
  );

  if (etape === 'scanCadenas') return (
    <ScanView
      titre="Sortie du chantier"
      stepCourante={1}
      badge={`Déconsignation · ${metierLabel}${membreActif ? `  ·  ${membreActif.nom}` : ''}`}
      infoIcone="lock-open-outline"
      infoTexte="Scannez le cadenas"
      infoSub={`Étape 1 : cadenas de ${membreActif?.nom || '—'}`}
      scanned={scanned}
      saving={saving}
      onScanned={onScanCadenas}
      onBack={() => { setEtape('liste'); setMembreActif(null); setCadenasScanne(null); }}
    />
  );

  if (etape === 'scanBadge') return (
    <ScanView
      titre="Sortie du chantier"
      stepCourante={2}
      badge={`Cad: ${cadenasScanne?.substring(0, 10) || '—'} ✓  ·  ${membreActif?.nom || '—'}`}
      infoIcone="card-outline"
      infoTexte="Scannez le badge OCP"
      infoSub={`Étape 2 : badge de ${membreActif?.nom || 'ce membre'}`}
      scanned={scanned}
      saving={saving || loadingDeconsigner}
      onScanned={onScanBadge}
      onBack={() => { setEtape('scanCadenas'); setCadenasScanne(null); setScanned(false); }}
    />
  );

  // ── LISTE PRINCIPALE ────────────────────────────────────────────
  const membres        = statut?.membres || [];
  const membresSurSite = membres.filter(m => m.statut === 'sur_site');
  const membresSortis  = membres.filter(m => m.statut === 'sortie');
  const membresAttente = membres.filter(m => m.statut === 'en_attente');
  const peutDeconsigner  = statut?.peut_deconsigner === true;
  const rapportDisponible = statut?.rapport_genere === true; // ✅ NOUVEAU
  const rapportPdfPath    = statut?.rapport_pdf_path || null;

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Déconsignation équipe</Text>
          <Text style={S.hSub}>{demande.numero_ordre} — TAG {demande.tag || demande.code_equipement || ''}</Text>
        </View>
        <TouchableOpacity style={S.refreshBtn} onPress={chargerStatut}>
          <Ionicons name="refresh-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Bannière rapport disponible ✅ NOUVEAU ── */}
      {rapportDisponible && (
        <TouchableOpacity
          style={[S.bannerRapport, { backgroundColor: CFG.vert }]}
          onPress={() => {
            const baseUrl = 'http://192.168.1.104:3000';
            const fullUrl = `${baseUrl}/${rapportPdfPath}`.replace(/([^:]\/)\/+/g, '$1');
            navigation.navigate('PdfViewer', {
              url:   fullUrl,
              titre: `Rapport — ${demande.numero_ordre}`,
              role:  'chef_equipe',
            });
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={S.bannerRapportTxt}>📄 Rapport disponible — Appuyez pour consulter</Text>
          <Ionicons name="open-outline" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Bannière statut déconsignation ── */}
      <View style={[S.bannerStatut, { backgroundColor: peutDeconsigner ? CFG.vertBg : CFG.rougeBg }]}>
        <Ionicons name={peutDeconsigner ? 'checkmark-circle' : 'warning'} size={22} color={peutDeconsigner ? CFG.vert : CFG.rouge} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[S.bannerTitre, { color: peutDeconsigner ? CFG.vert : CFG.rouge }]}>
            {peutDeconsigner ? '✅ Déconsignation possible' : '🔒 Déconsignation bloquée'}
          </Text>
          <Text style={[S.bannerSub, { color: peutDeconsigner ? '#2E7D32' : '#B71C1C' }]}>
            {peutDeconsigner
              ? 'Tous les membres ont quitté le chantier.'
              : membresSurSite.length > 0
                ? `${membresSurSite.length} membre(s) encore sur site.`
                : membresAttente.length > 0
                  ? `${membresAttente.length} membre(s) en attente.`
                  : 'Équipe non encore validée.'}
          </Text>
        </View>
      </View>

      <View style={S.statsRow}>
        {membresAttente.length > 0 && (
          <View style={[S.statBox, { borderColor: '#FFA000' }]}>
            <Text style={[S.statVal, { color: '#FFA000' }]}>{membresAttente.length}</Text>
            <Text style={S.statLbl}>En attente</Text>
          </View>
        )}
        <View style={[S.statBox, { borderColor: CFG.couleur }]}>
          <Text style={[S.statVal, { color: CFG.couleur }]}>{membresSurSite.length}</Text>
          <Text style={S.statLbl}>Sur site</Text>
        </View>
        <View style={[S.statBox, { borderColor: CFG.vert }]}>
          <Text style={[S.statVal, { color: CFG.vert }]}>{membresSortis.length}</Text>
          <Text style={S.statLbl}>Sortis</Text>
        </View>
        <View style={[S.statBox, { borderColor: '#9E9E9E' }]}>
          <Text style={[S.statVal, { color: '#9E9E9E' }]}>{statut?.total || 0}</Text>
          <Text style={S.statLbl}>Total</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }}>
        {membresSurSite.length > 0 && (
          <>
            <Text style={S.sectionTitre}>Sur site — à faire sortir</Text>
            {membresSurSite.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[S.membreCard, { borderLeftWidth: 4, borderLeftColor: CFG.couleur }]}
                onPress={() => selectionnerMembre(m)}
                activeOpacity={0.8}
              >
                <View style={S.avatar}><Text style={S.avatarTxt}>{(m.nom || '?')[0].toUpperCase()}</Text></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.membreNom}>{m.nom}</Text>
                  {/* ✅ CHANGEMENT : afficher cad_id si disponible */}
                  <Text style={S.membreMeta}>
                    {m.badge_ocp_id || '—'}
                    {m.cad_id ? `  ·  QR: ${m.cad_id.substring(0, 8)}…` : m.numero_cadenas ? `  ·  Cad: ${m.numero_cadenas}` : ''}
                  </Text>
                  {m.heure_entree && (
                    <Text style={[S.membreHeure, { color: CFG.couleur }]}>
                      Entrée : {new Date(m.heure_entree).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                <View style={S.scanBtn}><Ionicons name="scan-outline" size={18} color="#fff" /></View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {membresAttente.length > 0 && (
          <>
            <Text style={[S.sectionTitre, { color: '#FFA000' }]}>En attente</Text>
            {membresAttente.map(m => (
              <View key={m.id} style={[S.membreCard, { opacity: 0.7 }]}>
                <View style={[S.avatar, { backgroundColor: '#FFF8E1' }]}>
                  <Text style={[S.avatarTxt, { color: '#FFA000' }]}>{(m.nom || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.membreNom}>{m.nom}</Text>
                  <Text style={S.membreMeta}>{m.badge_ocp_id || m.matricule || '—'}</Text>
                </View>
                <Ionicons name="time-outline" size={22} color="#FFA000" />
              </View>
            ))}
          </>
        )}

        {membresSortis.length > 0 && (
          <>
            <Text style={[S.sectionTitre, { color: CFG.vert }]}>Sortis</Text>
            {membresSortis.map(m => (
              <View key={m.id} style={[S.membreCard, { opacity: 0.75 }]}>
                <View style={[S.avatar, { backgroundColor: CFG.vertBg }]}>
                  <Text style={[S.avatarTxt, { color: CFG.vert }]}>{(m.nom || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.membreNom}>{m.nom}</Text>
                  <Text style={S.membreMeta}>{m.badge_ocp_id || m.matricule || '—'}</Text>
                  {m.heure_sortie && (
                    <Text style={[S.membreHeure, { color: CFG.vert }]}>
                      Sortie : {new Date(m.heure_sortie).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                <Ionicons name="checkmark-circle" size={22} color={CFG.vert} />
              </View>
            ))}
          </>
        )}

        {membres.length === 0 && (
          <View style={[S.centered, { marginTop: 60 }]}>
            <Ionicons name="people-outline" size={54} color="#BDBDBD" />
            <Text style={S.emptyTxt}>Aucun membre dans l'équipe</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bouton Valider déconsignation ✅ NOUVEAU ── */}
      {peutDeconsigner && !rapportDisponible && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnValiderDeconsign, loadingValiderDeconsign && { opacity: 0.6 }]}
            onPress={handleValiderDeconsignation}
            disabled={loadingValiderDeconsign}
            activeOpacity={0.85}
          >
            {loadingValiderDeconsign ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-open-outline" size={20} color="#fff" />
                <Text style={S.btnValiderDeconsignTxt}>VALIDER DÉCONSIGNATION + RAPPORT PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const FRAME = 220;
const S = StyleSheet.create({
  permCenter:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1B2A', padding: 30, gap: 16 },
  permTitle:   { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn:     { backgroundColor: CFG.couleur, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },

  camHeader:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  camBackBtn:   { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  camHTitle:    { color: '#fff', fontSize: 15, fontWeight: '700' },

  stepBarFloat: { position: 'absolute', top: Platform.OS === 'ios' ? 110 : 94, left: 0, right: 0, zIndex: 20, alignItems: 'center' },
  stepBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 10 },
  stepItem:     { alignItems: 'center', gap: 4 },
  stepCircle:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  stepCircleActive: { backgroundColor: CFG.couleur, borderColor: CFG.couleur },
  stepNum:      { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepNumActive:{ color: '#fff' },
  stepLbl:      { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  stepLblActive:{ color: '#fff' },
  stepLine:     { width: 36, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8, marginBottom: 14 },
  stepLineActive: { backgroundColor: CFG.couleur },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrameWrap: { width: FRAME, height: FRAME, borderRadius: 16, overflow: 'hidden', position: 'relative' },

  corner:    { position: 'absolute', width: 24, height: 24, borderColor: CFG.couleur, borderWidth: 3 },
  cornerTL:  { top: 0,    left: 0,  borderRightWidth: 0,  borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR:  { top: 0,    right: 0, borderLeftWidth: 0,   borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL:  { bottom: 0, left: 0,  borderRightWidth: 0,  borderTopWidth: 0,    borderBottomLeftRadius: 6 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0,   borderTopWidth: 0,    borderBottomRightRadius: 6 },

  scanLine:       { position: 'absolute', left: 10, right: 10, height: 2, backgroundColor: CFG.couleur, opacity: 0.8, borderRadius: 1 },
  successOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.3)', alignItems: 'center', justifyContent: 'center' },

  instructions:   { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  metierBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${CFG.couleur}DD`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  metierBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  instructCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: `${CFG.couleur}E6`, borderRadius: 14, padding: 14 },
  instrTitle:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:       { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 3 },

  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingTxt:   { marginTop: 12, color: '#757575', fontSize: 14 },

  header:      { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: CFG.couleur },
  backBtn:     { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)' },
  refreshBtn:  { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)' },
  hTitle:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  hSub:        { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  // ✅ NOUVEAU — bannière rapport
  bannerRapport:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 8, borderRadius: 12, padding: 12, gap: 8 },
  bannerRapportTxt: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '700' },

  bannerStatut: { flexDirection: 'row', alignItems: 'center', margin: 14, marginBottom: 0, borderRadius: 14, padding: 14 },
  bannerTitre:  { fontWeight: '700', fontSize: 14 },
  bannerSub:    { fontSize: 12, marginTop: 2 },

  statsRow: { flexDirection: 'row', margin: 14, gap: 8 },
  statBox:  { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  statVal:  { fontSize: 20, fontWeight: '800' },
  statLbl:  { fontSize: 10, color: '#757575', marginTop: 2 },

  sectionTitre: { fontSize: 12, fontWeight: '700', color: '#9E9E9E', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  membreCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  avatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: CFG.bg, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:   { fontSize: 18, fontWeight: '700', color: CFG.couleur },
  membreNom:   { fontSize: 15, fontWeight: '600', color: '#212121' },
  membreMeta:  { fontSize: 12, color: '#757575', marginTop: 2 },
  membreHeure: { fontSize: 11, marginTop: 2 },
  emptyTxt:    { fontSize: 16, color: '#9E9E9E', marginTop: 14, fontWeight: '500' },
  scanBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: CFG.couleur, justifyContent: 'center', alignItems: 'center' },

  // ✅ NOUVEAU — bouton valider déconsignation
  bottomBar:             { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 16, borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 8 },
  btnValiderDeconsign:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: CFG.rouge, borderRadius: 14, paddingVertical: 15, gap: 8, elevation: 4, shadowColor: CFG.rouge, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  btnValiderDeconsignTxt:{ color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
});