// src/controllers/notification.controller.js
const db = require('../config/db');
const { success, error } = require('../utils/response');

// ✅ Convertit created_at en heure Maroc (Africa/Casablanca = UTC+1)
// CONVERT_TZ(created_at, '+00:00', '+01:00') garantit l'heure correcte
// quelle que soit la timezone du serveur MySQL

// ── GET /notifications ───────────────────────
const getNotifications = async (req, res) => {
  try {
    const { non_lues, type } = req.query;

    let query = `
      SELECT id, user_id, titre, message, type, lu,
             lien_ref AS lien,
             CONVERT_TZ(created_at, '+00:00', '+01:00') AS created_at
      FROM notifications
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (non_lues === 'true') {
      query += ' AND lu = 0';
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const [rows] = await db.query(query, params);
    return success(res, rows, 'Notifications récupérées');
  } catch (err) {
    console.error('getNotifications error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /notifications/count ─────────────────
const getNonLuesCount = async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND lu = 0';
    const params = [req.user.id];
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    const [rows] = await db.query(query, params);
    return success(res, { count: rows[0].total }, 'Compteur récupéré');
  } catch (err) {
    console.error('getNonLuesCount error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /notifications/non-lues ──────────────
// (utilisé par le dashboard pour le badge de comptage)
const getNotificationsNonLues = async (req, res) => {
  try {
    const { type } = req.query;
    let query = `
      SELECT id, titre, message, type, lu,
             lien_ref AS lien,
             CONVERT_TZ(created_at, '+00:00', '+01:00') AS created_at
      FROM notifications
      WHERE user_id = ? AND lu = 0
    `;
    const params = [req.user.id];
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await db.query(query, params);
    return success(res, rows, 'Notifications non lues récupérées');
  } catch (err) {
    console.error('getNotificationsNonLues error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /notifications/:id/lu ────────────────
const marquerCommeLue = async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET lu = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    return success(res, null, 'Notification marquée comme lue');
  } catch (err) {
    console.error('marquerCommeLue error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /notifications/toutes-lues ───────────
const marquerToutesLues = async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'UPDATE notifications SET lu = 1 WHERE user_id = ?';
    const params = [req.user.id];
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    await db.query(query, params);
    return success(res, null, 'Notifications marquées comme lues');
  } catch (err) {
    console.error('marquerToutesLues error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── DELETE /notifications/:id ─────────────────
const supprimerNotification = async (req, res) => {
  try {
    await db.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    return success(res, null, 'Notification supprimée');
  } catch (err) {
    console.error('supprimerNotification error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getNotifications,
  getNonLuesCount,
  getNotificationsNonLues,
  marquerCommeLue,
  marquerToutesLues,
  supprimerNotification,
};