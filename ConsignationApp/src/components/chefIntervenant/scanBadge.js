// src/components/chefIntervenant/scanBadge.js
//
// Écran : Détail d'une consignation + Gestion équipe
//   - Voir le détail complet de la demande
//   - Ajouter des membres à l'équipe
//   - Voir la liste des intervenants ajoutés
//
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Modal,
  TextInput, StatusBar, ActivityIndicator,
  Alert, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import {
  getAutorisation,
  ajouterIntervenant,
  marquerEntree,
  marquerSortie,
  supprimerIntervenant,
} from '../../api/intervenant.api';

const TYPE_CFG = {
  genie_civil: { couleur: '#E65100', bg: '#FFF3E0', label: 'Génie Civil'         },
  mecanique:   { couleur: '#1565C0', bg: '#E3F2FD', label: 'Travaux Mécaniques'  },
  electrique:  { couleur: '#F9A825', bg: '#FFFDE7', label: 'Travaux Électriques' },
  process:     { couleur: '#2E7D32', bg: '#E8F5E9', label: 'Process'              },
};

const TYPE_METIER_OPTIONS = [
  { key: 'genie_civil', label: 'Génie Civil'         },
  { key: 'mecanique',   label: 'Mécanique'            },
  { key: 'electrique',  label: 'Électricien'          },
  { key: 'process',     label: 'Process'              },
];

const formatHeure = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
};

