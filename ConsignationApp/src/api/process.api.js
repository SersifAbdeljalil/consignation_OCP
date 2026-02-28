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
// Utilisé dans detailConsignationProcess.js sous le nom demarrerConsignationProcess
export const demarrerConsignationProcess = async (id) => {
  const r = await client.post(`/process/demandes/${id}/demarrer`);
  return r.data;
};

// ── Scanner un cadenas process (point prédéfini) ───────────────────
// Utilisé dans scanCadenasProcess.js sous le nom scannerCadenasProcess
export const scannerCadenasProcess = async (pointId, data) => {
  const r = await client.post(`/process/points/${pointId}/cadenas`, data);
  return r.data;
};

// ── Scanner un cadenas libre process ──────────────────────────────
// Utilisé dans scanCadenasProcess.js sous le nom scannerCadenasLibreProcess
export const scannerCadenasLibreProcess = async (data) => {
  const r = await client.post('/process/cadenas-libre', data);
  return r.data;
};

// ── Valider la consignation process ───────────────────────────────
// Utilisé dans validerProcess.js sous le nom validerConsignationProcess
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

// ── Aliases (compatibilité ancienne API si besoin) ─────────────────
export const demarrerConsignation    = demarrerConsignationProcess;
export const scannerCadenas          = scannerCadenasProcess;
export const scannerCadenasLibre     = scannerCadenasLibreProcess;
export const validerProcess          = validerConsignationProcess;