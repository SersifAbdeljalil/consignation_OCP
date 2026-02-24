// src/middlewares/role.middleware.js
const { error } = require('../utils/response');

/**
 * roleMiddleware(['admin', 'hse'])
 * Vérifie que le user connecté possède un des rôles autorisés
 */
const roleMiddleware = (rolesAutorises = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Non authentifié', 401);
    }
    if (!rolesAutorises.includes(req.user.role)) {
      return error(res, 'Accès refusé : droits insuffisants', 403);
    }
    next();
  };
};

module.exports = roleMiddleware;