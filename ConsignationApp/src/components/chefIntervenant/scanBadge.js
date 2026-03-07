// src/screens/chef/scanBadge.js
// Couleur FIXE bleue pour TOUS les chefs — identique au dashboardChef
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, Platform, Animated, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getEquipe,
  getIntervenantsDispos,
  enregistrerMembre,
  verifierBadge,
  validerEquipe,
  marquerEntreeMembres,
} from '../../api/equipeIntervention.api';

// ✅ Couleur FIXE bleue — même que dashboardChef
const CFG = {
  couleur:     '#1565C0',
  couleurDark: '#0D47A1',
  bg:          '#E3F2FD',
  bgPale:      '#BBDEFB',
  vert:        '#388E3C',
  vertBg:      '#E8F5E9',
};

const TYPE_LABEL = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

// ── Ligne de scan animée ────────────────────────────────────
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

// ── Stepper Étape 1 / 2 ─────────────────────────────────────
function StepBar({ etapeCourante }) {
  // etapeCourante = 1 ou 2
  return (
    <View style={S.stepBar}>
      {/* Étape 1 */}
      <View style={S.stepItem}>
        <View style={[S.stepCircle, etapeCourante >= 1 && S.stepCircleActive]}>
          {etapeCourante > 1
            ? <Ionicons name="checkmark" size={14} color="#fff" />
            : <Text style={[S.stepNum, etapeCourante === 1 && S.stepNumActive]}>1</Text>
          }
        </View>
        <Text style={[S.stepLbl, etapeCourante === 1 && S.stepLblActive]}>Cadenas</Text>
      </View>

      {/* Ligne entre */}
      <View style={[S.stepLine, etapeCourante >= 2 && S.stepLineActive]} />

      {/* Étape 2 */}
      <View style={S.stepItem}>
        <View style={[S.stepCircle, etapeCourante >= 2 && S.stepCircleActive]}>
          <Text style={[S.stepNum, etapeCourante === 2 && S.stepNumActive]}>2</Text>
        </View>
        <Text style={[S.stepLbl, etapeCourante === 2 && S.stepLblActive]}>Badge OCP</Text>
      </View>
    </View>
  );
}

