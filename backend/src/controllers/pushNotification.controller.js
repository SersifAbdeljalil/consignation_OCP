const db    = require('../config/db');
const axios = require('axios');
const { success, error } = require('../utils/response');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ─── Enregistrer le token ─────────────────────
const enregistrerToken = async (req, res) => {
  try {
    const { token } = req.body;
    const userId    = req.user.id;

    if (!token) return error(res, 'Token requis', 400);

    console.log('[PUSH] Enregistrement — userId:', userId, '| token:', token);

    await db.query(
      `INSERT INTO push_tokens (user_id, token, created_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()`,
      [userId, token]
    );

    const [check] = await db.query(
      'SELECT id, user_id, token FROM push_tokens WHERE user_id = ?',
      [userId]
    );
    console.log('[PUSH] Token en base ✅:', check);

    return success(res, null, 'Token enregistré');
  } catch (err) {
    console.error('enregistrerToken error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── Supprimer le token ───────────────────────
const supprimerToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return error(res, 'Token requis', 400);
    await db.query('DELETE FROM push_tokens WHERE token = ?', [token]);
    return success(res, null, 'Token supprimé');
  } catch (err) {
    console.error('supprimerToken error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── Envoyer push via Expo ────────────────────
const envoyerPushNotification = async (userIds, titre, message, data = {}) => {
  try {
    if (!userIds || userIds.length === 0) return;

    console.log('[PUSH] Recherche tokens pour userIds:', userIds);

    const placeholders = userIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT user_id, token FROM push_tokens WHERE user_id IN (${placeholders})`,
      userIds
    );

    console.log('[PUSH] Tokens trouvés:', rows);

    if (!rows.length) {
      console.log('[PUSH] Aucun token trouvé');
      return;
    }

    const messages = rows.map(r => ({
      to:    r.token,
      sound: 'default',
      title: titre,
      body:  message,
      data:  data,
      badge: 1,
    }));

    const batchSize = 100;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch    = messages.slice(i, i + batchSize);
      const response = await axios.post(EXPO_PUSH_URL, batch, {
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/json',
        },
      });
      console.log('[PUSH] Résultat:', JSON.stringify(response.data));
    }
  } catch (err) {
    console.error('[PUSH] Erreur:', err?.message || err);
  }
};

module.exports = { enregistrerToken, supprimerToken, envoyerPushNotification };