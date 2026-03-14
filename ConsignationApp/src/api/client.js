// src/api/client.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ UNE SEULE IP À CHANGER ICI POUR TOUT L'APP
export const BASE_URL = 'http://192.168.1.158:3000';

// BASE_URL + /api  — pour les URLs PDF et fichiers
export const API_URL = `${BASE_URL}/api`;

const client = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Ajouter le token JWT à chaque requête ──────────────
client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Gérer l'expiration du token ───────────────────────
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export default client;