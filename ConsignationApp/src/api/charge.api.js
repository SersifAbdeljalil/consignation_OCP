// src/api/charge.api.js
import client from './client';

// ── Liste des demandes à consigner ────────────
export const getDemandesAConsigner = async () => {
  const res = await client.get('/charge/demandes');
  return res.data;
};

// ── Détail demande + plan + points ────────────
export const getDemandeDetail = async (id) => {
  const res = await client.get(`/charge/demandes/${id}`);
  return res.data;
};

// ── Démarrer la consignation ──────────────────
export const demarrerConsignation = async (id) => {
  const res = await client.post(`/charge/demandes/${id}/demarrer`);
  return res.data;
};

// ── Refuser la demande ────────────────────────
// motif: string (obligatoire)
export const refuserDemande = async (id, motif) => {
  const res = await client.post(`/charge/demandes/${id}/refuser`, { motif });
  return res.data;
};

// ── Suspendre / Mettre en attente ─────────────
// motif: string, heure_reprise: string | null
export const suspendreDemande = async (id, motif, heure_reprise = null) => {
  const res = await client.post(`/charge/demandes/${id}/suspendre`, { motif, heure_reprise });
  return res.data;
};

// ── Scanner un cadenas NFC (point prédéfini) ──
// data: { numero_cadenas, mcc_ref }
export const scannerCadenas = async (pointId, data) => {
  const res = await client.post(`/charge/points/${pointId}/cadenas`, data);
  return res.data;
};

// ── Scanner un cadenas libre (sans plan HSE) ──
// data: { demande_id, numero_cadenas, mcc_ref, repere, localisation, dispositif, etat_requis }
export const scannerCadenasLibre = async (data) => {
  const res = await client.post('/charge/cadenas-libre', data);
  return res.data;
};

// ── Enregistrer la photo ──────────────────────
// data: { photo_base64 }
export const enregistrerPhoto = async (id, data) => {
  const res = await client.post(`/charge/demandes/${id}/photo`, data);
  return res.data;
};

// ── Validation finale ─────────────────────────
export const validerConsignation = async (id) => {
  const res = await client.post(`/charge/demandes/${id}/valider`);
  return res.data;
};

// ── Historique du chargé ──────────────────────
export const getHistorique = async () => {
  const res = await client.get('/charge/historique');
  return res.data;
};