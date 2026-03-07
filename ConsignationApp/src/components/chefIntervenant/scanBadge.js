// src/screens/chef/scanBadge.js
// ══════════════════════════════════════════════════════════════════
// GESTION ÉQUIPE D'INTERVENTION — Flux complet
//
// ÉTAPE 2A — Membre existant (sorti) :
//   Scanner cadenas (cad_id) → vérification → membre trouvé → marquer "entré"
// ÉTAPE 2B — Nouveau membre :
//   Scanner cadenas (cad_id) → scanner badge OCP → saisie photo → enregistrer
//
// ÉTAPE 3 — Validation équipe :
//   Chef valide → tous passent en_attente
//   Changer manuellement en_attente → sur_site (un par un ou tous)
//
// ÉTAPE 4 — Déconsignation :
//   Sélectionner membre → scan cadenas → scan badge → sortie horodatée
//   Tous sortis → déblocage → valider déconsignation → PDF généré → PdfViewer
// ══════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, Platform, Animated,
  Vibration, FlatList, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  getEquipe,
  getIntervenantsDispos,
  getStatutDeconsignation,
  enregistrerMembre,
  verifierBadge,
  verifierCadenas,
  validerEquipe,
  marquerEntreeMembres,
  deconsignerMembre,
  validerDeconsignation,
  getRapport,
} from '../../api/equipeIntervention.api';

// ── Palette couleurs (bleue — identique au dashboardChef) ─────────
const C = {
  primary:     '#1565C0',
  primaryDark: '#0D47A1',
  primaryLight:'#E3F2FD',
  primaryMid:  '#BBDEFB',
  vert:        '#2E7D32',
  vertLight:   '#E8F5E9',
  vertMid:     '#4CAF50',
  rouge:       '#C62828',
  rougeLight:  '#FFEBEE',
  orange:      '#F57C00',
  orangeLight: '#FFF3E0',
  blanc:       '#FFFFFF',
  fond:        '#F0F4F8',
  gris:        '#9E9E9E',
  grisDark:    '#424242',
  noir:        '#1A1A2E',
  card:        '#FFFFFF',
  border:      '#E8EDF2',
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

const fmtHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

// ══════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ══════════════════════════════════════════════════════════════════

// ── Ligne de scan animée ──────────────────────────────────────────
function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return (
    <Animated.View
      style={{
        position: 'absolute', left: 8, right: 8, height: 2,
        backgroundColor: C.primary, opacity: 0.9, borderRadius: 1,
        transform: [{ translateY }],
        shadowColor: C.primary, shadowOpacity: 0.8, shadowRadius: 4,
      }}
    />
  );
}

