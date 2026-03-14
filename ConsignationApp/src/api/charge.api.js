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
export const refuserDemande = async (id, motif) => {
  const res = await client.post(`/charge/demandes/${id}/refuser`, { motif });
  return res.data;
};

// ── Suspendre / Mettre en attente ─────────────
export const suspendreDemande = async (id, motif, heure_reprise = null) => {
  const res = await client.post(`/charge/demandes/${id}/suspendre`, { motif, heure_reprise });
  return res.data;
};

// ── Scanner un cadenas NFC (point prédéfini) ──
export const scannerCadenas = async (pointId, data) => {
  const res = await client.post(`/charge/points/${pointId}/cadenas`, data);
  return res.data;
};

// ── Scanner un cadenas libre (sans plan HSE) ──
export const scannerCadenasLibre = async (data) => {
  const res = await client.post('/charge/cadenas-libre', data);
  return res.data;
};

// ── Enregistrer la photo ──────────────────────
export const enregistrerPhoto = async (id, data) => {
  const res = await client.post(`/charge/demandes/${id}/photo`, data);
  return res.data;
};

// ── Validation finale consignation ───────────
export const validerConsignation = async (id) => {
  const res = await client.post(`/charge/demandes/${id}/valider`);
  return res.data;
};

// ── Historique du chargé ──────────────────────
export const getHistorique = async () => {
  const res = await client.get('/charge/historique');
  return res.data;
};

// ════════════════════════════════════════════════
// ✅ DÉCONSIGNATION — fonctions corrigées
// ════════════════════════════════════════════════

// ── Liste demandes à déconsigner ──────────────
export const getDemandesADeconsigner = async () => {
  const res = await client.get('/charge/demandes-a-deconsigner');
  return res.data;
};

// ── Détail déconsignation (points + état cadenas) ──
export const getDemandeDeconsignationDetail = async (id) => {
  const res = await client.get(`/charge/demandes/${id}/deconsignation-detail`);
  return res.data;
};

// ── Scanner un cadenas lors de la déconsignation ──
// ✅ NOUVEAU — manquait complètement dans l'ancien fichier
export const scannerCadenasDeconsignation = async (id, point_id, cadenas_scanne) => {
  const res = await client.post(`/charge/demandes/${id}/scanner-decons-cadenas`, {
    point_id,
    cadenas_scanne,
  });
  return res.data;
};

// ── Valider déconsignation finale (chargé) ────
// ✅ FIX : nom corrigé (charge.api exportait validerDeconsignationFinale
//          mais detailDeconsignation.js importait validerDeconsignationFinaleCharge)
// ✅ FIX : badge_id transmis dans le body (avant : body vide → erreur 400 backend)
export const validerDeconsignationFinaleCharge = async (id, badge_id) => {
  const res = await client.post(`/charge/demandes/${id}/deconsigner`, { badge_id });
  return res.data;
};