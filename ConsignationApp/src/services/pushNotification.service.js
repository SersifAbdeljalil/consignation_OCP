import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://192.168.1.104:3000';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export const enregistrerPushToken = async () => {
  try {
    if (!Device.isDevice) {
      console.warn('[PUSH] Simulateur — push non supporté');
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
      console.error('[PUSH] projectId manquant dans app.json !');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[PUSH] Token Expo valide:', expoPushToken);

    const jwt = await AsyncStorage.getItem('token');

    // ✅ URL CORRECTE avec /api
    const response = await fetch(`${API_URL}/api/notifications/enregistrer-token`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: expoPushToken }),
    });

    const text = await response.text();
    console.log('[PUSH] Status:', response.status);
    console.log('[PUSH] Réponse:', text);

    if (response.ok) {
      console.log('[PUSH] Token enregistré sur le serveur ✅');
    } else {
      console.error('[PUSH] Erreur serveur:', text);
    }

  } catch (err) {
    console.error('[PUSH] Erreur:', err?.message || err);
  }
};

export const ecouterNotifications = (callback) => {
  const sub = Notifications.addNotificationReceivedListener(callback);
  return () => sub.remove();
};

export const ecouterClicNotification = (navigationRef) => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.demande_id && navigationRef?.current) {
      navigationRef.current.navigate('DemandeDetail', { id: data.demande_id });
    }
  });
  return () => sub.remove();
};
