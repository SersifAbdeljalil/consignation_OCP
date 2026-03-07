// src/components/chefIntervenant/PrendrePhotoEquipe.js
// Étape 3 — Photo du membre (chef intervenant)
// Inspiré de prendrePhoto.js (chargé) — couleurs bleues #1565C0 au lieu de vert
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
  Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import client from '../../api/client';

// ─── Couleurs chef intervenant (BLEU) ─────────────────────────────────────
const C = {
  primary:      '#1565C0',
  primaryDark:  '#0D47A1',
  primaryLight: '#E3F2FD',
  vert:         '#2E7D32',
  vertLight:    '#E8F5E9',
  rouge:        '#C62828',
  rougeLight:   '#FFEBEE',
  blanc:        '#FFFFFF',
  fond:         '#F0F4F8',
  gris:         '#9E9E9E',
  grisDark:     '#424242',
  card:         '#FFFFFF',
};

export default function PrendrePhotoEquipe({ navigation, route }) {
  const { demande, userMetier, scanParams } = route.params;
  const params = scanParams || {};

  const [photo,  setPhoto]  = useState(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState('');

  const handlePrendrePhoto = async () => {
    setErreur('');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "L'accès à la caméra est nécessaire pour la photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality:       0.65,
      allowsEditing: false,
      exif:          false,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleEnregistrer = async () => {
    if (!photo) { setErreur("Prenez d'abord une photo du membre."); return; }
    setSaving(true);
    setErreur('');
    try {
      const formData = new FormData();
      formData.append('demande_id',   String(demande.id));
      formData.append('nom',          params.nomResolu || params.badge);
      formData.append('badge_ocp_id', params.badge);
      if (params.matricule) formData.append('matricule', params.matricule);
      if (params.cadenas)   formData.append('cad_id',    params.cadenas);
      if (params.membreId)  formData.append('membre_id', String(params.membreId));

      formData.append('photo', {
        uri:  photo,
        name: `photo_membre_${Date.now()}.jpg`,
        type: 'image/jpeg',
      });

      const res = await client.post('/equipe-intervention/membre', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        const nom = params.nomResolu || params.badge;
        // Retour vers GestionEquipe avec refresh
        navigation.navigate('GestionEquipe', { demande, userMetier, refresh: Date.now() });
        Alert.alert(
          params.membreId ? 'Scan refait ✅' : 'Membre ajouté ✅',
          params.membreId
            ? `${params.nomExist || nom} a été mis à jour.`
            : `${nom} rejoint l'équipe.`
        );
      } else {
        setErreur(res.data.message || 'Enregistrement impossible.');
      }
    } catch (e) {
      if (e?.response?.status === 413) setErreur('Photo trop volumineuse. Réessayez.');
      else setErreur(e?.response?.data?.message || 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.fond }}>
      <StatusBar barStyle="light-content" backgroundColor={C.primaryDark} />

      {/* Header — BLEU comme prendrePhoto.js du chargé */}
      <View style={[S.header, { backgroundColor: C.primary }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>
            {params.membreId ? `Refaire — ${params.nomExist}` : 'Étape 3 / 3'}
          </Text>
          <Text style={S.hSub}>Photo du membre</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper : Cadenas ✅ · Badge ✅ · Photo 🔵 */}
      <View style={S.stepper}>
        {['Cadenas', 'Badge', 'Photo'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[
              S.stepCircle,
              i < 2 && { backgroundColor: C.vert },
              i === 2 && { backgroundColor: C.primary },
            ]}>
              {i < 2
                ? <Ionicons name="checkmark" size={14} color="#fff" />
                : <Text style={[S.stepNum, { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[S.stepLbl, i === 2 && { color: C.primary, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 130 }}>

        {/* Résumé membre */}
        <View style={S.resumeCard}>
          <View style={[S.resumeAvatar, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="person" size={28} color={C.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={S.resumeNom}>{params.nomResolu || params.badge || '—'}</Text>
            <Text style={S.resumeMeta}>
              {params.badge || '—'}{params.matricule ? `  ·  ${params.matricule}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
              <View style={[S.chip, { backgroundColor: C.vertLight }]}>
                <Ionicons name="lock-closed" size={10} color={C.vert} />
                <Text style={[S.chipTxt, { color: C.vert }]}>Cadenas ✓</Text>
              </View>
              <View style={[S.chip, { backgroundColor: C.vertLight }]}>
                <Ionicons name="card" size={10} color={C.vert} />
                <Text style={[S.chipTxt, { color: C.vert }]}>Badge ✓</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Instruction */}
        <View style={[S.instructionBox, { backgroundColor: C.primaryLight, borderColor: C.primary }]}>
          <Ionicons name="information-circle-outline" size={20} color={C.primary} />
          <Text style={[S.instructionTxt, { color: C.primaryDark }]}>
            Prenez une photo du visage du membre. La photo est obligatoire pour
            valider l'ajout et sera enregistrée dans le dossier de l'équipe.
          </Text>
        </View>

        {/* Zone photo */}
        {photo ? (
          <View style={S.photoWrap}>
            <Image source={{ uri: photo }} style={S.photo} resizeMode="cover" />
            <View style={S.photoOverlay}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={S.photoTimestampTxt}>{new Date().toLocaleString('fr-MA')}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[S.reprendre, { borderColor: C.primary }]}
              onPress={handlePrendrePhoto}
            >
              <Ionicons name="reload-outline" size={16} color={C.primary} />
              <Text style={[S.reprendreTxt, { color: C.primary }]}>Reprendre la photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[S.photoPlaceholder, { borderColor: C.primary }]}
            onPress={handlePrendrePhoto}
            activeOpacity={0.8}
          >
            <View style={[S.cameraIcon, { backgroundColor: C.primaryLight }]}>
              <Ionicons name="camera-outline" size={40} color={C.primary} />
            </View>
            <Text style={[S.placeholderTxt, { color: C.primary }]}>
              Appuyez pour photographier le membre
            </Text>
            <Text style={S.placeholderSub}>Photo obligatoire — visage bien visible</Text>
            <View style={[S.chip, { backgroundColor: '#FFEBEE', marginTop: 4 }]}>
              <Ionicons name="alert-circle-outline" size={11} color={C.rouge} />
              <Text style={[S.chipTxt, { color: C.rouge }]}>Étape obligatoire</Text>
            </View>
          </TouchableOpacity>
        )}

        {!!erreur && (
          <View style={S.errBox}>
            <Ionicons name="warning-outline" size={14} color={C.rouge} />
            <Text style={S.errTxt}>{erreur}</Text>
          </View>
        )}

        {/* Info équipement */}
        <View style={[S.infoStrip, { backgroundColor: '#F9FAFB' }]}>
          <Ionicons name="hardware-chip-outline" size={14} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={S.infoStripTxt}>{demande.tag} — {demande.equipement_nom || demande.numero_ordre}</Text>
            <Text style={S.infoStripSub}>Photo enregistrée sur le serveur</Text>
          </View>
        </View>

      </ScrollView>

      {/* Bouton bas */}
      <View style={S.bottomBar}>
        <TouchableOpacity
          style={[S.btn, { backgroundColor: photo ? C.primary : '#BDBDBD' }, saving && { opacity: 0.65 }]}
          onPress={handleEnregistrer}
          disabled={!photo || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={S.btnTxt}>Envoi en cours...</Text>
            </>
          ) : (
            <>
              <Ionicons name={photo ? 'checkmark-circle-outline' : 'camera-outline'} size={22} color="#fff" />
              <Text style={S.btnTxt}>
                {photo ? 'ENREGISTRER LE MEMBRE' : "PRENEZ D'ABORD UNE PHOTO"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  header:  { paddingTop: Platform.OS === 'ios' ? 52 : 36, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  stepper:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 28, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 12, fontWeight: '800', color: '#9E9E9E' },
  stepLbl:    { fontSize: 9, color: '#9E9E9E' },

  resumeCard:   { backgroundColor: '#fff', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  resumeAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  resumeNom:    { fontSize: 14, fontWeight: '700', color: '#424242' },
  resumeMeta:   { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  chipTxt:      { fontSize: 10, fontWeight: '700' },

  instructionBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 12, borderWidth: 1, gap: 10, marginBottom: 14 },
  instructionTxt: { flex: 1, fontSize: 12, lineHeight: 18 },

  photoWrap:         { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  photo:             { width: '100%', height: 220, borderRadius: 16 },
  photoOverlay:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  photoTimestampTxt: { color: '#fff', fontSize: 10, fontWeight: '600' },
  reprendre:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, padding: 8, borderWidth: 1.5, borderRadius: 10 },
  reprendreTxt:      { fontSize: 13, fontWeight: '600' },

  photoPlaceholder: { height: 220, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, backgroundColor: '#FAFAFA' },
  cameraIcon:       { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  placeholderTxt:   { fontSize: 14, fontWeight: '700' },
  placeholderSub:   { fontSize: 12, color: '#9E9E9E' },

  errBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, gap: 6, marginBottom: 10 },
  errTxt: { color: '#C62828', fontSize: 12, flex: 1 },

  infoStrip:    { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, marginTop: 4 },
  infoStripTxt: { fontSize: 13, fontWeight: '600', color: '#424242' },
  infoStripSub: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10 },
  btn:       { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTxt:    { color: '#fff', fontSize: 13, fontWeight: '800' },
});