// ── Vue caméra premium (style scanCadenasNFC) ───────────────
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

      {/* ── Header ── */}
      <View style={S.camHeader}>
        <TouchableOpacity style={S.camBackBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.camHTitle}>{titre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Stepper flottant sous le header ── */}
      <View style={S.stepBarFloat}>
        <StepBar etapeCourante={stepCourante} />
      </View>

      {/* ── Caméra ── */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
      />

      {/* ── Overlay avec cadre animé ── */}
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

      {/* ── Instructions bas ── */}
      <View style={S.instructions}>
        {badge && (
          <View style={S.metierBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
            <Text style={S.metierBadgeTxt}>{badge}</Text>
          </View>
        )}
        <View style={[
          S.instructCard,
          scanned && { backgroundColor: saving ? '#D97706' : '#10B981' },
        ]}>
          <Ionicons
            name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : (infoIcone || 'scan-outline')}
            size={24} color="#fff"
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.instrTitle}>
              {saving ? 'Sauvegarde...' : scanned ? 'Scanné !' : infoTexte}
            </Text>
            {infoSub && !scanned && (
              <Text style={S.instrSub}>{infoSub}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Composant principal ─────────────────────────────────────
export default function ScanBadge({ route, navigation }) {
  const { demande, userMetier } = route.params || {};
  const metierLabel = TYPE_LABEL[userMetier] || 'Chef';

  const [etape, setEtape]                           = useState('liste');
  const [membres, setMembres]                       = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [validating, setValidating]                 = useState(false);
  const [equipeValidee, setEquipeValidee]           = useState(false);
  const [scanned, setScanned]                       = useState(false);
  const [saving, setSaving]                         = useState(false);
  const [membreEnCours, setMembreEnCours]           = useState(null);
  const [intervenants, setIntervenants]             = useState([]);
  const [loadingIntervenants, setLoadingIntervenants] = useState(false);
  const [modalEntree, setModalEntree]               = useState(false);
  const [loadingEntree, setLoadingEntree]           = useState(false);
  const [membresSelecEntree, setMembresSelecEntree] = useState([]);

  const chargerEquipe = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getEquipe(demande.id);
      if (res.success) {
        setMembres(res.data.membres || []);
        setEquipeValidee(res.data.equipe_validee === 1);
      }
    } catch {
      Alert.alert('Erreur', "Impossible de charger l'équipe.");
    } finally {
      setLoading(false);
    }
  }, [demande.id]);

  useEffect(() => { chargerEquipe(); }, [chargerEquipe]);

  const ouvrirIntervenants = async () => {
    try {
      setLoadingIntervenants(true);
      const res = await getIntervenantsDispos(demande.id);
      if (res.success) { setIntervenants(res.data || []); setEtape('listeIntervenants'); }
      else Alert.alert('Erreur', res.message);
    } catch { Alert.alert('Erreur', 'Impossible de charger les intervenants.'); }
    finally { setLoadingIntervenants(false); }
  };

  const selectionnerIntervenant = (intervenant) => {
    Alert.alert(
      'Réactiver ce membre ?',
      `${intervenant.nom}${intervenant.badge_ocp_id ? `\nBadge : ${intervenant.badge_ocp_id}` : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réactiver',
          onPress: async () => {
            try {
              const res = await enregistrerMembre({
                demande_id: demande.id, nom: intervenant.nom,
                matricule: intervenant.matricule || undefined,
                badge_ocp_id: intervenant.badge_ocp_id || undefined,
                numero_cadenas: undefined,
              });
              if (res.success) { await chargerEquipe(); setEtape('liste'); Alert.alert('✅ Membre réactivé', `${intervenant.nom} a été réajouté.`); }
              else Alert.alert('Erreur', res.message);
            } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          },
        },
      ]
    );
  };

  const lancerScanCadenas = () => {
    setScanned(false); setSaving(false); setMembreEnCours(null); setEtape('scanCadenas');
  };

  // ── ÉTAPE 1 : scan cadenas (ajout membre) ───────────────
  const onScanCadenas = ({ data }) => {
    if (scanned) return;
    Vibration.vibrate(100);
    // setMembreEnCours AVANT setEtape pour éviter race condition
    setMembreEnCours({ numero_cadenas: data.trim() });
    setEtape('scanBadge');
  };

  // ── ÉTAPE 2 : scan badge (ajout membre) ──────────────────
  const onScanBadge = async ({ data }) => {
    if (scanned || !membreEnCours) return;
    Vibration.vibrate(200);
    setScanned(true);
    setSaving(true);
    try {
      const badge = data.trim();
      // Récupère le nom depuis la base si badge connu
      const check = await verifierBadge({ badge_ocp_id: badge });
      let nomMembre = badge;
      if (check.success && check.data.found) nomMembre = `${check.data.user.prenom} ${check.data.user.nom}`;
      const res = await enregistrerMembre({
        demande_id: demande.id,
        nom: nomMembre,
        badge_ocp_id: badge,
        numero_cadenas: membreEnCours.numero_cadenas,
      });
      if (res.success) {
        await chargerEquipe();
        setMembreEnCours(null);
        setEtape('liste');
        Alert.alert('✅ Membre ajouté', `${nomMembre} a été ajouté à l'équipe.`);
      } else {
        // Erreur serveur → retour à étape cadenas pour réessayer
        Alert.alert('Erreur', res.message);
        setScanned(false); setSaving(false);
        setMembreEnCours(null); setEtape('scanCadenas');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      setScanned(false); setSaving(false);
      setMembreEnCours(null); setEtape('scanCadenas');
    } finally {
      setSaving(false); setScanned(false);
    }
  };

  const handleValiderEquipe = () => {
    if (membres.length === 0) { Alert.alert('Attention', 'Ajoutez au moins un membre.'); return; }
    const sansCadenas = membres.filter(m => !m.numero_cadenas);
    if (sansCadenas.length > 0) { Alert.alert('Attention', `${sansCadenas.length} membre(s) sans cadenas.`); return; }
    Alert.alert('Confirmer validation', `Valider l'équipe de ${membres.length} membre${membres.length > 1 ? 's' : ''} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Valider', onPress: async () => {
          try {
            setValidating(true);
            const res = await validerEquipe(demande.id);
            if (res.success) { setEquipeValidee(true); await chargerEquipe(); setMembresSelecEntree([]); setModalEntree(true); }
            else Alert.alert('Erreur', res.message);
          } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          finally { setValidating(false); }
        },
      },
    ]);
  };

  const handleEntreeSite = async (tousOuIds) => {
    try {
      setLoadingEntree(true);
      const body = tousOuIds === 'tous' ? { tous: true } : { membres_ids: tousOuIds };
      const res = await marquerEntreeMembres(demande.id, body);
      if (res.success) {
        await chargerEquipe(); setModalEntree(false); setMembresSelecEntree([]);
        const nb = tousOuIds === 'tous' ? membres.filter(m => m.statut === 'en_attente').length : tousOuIds.length;
        Alert.alert('✅ Entrée enregistrée', `${nb} membre(s) sont maintenant sur site.`);
      } else Alert.alert('Erreur', res.message);
    } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
    finally { setLoadingEntree(false); }
  };

  const toggleMembreSelec = (id) =>
    setMembresSelecEntree(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  if (loading) return (
    <View style={S.centered}><ActivityIndicator size="large" color={CFG.couleur} /><Text style={S.loadingTxt}>Chargement...</Text></View>
  );

  // ── SCAN CADENAS (Étape 1) ────────────────────────────────
  if (etape === 'scanCadenas') return (
    <ScanView
      titre="Ajouter un membre"
      stepCourante={1}
      badge={`Chef ${metierLabel} · Équipe`}
      infoIcone="lock-open-outline"
      infoTexte="Scannez le cadenas"
      infoSub="Étape 1 : positionnez le cadenas dans le cadre"
      scanned={scanned}
      saving={saving}
      onScanned={onScanCadenas}
      onBack={() => setEtape('liste')}
    />
  );

  // ── SCAN BADGE (Étape 2) ──────────────────────────────────
  if (etape === 'scanBadge') return (
    <ScanView
      titre="Ajouter un membre"
      stepCourante={2}
      badge={`Chef ${metierLabel} · Cad: ${membreEnCours?.numero_cadenas || '—'} ✓`}
      infoIcone="card-outline"
      infoTexte="Scannez le badge OCP"
      infoSub="Étape 2 : présentez le badge du membre"
      scanned={scanned}
      saving={saving}
      onScanned={onScanBadge}
      onBack={() => { setEtape('scanCadenas'); setMembreEnCours(null); }}
    />
  );

  // ── LISTE INTERVENANTS ────────────────────────────────────
  if (etape === 'listeIntervenants') return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => setEtape('liste')}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Intervenants disponibles</Text>
          <Text style={S.hSub}>{intervenants.length} membre(s) réactivable(s)</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      {intervenants.length === 0
        ? <View style={S.centered}><Ionicons name="people-outline" size={54} color="#BDBDBD" /><Text style={S.emptyTxt}>Aucun intervenant disponible</Text></View>
        : <ScrollView contentContainerStyle={{ padding: 14 }}>
            {intervenants.map(item => (
              <TouchableOpacity key={item.id} style={S.membreCard} onPress={() => selectionnerIntervenant(item)} activeOpacity={0.8}>
                <View style={S.avatar}><Text style={S.avatarTxt}>{(item.nom || '?')[0].toUpperCase()}</Text></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.membreNom}>{item.nom}</Text>
                  <Text style={S.membreMeta}>{item.badge_ocp_id || item.matricule || '—'}{item.numero_cadenas ? `  ·  Cad: ${item.numero_cadenas}` : ''}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={26} color={CFG.couleur} />
              </TouchableOpacity>
            ))}
          </ScrollView>
      }
    </View>
  );

  // ── SÉLECTION ENTRÉE ──────────────────────────────────────
  if (etape === 'selectionEntree') {
    const membresEnAttente = membres.filter(m => m.statut === 'en_attente');
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
        <View style={S.header}>
          <TouchableOpacity style={S.backBtn} onPress={() => setEtape('liste')}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}><Text style={S.hTitle}>Qui entre sur site ?</Text><Text style={S.hSub}>Sélectionnez les membres</Text></View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }}>
          {membresEnAttente.map(m => {
            const selec = membresSelecEntree.includes(m.id);
            return (
              <TouchableOpacity key={m.id} style={[S.membreCard, selec && { backgroundColor: CFG.vertBg }]} onPress={() => toggleMembreSelec(m.id)} activeOpacity={0.8}>
                <View style={[S.avatar, selec && { backgroundColor: CFG.vert }]}>
                  <Text style={[S.avatarTxt, selec && { color: '#fff' }]}>{(m.nom || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={S.membreNom}>{m.nom}</Text>
                  <Text style={S.membreMeta}>{m.badge_ocp_id || m.matricule || '—'}{m.numero_cadenas ? `  ·  Cad: ${m.numero_cadenas}` : ''}</Text>
                </View>
                <Ionicons name={selec ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={selec ? CFG.vert : '#BDBDBD'} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {membresSelecEntree.length > 0 && (
          <View style={S.bottomBar}>
            <TouchableOpacity style={[S.btnValider, { backgroundColor: CFG.vert }, loadingEntree && { opacity: 0.6 }]} onPress={() => handleEntreeSite(membresSelecEntree)} disabled={loadingEntree} activeOpacity={0.85}>
              {loadingEntree ? <ActivityIndicator color="#fff" /> : <><Ionicons name="log-in-outline" size={20} color="#fff" /><Text style={S.btnValiderTxt}>ENTRER {membresSelecEntree.length} MEMBRE{membresSelecEntree.length > 1 ? 'S' : ''} SUR SITE</Text></>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── LISTE PRINCIPALE ──────────────────────────────────────
  const membresEnAttente = membres.filter(m => m.statut === 'en_attente');
  const membresSurSite   = membres.filter(m => m.statut === 'sur_site');
  const membresSortis    = membres.filter(m => m.statut === 'sortie');

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Équipe d'intervention</Text>
          <Text style={S.hSub}>{demande.numero_ordre} — TAG {demande.tag || demande.code_equipement || ''}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={S.statsRow}>
        <View style={[S.statBox, { borderColor: '#FFA000' }]}><Text style={[S.statVal, { color: '#FFA000' }]}>{membresEnAttente.length}</Text><Text style={S.statLbl}>En attente</Text></View>
        <View style={[S.statBox, { borderColor: CFG.couleur }]}><Text style={[S.statVal, { color: CFG.couleur }]}>{membresSurSite.length}</Text><Text style={S.statLbl}>Sur site</Text></View>
        <View style={[S.statBox, { borderColor: CFG.vert }]}><Text style={[S.statVal, { color: CFG.vert }]}>{membresSortis.length}</Text><Text style={S.statLbl}>Sortis</Text></View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 160 }}>
        {membres.length === 0 ? (
          <View style={[S.centered, { marginTop: 60 }]}>
            <Ionicons name="people-outline" size={54} color="#BDBDBD" />
            <Text style={S.emptyTxt}>Aucun membre dans l'équipe</Text>
            <Text style={S.emptySub}>Ajoutez des membres via le bouton ci-dessous</Text>
          </View>
        ) : membres.map(m => {
          const couleurStatut = m.statut === 'sur_site' ? CFG.couleur : m.statut === 'sortie' ? CFG.vert : '#FFA000';
          const iconeStatut   = m.statut === 'sur_site' ? 'construct' : m.statut === 'sortie' ? 'checkmark-circle' : 'time-outline';
          return (
            <View key={m.id} style={S.membreCard}>
              <View style={S.avatar}><Text style={S.avatarTxt}>{(m.nom || '?')[0].toUpperCase()}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={S.membreNom}>{m.nom}</Text>
                <Text style={S.membreMeta}>{m.badge_ocp_id || m.matricule || '—'}{m.numero_cadenas ? `  ·  Cad: ${m.numero_cadenas}` : ''}</Text>
                {m.heure_entree && <Text style={[S.membreHeure, { color: CFG.couleur }]}>Entrée : {new Date(m.heure_entree).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>}
                {m.heure_sortie && <Text style={[S.membreHeure, { color: CFG.vert }]}>Sortie : {new Date(m.heure_sortie).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>}
              </View>
              <Ionicons name={iconeStatut} size={22} color={couleurStatut} />
            </View>
          );
        })}
      </ScrollView>

      <View style={S.bottomBar}>
        {!equipeValidee ? (
          <>
            <TouchableOpacity style={[S.btnSecondaire, { marginBottom: 8 }]} onPress={ouvrirIntervenants} disabled={loadingIntervenants} activeOpacity={0.8}>
              {loadingIntervenants ? <ActivityIndicator color={CFG.couleur} /> : <><Ionicons name="people-outline" size={18} color={CFG.couleur} /><Text style={S.btnSecondaireTxt}>Ajouter depuis la liste</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={[S.btnSecondaire, { marginBottom: 8 }]} onPress={lancerScanCadenas} activeOpacity={0.8}>
              <Ionicons name="scan-outline" size={18} color={CFG.couleur} />
              <Text style={S.btnSecondaireTxt}>Scanner cadenas + badge</Text>
            </TouchableOpacity>
            {membres.length > 0 && (
              <TouchableOpacity style={[S.btnValider, validating && { opacity: 0.6 }]} onPress={handleValiderEquipe} disabled={validating} activeOpacity={0.85}>
                {validating ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-done-outline" size={20} color="#fff" /><Text style={S.btnValiderTxt}>VALIDER L'ÉQUIPE</Text></>}
              </TouchableOpacity>
            )}
          </>
        ) : (
          membresEnAttente.length > 0 && (
            <TouchableOpacity style={[S.btnValider, { backgroundColor: CFG.vert }]} onPress={() => { setMembresSelecEntree([]); setModalEntree(true); }} activeOpacity={0.85}>
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={S.btnValiderTxt}>MARQUER ENTRÉE SUR SITE</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <Modal transparent visible={modalEntree} animationType="slide">
        <View style={S.modalBackdrop}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>Entrée sur chantier</Text>
            <Text style={S.modalSub}>Qui entre sur le chantier maintenant ?</Text>
            <TouchableOpacity style={S.modalOption} onPress={() => handleEntreeSite('tous')} disabled={loadingEntree} activeOpacity={0.8}>
              <View style={[S.modalOptionIcon, { backgroundColor: CFG.vertBg }]}><Ionicons name="people" size={26} color={CFG.vert} /></View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptionTitre}>Toute l'équipe</Text>
                <Text style={S.modalOptionSub}>{membresEnAttente.length} membre{membresEnAttente.length > 1 ? 's' : ''} entrent maintenant</Text>
              </View>
              {loadingEntree ? <ActivityIndicator color={CFG.vert} /> : <Ionicons name="chevron-forward" size={18} color="#BDBDBD" />}
            </TouchableOpacity>
            <TouchableOpacity style={[S.modalOption, { marginTop: 10 }]} onPress={() => { setModalEntree(false); setMembresSelecEntree([]); setEtape('selectionEntree'); }} disabled={loadingEntree} activeOpacity={0.8}>
              <View style={[S.modalOptionIcon, { backgroundColor: CFG.bg }]}><Ionicons name="person-add-outline" size={26} color={CFG.couleur} /></View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptionTitre}>Choisir des membres</Text>
                <Text style={S.modalOptionSub}>Sélectionnez qui entre maintenant</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#BDBDBD" />
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

// ── StyleSheet ──────────────────────────────────────────────
const FRAME = 220;
const S = StyleSheet.create({
  permCenter:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1B2A', padding: 30, gap: 16 },
  permTitle:   { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBtn:     { backgroundColor: CFG.couleur, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Header caméra
  camHeader:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  camBackBtn:   { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  camHTitle:    { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Stepper flottant
  stepBarFloat: { position: 'absolute', top: Platform.OS === 'ios' ? 110 : 94, left: 0, right: 0, zIndex: 20, alignItems: 'center' },
  stepBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 30, paddingHorizontal: 20, paddingVertical: 10, gap: 0 },
  stepItem:     { alignItems: 'center', gap: 4 },
  stepCircle:   { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  stepCircleActive: { backgroundColor: CFG.couleur, borderColor: CFG.couleur },
  stepNum:      { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  stepNumActive:{ color: '#fff' },
  stepLbl:      { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  stepLblActive:{ color: '#fff' },
  stepLine:     { width: 36, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8, marginBottom: 14 },
  stepLineActive: { backgroundColor: CFG.couleur },

  // Overlay cadre scan
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

  // Instructions bas caméra
  instructions:   { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, gap: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  metierBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${CFG.couleur}DD`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  metierBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  instructCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: `${CFG.couleur}E6`, borderRadius: 14, padding: 14 },
  instrTitle:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  instrSub:       { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 3 },

  // Général
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingTxt:  { marginTop: 12, color: '#757575', fontSize: 14 },

  header:  { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: CFG.couleur },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)' },
  hTitle:  { color: '#fff', fontWeight: '700', fontSize: 16 },
  hSub:    { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  statsRow: { flexDirection: 'row', margin: 14, gap: 10 },
  statBox:  { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  statVal:  { fontSize: 22, fontWeight: '800' },
  statLbl:  { fontSize: 11, color: '#757575', marginTop: 2 },

  membreCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  avatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: CFG.bg, justifyContent: 'center', alignItems: 'center' },
  avatarTxt:   { fontSize: 18, fontWeight: '700', color: CFG.couleur },
  membreNom:   { fontSize: 15, fontWeight: '600', color: '#212121' },
  membreMeta:  { fontSize: 12, color: '#757575', marginTop: 2 },
  membreHeure: { fontSize: 11, marginTop: 2 },
  emptyTxt:    { fontSize: 16, color: '#9E9E9E', marginTop: 14, fontWeight: '500' },
  emptySub:    { fontSize: 13, color: '#BDBDBD', marginTop: 6, textAlign: 'center' },

  bottomBar:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 16, borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 8 },
  btnValider:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: CFG.couleur, borderRadius: 14, paddingVertical: 15, gap: 8 },
  btnValiderTxt:    { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  btnSecondaire:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: CFG.couleur, gap: 8, backgroundColor: '#fff' },
  btnSecondaireTxt: { fontWeight: '600', fontSize: 14, color: CFG.couleur },

  modalBackdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 18 },
  modalTitle:       { fontSize: 18, fontWeight: '700', color: '#212121', marginBottom: 4 },
  modalSub:         { fontSize: 13, color: '#757575', marginBottom: 20 },
  modalOption:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 14, padding: 14 },
  modalOptionIcon:  { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  modalOptionTitre: { fontSize: 15, fontWeight: '600', color: '#212121' },
  modalOptionSub:   { fontSize: 12, color: '#757575', marginTop: 2 },
  modalAnnuler:     { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  modalAnnulerTxt:  { fontSize: 15, color: '#9E9E9E', fontWeight: '500' },
});