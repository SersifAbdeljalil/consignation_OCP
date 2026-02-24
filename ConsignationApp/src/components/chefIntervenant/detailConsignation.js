// src/components/chefIntervenant/detailConsignation.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal,
  TextInput, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAutorisation,
  ajouterIntervenant,
  marquerEntree,
  marquerSortie,
  supprimerIntervenant,
} from '../../api/intervenant.api';

// ✅ Couleur FIXE bleue pour TOUS les chefs
const CFG = {
  couleur: '#1565C0',
  bg:      '#E3F2FD',
};

const TYPE_OPTS = [
  { key: 'genie_civil', label: 'Génie Civil'  },
  { key: 'mecanique',   label: 'Mécanique'    },
  { key: 'electrique',  label: 'Électricien'  },
  { key: 'process',     label: 'Process'      },
];

// Couleurs des chips de sélection de type (inchangées — juste pour les chips)
const TYPE_CHIP_CFG = {
  genie_civil: { couleur: '#E65100', bg: '#FFF3E0' },
  mecanique:   { couleur: '#1565C0', bg: '#E3F2FD' },
  electrique:  { couleur: '#F57F17', bg: '#FFFDE7' },
  process:     { couleur: '#2E7D32', bg: '#E8F5E9' },
};

const STATUT_LABELS = {
  en_attente:  { color: '#F59E0B', label: 'En attente'  },
  validee:     { color: '#10B981', label: 'Validée'     },
  rejetee:     { color: '#EF4444', label: 'Rejetée'     },
  en_cours:    { color: '#3B82F6', label: 'En cours'    },
  deconsignee: { color: '#8B5CF6', label: 'Déconsignée' },
  cloturee:    { color: '#6B7280', label: 'Clôturée'    },
};

const fmtHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getFullYear()}`;
};

export default function DetailConsignation({ navigation, route }) {
  const { demande }            = route.params;
  const [user, setUser]        = useState(null);
  const [aut, setAut]          = useState(null);
  const [intervenants, setIntervenants] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]    = useState(false);

  const [fPrenom, setFPrenom]       = useState('');
  const [fNom, setFNom]             = useState('');
  const [fMatricule, setFMatricule] = useState('');
  const [fBadge, setFBadge]         = useState('');
  const [fType, setFType]           = useState('');
  const [fErr, setFErr]             = useState('');

  const charger = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('user');
      const u = stored ? JSON.parse(stored) : null;
      setUser(u);
      if (u) setFType(u.type_metier || 'mecanique');

      // ✅ demande.id peut venir du dashboard OU d'une notification
      const demandeId = demande.id;
      if (!demandeId) {
        setLoading(false);
        return;
      }

      const res = await getAutorisation(demandeId);
      if (res?.success) {
        setAut(res.data);
        setIntervenants(res.data.intervenants || []);
      }
      // 404 = autorisation pas encore créée → normal
    } catch (e) {
      // 404 est attendu si l'autorisation n'existe pas encore
      if (e?.response?.status !== 404) {
        console.error('DetailConsignation charger error:', e?.message || e);
      }
    } finally {
      setLoading(false);
    }
  }, [demande.id]);

  useEffect(() => { charger(); }, [charger]);

  const st = STATUT_LABELS[demande.statut] || { color: '#9E9E9E', label: demande.statut || '—' };

  // ── Ajouter intervenant ──────────────────
  const handleAjouter = async () => {
    setFErr('');
    if (!fPrenom.trim() || !fNom.trim()) return setFErr('Prénom et nom obligatoires');
    if (!aut?.id) return setFErr('Autorisation non disponible — attendez que la consignation soit validée');
    setSaving(true);
    try {
      const res = await ajouterIntervenant({
        autorisation_id: aut.id,
        prenom:          fPrenom.trim(),
        nom:             fNom.trim(),
        matricule:       fMatricule.trim() || undefined,
        badge_ocp_id:    fBadge.trim()     || undefined,
        type_metier:     fType,
      });
      if (res.success) {
        setIntervenants(p => [...p, res.data]);
        setFPrenom(''); setFNom(''); setFMatricule(''); setFBadge('');
        setShowModal(false);
        Alert.alert('✅', `${res.data.prenom} ${res.data.nom} ajouté à l'équipe`);
      } else {
        setFErr(res.message || 'Erreur');
      }
    } catch { setFErr('Erreur de connexion'); }
    finally { setSaving(false); }
  };

  // ── Entrée ───────────────────────────────
  const handleEntree = async (id) => {
    try {
      const res = await marquerEntree(id);
      if (res.success) {
        setIntervenants(p => p.map(i =>
          i.id === id ? { ...i, heure_entree: new Date().toISOString() } : i
        ));
      } else Alert.alert('Erreur', res.message);
    } catch { Alert.alert('Erreur', 'Connexion impossible'); }
  };

  // ── Sortie ───────────────────────────────
  const handleSortie = async (id) => {
    Alert.alert('Confirmer sortie', 'Marquer cet intervenant comme sorti du site ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: async () => {
        try {
          const res = await marquerSortie(id);
          if (res.success) {
            setIntervenants(p => p.map(i =>
              i.id === id ? { ...i, heure_sortie: new Date().toISOString() } : i
            ));
          } else Alert.alert('Erreur', res.message);
        } catch { Alert.alert('Erreur', 'Connexion impossible'); }
      }},
    ]);
  };

  // ── Supprimer ────────────────────────────
  const handleSupprimer = (id, nom) => {
    Alert.alert('Supprimer intervenant', `Retirer ${nom} de l'équipe ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          const res = await supprimerIntervenant(id);
          if (res.success) setIntervenants(p => p.filter(i => i.id !== id));
          else Alert.alert('Erreur', res.message);
        } catch { Alert.alert('Erreur', 'Connexion impossible'); }
      }},
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#F5F7FA' }}>
        <ActivityIndicator size="large" color={CFG.couleur} />
      </View>
    );
  }

  // ── Intervenant row ──────────────────────
  const IntRow = ({ item }) => {
    const entree   = !!item.heure_entree;
    const sortie   = !!item.heure_sortie;
    const initiales = `${(item.prenom||'?')[0]}${(item.nom||'?')[0]}`.toUpperCase();
    return (
      <View style={S.intRow}>
        <View style={[S.avatar, { backgroundColor: CFG.bg }]}>
          <Text style={[S.avatarTxt, { color: CFG.couleur }]}>{initiales}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={S.intNom}>{item.prenom} {item.nom}</Text>
          <Text style={S.intMeta}>
            {item.matricule || 'Sans matricule'}
            {item.badge_ocp_id ? `  ·  ${item.badge_ocp_id}` : ''}
          </Text>
          <View style={S.heuresRow}>
            {entree ? (
              <View style={S.hEntree}>
                <Ionicons name="log-in-outline" size={10} color="#10B981" />
                <Text style={S.hEntreeTxt}>Entrée {fmtHeure(item.heure_entree)}</Text>
              </View>
            ) : (
              <View style={S.hAttente}>
                <Ionicons name="time-outline" size={10} color="#F59E0B" />
                <Text style={S.hAttenteTxt}>Pas encore entré</Text>
              </View>
            )}
            {sortie && (
              <View style={S.hSortie}>
                <Ionicons name="log-out-outline" size={10} color="#EF4444" />
                <Text style={S.hSortieTxt}>Sortie {fmtHeure(item.heure_sortie)}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={S.intBtns}>
          {!entree && (
            <TouchableOpacity style={[S.iBtn, { backgroundColor: '#ECFDF5' }]} onPress={() => handleEntree(item.id)}>
              <Ionicons name="log-in-outline" size={17} color="#10B981" />
            </TouchableOpacity>
          )}
          {entree && !sortie && (
            <TouchableOpacity style={[S.iBtn, { backgroundColor: '#FEF2F2' }]} onPress={() => handleSortie(item.id)}>
              <Ionicons name="log-out-outline" size={17} color="#EF4444" />
            </TouchableOpacity>
          )}
          {sortie && (
            <View style={[S.iBtn, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="checkmark-done-outline" size={17} color="#10B981" />
            </View>
          )}
          {!entree && (
            <TouchableOpacity style={[S.iBtn, { backgroundColor: '#F5F5F5', marginTop: 6 }]} onPress={() => handleSupprimer(item.id, `${item.prenom} ${item.nom}`)}>
              <Ionicons name="trash-outline" size={15} color="#BDBDBD" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleur} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Détail Consignation</Text>
          <Text style={S.hSub}>{demande.numero_ordre || '—'}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 50 }}>

        {/* ── Info demande ── */}
        <View style={S.infoCard}>
          <View style={[S.statutRow, { backgroundColor: st.color + '15' }]}>
            <View style={[S.statutDot, { backgroundColor: st.color }]} />
            <Text style={[S.statutLabel, { color: st.color }]}>{st.label}</Text>
            <Text style={S.statutDate}>{fmtDate(demande.created_at)}</Text>
          </View>

          {[
            { icon: 'layers-outline',        lbl: 'LOT',          val: demande.lot_code || demande.lot         },
            { icon: 'hardware-chip-outline', lbl: 'TAG',          val: demande.tag                             },
            { icon: 'cube-outline',          lbl: 'Équipement',   val: demande.equipement_nom                  },
            { icon: 'location-outline',      lbl: 'Localisation', val: demande.equipement_localisation         },
            { icon: 'person-outline',        lbl: 'Demandeur',    val: demande.demandeur_nom                   },
          ].map((r, i) => (
            <View key={i} style={S.infoRow}>
              <Ionicons name={r.icon} size={14} color={CFG.couleur} />
              <Text style={S.infoLbl}>{r.lbl}</Text>
              <Text style={S.infoVal} numberOfLines={2}>{r.val || '—'}</Text>
            </View>
          ))}

          <View style={S.raisonBox}>
            <Ionicons name="document-text-outline" size={14} color={CFG.couleur} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={S.raisonLbl}>Raison de l'intervention</Text>
              <Text style={S.raisonTxt}>{demande.raison || '—'}</Text>
            </View>
          </View>

          {!aut && (
            <View style={S.warnBox}>
              <Ionicons name="time-outline" size={15} color="#D97706" />
              <Text style={S.warnTxt}>
                L'autorisation de travail sera disponible après validation du plan de consignation
              </Text>
            </View>
          )}
        </View>

        {/* ── Section équipe ── */}
        <View style={S.secRow}>
          <Text style={S.secTitle}>Mon Équipe</Text>
          <View style={[S.secCount, { backgroundColor: CFG.bg }]}>
            <Text style={[S.secCountTxt, { color: CFG.couleur }]}>
              {intervenants.length} membre{intervenants.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {aut ? (
          <TouchableOpacity style={[S.addBtn, { borderColor: CFG.couleur }]} onPress={() => setShowModal(true)}>
            <View style={[S.addIcon, { backgroundColor: CFG.bg }]}>
              <Ionicons name="person-add-outline" size={18} color={CFG.couleur} />
            </View>
            <Text style={[S.addTxt, { color: CFG.couleur }]}>Ajouter un membre à l'équipe</Text>
            <Ionicons name="chevron-forward" size={16} color={CFG.couleur} />
          </TouchableOpacity>
        ) : (
          <View style={S.addBtnDisabled}>
            <Ionicons name="lock-closed-outline" size={16} color="#BDBDBD" />
            <Text style={S.addTxtDisabled}>Disponible après validation de la consignation</Text>
          </View>
        )}

        <View style={{ paddingHorizontal: 14 }}>
          {intervenants.length === 0 ? (
            <View style={S.emptyEq}>
              <Ionicons name="people-outline" size={36} color="#BDBDBD" />
              <Text style={S.emptyEqTxt}>
                {aut
                  ? "Aucun intervenant — ajoutez des membres via le bouton +"
                  : "En attente de l'autorisation de travail"}
              </Text>
            </View>
          ) : (
            intervenants.map(item => <IntRow key={item.id} item={item} />)
          )}
        </View>
      </ScrollView>

      {/* ══ Modal ajout intervenant ══ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={S.overlay}>
            <View style={S.modalBox}>
              <View style={[S.modalHeader, { borderBottomColor: '#F0F0F0' }]}>
                <View>
                  <Text style={S.modalTitle}>➕ Ajouter un intervenant</Text>
                  <Text style={S.modalSub}>Autorisation #{aut?.id}</Text>
                </View>
                <TouchableOpacity onPress={() => { setShowModal(false); setFErr(''); }}>
                  <Ionicons name="close" size={24} color="#424242" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={S.fLbl}>Prénom <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput style={S.fInput} placeholder="ex: Mohamed" placeholderTextColor="#BDBDBD" value={fPrenom} onChangeText={t => { setFPrenom(t); setFErr(''); }} autoCapitalize="words" />

                <Text style={S.fLbl}>Nom <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput style={S.fInput} placeholder="ex: El Alami" placeholderTextColor="#BDBDBD" value={fNom} onChangeText={t => { setFNom(t); setFErr(''); }} autoCapitalize="words" />

                <Text style={S.fLbl}>Matricule  <Text style={S.optional}>(optionnel)</Text></Text>
                <TextInput style={S.fInput} placeholder="ex: OCP-12345" placeholderTextColor="#BDBDBD" value={fMatricule} onChangeText={setFMatricule} autoCapitalize="characters" />

                <Text style={S.fLbl}>Badge OCP  <Text style={S.optional}>(optionnel)</Text></Text>
                <TextInput style={S.fInput} placeholder="ex: OCP-GC-0042" placeholderTextColor="#BDBDBD" value={fBadge} onChangeText={setFBadge} />

                <Text style={S.fLbl}>Corps de métier <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <View style={S.typeGrid}>
                  {TYPE_OPTS.map(t => {
                    const tc  = TYPE_CHIP_CFG[t.key];
                    const sel = fType === t.key;
                    return (
                      <TouchableOpacity key={t.key} style={[S.typeChip, sel && { backgroundColor: tc.bg, borderColor: tc.couleur }]} onPress={() => setFType(t.key)}>
                        <Text style={[S.typeChipTxt, sel && { color: tc.couleur, fontWeight: '700' }]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {fErr ? (
                  <View style={S.errBox}>
                    <Ionicons name="warning-outline" size={14} color="#EF4444" />
                    <Text style={S.errTxt}>{fErr}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[S.saveBtn, { backgroundColor: CFG.couleur }, saving && { opacity: 0.65 }]}
                  onPress={handleAjouter}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="person-add-outline" size={18} color="#fff" /><Text style={S.saveBtnTxt}>AJOUTER À L'ÉQUIPE</Text></>
                  }
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  header:   { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:  { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  infoCard:    { backgroundColor: '#fff', margin: 14, borderRadius: 18, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  statutRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12, gap: 8 },
  statutDot:   { width: 8, height: 8, borderRadius: 4 },
  statutLabel: { fontSize: 12, fontWeight: '800', flex: 1 },
  statutDate:  { fontSize: 11, color: '#9E9E9E' },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:     { fontSize: 12, color: '#9E9E9E', width: 85 },
  infoVal:     { flex: 1, fontSize: 13, fontWeight: '600', color: '#212121', textAlign: 'right' },
  raisonBox:   { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10 },
  raisonLbl:   { fontSize: 11, color: '#9E9E9E', marginBottom: 3 },
  raisonTxt:   { fontSize: 13, color: '#424242', lineHeight: 19 },
  warnBox:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginTop: 12, gap: 8 },
  warnTxt:     { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  secRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 8 },
  secTitle:    { fontSize: 14, fontWeight: '700', color: '#424242', flex: 1 },
  secCount:    { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  secCountTxt: { fontSize: 12, fontWeight: '700' },
  addBtn:         { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderStyle: 'dashed', elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, gap: 10 },
  addIcon:        { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addTxt:         { flex: 1, fontSize: 14, fontWeight: '700' },
  addBtnDisabled: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, backgroundColor: '#FAFAFA', borderRadius: 14, padding: 14, gap: 8 },
  addTxtDisabled: { flex: 1, fontSize: 13, color: '#BDBDBD' },
  intRow:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 1 } },
  avatar:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontWeight: '800' },
  intNom:    { fontSize: 14, fontWeight: '700', color: '#212121' },
  intMeta:   { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  heuresRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  hEntree:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  hEntreeTxt: { fontSize: 10, fontWeight: '700', color: '#10B981' },
  hSortie:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  hSortieTxt: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  hAttente:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  hAttenteTxt:{ fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  intBtns:   { alignItems: 'center', gap: 4 },
  iBtn:      { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  emptyEq:    { alignItems: 'center', padding: 30 },
  emptyEqTxt: { fontSize: 13, color: '#9E9E9E', textAlign: 'center', marginTop: 10, lineHeight: 19 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:    { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1 },
  modalTitle:  { fontSize: 17, fontWeight: '700', color: '#212121' },
  modalSub:    { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
  modalBody:   { padding: 18, paddingBottom: 36 },
  fLbl:       { fontSize: 13, fontWeight: '600', color: '#424242', marginTop: 14, marginBottom: 6 },
  optional:   { fontSize: 11, color: '#BDBDBD', fontWeight: '400' },
  fInput:     { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 14, height: 48, fontSize: 15, color: '#212121' },
  typeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  typeChipTxt:{ fontSize: 12, color: '#757575' },
  errBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 10, marginTop: 14, gap: 6 },
  errTxt:     { color: '#EF4444', fontSize: 13, flex: 1 },
  saveBtn:    { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, elevation: 4, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  saveBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
});