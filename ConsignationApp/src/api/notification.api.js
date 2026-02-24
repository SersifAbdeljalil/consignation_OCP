// src/api/notification.api.js
import client from './client';

// ── Récupérer toutes les notifications
export const getNotifications = async () => {
  const res = await client.get('/notifications');
  return res.data;
};

// ── Notifications non lues seulement
export const getNotificationsNonLues = async () => {
  const res = await client.get('/notifications?non_lues=true');
  return res.data;
};

// ── ✅ NOUVEAU : Notifications d'intervention (pour chefs intervenants)
export const getNotificationsIntervention = async () => {
  const res = await client.get('/notifications?type=intervention');
  return res.data;
};

// ── ✅ NOUVEAU : Notifications d'intervention non lues
export const getNotificationsInterventionNonLues = async () => {
  const res = await client.get('/notifications?type=intervention&non_lues=true');
  return res.data;
};

// ── ✅ NOUVEAU : Compteur notifications intervention non lues
export const getNonLuesCountIntervention = async () => {
  const res = await client.get('/notifications/count?type=intervention');
  return res.data;
};

// ── Compteur notifications non lues (tous types)
export const getNonLuesCount = async () => {
  const res = await client.get('/notifications/count');
  return res.data;
};

// ── Marquer une notification comme lue
export const marquerCommeLue = async (id) => {
  const res = await client.put(`/notifications/${id}/lu`);
  return res.data;
};

// ── Marquer toutes comme lues
export const marquerToutesLues = async () => {
  const res = await client.put('/notifications/toutes-lues');
  return res.data;
};

// ── ✅ NOUVEAU : Marquer toutes les notifications d'intervention comme lues
export const marquerToutesLuesIntervention = async () => {
  const res = await client.put('/notifications/toutes-lues?type=intervention');
  return res.data;
};

// ── Supprimer une notification
export const supprimerNotification = async (id) => {
  const res = await client.delete(`/notifications/${id}`);
  return res.data;
};