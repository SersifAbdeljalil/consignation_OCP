// src/components/chefIntervenant/GestionEquipe.js
// Vue principale — liste des membres + déconsignation
// Les écrans scan sont maintenant séparés :
//   → ScanCadenasEquipe (étape 1)
//   → ScanBadgeEquipe   (étape 2)
//   → PrendrePhotoEquipe (étape 3)
// La logique métier est INCHANGÉE
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, Platform, Animated,
  Vibration, FlatList, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getEquipe,
  getStatutDeconsignation,
  supprimerMembre,
  verifierBadge,
  validerEquipe,
  marquerEntreeMembres,
  deconsignerMembre,
  validerDeconsignation,
} from '../../api/equipeIntervention.api';

const BASE_URL = 'http://192.168.1.104:3000';

const C = {
  primary:      '#1565C0',
  primaryDark:  '#0D47A1',
  primaryLight: '#E3F2FD',
  primaryMid:   '#BBDEFB',
  vert:         '#2E7D32',
  vertLight:    '#E8F5E9',
  vertMid:      '#4CAF50',
  rouge:        '#C62828',
  rougeLight:   '#FFEBEE',
  orange:       '#F57C00',
  orangeLight:  '#FFF3E0',
  blanc:        '#FFFFFF',
  fond:         '#F0F4F8',
  gris:         '#9E9E9E',
  grisDark:     '#424242',
  card:         '#FFFFFF',
  border:       '#E8EDF2',
};

const fmtHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

const norm = (v) => (v || '').trim().toLowerCase().replace(/[\s-]/g, '');

// ══════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Ligne scan animée (déconsignation)
// ══════════════════════════════════════════════════════════════════
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
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  return (
    <Animated.View style={{
      position: 'absolute', left: 8, right: 8, height: 2,
      backgroundColor: C.rouge, opacity: 0.9, borderRadius: 1,
      transform: [{ translateY: ty }],
    }} />
  );
}

