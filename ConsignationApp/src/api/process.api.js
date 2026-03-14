// src/api/process.api.js
import client from './client';

// ── Liste des demandes process ─────────────────────────────────────
export const getDemandesProcess = async () => {
  const r = await client.get('/process/demandes');
  return r.data;
};

// ── Détail d'une demande ───────────────────────────────────────────
export const getDemandeDetailProcess = async (id) => {
  const r = await client.get(`/process/demandes/${id}`);
  return r.data;
};

// ── Démarrer la consignation process ──────────────────────────────
export const demarrerConsignationProcess = async (id) => {
  const r = await client.post(`/process/demandes/${id}/demarrer`);
  return r.data;
};

// ── Scanner un cadenas process (point prédéfini) ───────────────────
export const scannerCadenasProcess = async (pointId, data) => {
  const r = await client.post(`/process/points/${pointId}/cadenas`, data);
  return r.data;
};

// ── Scanner un cadenas libre process ──────────────────────────────
export const scannerCadenasLibreProcess = async (data) => {
  const r = await client.post('/process/cadenas-libre', data);
  return r.data;
};

// ── Valider la consignation process ───────────────────────────────
export const validerConsignationProcess = async (id) => {
  const r = await client.post(`/process/demandes/${id}/valider`);
  return r.data;
};

// ── Historique process ─────────────────────────────────────────────
export const getHistoriqueProcess = async () => {
  const r = await client.get('/process/historique');
  return r.data;
};

// ── Servir le PDF ──────────────────────────────────────────────────
export const getPDFProcess = async (id) => {
  const r = await client.get(`/process/demandes/${id}/pdf`);
  return r.data;
};

// ════════════════════════════════════════════════
// ✅ DÉCONSIGNATION — nouvelles fonctions
// ════════════════════════════════════════════════

// ── Liste demandes à déconsigner (process) ────
export const getDemandesADeconsignerProcess = async () => {
  const r = await client.get('/process/demandes-a-deconsigner');
  return r.data;
};

// ── Déconsigner un point process (scan cadenas)
export const deconsignerPointProcess = async (pointId, data) => {
  const r = await client.post(`/process/deconsigner-point/${pointId}`, data);
  return r.data;
};

// ── Valider déconsignation finale (process) ───
export const validerDeconsignationFinaleProcess = async (id) => {
  const r = await client.post(`/process/demandes/${id}/deconsigner`);
  return r.data;
};

// ── Aliases (compatibilité ancienne API) ──────
export const demarrerConsignation    = demarrerConsignationProcess;
export const scannerCadenas          = scannerCadenasProcess;
export const scannerCadenasLibre     = scannerCadenasLibreProcess;
export const validerProcess          = validerConsignationProcess;