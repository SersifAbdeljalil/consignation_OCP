// src/services/pushNotification.service.js
// ✅ Compatible Expo Go SDK 53 + Development Build
// Import conditionnel pour éviter le crash natif au top-level

import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_URL = 'http://192.168.1.104:3000';

// ── Vérifier si on est dans Expo Go ──────────────────────────────────────────
const isExpoGo = Constants.appOwnership === 'expo';
const isAndroid = Platform.OS === 'android';

// ✅ Import conditionnel — évite le crash natif sur Expo Go Android SDK 53+
let Notifications = null;
if (!(isExpoGo && isAndroid)) {
  try {
    Notifications = require('expo-notifications');

    // ✅ Handler uniquement si le module est disponible
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.warn('[PUSH] expo-notifications non disponible:', e?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const enregistrerPushToken = async () => {
  try {
    if (!Device.isDevice) {
      console.warn('[PUSH] Simulateur — push non supporté');
      return;
    }

    if (!Notifications) {
      console.warn('[PUSH] Expo Go Android — push désactivé (SDK 53). Utilisez un development build.');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PUSH] Permission refusée');
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.error('[PUSH] projectId manquant dans app.json');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[PUSH] Token Expo valide:', expoPushToken);

    const jwt = await AsyncStorage.getItem('token');
    const response = await fetch(`${API_URL}/api/notifications/enregistrer-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: expoPushToken }),
    });

    const text = await response.text();
    console.log('[PUSH] Status:', response.status);

    if (response.ok) {
      console.log('[PUSH] Token enregistré ✅');
    } else {
      console.error('[PUSH] Erreur serveur:', text);
    }
  } catch (err) {
    console.warn('[PUSH] Non critique — ignoré:', err?.message || err);
  }
};

export const ecouterNotifications = (callback) => {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationReceivedListener(callback);
  return () => sub.remove();
};

export const ecouterClicNotification = (navigationRef) => {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.demande_id && navigationRef?.current) {
      navigationRef.current.navigate('DemandeDetail', { id: data.demande_id });
    }
  });
  return () => sub.remove();
};