// ── Stepper ───────────────────────────────────────────────────────
function StepBar({ etape, total = 2 }) {
  const labels = ['Cadenas', 'Badge OCP'];
  return (
    <View style={SC.stepBar}>
      {labels.slice(0, total).map((label, i) => {
        const num      = i + 1;
        const actif    = etape === num;
        const complete = etape > num;
        return (
          <React.Fragment key={i}>
            <View style={SC.stepItem}>
              <View style={[SC.stepCircle, (actif || complete) && SC.stepCircleActive]}>
                {complete
                  ? <Ionicons name="checkmark" size={12} color={C.blanc} />
                  : <Text style={[SC.stepNum, actif && SC.stepNumActive]}>{num}</Text>
                }
              </View>
              <Text style={[SC.stepLbl, actif && SC.stepLblActive]}>{label}</Text>
            </View>
            {i < total - 1 && (
              <View style={[SC.stepLine, complete && SC.stepLineActive]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Écran caméra scan QR/Code-barres ─────────────────────────────
function ScanView({ titre, etape, badgeTxt, hint, hintSub, scanned, saving, onScanned, onBack, couleurHint }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const [perm, demPerm] = useCameraPermissions();

  useEffect(() => { if (!perm?.granted) demPerm(); }, [perm]);
  useEffect(() => {
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    p.start();
    return () => p.stop();
  }, []);

  if (!perm?.granted) return (
    <View style={SC.permCenter}>
      <View style={SC.permIconWrap}>
        <Ionicons name="camera-off-outline" size={52} color={C.rouge} />
      </View>
      <Text style={SC.permTitle}>Accès caméra requis</Text>
      <TouchableOpacity style={SC.permBtn} onPress={demPerm}>
        <Text style={SC.permBtnTxt}>Autoriser la caméra</Text>
      </TouchableOpacity>
    </View>
  );

  const hintColor = couleurHint || C.primary;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
      {/* Header */}
      <View style={SC.camHdr}>
        <TouchableOpacity style={SC.camBackBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={SC.camHTitle}>{titre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={SC.stepFloat}>
        <StepBar etape={etape} />
      </View>

      {/* Caméra */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
      />

      {/* Overlay */}
      <View style={SC.overlay} pointerEvents="none">
        <View style={SC.overlayTop} />
        <View style={SC.overlayRow}>
          <View style={SC.overlaySide} />
          <Animated.View style={[SC.frame, { transform: [{ scale: pulse }] }]}>
            {/* Coins colorés */}
            {[['TL','top',0,'left',0], ['TR','top',0,'right',0], ['BL','bottom',0,'left',0], ['BR','bottom',0,'right',0]].map(
              ([k, v1, n1, v2, n2]) => (
                <View key={k} style={[SC.corner, {
                  [v1]: n1, [v2]: n2,
                  borderTopWidth:    (v1 === 'top')    ? 3 : 0,
                  borderBottomWidth: (v1 === 'bottom') ? 3 : 0,
                  borderLeftWidth:   (v2 === 'left')   ? 3 : 0,
                  borderRightWidth:  (v2 === 'right')  ? 3 : 0,
                  borderColor: hintColor,
                }]} />
              )
            )}
            {!scanned && <ScanLine />}
            {scanned && (
              <View style={SC.successOvl}>
                <Ionicons name={saving ? 'sync-outline' : 'checkmark-circle'} size={64} color={saving ? C.orange : C.vertMid} />
              </View>
            )}
          </Animated.View>
          <View style={SC.overlaySide} />
        </View>
        <View style={SC.overlayBottom} />
      </View>

      {/* Instructions bas */}
      <View style={SC.instrBox}>
        {badgeTxt && (
          <View style={[SC.badgePill, { backgroundColor: `${hintColor}CC` }]}>
            <Ionicons name="shield-checkmark-outline" size={12} color={C.blanc} />
            <Text style={SC.badgePillTxt}>{badgeTxt}</Text>
          </View>
        )}
        <View style={[SC.instrCard, scanned && { backgroundColor: saving ? C.orange : C.vert }]}>
          <View style={[SC.instrDot, { backgroundColor: `${hintColor}44` }]}>
            <Ionicons
              name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'scan-outline'}
              size={22} color={C.blanc}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={SC.instrTitle}>
              {saving ? 'Enregistrement...' : scanned ? 'Code scanné !' : hint}
            </Text>
            {hintSub && !scanned && (
              <Text style={SC.instrSub}>{hintSub}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Carte membre ──────────────────────────────────────────────────
function MembreCard({ m, onPressSurSite, onPressSortie, equipeValidee, modeDeconsignation }) {
  const statutCfg = {
    en_attente: { color: C.orange, bg: C.orangeLight, label: 'En attente', icon: 'time-outline' },
    sur_site:   { color: C.primary, bg: C.primaryLight, label: 'Sur site', icon: 'construct-outline' },
    sortie:     { color: C.vert, bg: C.vertLight, label: 'Sorti', icon: 'checkmark-circle-outline' },
  }[m.statut] || { color: C.gris, bg: '#F5F5F5', label: m.statut, icon: 'ellipse-outline' };

  const initiale = (m.nom || '?')[0].toUpperCase();

  return (
    <View style={[MC.card, modeDeconsignation && m.statut === 'sur_site' && MC.cardActive]}>
      {/* Indicateur statut gauche */}
      <View style={[MC.stripe, { backgroundColor: statutCfg.color }]} />

      {/* Avatar */}
      <View style={[MC.avatar, { backgroundColor: statutCfg.bg }]}>
        <Text style={[MC.avatarTxt, { color: statutCfg.color }]}>{initiale}</Text>
      </View>

      {/* Infos */}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={MC.nom}>{m.nom}</Text>
        <Text style={MC.meta}>
          {m.badge_ocp_id || m.matricule || '—'}
          {m.numero_cadenas ? `  ·  🔒 ${m.numero_cadenas}` : ''}
        </Text>
        {m.heure_entree && (
          <Text style={[MC.heure, { color: C.primary }]}>
            ↳ Entrée {fmtHeure(m.heure_entree)}
            {m.heure_sortie ? `  →  Sortie ${fmtHeure(m.heure_sortie)}` : ''}
          </Text>
        )}
      </View>

      {/* Badge statut */}
      <View style={[MC.statutBadge, { backgroundColor: statutCfg.bg }]}>
        <Ionicons name={statutCfg.icon} size={11} color={statutCfg.color} />
        <Text style={[MC.statutTxt, { color: statutCfg.color }]}>{statutCfg.label}</Text>
      </View>

      {/* Bouton "Sur site" si en_attente + équipe validée */}
      {!modeDeconsignation && equipeValidee && m.statut === 'en_attente' && (
        <TouchableOpacity style={MC.btnSurSite} onPress={() => onPressSurSite?.(m)} activeOpacity={0.8}>
          <Ionicons name="log-in-outline" size={16} color={C.blanc} />
        </TouchableOpacity>
      )}

      {/* Bouton "Sortir" si sur_site + mode déconsignation */}
      {modeDeconsignation && m.statut === 'sur_site' && (
        <TouchableOpacity style={[MC.btnSurSite, { backgroundColor: C.rouge }]} onPress={() => onPressSortie?.(m)} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={16} color={C.blanc} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function ScanBadge({ route, navigation }) {
  const { demande, userMetier } = route.params || {};
  const metierLabel = TYPE_LABEL[userMetier] || 'Chef';

  // ── États navigation interne ────────────────────────────────────
  // 'liste' | 'scanCadenasAjout' | 'scanBadgeAjout' | 'photoAjout'
  // | 'listeIntervenants' | 'selectionEntree'
  // | 'scanCadenasDeconsigne' | 'scanBadgeDeconsigne'
  // | 'validerDeconsignationEcran'
  const [etape, setEtape] = useState('liste');

  // ── Données ─────────────────────────────────────────────────────
  const [membres,           setMembres]           = useState([]);
  const [statut,            setStatut]            = useState(null);
  const [equipeValidee,     setEquipeValidee]      = useState(false);
  const [intervenants,      setIntervenants]       = useState([]);
  const [membresSelecEntree,setMembresSelecEntree] = useState([]);

  // ── Contexte scan ajout membre ──────────────────────────────────
  const [cadEnCours,   setCadEnCours]   = useState(null); // cad_id scanné étape1
  const [photoUri,     setPhotoUri]     = useState(null);

  // ── Contexte scan déconsignation ────────────────────────────────
  const [membreActif,     setMembreActif]     = useState(null);
  const [cadenasDeconsign,setCadenasDeconsign]= useState(null);

  // ── États UI ─────────────────────────────────────────────────────
  const [loading,           setLoading]           = useState(true);
  const [loadingInterv,     setLoadingInterv]     = useState(false);
  const [validating,        setValidating]        = useState(false);
  const [loadingEntree,     setLoadingEntree]     = useState(false);
  const [loadingDeconsign,  setLoadingDeconsign]  = useState(false);
  const [updatingIds,       setUpdatingIds]       = useState([]);
  const [scanned,           setScanned]           = useState(false);
  const [saving,            setSaving]            = useState(false);
  const [modalEntree,       setModalEntree]       = useState(false);
  const [rapportGenere,     setRapportGenere]     = useState(null); // data rapport PDF

  // ── Chargements ─────────────────────────────────────────────────
  const chargerEquipe = useCallback(async () => {
    try {
      setLoading(true);
      const [resEquipe, resStatut] = await Promise.all([
        getEquipe(demande.id),
        getStatutDeconsignation(demande.id),
      ]);
      if (resEquipe.success) {
        setMembres(resEquipe.data.membres || []);
        setEquipeValidee(resEquipe.data.equipe_validee === 1);
      }
      if (resStatut.success) {
        setStatut(resStatut.data);
        if (resStatut.data?.rapport_genere) {
          setRapportGenere({ pdf_path: resStatut.data.rapport_pdf_path });
        }
      }
    } catch { Alert.alert('Erreur', "Impossible de charger l'équipe."); }
    finally { setLoading(false); }
  }, [demande.id]);

  useEffect(() => { chargerEquipe(); }, [chargerEquipe]);

  // ── Helpers reset scan ───────────────────────────────────────────
  const resetScan = () => { setScanned(false); setSaving(false); };

  // ──────────────────────────────────────────────────────────────────
  // FLUX AJOUT MEMBRE — ÉTAPE 1 : scan cadenas (cad_id)
  // ──────────────────────────────────────────────────────────────────
  const onScanCadenasAjout = useCallback(async ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(80);
    const cad = data.trim();

    // Vérifier si ce cad_id correspond à un membre sorti existant (Option A)
    try {
      const res = await verifierCadenas({ cad_id: cad });
      if (res.success && res.data.found) {
        // Option A — membre sorti retrouvé par son cadenas
        const mb = res.data.membre;
        Alert.alert(
          '🔍 Membre reconnu',
          `${mb.nom} a déjà été dans votre équipe.\nRéactiver ce membre ?`,
          [
            { text: 'Annuler',   style: 'cancel', onPress: () => {} },
            {
              text: 'Réactiver',
              onPress: async () => {
                try {
                  setSaving(true);
                  const r = await enregistrerMembre({
                    demande_id:   demande.id,
                    nom:          mb.nom,
                    matricule:    mb.matricule      || undefined,
                    badge_ocp_id: mb.badge_ocp_id   || undefined,
                    numero_cadenas: mb.numero_cadenas || undefined,
                    cad_id:       cad,
                  });
                  if (r.success) {
                    await chargerEquipe();
                    setEtape('liste');
                    Alert.alert('✅ Membre réactivé', `${mb.nom} a rejoint l'équipe.`);
                  } else {
                    Alert.alert('Erreur', r.message);
                  }
                } catch (e) {
                  Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
                } finally {
                  setSaving(false);
                }
              },
            },
          ]
        );
        return;
      }
    } catch {}

    // Option B — nouveau membre : passer à l'étape 2 badge
    setCadEnCours(cad);
    resetScan();
    setEtape('scanBadgeAjout');
  }, [scanned, demande.id, chargerEquipe]);

  // ──────────────────────────────────────────────────────────────────
  // FLUX AJOUT MEMBRE — ÉTAPE 2 : scan badge OCP
  // ──────────────────────────────────────────────────────────────────
  const onScanBadgeAjout = useCallback(async ({ data }) => {
    if (scanned || !cadEnCours) return;
    Vibration.vibrate(160);
    setScanned(true);
    setSaving(true);

    try {
      const badge = data.trim();
      // Résolution du nom depuis users si badge connu
      let nomMembre  = badge;
      let matricule  = undefined;
      const check = await verifierBadge({ badge_ocp_id: badge });
      if (check.success && check.data.found) {
        nomMembre = `${check.data.user.prenom} ${check.data.user.nom}`;
        matricule  = check.data.user.matricule || undefined;
      }

      // Proposer de prendre une photo
      setSaving(false);
      setScanned(false);

      Alert.alert(
        '📷 Photo du membre',
        `Prendre une photo de ${nomMembre} ?`,
        [
          {
            text: 'Passer',
            onPress: () => _enregistrerNouveauMembre(nomMembre, badge, matricule, null),
          },
          {
            text: 'Prendre la photo',
            onPress: async () => {
              try {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                  _enregistrerNouveauMembre(nomMembre, badge, matricule, null);
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  quality: 0.6,
                  aspect: [3, 4],
                  allowsEditing: false,
                });
                const uri = result.canceled ? null : result.assets[0].uri;
                _enregistrerNouveauMembre(nomMembre, badge, matricule, uri);
              } catch {
                _enregistrerNouveauMembre(nomMembre, badge, matricule, null);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      resetScan();
      setCadEnCours(null);
      setEtape('scanCadenasAjout');
    }
  }, [scanned, cadEnCours, demande.id]);

  const _enregistrerNouveauMembre = async (nom, badge_ocp_id, matricule, photoUri) => {
    try {
      setSaving(true);
      const res = await enregistrerMembre({
        demande_id:   demande.id,
        nom,
        badge_ocp_id,
        matricule,
        cad_id:       cadEnCours,
        photo_path:   photoUri || undefined,
      });
      if (res.success) {
        await chargerEquipe();
        setCadEnCours(null);
        setEtape('liste');
        Alert.alert('✅ Membre ajouté', `${nom} a été ajouté à l'équipe.`);
      } else {
        Alert.alert('Erreur', res.message);
        setEtape('scanCadenasAjout');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      setEtape('scanCadenasAjout');
    } finally {
      setSaving(false);
      resetScan();
    }
  };

  // ──────────────────────────────────────────────────────────────────
  // LISTE INTERVENANTS CONNUS (membres sortis réactivables)
  // ──────────────────────────────────────────────────────────────────
  const ouvrirIntervenants = async () => {
    try {
      setLoadingInterv(true);
      const res = await getIntervenantsDispos(demande.id);
      if (res.success) {
        setIntervenants(res.data || []);
        setEtape('listeIntervenants');
      } else Alert.alert('Erreur', res.message);
    } catch { Alert.alert('Erreur', 'Impossible de charger les intervenants.'); }
    finally { setLoadingInterv(false); }
  };

  const selectionnerIntervenant = (item) => {
    Alert.alert(
      'Réactiver ce membre ?',
      `${item.nom}${item.badge_ocp_id ? `\nBadge : ${item.badge_ocp_id}` : ''}${item.numero_cadenas ? `\nCadenas : ${item.numero_cadenas}` : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réactiver',
          onPress: async () => {
            try {
              const res = await enregistrerMembre({
                demande_id:     demande.id,
                nom:            item.nom,
                matricule:      item.matricule      || undefined,
                badge_ocp_id:   item.badge_ocp_id   || undefined,
                numero_cadenas: item.numero_cadenas  || undefined,
                cad_id:         item.cad_id          || undefined,
              });
              if (res.success) {
                await chargerEquipe();
                setEtape('liste');
                Alert.alert('✅ Réactivé', `${item.nom} a rejoint l'équipe.`);
              } else Alert.alert('Erreur', res.message);
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            }
          },
        },
      ]
    );
  };

  // ──────────────────────────────────────────────────────────────────
  // VALIDATION ÉQUIPE
  // ──────────────────────────────────────────────────────────────────
  const handleValiderEquipe = () => {
    if (!membres.length) { Alert.alert('Attention', 'Ajoutez au moins un membre.'); return; }
    const sans = membres.filter(m => !m.numero_cadenas && !m.cad_id);
    if (sans.length) {
      Alert.alert('Attention', `${sans.length} membre(s) sans cadenas enregistré.`);
      return;
    }
    Alert.alert(
      'Confirmer validation',
      `Valider l'équipe de ${membres.length} membre${membres.length > 1 ? 's' : ''} ?\n\nIls passeront en "En attente" — vous pourrez les marquer sur site un par un.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: async () => {
            try {
              setValidating(true);
              const res = await validerEquipe(demande.id);
              if (res.success) {
                await chargerEquipe();
                Alert.alert('✅ Équipe validée', `${membres.length} membre(s) en attente d'entrée.`);
              } else Alert.alert('Erreur', res.message);
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            } finally { setValidating(false); }
          },
        },
      ]
    );
  };

  // ──────────────────────────────────────────────────────────────────
  // ENTRÉE SUR SITE — marquer un membre sur_site
  // ──────────────────────────────────────────────────────────────────
  const handleMarquerEntree = async (membre) => {
    if (updatingIds.includes(membre.id)) return;
    Alert.alert(
      'Confirmer présence',
      `Marquer ${membre.nom} comme "Sur site" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              setUpdatingIds(p => [...p, membre.id]);
              const res = await marquerEntreeMembres(demande.id, { membres_ids: [membre.id] });
              if (res.success) {
                setMembres(p => p.map(m =>
                  m.id === membre.id ? { ...m, statut: 'sur_site', heure_entree: new Date().toISOString() } : m
                ));
              } else Alert.alert('Erreur', res.message);
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            } finally {
              setUpdatingIds(p => p.filter(id => id !== membre.id));
            }
          },
        },
      ]
    );
  };

  const handleEntreeSite = async (tousOuIds) => {
    try {
      setLoadingEntree(true);
      const body = tousOuIds === 'tous'
        ? { tous: true }
        : { membres_ids: tousOuIds };
      const res = await marquerEntreeMembres(demande.id, body);
      if (res.success) {
        await chargerEquipe();
        setModalEntree(false);
        setMembresSelecEntree([]);
        const nb = tousOuIds === 'tous'
          ? membres.filter(m => m.statut === 'en_attente').length
          : tousOuIds.length;
        Alert.alert('✅ Entrée enregistrée', `${nb} membre(s) sont maintenant sur site.`);
      } else Alert.alert('Erreur', res.message);
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
    } finally { setLoadingEntree(false); }
  };

  // ──────────────────────────────────────────────────────────────────
  // DÉCONSIGNATION — ÉTAPE 1 : scan cadenas sortant
  // ──────────────────────────────────────────────────────────────────
  const lancerDeconsignMembre = (membre) => {
    if (membre.statut !== 'sur_site') {
      Alert.alert('Attention', `${membre.nom} n'est pas sur site.`);
      return;
    }
    setMembreActif(membre);
    setCadenasDeconsign(null);
    resetScan();
    setEtape('scanCadenasDeconsigne');
  };

  const normaliser = (v) => (v || '').trim().toLowerCase().replace(/[\s-]/g, '');

  const onScanCadenasDeconsigne = ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(80);
    const cad = data.trim();

    // Vérification côté front (cad_id prioritaire, sinon numero_cadenas)
    const attenduCad = membreActif?.cad_id;
    const attenduNum = membreActif?.numero_cadenas;
    const attendu    = attenduCad || attenduNum;

    if (attendu && normaliser(cad) !== normaliser(attendu)) {
      Alert.alert(
        '⚠️ Cadenas incorrect',
        `Scanné : ${cad}\nAttendu : ${attendu}\n\nVérifiez le cadenas de ${membreActif?.nom}.`,
        [
          { text: 'Réessayer', style: 'cancel' },
          {
            text: 'Continuer quand même',
            onPress: () => { setCadenasDeconsign(cad); resetScan(); setEtape('scanBadgeDeconsigne'); },
          },
        ]
      );
      return;
    }
    setCadenasDeconsign(cad);
    resetScan();
    setEtape('scanBadgeDeconsigne');
  };

  // ──────────────────────────────────────────────────────────────────
  // DÉCONSIGNATION — ÉTAPE 2 : scan badge sortant
  // ──────────────────────────────────────────────────────────────────
  const onScanBadgeDeconsigne = async ({ data }) => {
    if (scanned || !membreActif || !cadenasDeconsign) return;
    Vibration.vibrate(200);
    setScanned(true);
    setSaving(true);

    const badge = data.trim();
    // Vérif badge côté front
    const attenduBadge = membreActif?.badge_ocp_id;
    if (attenduBadge && normaliser(badge) !== normaliser(attenduBadge)) {
      Alert.alert(
        '❌ Badge incorrect',
        `Ce badge ne correspond pas à ${membreActif.nom}.\nScanné : ${badge}`,
        [{ text: 'Réessayer', onPress: () => { resetScan(); } }]
      );
      return;
    }

    try {
      setLoadingDeconsign(true);
      const res = await deconsignerMembre(membreActif.id, {
        cad_id:        cadenasDeconsign,
        numero_cadenas:membreActif.numero_cadenas || undefined,
        badge_ocp_id:  badge,
      });
      if (res.success) {
        const nom = membreActif.nom;
        setMembreActif(null);
        setCadenasDeconsign(null);
        resetScan();

        await chargerEquipe();
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
            `${nom} a quitté le chantier.\n${res.data.sortis}/${res.data.total} membres sortis.`
          );
        }
      } else {
        Alert.alert('Erreur', res.message);
        resetScan();
        setCadenasDeconsign(null);
        setEtape('scanCadenasDeconsigne');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      resetScan();
      setCadenasDeconsign(null);
      setEtape('scanCadenasDeconsigne');
    } finally {
      setLoadingDeconsign(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────
  // VALIDATION DÉCONSIGNATION FINALE → PDF généré → PdfViewer
  // ──────────────────────────────────────────────────────────────────
  const handleValiderDeconsignation = () => {
    Alert.alert(
      '🔓 Valider la déconsignation',
      `Tous les membres ont quitté le chantier.\n\nUn rapport PDF complet sera généré avec :\n• Chronologie des actions\n• Statistiques\n• Graphiques\n\nConfirmer ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider et générer le rapport',
          onPress: async () => {
            try {
              setLoadingDeconsign(true);
              const res = await validerDeconsignation(demande.id);
              if (res.success) {
                setRapportGenere(res.data);
                await chargerEquipe();
                Alert.alert(
                  '✅ Déconsignation validée',
                  'Le rapport PDF a été généré. Voulez-vous le consulter maintenant ?',
                  [
                    { text: 'Plus tard', style: 'cancel' },
                    { text: 'Voir le rapport', onPress: () => ouvrirPdf(res.data.pdf_path) },
                  ]
                );
              } else {
                Alert.alert('Erreur', res.message);
              }
            } catch (e) {
              Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
            } finally {
              setLoadingDeconsign(false);
            }
          },
        },
      ]
    );
  };

  const ouvrirPdf = (pdfPath) => {
    if (!pdfPath) {
      Alert.alert('Erreur', 'Chemin PDF non disponible.');
      return;
    }
    // Construire l'URL complète (adapter le baseURL à votre config)
    const baseUrl = client?.defaults?.baseURL || 'http://192.168.1.104:3000';
    const fullUrl = `${baseUrl}/${pdfPath}`.replace(/([^:]\/)\/+/g, '$1');
    navigation.navigate('PdfViewer', {
      url:   fullUrl,
      titre: `Rapport — ${demande.numero_ordre}`,
      role:  'chef_equipe',
    });
  };

  // ──────────────────────────────────────────────────────────────────
  // DÉRIVÉS
  // ──────────────────────────────────────────────────────────────────
  const membresEnAttente  = membres.filter(m => m.statut === 'en_attente');
  const membresSurSite    = membres.filter(m => m.statut === 'sur_site');
  const membresSortis     = membres.filter(m => m.statut === 'sortie');
  const peutDeconsigner   = statut?.peut_deconsigner === true;
  const hasEnAttente      = membresEnAttente.length > 0;
  const hasSurSite        = membresSurSite.length > 0;

  // ══════════════════════════════════════════════════════════════════
  // RENDU PAR ÉTAPE
  // ══════════════════════════════════════════════════════════════════

  if (loading) return (
    <View style={[S.flex, S.center, { backgroundColor: C.fond }]}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={S.loadingTxt}>Chargement de l'équipe...</Text>
    </View>
  );

  // ── SCAN CADENAS AJOUT ────────────────────────────────────────────
  if (etape === 'scanCadenasAjout') return (
    <ScanView
      titre="Ajouter un membre"
      etape={1}
      badgeTxt={`Équipe · ${metierLabel}`}
      hint="Scannez le cadenas personnel"
      hintSub="Le QR code du cadenas identifie le membre"
      scanned={scanned}
      saving={saving}
      onScanned={onScanCadenasAjout}
      onBack={() => setEtape('liste')}
    />
  );

  // ── SCAN BADGE AJOUT ──────────────────────────────────────────────
  if (etape === 'scanBadgeAjout') return (
    <ScanView
      titre="Ajouter un membre"
      etape={2}
      badgeTxt={`Cad: ${cadEnCours?.substring(0, 10) || '—'} ✓`}
      hint="Scannez le badge OCP"
      hintSub="Badge ou QR code du membre"
      scanned={scanned}
      saving={saving}
      onScanned={onScanBadgeAjout}
      onBack={() => { setCadEnCours(null); resetScan(); setEtape('scanCadenasAjout'); }}
    />
  );

  // ── LISTE INTERVENANTS ────────────────────────────────────────────
  if (etape === 'listeIntervenants') return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => setEtape('liste')}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Membres connus</Text>
          <Text style={S.hSub}>{intervenants.length} réactivable(s)</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      {intervenants.length === 0 ? (
        <View style={[S.center, { flex: 1 }]}>
          <Ionicons name="people-outline" size={52} color={C.gris} />
          <Text style={S.emptyTxt}>Aucun membre disponible</Text>
        </View>
      ) : (
        <FlatList
          data={intervenants}
          keyExtractor={i => i.id.toString()}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={S.intervCard} onPress={() => selectionnerIntervenant(item)} activeOpacity={0.8}>
              <View style={[S.intervAvatar, { backgroundColor: C.primaryLight }]}>
                <Text style={[S.intervAvatarTxt, { color: C.primary }]}>{(item.nom || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={S.intervNom}>{item.nom}</Text>
                <Text style={S.intervMeta}>
                  {item.badge_ocp_id || item.matricule || '—'}
                  {item.numero_cadenas ? `  ·  🔒 ${item.numero_cadenas}` : ''}
                </Text>
              </View>
              <View style={[S.intervChip, { backgroundColor: C.primaryLight }]}>
                <Ionicons name="add-circle-outline" size={20} color={C.primary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );

  // ── SÉLECTION ENTRÉE ──────────────────────────────────────────────
  if (etape === 'selectionEntree') return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => setEtape('liste')}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Qui entre sur site ?</Text>
          <Text style={S.hSub}>{membresEnAttente.length} en attente</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={membresEnAttente}
        keyExtractor={m => m.id.toString()}
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const selec = membresSelecEntree.includes(item.id);
          return (
            <TouchableOpacity
              style={[S.selecCard, selec && S.selecCardActif]}
              onPress={() => setMembresSelecEntree(p =>
                p.includes(item.id) ? p.filter(i => i !== item.id) : [...p, item.id]
              )}
              activeOpacity={0.8}
            >
              <View style={[S.selecAvatar, { backgroundColor: selec ? C.vert : C.primaryLight }]}>
                <Text style={[S.selecAvatarTxt, { color: selec ? C.blanc : C.primary }]}>
                  {(item.nom || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={S.selecNom}>{item.nom}</Text>
                <Text style={S.selecMeta}>{item.badge_ocp_id || item.matricule || '—'}</Text>
              </View>
              <Ionicons
                name={selec ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={selec ? C.vert : C.gris}
              />
            </TouchableOpacity>
          );
        }}
      />
      {membresSelecEntree.length > 0 && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnPrincipal, { backgroundColor: C.vert }, loadingEntree && S.btnDisabled]}
            onPress={() => handleEntreeSite(membresSelecEntree)}
            disabled={loadingEntree}
            activeOpacity={0.85}
          >
            {loadingEntree
              ? <ActivityIndicator color={C.blanc} />
              : <>
                  <Ionicons name="log-in-outline" size={18} color={C.blanc} />
                  <Text style={S.btnPrincipalTxt}>
                    ENTRER {membresSelecEntree.length} MEMBRE{membresSelecEntree.length > 1 ? 'S' : ''} SUR SITE
                  </Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── SCAN CADENAS DÉCONSIGNATION ────────────────────────────────────
  if (etape === 'scanCadenasDeconsigne') return (
    <ScanView
      titre="Sortie du chantier"
      etape={1}
      badgeTxt={`Sortie · ${membreActif?.nom || '—'}`}
      hint="Scannez le cadenas personnel"
      hintSub={`Étape 1 : cadenas de ${membreActif?.nom || 'ce membre'}`}
      couleurHint={C.rouge}
      scanned={scanned}
      saving={saving || loadingDeconsign}
      onScanned={onScanCadenasDeconsigne}
      onBack={() => { setMembreActif(null); setCadenasDeconsign(null); resetScan(); setEtape('liste'); }}
    />
  );

  // ── SCAN BADGE DÉCONSIGNATION ──────────────────────────────────────
  if (etape === 'scanBadgeDeconsigne') return (
    <ScanView
      titre="Sortie du chantier"
      etape={2}
      badgeTxt={`Cad ✓  ·  ${membreActif?.nom || '—'}`}
      hint="Scannez le badge OCP"
      hintSub="Étape 2 : confirmation identité"
      couleurHint={C.rouge}
      scanned={scanned}
      saving={saving || loadingDeconsign}
      onScanned={onScanBadgeDeconsigne}
      onBack={() => { setCadenasDeconsign(null); resetScan(); setEtape('scanCadenasDeconsigne'); }}
    />
  );

  // ══════════════════════════════════════════════════════════════════
  // VUE PRINCIPALE — LISTE
  // ══════════════════════════════════════════════════════════════════
  return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Équipe d'intervention</Text>
          <Text style={S.hSub}>{demande?.numero_ordre} · TAG {demande?.tag || demande?.code_equipement || '—'}</Text>
        </View>
        <TouchableOpacity style={S.backBtn} onPress={chargerEquipe}>
          <Ionicons name="refresh-outline" size={20} color={C.blanc} />
        </TouchableOpacity>
      </View>

      {/* ── Bannière déconsignation possible ── */}
      {peutDeconsigner && !rapportGenere && (
        <TouchableOpacity
          style={S.bannerDeconsign}
          onPress={handleValiderDeconsignation}
          disabled={loadingDeconsign}
          activeOpacity={0.85}
        >
          <Ionicons name="lock-open-outline" size={22} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={S.bannerTitre}>🔓 Déconsignation possible</Text>
            <Text style={S.bannerSub}>Tous sortis — Appuyez pour valider et générer le rapport PDF</Text>
          </View>
          {loadingDeconsign
            ? <ActivityIndicator color={C.blanc} size="small" />
            : <Ionicons name="chevron-forward" size={18} color={C.blanc} />
          }
        </TouchableOpacity>
      )}

      {/* ── Bannière rapport disponible ── */}
      {rapportGenere && (
        <TouchableOpacity
          style={[S.bannerDeconsign, { backgroundColor: C.vert }]}
          onPress={() => ouvrirPdf(rapportGenere.pdf_path)}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={22} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={S.bannerTitre}>📄 Rapport disponible</Text>
            <Text style={S.bannerSub}>Appuyez pour consulter le rapport d'intervention</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={C.blanc} />
        </TouchableOpacity>
      )}

      {/* ── Compteurs ── */}
      <View style={S.statsRow}>
        {[
          { val: membresEnAttente.length, label: 'En attente', color: C.orange, bg: C.orangeLight },
          { val: membresSurSite.length,   label: 'Sur site',   color: C.primary, bg: C.primaryLight },
          { val: membresSortis.length,    label: 'Sortis',     color: C.vert,    bg: C.vertLight },
        ].map((s, i) => (
          <View key={i} style={[S.statBox, { borderColor: s.color, backgroundColor: s.bg }]}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Liste membres ── */}
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>

        {/* Infos si mode déconsignation */}
        {equipeValidee && hasSurSite && !peutDeconsigner && (
          <View style={S.infoBox}>
            <Ionicons name="information-circle-outline" size={15} color={C.primary} />
            <Text style={S.infoTxt}>
              Appuyez sur <Ionicons name="log-out-outline" size={12} color={C.rouge} /> pour enregistrer la sortie d'un membre sur site.
            </Text>
          </View>
        )}

        {/* Infos si tous en attente */}
        {equipeValidee && hasEnAttente && !hasSurSite && (
          <View style={S.infoBox}>
            <Ionicons name="information-circle-outline" size={15} color={C.primary} />
            <Text style={S.infoTxt}>
              Appuyez sur <Ionicons name="log-in-outline" size={12} color={C.vert} /> pour marquer chaque membre présent sur site.
            </Text>
          </View>
        )}

        {membres.length === 0 ? (
          <View style={[S.center, { marginTop: 60 }]}>
            <View style={S.emptyIcon}>
              <Ionicons name="people-outline" size={38} color={C.primary} />
            </View>
            <Text style={S.emptyTitre}>Aucun membre</Text>
            <Text style={S.emptySub}>Ajoutez des membres via les boutons ci-dessous</Text>
          </View>
        ) : (
          membres.map(m => (
            <MembreCard
              key={m.id}
              m={m}
              equipeValidee={equipeValidee}
              modeDeconsignation={equipeValidee && hasSurSite}
              onPressSurSite={handleMarquerEntree}
              onPressSortie={lancerDeconsignMembre}
            />
          ))
        )}
      </ScrollView>

      {/* ── Barre boutons bas ── */}
      <View style={S.bottomBar}>
        {!equipeValidee ? (
          // Mode constitution équipe
          <>
            <View style={S.rowBtns}>
              <TouchableOpacity
                style={[S.btnSecondaire, { flex: 1, marginRight: 6 }]}
                onPress={ouvrirIntervenants}
                disabled={loadingInterv}
                activeOpacity={0.8}
              >
                {loadingInterv
                  ? <ActivityIndicator color={C.primary} size="small" />
                  : <Ionicons name="people-outline" size={17} color={C.primary} />
                }
                <Text style={S.btnSecondaireTxt}>Membres connus</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.btnSecondaire, { flex: 1, marginLeft: 6 }]}
                onPress={() => { resetScan(); setCadEnCours(null); setEtape('scanCadenasAjout'); }}
                activeOpacity={0.8}
              >
                <Ionicons name="scan-outline" size={17} color={C.primary} />
                <Text style={S.btnSecondaireTxt}>Scanner</Text>
              </TouchableOpacity>
            </View>
            {membres.length > 0 && (
              <TouchableOpacity
                style={[S.btnPrincipal, validating && S.btnDisabled]}
                onPress={handleValiderEquipe}
                disabled={validating}
                activeOpacity={0.85}
              >
                {validating
                  ? <ActivityIndicator color={C.blanc} />
                  : <>
                      <Ionicons name="checkmark-done-outline" size={18} color={C.blanc} />
                      <Text style={S.btnPrincipalTxt}>VALIDER L'ÉQUIPE ({membres.length})</Text>
                    </>
                }
              </TouchableOpacity>
            )}
          </>
        ) : hasEnAttente ? (
          // Mode entrée sur site
          <TouchableOpacity
            style={[S.btnPrincipal, { backgroundColor: C.primary }, loadingEntree && S.btnDisabled]}
            onPress={() => { setMembresSelecEntree([]); setModalEntree(true); }}
            disabled={loadingEntree}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={18} color={C.blanc} />
            <Text style={S.btnPrincipalTxt}>MARQUER ENTRÉE SUR SITE ({membresEnAttente.length})</Text>
          </TouchableOpacity>
        ) : peutDeconsigner && !rapportGenere ? (
          // Mode validation déconsignation
          <TouchableOpacity
            style={[S.btnPrincipal, { backgroundColor: C.rouge }, loadingDeconsign && S.btnDisabled]}
            onPress={handleValiderDeconsignation}
            disabled={loadingDeconsign}
            activeOpacity={0.85}
          >
            {loadingDeconsign
              ? <ActivityIndicator color={C.blanc} />
              : <>
                  <Ionicons name="lock-open-outline" size={18} color={C.blanc} />
                  <Text style={S.btnPrincipalTxt}>VALIDER DÉCONSIGNATION + PDF</Text>
                </>
            }
          </TouchableOpacity>
        ) : rapportGenere ? (
          // Rapport déjà généré
          <TouchableOpacity
            style={[S.btnPrincipal, { backgroundColor: C.vert }]}
            onPress={() => ouvrirPdf(rapportGenere.pdf_path)}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={18} color={C.blanc} />
            <Text style={S.btnPrincipalTxt}>VOIR LE RAPPORT PDF</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Modal choix entrée site ── */}
      <Modal transparent visible={modalEntree} animationType="slide">
        <View style={S.modalBackdrop}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>Entrée sur chantier</Text>
            <Text style={S.modalSub}>Qui entre sur le chantier maintenant ?</Text>

            {/* Option : Tous */}
            <TouchableOpacity
              style={S.modalOpt}
              onPress={() => handleEntreeSite('tous')}
              disabled={loadingEntree}
              activeOpacity={0.8}
            >
              <View style={[S.modalOptIcon, { backgroundColor: C.vertLight }]}>
                <Ionicons name="people" size={26} color={C.vert} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptTitre}>Toute l'équipe</Text>
                <Text style={S.modalOptSub}>
                  {membresEnAttente.length} membre{membresEnAttente.length > 1 ? 's' : ''} entrent maintenant
                </Text>
              </View>
              {loadingEntree
                ? <ActivityIndicator color={C.vert} size="small" />
                : <Ionicons name="chevron-forward" size={16} color={C.gris} />
              }
            </TouchableOpacity>

            {/* Option : Sélection */}
            <TouchableOpacity
              style={[S.modalOpt, { marginTop: 10 }]}
              onPress={() => { setModalEntree(false); setMembresSelecEntree([]); setEtape('selectionEntree'); }}
              disabled={loadingEntree}
              activeOpacity={0.8}
            >
              <View style={[S.modalOptIcon, { backgroundColor: C.primaryLight }]}>
                <Ionicons name="person-add-outline" size={26} color={C.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptTitre}>Choisir des membres</Text>
                <Text style={S.modalOptSub}>Sélectionner qui entre maintenant</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.gris} />
            </TouchableOpacity>

            <TouchableOpacity style={S.modalAnnuler} onPress={() => setModalEntree(false)}>
              <Text style={S.modalAnnulerTxt}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// STYLES — MembreCard
// ══════════════════════════════════════════════════════════════════
const MC = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardActive: {
    borderWidth: 1.5,
    borderColor: C.rouge,
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  avatarTxt: {
    fontSize: 17,
    fontWeight: '800',
  },
  nom: {
    fontSize: 14,
    fontWeight: '700',
    color: C.grisDark,
  },
  meta: {
    fontSize: 11,
    color: C.gris,
    marginTop: 2,
  },
  heure: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
  statutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3,
    marginRight: 8,
  },
  statutTxt: {
    fontSize: 10,
    fontWeight: '700',
  },
  btnSurSite: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.vert,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    elevation: 2,
  },
});

// ══════════════════════════════════════════════════════════════════
// STYLES — ScanView sous-composant
// ══════════════════════════════════════════════════════════════════
const FRAME = 220;
const SC = StyleSheet.create({
  permCenter:  { flex: 1, backgroundColor: '#0A0E1A', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 },
  permIconWrap:{ width: 88, height: 88, borderRadius: 20, backgroundColor: C.rougeLight, alignItems: 'center', justifyContent: 'center' },
  permTitle:   { color: C.blanc, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  permBtn:     { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13 },
  permBtnTxt:  { color: C.blanc, fontSize: 14, fontWeight: '700' },

  camHdr:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  camBackBtn:{ width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  camHTitle: { color: C.blanc, fontSize: 14, fontWeight: '700' },

  stepFloat: { position: 'absolute', top: Platform.OS === 'ios' ? 112 : 96, left: 0, right: 0, zIndex: 20, alignItems: 'center' },
  stepBar:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 10 },
  stepItem:  { alignItems: 'center', gap: 4 },
  stepCircle:{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  stepCircleActive: { backgroundColor: C.primary, borderColor: C.primary },
  stepNum:   { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.45)' },
  stepNumActive: { color: C.blanc },
  stepLbl:   { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  stepLblActive: { color: C.blanc },
  stepLine:  { width: 32, height: 2, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 8, marginBottom: 12 },
  stepLineActive: { backgroundColor: C.primary },

  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  frame:         { width: FRAME, height: FRAME, borderRadius: 14, overflow: 'hidden' },
  corner:        { position: 'absolute', width: 22, height: 22 },
  successOvl:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.25)', alignItems: 'center', justifyContent: 'center' },

  instrBox:    { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  badgePill:   { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  badgePillTxt:{ color: C.blanc, fontSize: 11, fontWeight: '700' },
  instrCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: `${C.primary}E0`, borderRadius: 14, padding: 14 },
  instrDot:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  instrTitle:  { color: C.blanc, fontSize: 13, fontWeight: '700' },
  instrSub:    { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 3 },
});

// ══════════════════════════════════════════════════════════════════
// STYLES — Principal
// ══════════════════════════════════════════════════════════════════
const S = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: {
    paddingTop:       Platform.OS === 'ios' ? 52 : 36,
    paddingBottom:    14,
    paddingHorizontal:16,
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  C.primary,
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hTitle: { color: C.blanc, fontWeight: '700', fontSize: 16 },
  hSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  // Bannière déconsignation
  bannerDeconsign: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  C.rouge,
    margin:           14,
    marginBottom:     0,
    borderRadius:     16,
    padding:          14,
    elevation:        4,
    shadowColor:      C.rouge,
    shadowOpacity:    0.35,
    shadowRadius:     8,
    shadowOffset:     { width: 0, height: 3 },
  },
  bannerTitre: { color: C.blanc, fontWeight: '800', fontSize: 13 },
  bannerSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection:   'row',
    margin:          14,
    marginBottom:    0,
    gap:             10,
  },
  statBox: {
    flex:          1,
    borderWidth:   1.5,
    borderRadius:  14,
    paddingVertical: 10,
    alignItems:    'center',
  },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLbl: { fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Infos
  infoBox: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    backgroundColor: C.primaryLight,
    borderRadius:   12,
    padding:        10,
    marginBottom:   10,
  },
  infoTxt: { flex: 1, fontSize: 12, color: C.primary, lineHeight: 17 },

  // Intervenants
  intervCard: {
    backgroundColor:  C.card,
    borderRadius:     14,
    padding:          14,
    marginBottom:     10,
    flexDirection:    'row',
    alignItems:       'center',
    elevation:        2,
    shadowColor:      '#000',
    shadowOpacity:    0.05,
    shadowRadius:     5,
    shadowOffset:     { width: 0, height: 2 },
  },
  intervAvatar:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  intervAvatarTxt: { fontSize: 17, fontWeight: '800' },
  intervNom:       { fontSize: 14, fontWeight: '700', color: C.grisDark },
  intervMeta:      { fontSize: 11, color: C.gris, marginTop: 2 },
  intervChip:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Sélection entrée
  selecCard: {
    backgroundColor:  C.card,
    borderRadius:     14,
    padding:          14,
    marginBottom:     10,
    flexDirection:    'row',
    alignItems:       'center',
    elevation:        2,
    shadowColor:      '#000',
    shadowOpacity:    0.05,
    shadowRadius:     5,
    shadowOffset:     { width: 0, height: 2 },
  },
  selecCardActif:  { borderWidth: 1.5, borderColor: C.vert, backgroundColor: '#F1FFF4' },
  selecAvatar:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  selecAvatarTxt:  { fontSize: 17, fontWeight: '800' },
  selecNom:        { fontSize: 14, fontWeight: '700', color: C.grisDark },
  selecMeta:       { fontSize: 11, color: C.gris, marginTop: 2 },

  // Empty state
  emptyIcon:  { width: 76, height: 76, borderRadius: 38, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitre: { fontSize: 15, fontWeight: '700', color: C.grisDark },
  emptySub:   { fontSize: 12, color: C.gris, marginTop: 6, textAlign: 'center' },
  emptyTxt:   { fontSize: 14, color: C.gris, marginTop: 12, fontWeight: '500' },
  loadingTxt: { marginTop: 14, color: C.gris, fontSize: 14 },

  // Boutons bas
  bottomBar: {
    position:         'absolute',
    bottom:           0, left: 0, right: 0,
    backgroundColor:  C.blanc,
    paddingHorizontal:16,
    paddingTop:       12,
    paddingBottom:    Platform.OS === 'ios' ? 30 : 16,
    borderTopWidth:   1,
    borderTopColor:   C.border,
    elevation:        10,
    shadowColor:      '#000',
    shadowOpacity:    0.08,
    shadowRadius:     10,
    shadowOffset:     { width: 0, height: -3 },
  },
  rowBtns: {
    flexDirection: 'row',
    marginBottom:  8,
  },
  btnPrincipal: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    backgroundColor:  C.primary,
    borderRadius:     14,
    paddingVertical:  15,
    gap:              8,
    elevation:        4,
    shadowColor:      C.primary,
    shadowOpacity:    0.3,
    shadowRadius:     8,
    shadowOffset:     { width: 0, height: 3 },
  },
  btnPrincipalTxt: { color: C.blanc, fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  btnDisabled:     { opacity: 0.55 },
  btnSecondaire: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    borderRadius:     12,
    paddingVertical:  11,
    borderWidth:      1.5,
    borderColor:      C.primary,
    backgroundColor:  C.primaryLight,
    gap:              6,
  },
  btnSecondaireTxt: { fontWeight: '700', fontSize: 12, color: C.primary },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor:   C.blanc,
    borderTopLeftRadius:  26,
    borderTopRightRadius: 26,
    padding:           24,
    paddingBottom:     Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle:     { width: 38, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 18 },
  modalTitle:      { fontSize: 18, fontWeight: '800', color: C.grisDark, marginBottom: 4 },
  modalSub:        { fontSize: 13, color: C.gris, marginBottom: 20 },
  modalOpt:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFB', borderRadius: 16, padding: 14 },
  modalOptIcon:    { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  modalOptTitre:   { fontSize: 14, fontWeight: '700', color: C.grisDark },
  modalOptSub:     { fontSize: 12, color: C.gris, marginTop: 2 },
  modalAnnuler:    { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  modalAnnulerTxt: { fontSize: 14, color: C.gris, fontWeight: '600' },
});