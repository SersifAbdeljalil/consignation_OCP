// src/api/demande.api.js
//
// ✅ FIX — Ajout de demanderDeconsignation() qui utilise le client axios
//   Avant : detailDemande.js utilisait fetch() direct avec AsyncStorage.getItem('token')
//           → Risque d'erreur réseau / token manquant / URL incorrecte
//   Après : utilise client axios (token automatique, BASE_URL centralisé)

import client from './client';

export const creerDemande = async (data) => {
  const res = await client.post('/demandes', data);
  return res.data;
};

export const getMesDemandes = async (statut = null) => {
  const params = statut ? { statut } : {};
  const res = await client.get('/demandes/mes-demandes', { params });
  return res.data;
};

export const getDemandeById = async (id) => {
  const res = await client.get(`/demandes/${id}`);
  return res.data;
};

// ✅ NOUVEAU — Demander la déconsignation finale (notifie chargé et/ou process)
// Remplace le fetch() manuel dans detailDemande.js
export const demanderDeconsignation = async (demandeId) => {
  const res = await client.post(`/demandes/${demandeId}/demander-deconsignation`);
  return res.data;
};

export const getLots = async () => {
  const res = await client.get('/lots');
  return res.data;
};

export const getEquipementsParLot = async (lotId) => {
  const res = await client.get(`/lots/${lotId}/equipements`);
  return res.data;
};