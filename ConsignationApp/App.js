// App.js
import React, { useState, useEffect, useRef } from 'react';
import {
  Animated, StatusBar,
  ActivityIndicator, Dimensions, Image,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/styles/variables.css';
import {
  ecouterNotifications,
  ecouterClicNotification,
} from './src/services/pushNotification.service';
// ✅ NE PAS appeler enregistrerPushToken ici — se fait après le login

const { width, height } = Dimensions.get('window');

const SplashScreen = ({ onFinish }) => {
  const scaleAnim   = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacityAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => onFinish());
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={{
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: COLORS.green, opacity: opacityAnim,
    }}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />
      <View style={{
        position: 'absolute', top: -height * 0.08,
        width: width * 1.1, height: width * 1.1,
        borderRadius: width * 0.6,
        backgroundColor: COLORS.greenDark, opacity: 0.3,
      }} />
      <View style={{
        position: 'absolute', bottom: -height * 0.12, right: -width * 0.15,
        width: width * 0.85, height: width * 0.85,
        borderRadius: width * 0.5,
        backgroundColor: COLORS.blue, opacity: 0.2,
      }} />
      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
        <Image
          source={require('./assets/LOGO.png')}
          style={{ width: 220, height: 220, resizeMode: 'contain' }}
        />
      </Animated.View>
      <ActivityIndicator size="small" color={COLORS.white} style={{ position: 'absolute', bottom: 60 }} />
    </Animated.View>
  );
};

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const navigationRef = useRef(null);

  useEffect(() => {
    // ✅ Écouter les notifs reçues (app ouverte) — pas besoin d'être connecté
    const stopEcoute = ecouterNotifications((notif) => {
      console.log('[APP] Nouvelle notif:', notif.request.content.title);
    });

    // ✅ Écouter le clic sur notif (app fermée/background) → navigation auto
    const stopClic = ecouterClicNotification(navigationRef);

    return () => {
      stopEcoute();
      stopClic();
    };
  }, []);

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
    </NavigationContainer>
  );
}