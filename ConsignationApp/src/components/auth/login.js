import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Animated, StatusBar, KeyboardAvoidingView,
  Platform, ActivityIndicator, Dimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../styles/variables.css';
import S from '../../styles/login.css';
import { loginUser } from '../../api/auth.api';
import { enregistrerPushToken } from '../../services/pushNotification.service';

const { width, height } = Dimensions.get('window');

export default function Login({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [errMsg, setErrMsg]     = useState('');

  const cardAnim    = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardAnim,    { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const redirectByRole = (role) => {
    const routes = {
      agent_production:    'AgentStack',
      chef_prod:           'ChefProdStack',
      hse:                 'HseStack',
      electricien:         'ElecStack',
      chef_electricien:    'ChefElecStack',
      chef_genie_civil:    'ChefIntStack',
      chef_mecanique:      'ChefIntStack',
      chef_electrique:     'ChefIntStack',
      chef_process:        'ChefIntStack',
      chef_intervenant:    'ChefIntStack',
      charge_consignation: 'ChargeStack',   // ✅ AJOUTÉ
      admin:               'AdminStack',
    };
    navigation.replace(routes[role] || 'AgentStack');
  };

  const handleLogin = async () => {
    setErrMsg('');
    if (!username.trim() || !password.trim()) {
      setErrMsg('Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      const data = await loginUser(username.trim(), password);
      if (data.success) {
        await AsyncStorage.setItem('token', data.data.token);
        await AsyncStorage.setItem('user', JSON.stringify(data.data.user));
        await enregistrerPushToken();
        redirectByRole(data.data.user.role);
      } else {
        setErrMsg(data.message || 'Identifiants incorrects');
      }
    } catch (e) {
      console.error('Login error:', e);
      setErrMsg('Impossible de se connecter au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={S.loginContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.greenDark} />

      <View style={S.loginHeader}>
        <View style={S.headerDecoBlue} />
        <View style={S.headerDecoGreen} />
        <Image
          source={require('../../../assets/LOGO.png')}
          style={{ width: 130, height: 130, resizeMode: 'contain' }}
        />
      </View>

      <Animated.View style={[S.loginCard, { transform: [{ translateY: cardAnim }], opacity: opacityAnim }]}>
        <Text style={S.cardTitle}>Connexion</Text>
        <Text style={S.cardSubtitle}>
          Entrez vos identifiants pour accéder à l'application
        </Text>

        <View style={S.inputGroup}>
          <Text style={S.inputLabel}>Nom d'utilisateur</Text>
          <View style={S.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={COLORS.gray} style={{ marginRight: 8 }} />
            <TextInput
              style={S.input}
              placeholder="Votre identifiant"
              placeholderTextColor={COLORS.gray}
              value={username}
              onChangeText={(t) => { setUsername(t); setErrMsg(''); }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={S.inputGroup}>
          <Text style={S.inputLabel}>Mot de passe</Text>
          <View style={S.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.gray} style={{ marginRight: 8 }} />
            <TextInput
              style={S.input}
              placeholder="Votre mot de passe"
              placeholderTextColor={COLORS.gray}
              value={password}
              onChangeText={(t) => { setPassword(t); setErrMsg(''); }}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={S.eyeBtn}>
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.gray}
              />
            </TouchableOpacity>
          </View>
        </View>

        {errMsg ? (
          <View style={S.errorBox}>
            <Ionicons name="warning-outline" size={16} color={COLORS.error} style={{ marginRight: 6 }} />
            <Text style={S.errorText}>{errMsg}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[S.loginBtn, loading && S.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="log-in-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                <Text style={S.loginBtnText}>SE CONNECTER</Text>
              </View>
            )
          }
        </TouchableOpacity>

        <View style={S.separator}>
          <View style={S.separatorLine} />
          <Text style={S.separatorText}>OCP — KOFERT</Text>
          <View style={S.separatorLine} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.gray} style={{ marginRight: 4 }} />
          <Text style={S.helpText}>Mot de passe oublié ? Contactez votre administrateur.</Text>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}