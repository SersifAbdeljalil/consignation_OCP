const db = require('../config/db');

/**
 * Envoyer une notification à un utilisateur
 * @param {number} userId - ID du destinataire
 * @param {string} titre - Titre de la notification
 * @param {string} message - Corps du message
 * @param {string} type - Type parmi: demande|validation|rejet|plan|execution|autorisation|intervention|deconsignation|remise_service
 * @param {string|null} lienRef - Lien de référence optionnel (ex: "demande/5")
 */
const envoyerNotification = async (userId, titre, message, type, lienRef = null) => {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, titre, message, type, lien_ref, lu)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, titre, message, type, lienRef]
    );
  } catch (err) {
    // On log mais on ne bloque pas le flux principal
    console.error('envoyerNotification error:', err.message);
  }
};

/**
 * Envoyer une notification à plusieurs utilisateurs
 * @param {number[]} userIds - Tableau d'IDs
 * @param {string} titre
 * @param {string} message
 * @param {string} type
 * @param {string|null} lienRef
 */
const envoyerNotificationMultiple = async (userIds, titre, message, type, lienRef = null) => {
  try {
    if (!userIds || userIds.length === 0) return;
    const values = userIds.map(id => [id, titre, message, type, lienRef, 0]);
    await db.query(
      `INSERT INTO notifications (user_id, titre, message, type, lien_ref, lu)
       VALUES ?`,
      [values]
    );
  } catch (err) {
    console.error('envoyerNotificationMultiple error:', err.message);
  }
};

/**
 * Notifier tous les utilisateurs d'un rôle donné
 * @param {string} roleNom - ex: 'chef_prod', 'hse', 'electricien'
 * @param {string} titre
 * @param {string} message
 * @param {string} type
 * @param {string|null} lienRef
 */
const envoyerNotificationRole = async (roleNom, titre, message, type, lienRef = null) => {
  try {
    const [users] = await db.query(
      `SELECT u.id FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.nom = ? AND u.actif = 1`,
      [roleNom]
    );
    if (!users.length) return;
    const userIds = users.map(u => u.id);
    await envoyerNotificationMultiple(userIds, titre, message, type, lienRef);
  } catch (err) {
    console.error('envoyerNotificationRole error:', err.message);
  }
};

module.exports = {
  envoyerNotification,
  envoyerNotificationMultiple,
  envoyerNotificationRole,
};