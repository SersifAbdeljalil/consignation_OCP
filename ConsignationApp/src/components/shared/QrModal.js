// src/components/shared/QrModal.js
// ✅ QR pointe vers http://IP_locale:PORT/pdf
// ✅ Scan depuis même WiFi → téléchargement automatique dans le navigateur

import React from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';

const { width: SW } = Dimensions.get('window');

export default function QrModal({ visible, onClose, qrValue, titre, theme, serverActif }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={S.overlay}>
        <View style={S.card}>

          {/* ── Header ── */}
          <View style={[S.cardHeader, { backgroundColor: theme.couleur }]}>
            <Ionicons name="qr-code-outline" size={18} color="#fff" />
            <Text style={S.cardTitre} numberOfLines={1}>{titre}</Text>
            <TouchableOpacity onPress={onClose} style={S.closeBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* ── QR ou spinner ── */}
          <View style={S.qrWrap}>
            {serverActif && qrValue ? (
              <View style={S.qrBorder}>
                <QRCode
                  value={qrValue}
                  size={SW * 0.58}
                  color="#1a1a1a"
                  backgroundColor="#ffffff"
                  quietZone={10}
                />
              </View>
            ) : (
              <View style={S.preparationWrap}>
                <Ionicons name="hourglass-outline" size={40} color={theme.couleur} />
                <Text style={[S.preparationTxt, { color: theme.couleur }]}>
                  Préparation du serveur...
                </Text>
              </View>
            )}
          </View>

          {/* ── Instructions ── */}
          <View style={[S.infoBox, { backgroundColor: theme.bgPale }]}>
            <Ionicons name="wifi-outline" size={22} color={theme.couleur} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[S.infoTitre, { color: theme.couleurDark }]}>
                Même réseau WiFi requis
              </Text>
              <Text style={[S.infoTxt, { color: theme.couleur }]}>
                1. Connectez l'autre appareil au même WiFi{'\n'}
                2. Scannez le QR code{'\n'}
                3. Le PDF se télécharge automatiquement
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[S.fermerBtn, { backgroundColor: theme.couleur }]}
            onPress={onClose}
          >
            <Text style={S.fermerTxt}>Fermer</Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTitre: {
    color: '#fff', fontWeight: '700', fontSize: 14, flex: 1,
  },
  closeBtn: {
    width: 32, height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  qrWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 28, backgroundColor: '#fafafa',
    minHeight: 180,
  },
  qrBorder: {
    padding: 12, backgroundColor: '#fff', borderRadius: 16,
    elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.1,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  preparationWrap: {
    alignItems: 'center', gap: 12,
  },
  preparationTxt: {
    fontSize: 13, fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 16, marginBottom: 16,
    padding: 14, borderRadius: 12,
  },
  infoTitre: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  infoTxt:   { fontSize: 12, lineHeight: 20, fontWeight: '500' },
  fermerBtn: {
    marginHorizontal: 16, marginBottom: 20,
    paddingVertical: 13, borderRadius: 12, alignItems: 'center',
  },
  fermerTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});