// ══════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT : Carte membre
// ══════════════════════════════════════════════════════════════════
function MembreCard({ m, equipeValidee, modeDeconsignation, updatingId, onRetirer, onRefaire, onValiderMembre, onEntreeSite, onSortie }) {
  const hasCadenas = !!(m.cad_id || m.numero_cadenas);
  const hasBadge   = !!m.badge_ocp_id;
  const hasPhoto   = !!m.photo_path;
  const complet    = hasCadenas && hasBadge && hasPhoto;
  const surSite    = m.statut === 'sur_site';
  const sorti      = m.statut === 'sorti';
  const updating   = updatingId === m.id;

  const photoUri = m.photo_path ? `${BASE_URL}/${m.photo_path}`.replace(/([^:]\/)\/+/g, '$1') : null;

  const borderColor = sorti ? C.gris : surSite ? C.rouge : complet ? C.vert : C.orange;
  const stripeColor = sorti ? C.gris : surSite ? C.rouge : complet ? C.vert : C.orange;

  return (
    <View style={[MCS.card, { borderColor, borderWidth: 1.5 }]}>
      <View style={[MCS.stripe, { backgroundColor: stripeColor }]} />
      {photoUri
        ? <Image source={{ uri: photoUri }} style={MCS.avatarImg} />
        : (
          <View style={[MCS.avatar, { backgroundColor: complet ? C.vertLight : C.primaryLight }]}>
            <Text style={[MCS.avatarTxt, { color: complet ? C.vert : C.primary }]}>
              {(m.nom || '?')[0].toUpperCase()}
            </Text>
          </View>
        )
      }

      <View style={{ flex: 1, marginLeft: 10, paddingVertical: 8 }}>
        <Text style={MCS.nom}>{m.nom || '—'}</Text>
        <Text style={MCS.meta}>{m.badge_ocp_id || m.matricule || '—'}</Text>
        {m.heure_entree && <Text style={[MCS.heure, { color: C.vert }]}>Entrée {fmtHeure(m.heure_entree)}</Text>}
        {m.heure_scan_sortie && <Text style={[MCS.heure, { color: C.rouge }]}>Sortie {fmtHeure(m.heure_scan_sortie)}</Text>}

        <View style={MCS.chips}>
          {[
            { ok: hasCadenas, icon: 'lock-closed', label: 'Cadenas', okC: C.vert,    noC: C.orange },
            { ok: hasBadge,   icon: 'card',        label: 'Badge',   okC: C.primary, noC: C.orange },
            { ok: hasPhoto,   icon: 'camera',      label: 'Photo',   okC: C.primary, noC: C.rouge  },
          ].map((chip, i) => (
            <View key={i} style={[MCS.chip, { backgroundColor: chip.ok ? (i === 0 ? C.vertLight : C.primaryLight) : C.orangeLight }]}>
              <Ionicons name={chip.ok ? chip.icon : `${chip.icon}-outline`} size={9} color={chip.ok ? (i === 0 ? C.vert : C.primary) : chip.noC} />
              <Text style={[MCS.chipTxt, { color: chip.ok ? (i === 0 ? C.vert : C.primary) : chip.noC }]}>
                {chip.label}{chip.ok ? ' ✓' : ' ✗'}
              </Text>
            </View>
          ))}
        </View>

        {!equipeValidee && complet && onValiderMembre && (
          <TouchableOpacity style={MCS.btnValider} onPress={() => onValiderMembre(m)}>
            <Ionicons name="checkmark-circle" size={13} color={C.blanc} />
            <Text style={MCS.btnValiderTxt}>Prêt</Text>
          </TouchableOpacity>
        )}

        {equipeValidee && m.statut === 'en_attente' && onEntreeSite && (
          <TouchableOpacity
            style={[MCS.btnValider, { backgroundColor: C.primary }]}
            onPress={() => onEntreeSite(m)}
            disabled={updating}
          >
            {updating ? <ActivityIndicator size="small" color={C.blanc} /> : (
              <><Ionicons name="log-in-outline" size={13} color={C.blanc} /><Text style={MCS.btnValiderTxt}>Entrer</Text></>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={MCS.actions}>
        <View style={[MCS.badge, {
          backgroundColor: sorti ? '#F5F5F5' : surSite ? C.rougeLight : complet ? C.vertLight : C.orangeLight,
        }]}>
          <Text style={[MCS.badgeTxt, {
            color: sorti ? C.gris : surSite ? C.rouge : complet ? C.vert : C.orange,
          }]}>
            {sorti ? 'Sorti' : surSite ? 'Sur site' : complet ? 'Complet' : 'Incomplet'}
          </Text>
        </View>

        <View style={MCS.btnsRow}>
          {!equipeValidee && onRefaire && (
            <TouchableOpacity style={[MCS.btn, { backgroundColor: C.primaryLight }]} onPress={() => onRefaire(m)}>
              <Ionicons name="refresh-outline" size={15} color={C.primary} />
            </TouchableOpacity>
          )}
          {!equipeValidee && onRetirer && (
            <TouchableOpacity style={[MCS.btn, { backgroundColor: C.rougeLight }]} onPress={() => onRetirer(m)}>
              <Ionicons name="trash-outline" size={15} color={C.rouge} />
            </TouchableOpacity>
          )}
          {modeDeconsignation && surSite && onSortie && (
            <TouchableOpacity style={[MCS.btnRond, { backgroundColor: C.rougeLight }]} onPress={() => onSortie(m)}>
              <Ionicons name="log-out-outline" size={16} color={C.rouge} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ══════════════════════════════════════════════════════════════════
export default function GestionEquipe({ route, navigation }) {
  const { demande, userMetier } = route.params || {};

  // Vue interne (uniquement pour sélection entrée + déconsignation)
  const [vue, setVue] = useState('liste');

  const [membres,        setMembres]        = useState([]);
  const [equipeValidee,  setEquipeValidee]  = useState(false);
  const [statut,         setStatut]         = useState(null);
  const [rapportGenere,  setRapportGenere]  = useState(null);

  const [deconsMembre,  setDeconsMembre]  = useState(null);
  const [deconsCadenas, setDeconsCadenas] = useState(null);

  const [loading,          setLoading]         = useState(true);
  const [validatingEquipe, setValidatingEquipe] = useState(false);
  const [loadingEntree,    setLoadingEntree]    = useState(false);
  const [loadingDeconsign, setLoadingDeconsign] = useState(false);
  const [updatingMembId,   setUpdatingMembId]   = useState(null);
  const [scanned,          setScanned]          = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [membresSelec,     setMembresSelec]     = useState([]);
  const [modalEntree,      setModalEntree]      = useState(false);

  const [permDec,   demPermDec]  = useCameraPermissions();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cooldown  = useRef(false);

  // ── Chargement ──────────────────────────────────────────────────
  const charger = useCallback(async () => {
    try {
      setLoading(true);
      const [resE, resS] = await Promise.all([
        getEquipe(demande.id),
        getStatutDeconsignation(demande.id),
      ]);
      if (resE.success) {
        setMembres(resE.data.membres || []);
        setEquipeValidee(resE.data.equipe_validee === 1);
      }
      if (resS.success) {
        setStatut(resS.data);
        if (resS.data?.rapport_pdf_path)
          setRapportGenere({ pdf_path: resS.data.rapport_pdf_path });
      }
    } catch { Alert.alert('Erreur', "Impossible de charger l'équipe."); }
    finally { setLoading(false); }
  }, [demande.id]);

  useEffect(() => { charger(); }, [charger]);

  // Rafraîchir quand on revient depuis un écran de scan
  useEffect(() => {
    if (route.params?.refresh) charger();
  }, [route.params?.refresh]);

  useEffect(() => {
    if (permDec && !permDec.granted) demPermDec();
  }, [permDec]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    );
    if (vue === 'deconsCadenas' || vue === 'deconsBadge') pulse.start();
    return () => pulse.stop();
  }, [vue]);

  const resetScan = () => { cooldown.current = false; setScanned(false); setSaving(false); };

  // ── Navigation vers les écrans séparés ──────────────────────────
  const lancerNouveauMembre = () => {
    navigation.navigate('ScanCadenasEquipe', {
      demande, userMetier, scanParams: {},
    });
  };

  const lancerDepuisListe = () => {
    navigation.navigate('ScanCadenasEquipe', {
      demande, userMetier, scanParams: { modeListeOuvert: true },
    });
  };

  const lancerRefaire = (m) => {
    navigation.navigate('ScanCadenasEquipe', {
      demande, userMetier,
      scanParams: { membreId: m.id, nomExist: m.nom },
    });
  };

  // ── Retirer membre ───────────────────────────────────────────────
  const retirerMembre = (m) => {
    Alert.alert(
      '⚠️ Supprimer ce membre ?',
      `${m.nom} sera définitivement supprimé de l'équipe.\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerMembre(m.id);
              setMembres(p => p.filter(x => x.id !== m.id));
              Alert.alert('Supprimé ✅', `${m.nom} a été retiré de l'équipe.`);
            } catch (e) {
              const status = e?.response?.status;
              if (status === 200 || status === 204) {
                setMembres(p => p.filter(x => x.id !== m.id));
                Alert.alert('Supprimé ✅', `${m.nom} a été retiré de l'équipe.`);
              } else {
                Alert.alert('Erreur', e?.response?.data?.message || 'Impossible de supprimer.');
              }
            }
          },
        },
      ]
    );
  };

  const validerUnMembre = (m) => {
    if (!(m.cad_id || m.numero_cadenas) || !m.badge_ocp_id || !m.photo_path) {
      Alert.alert('Incomplet', 'Ce membre doit avoir cadenas, badge et photo.');
      return;
    }
    Alert.alert('Membre prêt ✅', `${m.nom} sera inclus dans la validation.`);
  };

  const validerTouteEquipe = () => {
    if (!membres.length) { Alert.alert('Attention', 'Ajoutez au moins un membre.'); return; }
    const incomplets = membres.filter(m => !(m.cad_id || m.numero_cadenas) || !m.badge_ocp_id || !m.photo_path);
    if (incomplets.length) {
      Alert.alert(`${incomplets.length} membre(s) incomplet(s)`, `${incomplets.map(m => m.nom || '—').join(', ')}\n\nChaque membre doit avoir cadenas + badge + photo.`);
      return;
    }
    Alert.alert("Valider l'équipe ?", `${membres.length} membre(s) vont passer en "En attente d'entrée".`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Valider',
        onPress: async () => {
          setValidatingEquipe(true);
          try {
            const res = await validerEquipe(demande.id);
            if (res.success) { await charger(); Alert.alert('Équipe validée ✅', `${membres.length} membre(s) prêts.`); }
            else Alert.alert('Erreur', res.message);
          } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          finally { setValidatingEquipe(false); }
        },
      },
    ]);
  };

  const handleEntreeSingle = (m) => {
    Alert.alert('Confirmer entrée', `Marquer ${m.nom} comme "Sur site" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        onPress: async () => {
          setUpdatingMembId(m.id);
          try {
            const res = await marquerEntreeMembres(demande.id, { membres_ids: [m.id] });
            if (res.success) setMembres(p => p.map(x => x.id === m.id ? { ...x, statut: 'sur_site', heure_entree: new Date().toISOString() } : x));
            else Alert.alert('Erreur', res.message);
          } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          finally { setUpdatingMembId(null); }
        },
      },
    ]);
  };

  const handleEntree = async (idsOuTous) => {
    setLoadingEntree(true);
    try {
      const body = idsOuTous === 'tous' ? { tous: true } : { membres_ids: idsOuTous };
      const res  = await marquerEntreeMembres(demande.id, body);
      if (res.success) { await charger(); setModalEntree(false); setMembresSelec([]); }
      else Alert.alert('Erreur', res.message);
    } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
    finally { setLoadingEntree(false); }
  };

  const lancerDeconsign = (m) => {
    setDeconsMembre(m);
    setDeconsCadenas(null);
    resetScan();
    setVue('deconsCadenas');
  };

  // ── Déconsignation scan cadenas ──────────────────────────────────
  const onDeconsScanCadenas = async ({ data }) => {
    if (scanned || cooldown.current || !deconsMembre) return;
    cooldown.current = true;
    setScanned(true);
    Vibration.vibrate(150);
    const cad     = data.trim();
    const attendu = deconsMembre.cad_id || deconsMembre.numero_cadenas;
    if (attendu && norm(cad) !== norm(attendu)) {
      Alert.alert('Cadenas incorrect', `Scanné : ${cad}\nAttendu : ${attendu}`, [
        { text: 'Réessayer', style: 'cancel', onPress: resetScan },
        { text: 'Continuer quand même', onPress: () => { setDeconsCadenas(cad); resetScan(); setVue('deconsBadge'); } },
      ]);
      return;
    }
    setDeconsCadenas(cad);
    resetScan();
    setVue('deconsBadge');
  };

  // ── Déconsignation scan badge ────────────────────────────────────
  const onDeconsScanBadge = async ({ data }) => {
    if (scanned || cooldown.current || !deconsMembre || !deconsCadenas) return;
    cooldown.current = true;
    setScanned(true);
    Vibration.vibrate(200);
    setSaving(true);
    const badge   = data.trim();
    const attendu = deconsMembre?.badge_ocp_id;
    if (attendu && norm(badge) !== norm(attendu)) {
      Alert.alert('Badge incorrect', `Ce badge ne correspond pas à ${deconsMembre.nom}.`,
        [{ text: 'Réessayer', onPress: resetScan }]);
      setSaving(false);
      return;
    }
    try {
      setLoadingDeconsign(true);
      const res = await deconsignerMembre(deconsMembre.id, {
        cad_id:         deconsCadenas,
        numero_cadenas: deconsMembre.numero_cadenas || undefined,
        badge_ocp_id:   badge,
      });
      if (res.success) {
        const nom = deconsMembre.nom;
        setDeconsMembre(null); setDeconsCadenas(null); resetScan();
        await charger();
        setVue('liste');
        if (res.data.tous_sortis) {
          Alert.alert("Toute l'équipe est sortie !", `${res.data.total} membres ont quitté le chantier.`);
        } else {
          Alert.alert('Sortie enregistrée ✅', `${nom} — ${res.data.sortis}/${res.data.total} sortis.`);
        }
      } else {
        Alert.alert('Erreur', res.message);
        resetScan(); setDeconsCadenas(null); setVue('deconsCadenas');
      }
    } catch (e) {
      Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.');
      resetScan(); setDeconsCadenas(null); setVue('deconsCadenas');
    } finally { setLoadingDeconsign(false); setSaving(false); }
  };

  const handleValiderDeconsignation = () => {
    Alert.alert('Valider la déconsignation ?', 'Un rapport PDF sera généré et archivé.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Valider + PDF',
        onPress: async () => {
          setLoadingDeconsign(true);
          try {
            const res = await validerDeconsignation(demande.id);
            if (res.success) {
              setRapportGenere(res.data);
              await charger();
              Alert.alert('Déconsignation validée ✅', 'Rapport PDF généré.', [
                { text: 'Plus tard', style: 'cancel' },
                { text: 'Voir le rapport', onPress: () => ouvrirPdf(res.data.pdf_path) },
              ]);
            } else Alert.alert('Erreur', res.message);
          } catch (e) { Alert.alert('Erreur', e?.response?.data?.message || 'Problème réseau.'); }
          finally { setLoadingDeconsign(false); }
        },
      },
    ]);
  };

  const ouvrirPdf = (pdfPath) => {
    if (!pdfPath) return;
    const url = `${BASE_URL}/${pdfPath}`.replace(/([^:]\/)\/+/g, '$1');
    navigation.navigate('PdfViewer', { url, titre: `Rapport — ${demande.numero_ordre}`, role: 'chef_equipe' });
  };

  // ── Dérivés ─────────────────────────────────────────────────────
  const membresEnAttente = membres.filter(m => m.statut === 'en_attente');
  const membresSurSite   = membres.filter(m => m.statut === 'sur_site');
  const peutDeconsigner  = statut?.peut_deconsigner === true;
  const nbComplets       = membres.filter(m => (m.cad_id || m.numero_cadenas) && m.badge_ocp_id && m.photo_path).length;
  const tousComplets     = membres.length > 0 && nbComplets === membres.length;
  const FRAME            = 220;

  if (loading) return (
    <View style={[S.flex, S.center, { backgroundColor: C.fond }]}>
      <ActivityIndicator size="large" color={C.primary} />
      <Text style={{ color: C.gris, marginTop: 12 }}>Chargement…</Text>
    </View>
  );

  // ── Sélection entrée ────────────────────────────────────────────
  if (vue === 'selectionEntree') return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => setVue('liste')}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitre}>Qui entre maintenant ?</Text>
          <Text style={S.hSub}>{membresEnAttente.length} en attente</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={membresEnAttente}
        keyExtractor={m => m.id.toString()}
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const sel = membresSelec.includes(item.id);
          return (
            <TouchableOpacity
              style={[S.selecCard, sel && S.selecCardOn]}
              onPress={() => setMembresSelec(p => p.includes(item.id) ? p.filter(i => i !== item.id) : [...p, item.id])}
            >
              <View style={[S.selecAv, { backgroundColor: sel ? C.vert : C.primaryLight }]}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: sel ? C.blanc : C.primary }}>
                  {(item.nom || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={S.intervNom}>{item.nom}</Text>
                <Text style={S.intervMeta}>{item.badge_ocp_id || '—'}</Text>
              </View>
              <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={sel ? C.vert : C.gris} />
            </TouchableOpacity>
          );
        }}
      />
      {membresSelec.length > 0 && (
        <View style={S.bottomBar}>
          <TouchableOpacity
            style={[S.btnPrinc, { backgroundColor: C.vert }, loadingEntree && S.btnDis]}
            onPress={() => handleEntree(membresSelec)} disabled={loadingEntree}
          >
            {loadingEntree ? <ActivityIndicator color={C.blanc} /> : (
              <><Ionicons name="log-in-outline" size={18} color={C.blanc} /><Text style={S.btnPrincTxt}>ENTRER {membresSelec.length} MEMBRE(S)</Text></>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ── Déconsignation — scan cadenas ────────────────────────────────
  if (vue === 'deconsCadenas') return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
      <View style={[DC.header, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <TouchableOpacity style={DC.backBtn} onPress={() => { setDeconsMembre(null); setDeconsCadenas(null); resetScan(); setVue('liste'); }}>
          <Ionicons name="arrow-back" size={20} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={DC.titre}>Sortie du chantier</Text>
          <Text style={DC.sub}>{deconsMembre?.nom}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <View style={DC.stepper}>
        {['Cadenas', 'Badge'].map((lbl, i) => (
          <View key={i} style={DC.stepItem}>
            <View style={[DC.stepCircle, i === 0 && { backgroundColor: C.rouge }]}>
              <Text style={[DC.stepNum, i === 0 && { color: '#fff' }]}>{i + 1}</Text>
            </View>
            <Text style={[DC.stepLbl, i === 0 && { color: '#fff', fontWeight: '700' }]}>{lbl}</Text>
          </View>
        ))}
      </View>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onDeconsScanCadenas}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
      />
      <View style={DC.overlay} pointerEvents="none">
        <View style={DC.overlayTop} />
        <View style={DC.overlayRow}>
          <View style={DC.overlaySide} />
          <Animated.View style={[DC.frame, { transform: [{ scale: pulseAnim }] }]}>
            {[
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((st, i) => (
              <View key={i} style={[DC.corner, st, { borderColor: C.rouge }]} />
            ))}
            {!scanned && <ScanLine />}
            {scanned && (
              <View style={DC.successOverlay}>
                <Ionicons name={saving ? 'sync-outline' : 'checkmark-circle'} size={64} color={saving ? C.orange : C.vert} />
              </View>
            )}
          </Animated.View>
          <View style={DC.overlaySide} />
        </View>
        <View style={DC.overlayBottom} />
      </View>
      <View style={DC.instrWrap}>
        <View style={[DC.pill, { backgroundColor: `${C.rouge}CC` }]}>
          <Ionicons name="log-out-outline" size={12} color={C.blanc} />
          <Text style={DC.pillTxt}>Sortie · {deconsMembre?.nom}</Text>
        </View>
        <View style={[DC.instrCard, { backgroundColor: `${C.rouge}E0` }, scanned && { backgroundColor: saving ? C.orange : C.vert }]}>
          <Ionicons name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'lock-open-outline'} size={22} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={DC.instrTitre}>{saving ? 'Traitement...' : scanned ? 'Cadenas scanné !' : 'Scannez le cadenas personnel'}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // ── Déconsignation — scan badge ──────────────────────────────────
  if (vue === 'deconsBadge') return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
      <View style={[DC.header, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
        <TouchableOpacity style={DC.backBtn} onPress={() => { setDeconsCadenas(null); resetScan(); setVue('deconsCadenas'); }}>
          <Ionicons name="arrow-back" size={20} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={DC.titre}>Sortie du chantier</Text>
          <Text style={DC.sub}>{deconsMembre?.nom}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <View style={DC.stepper}>
        {['Cadenas', 'Badge'].map((lbl, i) => (
          <View key={i} style={DC.stepItem}>
            <View style={[DC.stepCircle, { backgroundColor: i === 0 ? C.vert : C.rouge }]}>
              {i === 0
                ? <Ionicons name="checkmark" size={12} color={C.blanc} />
                : <Text style={[DC.stepNum, { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[DC.stepLbl, { color: i === 1 ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: i === 1 ? '700' : '400' }]}>{lbl}</Text>
          </View>
        ))}
      </View>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : onDeconsScanBadge}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
      />
      <View style={DC.overlay} pointerEvents="none">
        <View style={DC.overlayTop} />
        <View style={DC.overlayRow}>
          <View style={DC.overlaySide} />
          <Animated.View style={[DC.frame, { transform: [{ scale: pulseAnim }] }]}>
            {[
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((st, i) => (
              <View key={i} style={[DC.corner, st, { borderColor: C.rouge }]} />
            ))}
            {!scanned && <ScanLine />}
            {scanned && (
              <View style={DC.successOverlay}>
                <Ionicons name={saving || loadingDeconsign ? 'sync-outline' : 'checkmark-circle'} size={64} color={saving ? C.orange : C.vert} />
              </View>
            )}
          </Animated.View>
          <View style={DC.overlaySide} />
        </View>
        <View style={DC.overlayBottom} />
      </View>
      <View style={DC.instrWrap}>
        <View style={[DC.pill, { backgroundColor: `${C.vert}CC` }]}>
          <Ionicons name="lock-closed" size={12} color={C.blanc} />
          <Text style={DC.pillTxt}>Cadenas ✓ · {deconsMembre?.nom}</Text>
        </View>
        <View style={[DC.instrCard, { backgroundColor: `${C.rouge}E0` }, scanned && { backgroundColor: saving ? C.orange : C.vert }]}>
          <Ionicons name={scanned ? (saving ? 'sync-outline' : 'checkmark-circle') : 'card-outline'} size={22} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={DC.instrTitre}>{saving ? 'Enregistrement...' : scanned ? 'Badge scanné !' : 'Scannez le badge OCP'}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  // ══════════════════════════════════════════════════════════════════
  // VUE PRINCIPALE — LISTE
  // ══════════════════════════════════════════════════════════════════
  return (
    <View style={[S.flex, { backgroundColor: C.fond }]}>
      <View style={S.header}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={C.blanc} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitre}>Équipe d'intervention</Text>
          <Text style={S.hSub}>{demande?.numero_ordre}  ·  TAG {demande?.tag || '—'}</Text>
        </View>
        <TouchableOpacity style={S.backBtn} onPress={charger}>
          <Ionicons name="refresh-outline" size={20} color={C.blanc} />
        </TouchableOpacity>
      </View>

      {peutDeconsigner && !rapportGenere && equipeValidee && (
        <TouchableOpacity style={S.bannerRouge} onPress={handleValiderDeconsignation} disabled={loadingDeconsign}>
          <Ionicons name="lock-open-outline" size={20} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={S.bannerTitre}>Déconsignation possible</Text>
            <Text style={S.bannerSub}>Tous sortis — Générer le rapport PDF</Text>
          </View>
          {loadingDeconsign ? <ActivityIndicator color={C.blanc} size="small" /> : <Ionicons name="chevron-forward" size={18} color={C.blanc} />}
        </TouchableOpacity>
      )}

      {rapportGenere && (
        <TouchableOpacity style={[S.bannerRouge, { backgroundColor: C.vert }]} onPress={() => ouvrirPdf(rapportGenere.pdf_path)}>
          <Ionicons name="document-text-outline" size={20} color={C.blanc} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={S.bannerTitre}>Rapport disponible</Text>
            <Text style={S.bannerSub}>Appuyez pour consulter le PDF</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={C.blanc} />
        </TouchableOpacity>
      )}

      <View style={S.statsRow}>
        {[
          { val: membres.length,              label: 'Total',      color: C.primary, bg: C.primaryLight },
          { val: nbComplets,                  label: 'Complets',   color: C.vert,    bg: C.vertLight    },
          { val: membres.length - nbComplets, label: 'Incomplets', color: C.orange,  bg: C.orangeLight  },
        ].map((s, i) => (
          <View key={i} style={[S.statBox, { borderColor: s.color, backgroundColor: s.bg }]}>
            <Text style={[S.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={[S.statLbl, { color: s.color }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {!equipeValidee && membres.length > 0 && (
        <View style={S.helpBox}>
          <Ionicons name="information-circle-outline" size={15} color={C.primary} />
          <Text style={S.helpTxt}>
            Chaque membre doit avoir <Text style={{ fontWeight: '800' }}>cadenas + badge + photo</Text>.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 200 }}>
        {membres.length === 0 ? (
          <View style={[S.center, { marginTop: 60 }]}>
            <View style={S.emptyIconBox}><Ionicons name="people-outline" size={38} color={C.primary} /></View>
            <Text style={S.emptyTitre}>Aucun membre</Text>
            <Text style={S.emptySub}>Utilisez les boutons ci-dessous pour ajouter des membres</Text>
          </View>
        ) : (
          membres.map(m => (
            <MembreCard
              key={m.id} m={m}
              equipeValidee={equipeValidee}
              modeDeconsignation={equipeValidee && membresSurSite.length > 0}
              updatingId={updatingMembId}
              onRetirer={!equipeValidee ? retirerMembre : undefined}
              onRefaire={!equipeValidee ? lancerRefaire : undefined}
              onValiderMembre={!equipeValidee ? validerUnMembre : undefined}
              onEntreeSite={handleEntreeSingle}
              onSortie={lancerDeconsign}
            />
          ))
        )}
      </ScrollView>

      {/* Barre boutons bas */}
      <View style={S.bottomBar}>
        {!equipeValidee && (
          <>
            <View style={S.rowBtns}>
              <TouchableOpacity style={[S.btnSec, { flex: 1, marginRight: 6 }]} onPress={lancerDepuisListe}>
                <Ionicons name="people-outline" size={16} color={C.primary} />
                <Text style={S.btnSecTxt}>Depuis la liste</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.btnSec, { flex: 1, marginLeft: 6 }]} onPress={lancerNouveauMembre}>
                <Ionicons name="scan-outline" size={16} color={C.primary} />
                <Text style={S.btnSecTxt}>Nouveau scan</Text>
              </TouchableOpacity>
            </View>
            {membres.length > 0 && (
              <TouchableOpacity
                style={[S.btnPrinc, !tousComplets && S.btnDisabled, validatingEquipe && S.btnDis]}
                onPress={validerTouteEquipe} disabled={validatingEquipe}
              >
                {validatingEquipe ? <ActivityIndicator color={C.blanc} /> : (
                  <><Ionicons name="checkmark-done-outline" size={18} color={C.blanc} /><Text style={S.btnPrincTxt}>VALIDER L'ÉQUIPE ({nbComplets}/{membres.length})</Text></>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {equipeValidee && membresEnAttente.length > 0 && (
          <TouchableOpacity style={[S.btnPrinc, loadingEntree && S.btnDis]} onPress={() => { setMembresSelec([]); setModalEntree(true); }} disabled={loadingEntree}>
            <Ionicons name="log-in-outline" size={18} color={C.blanc} />
            <Text style={S.btnPrincTxt}>MARQUER ENTRÉE ({membresEnAttente.length})</Text>
          </TouchableOpacity>
        )}

        {equipeValidee && peutDeconsigner && !rapportGenere && (
          <TouchableOpacity style={[S.btnPrinc, { backgroundColor: C.rouge }, loadingDeconsign && S.btnDis]} onPress={handleValiderDeconsignation} disabled={loadingDeconsign}>
            {loadingDeconsign ? <ActivityIndicator color={C.blanc} /> : (
              <><Ionicons name="lock-open-outline" size={18} color={C.blanc} /><Text style={S.btnPrincTxt}>VALIDER DÉCONSIGNATION + PDF</Text></>
            )}
          </TouchableOpacity>
        )}

        {rapportGenere && (
          <TouchableOpacity style={[S.btnPrinc, { backgroundColor: C.vert }]} onPress={() => ouvrirPdf(rapportGenere.pdf_path)}>
            <Ionicons name="document-text-outline" size={18} color={C.blanc} />
            <Text style={S.btnPrincTxt}>VOIR LE RAPPORT PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal entrée site */}
      <Modal transparent visible={modalEntree} animationType="slide">
        <View style={S.modalBg}>
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitre}>Entrée sur chantier</Text>
            <Text style={S.modalSub}>Qui entre maintenant ?</Text>
            <TouchableOpacity style={S.modalOpt} onPress={() => handleEntree('tous')} disabled={loadingEntree}>
              <View style={[S.modalOptIco, { backgroundColor: C.vertLight }]}>
                <Ionicons name="people" size={26} color={C.vert} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptTitre}>Toute l'équipe</Text>
                <Text style={S.modalOptSub}>{membresEnAttente.length} membre(s) en attente</Text>
              </View>
              {loadingEntree ? <ActivityIndicator color={C.vert} size="small" /> : <Ionicons name="chevron-forward" size={16} color={C.gris} />}
            </TouchableOpacity>
            <TouchableOpacity style={[S.modalOpt, { marginTop: 10 }]} onPress={() => { setModalEntree(false); setMembresSelec([]); setVue('selectionEntree'); }} disabled={loadingEntree}>
              <View style={[S.modalOptIco, { backgroundColor: C.primaryLight }]}>
                <Ionicons name="person-add-outline" size={26} color={C.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={S.modalOptTitre}>Choisir des membres</Text>
                <Text style={S.modalOptSub}>Sélectionner qui entre maintenant</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.gris} />
            </TouchableOpacity>
            <TouchableOpacity style={S.modalAnnuler} onPress={() => setModalEntree(false)}>
              <Text style={{ fontSize: 14, color: C.gris, fontWeight: '600' }}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Styles déconsignation
const FRAME = 220;
const DC = StyleSheet.create({
  header:        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:       { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  titre:         { color: '#fff', fontSize: 14, fontWeight: '700' },
  sub:           { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  stepper:       { position: 'absolute', top: Platform.OS === 'ios' ? 108 : 92, left: 0, right: 0, zIndex: 20, flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 28, backgroundColor: 'rgba(0,0,0,0.5)' },
  stepItem:      { alignItems: 'center', gap: 3 },
  stepCircle:    { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stepNum:       { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.4)' },
  stepLbl:       { fontSize: 8, color: 'rgba(255,255,255,0.4)' },
  overlay:       { ...StyleSheet.absoluteFillObject },
  overlayTop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayRow:    { flexDirection: 'row', height: FRAME },
  overlaySide:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  frame:         { width: FRAME, height: FRAME, borderRadius: 14, overflow: 'hidden' },
  corner:        { position: 'absolute', width: 22, height: 22 },
  successOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,185,129,0.22)', alignItems: 'center', justifyContent: 'center' },
  instrWrap:     { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, gap: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  pillTxt:       { color: '#fff', fontSize: 11, fontWeight: '700' },
  instrCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14 },
  instrTitre:    { color: '#fff', fontSize: 13, fontWeight: '700' },
});

const MCS = StyleSheet.create({
  card:         { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  stripe:       { width: 4, alignSelf: 'stretch' },
  avatar:       { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  avatarImg:    { width: 48, height: 48, borderRadius: 24, marginLeft: 10 },
  avatarTxt:    { fontSize: 18, fontWeight: '800' },
  nom:          { fontSize: 14, fontWeight: '700', color: '#424242' },
  meta:         { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  heure:        { fontSize: 11, marginTop: 3, fontWeight: '600' },
  chips:        { flexDirection: 'row', gap: 4, marginTop: 5 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  chipTxt:      { fontSize: 9, fontWeight: '700' },
  actions:      { alignItems: 'flex-end', paddingRight: 10, paddingVertical: 8 },
  badge:        { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, gap: 3 },
  badgeTxt:     { fontSize: 10, fontWeight: '700' },
  btnsRow:      { flexDirection: 'row', gap: 6, marginTop: 5 },
  btn:          { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btnValider:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2E7D32', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 5 },
  btnValiderTxt:{ color: '#fff', fontSize: 11, fontWeight: '800' },
  btnRond:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});

const S = StyleSheet.create({
  flex:       { flex: 1 },
  center:     { alignItems: 'center', justifyContent: 'center' },
  header:     { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary },
  backBtn:    { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hTitre:     { color: '#fff', fontWeight: '700', fontSize: 16 },
  hSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  bannerRouge:{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.rouge, margin: 14, marginBottom: 0, borderRadius: 16, padding: 14, elevation: 4 },
  bannerTitre:{ color: '#fff', fontWeight: '800', fontSize: 13 },
  bannerSub:  { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  statsRow:   { flexDirection: 'row', margin: 14, marginBottom: 0, gap: 10 },
  statBox:    { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  statVal:    { fontSize: 22, fontWeight: '800' },
  statLbl:    { fontSize: 10, fontWeight: '600', marginTop: 2 },
  helpBox:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: C.primaryLight, borderRadius: 12, margin: 14, marginBottom: 0, padding: 10 },
  helpTxt:    { flex: 1, fontSize: 12, color: C.primary, lineHeight: 17 },
  emptyIconBox:{ width: 76, height: 76, borderRadius: 38, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitre: { fontSize: 15, fontWeight: '700', color: C.grisDark },
  emptySub:   { fontSize: 12, color: C.gris, marginTop: 6, textAlign: 'center' },
  intervNom:  { fontSize: 14, fontWeight: '700', color: C.grisDark },
  intervMeta: { fontSize: 11, color: C.gris, marginTop: 2 },
  selecCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  selecCardOn:{ borderWidth: 1.5, borderColor: C.vert, backgroundColor: '#F1FFF4' },
  selecAv:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bottomBar:  { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 30 : 16, borderTopWidth: 1, borderTopColor: '#E8EDF2', elevation: 10, gap: 8 },
  rowBtns:    { flexDirection: 'row' },
  btnPrinc:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, gap: 8, elevation: 4 },
  btnPrincTxt:{ color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.4 },
  btnDis:     { opacity: 0.5 },
  btnDisabled:{ opacity: 0.45 },
  btnSec:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 11, borderWidth: 1.5, borderColor: C.primary, backgroundColor: C.primaryLight, gap: 6 },
  btnSecTxt:  { fontWeight: '700', fontSize: 12, color: C.primary },
  modalBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHandle:{ width: 38, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 18 },
  modalTitre: { fontSize: 18, fontWeight: '800', color: C.grisDark, marginBottom: 4 },
  modalSub:   { fontSize: 13, color: C.gris, marginBottom: 20 },
  modalOpt:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFB', borderRadius: 16, padding: 14 },
  modalOptIco:{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  modalOptTitre:{ fontSize: 14, fontWeight: '700', color: C.grisDark },
  modalOptSub:{ fontSize: 12, color: C.gris, marginTop: 2 },
  modalAnnuler:{ marginTop: 16, alignItems: 'center', paddingVertical: 12 },
});