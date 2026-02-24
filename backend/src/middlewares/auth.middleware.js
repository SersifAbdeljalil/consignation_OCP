// src/middlewares/auth.middleware.js
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
      `SELECT u.id, u.nom, u.prenom, u.username, u.matricule,
              u.entite, u.zone, u.actif,
              u.type_metier,
              r.nom AS role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [decoded.id]
    );

    if (!rows.length || !rows[0].actif) {
      return error(res, 'Utilisateur introuvable ou desactive', 401);
    }

    // 🔍 DEBUG — à retirer en production
    console.log(`[AUTH] ${req.method} ${req.path} — user: ${rows[0].username} | role: ${rows[0].role} | type_metier: ${rows[0].type_metier}`);

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Session expiree, veuillez vous reconnecter', 401);
    }
    return error(res, 'Token invalide', 401);
  }
};

module.exports = authMiddleware;