// src/components/shared/QrModal.js
// ✅ Affiche un QR code contenant une URL publique du PDF
// ✅ Scan depuis n'importe quel appareil → téléchargement direct dans le navigateur
// ✅ Aucun token dans le QR = sécurisé

import React from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';

const { width: SW } = Dimensions.get('window');

export default function QrModal({ visible, onClose, qrValue, titre, theme }) {
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

          {/* ── QR ── */}
          <View style={S.qrWrap}>
            <View style={S.qrBorder}>
              <QRCode
                value={qrValue}
                size={SW * 0.58}
                color="#1a1a1a"
                backgroundColor="#ffffff"
                quietZone={10}
              />
            </View>
          </View>

          {/* ── Instructions ── */}
          <View style={[S.infoBox, { backgroundColor: theme.bgPale }]}>
            <Ionicons name="phone-portrait-outline" size={22} color={theme.couleur} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[S.infoTitre, { color: theme.couleurDark }]}>
                Comment utiliser ce QR ?
              </Text>
              <Text style={[S.infoTxt, { color: theme.couleur }]}>
                1. Scannez avec un autre téléphone{'\n'}
                2. Le PDF s'ouvre dans le navigateur{'\n'}
                3. Téléchargez-le directement
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
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  closeBtn: {
    width: 32, height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    backgroundColor: '#fafafa',
  },
  qrBorder: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
  },
  infoTitre: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoTxt: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
  fermerBtn: {
    marginHorizontal: 16,
    marginBottom: 20,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  fermerTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});