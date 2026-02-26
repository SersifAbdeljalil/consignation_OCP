// src/middlewares/auth.middleware.js
//
// ✅ Retourne matricule + badge_ocp_id dans req.user
// ✅ Utilisé par scanBadgeNFC pour vérifier le badge par matricule
//
const { verifyToken } = require('../utils/jwt');
const { error }       = require('../utils/response');
const db              = require('../config/db');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, 'Token manquant ou invalide', 401);
    }

    const token   = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const [rows] = await db.query(
      `SELECT u.id,
              u.nom,
              u.prenom,
              u.username,
              u.matricule,
              u.badge_ocp_id,
              u.entite,
              u.zone,
              u.actif,
              u.type_metier,
              u.telephone,
              r.nom AS role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [decoded.id]
    );

    if (!rows.length || !rows[0].actif) {
      return error(res, 'Utilisateur introuvable ou désactivé', 401);
    }

    // 🔍 DEBUG — à retirer en production
    console.log(
      `[AUTH] ${req.method} ${req.path}`,
      `— user: ${rows[0].username}`,
      `| role: ${rows[0].role}`,
      `| matricule: ${rows[0].matricule}`,
      `| badge_ocp_id: ${rows[0].badge_ocp_id}`
    );

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Session expirée, veuillez vous reconnecter', 401);
    }
    return error(res, 'Token invalide', 401);
  }
};

module.exports = authMiddleware;