export default function ScanBadge({ navigation, route }) {
  const { demande }           = route.params;
  const user                  = useSelector(s => s.auth.user);
  const cfg                   = TYPE_CFG[user?.type_metier] || TYPE_CFG.mecanique;

  const [autorisation, setAutorisation]     = useState(null);
  const [intervenants, setIntervenants]     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showModal, setShowModal]           = useState(false);
  const [saving, setSaving]                 = useState(false);

  // Formulaire ajout intervenant
  const [nom, setNom]                     = useState('');
  const [prenom, setPrenom]               = useState('');
  const [matricule, setMatricule]         = useState('');
  const [badge, setBadge]                 = useState('');
  const [typeMetier, setTypeMetier]       = useState(user?.type_metier || 'mecanique');
  const [formErr, setFormErr]             = useState('');

  const charger = useCallback(async () => {
    try {
      const res = await getAutorisation(demande.id);
      if (res.success) {
        setAutorisation(res.data);
        setIntervenants(res.data.intervenants || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [demande.id]);

  useEffect(() => { charger(); }, [charger]);

  const handleAjouter = async () => {
    setFormErr('');
    if (!nom.trim() || !prenom.trim()) return setFormErr('Nom et prénom obligatoires');

    if (!autorisation?.id) return setFormErr('Autorisation introuvable — consignation non encore validée');

    setSaving(true);
    try {
      const res = await ajouterIntervenant({
        autorisation_id: autorisation.id,
        nom:             nom.trim(),
        prenom:          prenom.trim(),
        matricule:       matricule.trim() || undefined,
        badge_ocp_id:    badge.trim()     || undefined,
        type_metier:     typeMetier,
      });
      if (res.success) {
        setIntervenants(p => [...p, res.data]);
        setNom(''); setPrenom(''); setMatricule(''); setBadge('');
        setShowModal(false);
        Alert.alert('✅ Ajouté', `${res.data.prenom} ${res.data.nom} ajouté à l'équipe`);
      } else {
        setFormErr(res.message || 'Erreur lors de l\'ajout');
      }
    } catch {
      setFormErr('Erreur de connexion');
    } finally {
      setSaving(false);
    }
  };

  const handleEntree = async (id) => {
    try {
      const res = await marquerEntree(id);
      if (res.success) {
        setIntervenants(p => p.map(i => i.id === id ? { ...i, heure_entree: new Date().toISOString() } : i));
      } else {
        Alert.alert('Erreur', res.message);
      }
    } catch { Alert.alert('Erreur', 'Connexion impossible'); }
  };

  const handleSortie = async (id) => {
    try {
      const res = await marquerSortie(id);
      if (res.success) {
        setIntervenants(p => p.map(i => i.id === id ? { ...i, heure_sortie: new Date().toISOString() } : i));
      } else {
        Alert.alert('Erreur', res.message);
      }
    } catch { Alert.alert('Erreur', 'Connexion impossible'); }
  };

  const handleSupprimer = (id, nom) => {
    Alert.alert(
      'Supprimer',
      `Supprimer ${nom} de l'équipe ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            const res = await supprimerIntervenant(id);
            if (res.success) setIntervenants(p => p.filter(i => i.id !== id));
            else Alert.alert('Erreur', res.message);
          } catch { Alert.alert('Erreur', 'Connexion impossible'); }
        }},
      ]
    );
  };

  const renderIntervenant = ({ item }) => {
    const entree = !!item.heure_entree;
    const sortie = !!item.heure_sortie;
    return (
      <View style={S.intCard}>
        {/* Infos */}
        <View style={[S.intAvatar, { backgroundColor: cfg.bg }]}>
          <Text style={[S.intInitiales, { color: cfg.couleur }]}>
            {item.prenom[0]}{item.nom[0]}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={S.intNom}>{item.prenom} {item.nom}</Text>
          <Text style={S.intMeta}>
            {item.matricule || 'Sans matricule'}
            {item.badge_ocp_id ? ` · ${item.badge_ocp_id}` : ''}
          </Text>
          {/* Heures */}
          <View style={S.heuresRow}>
            {entree && (
              <View style={S.heureBadge}>
                <Ionicons name="log-in-outline" size={11} color="#10B981" />
                <Text style={[S.heureText, { color: '#10B981' }]}>
                  Entrée {formatHeure(item.heure_entree)}
                </Text>
              </View>
            )}
            {sortie && (
              <View style={[S.heureBadge, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="log-out-outline" size={11} color="#EF4444" />
                <Text style={[S.heureText, { color: '#EF4444' }]}>
                  Sortie {formatHeure(item.heure_sortie)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={S.intActions}>
          {!entree && (
            <TouchableOpacity
              style={[S.actBtn, { backgroundColor: '#ECFDF5' }]}
              onPress={() => handleEntree(item.id)}
            >
              <Ionicons name="log-in-outline" size={16} color="#10B981" />
            </TouchableOpacity>
          )}
          {entree && !sortie && (
            <TouchableOpacity
              style={[S.actBtn, { backgroundColor: '#FEF2F2' }]}
              onPress={() => handleSortie(item.id)}
            >
              <Ionicons name="log-out-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          )}
          {!entree && (
            <TouchableOpacity
              style={[S.actBtn, { backgroundColor: '#F5F5F5', marginTop: 4 }]}
              onPress={() => handleSupprimer(item.id, `${item.prenom} ${item.nom}`)}
            >
              <Ionicons name="trash-outline" size={16} color="#9E9E9E" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator color={cfg.couleur} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={cfg.couleur} />

      {/* ── Header ── */}
      <View style={[S.header, { backgroundColor: cfg.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.headerTitle}>Détail Consignation</Text>
          <Text style={S.headerSub}>{demande.numero_ordre}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Carte info demande ── */}
        <View style={S.infoCard}>
          <View style={S.infoRow}>
            <Ionicons name="layers-outline" size={14} color={cfg.couleur} />
            <Text style={S.infoLbl}>LOT</Text>
            <Text style={S.infoVal}>{demande.lot_code || demande.lot}</Text>
          </View>
          <View style={S.infoRow}>
            <Ionicons name="hardware-chip-outline" size={14} color={cfg.couleur} />
            <Text style={S.infoLbl}>TAG</Text>
            <Text style={S.infoVal}>{demande.tag}</Text>
          </View>
          <View style={S.infoRow}>
            <Ionicons name="cube-outline" size={14} color={cfg.couleur} />
            <Text style={S.infoLbl}>Équipement</Text>
            <Text style={[S.infoVal, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
              {demande.equipement_nom}
            </Text>
          </View>
          <View style={S.infoRow}>
            <Ionicons name="location-outline" size={14} color={cfg.couleur} />
            <Text style={S.infoLbl}>Localisation</Text>
            <Text style={[S.infoVal, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>
              {demande.equipement_localisation}
            </Text>
          </View>
          <View style={[S.infoRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="document-text-outline" size={14} color={cfg.couleur} />
            <Text style={S.infoLbl}>Raison</Text>
            <Text style={[S.infoVal, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>
              {demande.raison}
            </Text>
          </View>

          {/* Statut autorisation */}
          {!autorisation && (
            <View style={S.warnBox}>
              <Ionicons name="time-outline" size={15} color="#F59E0B" />
              <Text style={S.warnText}>
                Autorisation non encore disponible — en attente de validation et plan de consignation
              </Text>
            </View>
          )}
        </View>

        {/* ── Section Équipe ── */}
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>Mon Équipe</Text>
          <Text style={S.sectionCount}>{intervenants.length} membre{intervenants.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Bouton ajouter */}
        {autorisation && (
          <TouchableOpacity
            style={[S.addBtn, { borderColor: cfg.couleur, backgroundColor: cfg.bg }]}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="person-add-outline" size={18} color={cfg.couleur} />
            <Text style={[S.addBtnText, { color: cfg.couleur }]}>Ajouter un intervenant</Text>
          </TouchableOpacity>
        )}

        {/* Liste intervenants */}
        {intervenants.length === 0
          ? (
            <View style={S.emptyEq}>
              <Ionicons name="people-outline" size={40} color="#BDBDBD" />
              <Text style={S.emptyEqText}>
                {autorisation
                  ? 'Aucun intervenant — appuyez sur + pour ajouter'
                  : 'Disponible après validation de la consignation'}
              </Text>
            </View>
          )
          : intervenants.map(item => (
              <View key={item.id} style={{ paddingHorizontal: 14 }}>
                {renderIntervenant({ item })}
              </View>
            ))
        }
      </ScrollView>

      {/* ══ Modal ajout intervenant ══ */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={S.modalOverlay}>
            <View style={S.modalBox}>
              <View style={S.modalHeader}>
                <Text style={S.modalTitle}>➕ Ajouter un intervenant</Text>
                <TouchableOpacity onPress={() => { setShowModal(false); setFormErr(''); }}>
                  <Ionicons name="close" size={24} color="#424242" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
                {/* Prénom */}
                <Text style={S.fLabel}>Prénom <Text style={S.fReq}>*</Text></Text>
                <TextInput
                  style={S.fInput}
                  placeholder="Prénom"
                  placeholderTextColor="#BDBDBD"
                  value={prenom}
                  onChangeText={t => { setPrenom(t); setFormErr(''); }}
                  autoCapitalize="words"
                />

                {/* Nom */}
                <Text style={S.fLabel}>Nom <Text style={S.fReq}>*</Text></Text>
                <TextInput
                  style={S.fInput}
                  placeholder="Nom de famille"
                  placeholderTextColor="#BDBDBD"
                  value={nom}
                  onChangeText={t => { setNom(t); setFormErr(''); }}
                  autoCapitalize="words"
                />

                {/* Matricule */}
                <Text style={S.fLabel}>Matricule</Text>
                <TextInput
                  style={S.fInput}
                  placeholder="Optionnel"
                  placeholderTextColor="#BDBDBD"
                  value={matricule}
                  onChangeText={setMatricule}
                  autoCapitalize="characters"
                />

                {/* Badge OCP */}
                <Text style={S.fLabel}>Badge OCP</Text>
                <TextInput
                  style={S.fInput}
                  placeholder="Optionnel"
                  placeholderTextColor="#BDBDBD"
                  value={badge}
                  onChangeText={setBadge}
                />

                {/* Type métier */}
                <Text style={S.fLabel}>Corps de métier <Text style={S.fReq}>*</Text></Text>
                <View style={S.typeGrid}>
                  {TYPE_METIER_OPTIONS.map(t => {
                    const tc = TYPE_CFG[t.key];
                    const sel = typeMetier === t.key;
                    return (
                      <TouchableOpacity
                        key={t.key}
                        style={[S.typeChip, sel && { backgroundColor: tc.bg, borderColor: tc.couleur }]}
                        onPress={() => setTypeMetier(t.key)}
                      >
                        <Text style={[S.typeChipText, sel && { color: tc.couleur, fontWeight: '700' }]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Erreur */}
                {formErr ? (
                  <View style={S.errBox}>
                    <Ionicons name="warning-outline" size={14} color="#EF4444" />
                    <Text style={S.errText}>{formErr}</Text>
                  </View>
                ) : null}

                {/* Bouton */}
                <TouchableOpacity
                  style={[S.saveBtn, { backgroundColor: cfg.couleur }, saving && { opacity: 0.65 }]}
                  onPress={handleAjouter}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="person-add-outline" size={18} color="#fff" />
                        <Text style={S.saveBtnText}>AJOUTER À L'ÉQUIPE</Text>
                      </>
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
  // Header
  header:      { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn:     { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 11 },

  // Info card
  infoCard:   { backgroundColor: '#fff', margin: 14, borderRadius: 16, padding: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  infoRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 8 },
  infoLbl:    { fontSize: 12, color: '#9E9E9E', width: 80 },
  infoVal:    { fontSize: 13, fontWeight: '600', color: '#212121' },
  warnBox:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginTop: 12, gap: 8 },
  warnText:   { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: '#424242' },
  sectionCount:  { fontSize: 12, color: '#9E9E9E', backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  // Bouton ajouter
  addBtn:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 10, borderWidth: 1.5, borderRadius: 12, borderStyle: 'dashed', padding: 12, gap: 8 },
  addBtnText: { fontSize: 14, fontWeight: '700' },

  // Intervenant card
  intCard:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
  intAvatar:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  intInitiales:{ fontSize: 15, fontWeight: '800' },
  intNom:     { fontSize: 14, fontWeight: '700', color: '#212121' },
  intMeta:    { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  heuresRow:  { flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  heureBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  heureText:  { fontSize: 10, fontWeight: '700' },
  intActions: { alignItems: 'center', gap: 4 },
  actBtn:     { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Empty equipe
  emptyEq:    { alignItems: 'center', padding: 30 },
  emptyEqText:{ fontSize: 13, color: '#9E9E9E', textAlign: 'center', marginTop: 10, lineHeight: 19 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: '#212121' },

  // Formulaire
  fLabel:     { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6, marginTop: 12 },
  fReq:       { color: '#EF4444' },
  fInput:     { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 12, backgroundColor: '#FAFAFA', paddingHorizontal: 14, height: 48, fontSize: 15, color: '#212121' },
  typeGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  typeChipText:{ fontSize: 12, color: '#757575' },
  errBox:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 10, marginTop: 12, gap: 6 },
  errText:    { color: '#EF4444', fontSize: 13, flex: 1 },
  saveBtn:    { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, elevation: 4, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  saveBtnText:{ color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
});