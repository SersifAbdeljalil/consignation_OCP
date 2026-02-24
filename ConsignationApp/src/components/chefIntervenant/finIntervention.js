// src/components/chefIntervenant/scanBadge.jsx
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = {
  green:     '#2E7D32',
  greenDark: '#1B5E20',
  white:     '#FFFFFF',
  gray:      '#9E9E9E',
};

export default function ScanBadge({ navigation, route }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <StatusBar barStyle="light-content" backgroundColor={C.greenDark} />

      {/* HEADER */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.white} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Scanner Badge</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* CONTENT */}
      <View style={S.center}>
        <Ionicons name="card-outline" size={80} color={C.gray} />
        <Text style={S.title}>Scanner le badge NFC</Text>
        <Text style={S.sub}>Approchez votre badge OCP du téléphone</Text>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  header: {
    backgroundColor: '#2E7D32',
    paddingTop: 50, paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  title:  { fontSize: 20, fontWeight: '800', color: '#212121', marginTop: 20 },
  sub:    { fontSize: 14, color: '#9E9E9E', marginTop: 8, textAlign: 'center' },
});