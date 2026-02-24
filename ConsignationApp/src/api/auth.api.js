// src/api/auth.api.js
import client from './client';

export const loginUser = async (username, mot_de_passe) => {
  const res = await client.post('/auth/login', { username, mot_de_passe });
  return res.data;
};

export const getMe = async () => {
  const res = await client.get('/auth/me');
  return res.data;
};

export const changerMotDePasse = async (ancien, nouveau, confirmation) => {
  const res = await client.put('/auth/change-password', {
    ancien_mot_de_passe:  ancien,
    nouveau_mot_de_passe: nouveau,
    confirmation,
  });
  return res.data;
};