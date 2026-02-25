// src/components/charge/prendrePhoto.js
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image,
  StatusBar, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';  // ✅ SDK 54+
import { enregistrerPhoto } from '../../api/charge.api';

const CFG = {
  couleur:     '#2d6a4f',
  couleurDark: '#1b4332',
  bgPale:      '#d8f3dc',
};

export default function PrendrePhoto({ navigation, route }) {
  const { demande, plan, points, badge_id } = route.params;

  const [photo,  setPhoto]  = useState(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState('');

  const handlePrendrePhoto = async () => {
    setErreur('');
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "L'accès à la caméra est nécessaire.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.3,        // ✅ 30% qualité — réduit drastiquement la taille
      allowsEditing: false,
      exif: false,         // ✅ pas de métadonnées EXIF inutiles
    });

    if (!result.canceled && result.assets?.length > 0) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleEnregistrer = async () => {
    if (!photo) { setErreur("Prenez d'abord une photo"); return; }
    setSaving(true);
    setErreur('');

    try {
      const base64 = await FileSystem.readAsStringAsync(photo, {
        encoding: 'base64',
      });

      // ✅ Vérifier la taille avant envoi (~4/3 * taille base64 = taille réelle)
      const estimatedSizeKB = Math.round((base64.length * 3) / 4 / 1024);
      console.log(`[PHOTO] Taille estimée : ${estimatedSizeKB} KB`);

      const ext      = photo.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const dataUri  = `data:${mimeType};base64,${base64}`;

      const res = await enregistrerPhoto(demande.id, { photo_base64: dataUri });

      if (res?.success) {
        navigation.navigate('ValiderConsignation', {
          demande,
          plan,
          points,
          badge_id,
          photo_path: res.data?.photo_path,
        });
      } else {
        setErreur(res?.message || "Erreur lors de l'enregistrement");
      }
    } catch (e) {
      console.error('handleEnregistrer error:', e);
      if (e?.response?.status === 413) {
        setErreur('Photo trop grande. Réessayez avec une qualité réduite.');
      } else {
        setErreur(`Erreur : ${e?.message || 'inconnue'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={CFG.couleurDark} />

      {/* Header */}
      <View style={[S.header, { backgroundColor: CFG.couleur }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={S.hTitle}>Étape 3 / 4</Text>
          <Text style={S.hSub}>Photo du départ consigné</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Stepper */}
      <View style={S.stepper}>
        {['Badge', 'Cadenas', 'Photo', 'Valider'].map((s, i) => (
          <View key={i} style={S.stepItem}>
            <View style={[
              S.stepCircle,
              i < 2 && { backgroundColor: '#10B981' },
              i === 2 && { backgroundColor: CFG.couleur },
            ]}>
              {i < 2
                ? <Ionicons name="checkmark" size={14} color="#fff" />
                : <Text style={[S.stepNum, i === 2 && { color: '#fff' }]}>{i + 1}</Text>
              }
            </View>
            <Text style={[S.stepLbl, i === 2 && { color: CFG.couleur, fontWeight: '700' }]}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1, padding: 20 }}>

        {/* Instruction */}
        <View style={[S.instructionBox, { backgroundColor: CFG.bgPale, borderColor: CFG.couleur }]}>
          <Ionicons name="information-circle-outline" size={20} color={CFG.couleur} />
          <Text style={[S.instructionTxt, { color: CFG.couleurDark }]}>
            Prenez une photo du départ électrique consigné avec tous les cadenas en place.
            Cette photo sera attachée au dossier officiel.
          </Text>
        </View>

        {/* Zone photo */}
        {photo ? (
          <View style={S.photoWrap}>
            <Image source={{ uri: photo }} style={S.photo} resizeMode="cover" />
            <View style={S.photoOverlay}>
              <View style={S.photoTimestamp}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={S.photoTimestampTxt}>
                  {new Date().toLocaleString('fr-MA')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[S.reprendre, { borderColor: CFG.couleur }]}
              onPress={handlePrendrePhoto}
            >
              <Ionicons name="reload-outline" size={16} color={CFG.couleur} />
              <Text style={[S.reprendreTxt, { color: CFG.couleur }]}>Reprendre</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[S.photoPlaceholder, { borderColor: CFG.couleur }]}
            onPress={handlePrendrePhoto}
            activeOpacity={0.8}
          >
            <View style={[S.cameraIcon, { backgroundColor: CFG.bgPale }]}>
              <Ionicons name="camera-outline" size={40} color={CFG.couleur} />
            </View>
            <Text style={[S.placeholderTxt, { color: CFG.couleur }]}>
              Appuyez pour prendre la photo
            </Text>
            <Text style={S.placeholderSub}>Photo obligatoire avant validation</Text>
          </TouchableOpacity>
        )}

        {/* Erreur */}
        {!!erreur && (
          <View style={S.errBox}>
            <Ionicons name="warning-outline" size={14} color="#EF4444" />
            <Text style={S.errTxt}>{erreur}</Text>
          </View>
        )}

        {/* Info demande */}
        <View style={[S.infoStrip, { backgroundColor: '#F9FAFB' }]}>
          <Text style={S.infoStripTxt}>📍 {demande.tag} — {demande.equipement_nom}</Text>
          <Text style={S.infoStripSub}>{points?.length ?? 0} cadenas posés ✅</Text>
          {badge_id && (
            <Text style={[S.infoStripSub, { color: CFG.couleur }]}>🪪 Badge : {badge_id}</Text>
          )}
        </View>
      </View>

      {/* Bouton enregistrer */}
      <View style={S.bottomBar}>
        <TouchableOpacity
          style={[S.btn, { backgroundColor: photo ? CFG.couleur : '#BDBDBD' }, saving && { opacity: 0.65 }]}
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
              <Ionicons name="arrow-forward-circle-outline" size={22} color="#fff" />
              <Text style={S.btnTxt}>
                {photo ? 'ENREGISTRER ET CONTINUER' : "PRENEZ UNE PHOTO D'ABORD"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  header:  { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 36, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  hTitle:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  hSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },

  stepper:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, backgroundColor: '#fff', gap: 20 },
  stepItem:   { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  stepNum:    { fontSize: 12, fontWeight: '800', color: '#9E9E9E' },
  stepLbl:    { fontSize: 9, color: '#9E9E9E' },

  instructionBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 12, borderWidth: 1, gap: 10, marginBottom: 16 },
  instructionTxt: { flex: 1, fontSize: 13, lineHeight: 19 },

  photoWrap:         { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  photo:             { width: '100%', height: 220, borderRadius: 16 },
  photoOverlay:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  photoTimestamp:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  photoTimestampTxt: { color: '#fff', fontSize: 10, fontWeight: '600' },
  reprendre:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, padding: 8, borderWidth: 1.5, borderRadius: 10 },
  reprendreTxt:      { fontSize: 13, fontWeight: '600' },

  photoPlaceholder: { height: 220, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12, backgroundColor: '#FAFAFA' },
  cameraIcon:       { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  placeholderTxt:   { fontSize: 15, fontWeight: '700' },
  placeholderSub:   { fontSize: 12, color: '#9E9E9E' },

  errBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, gap: 6, marginBottom: 10 },
  errTxt: { color: '#EF4444', fontSize: 12, flex: 1 },

  infoStrip:    { borderRadius: 10, padding: 12 },
  infoStripTxt: { fontSize: 13, fontWeight: '600', color: '#424242' },
  infoStripSub: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  bottomBar: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', elevation: 10 },
  btn:       { borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTxt:    { color: '#fff', fontSize: 13, fontWeight: '800' },
});