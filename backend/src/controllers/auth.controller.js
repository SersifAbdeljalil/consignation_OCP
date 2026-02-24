// src/controllers/auth.controller.js
const bcrypt          = require('bcryptjs');
const db              = require('../config/db');
const { generateToken } = require('../utils/jwt');
const { success, error } = require('../utils/response');

// ─── LOGIN ─────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { username, mot_de_passe } = req.body;

    if (!username || !mot_de_passe) {
      return error(res, 'Nom d\'utilisateur et mot de passe requis', 400);
    }

    const [rows] = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.username, u.mot_de_passe,
              u.matricule, u.entite, u.actif, r.nom AS role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = ?`,
      [username]
    );

    if (!rows.length) {
      return error(res, 'Nom d\'utilisateur ou mot de passe incorrect', 401);
    }

    const user = rows[0];

    if (!user.actif) {
      return error(res, 'Compte désactivé, contactez l\'administrateur', 403);
    }

    const mdpValide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!mdpValide) {
      return error(res, 'Nom d\'utilisateur ou mot de passe incorrect', 401);
    }

    const token = generateToken({ id: user.id, role: user.role });

    const { mot_de_passe: _, ...userSansPassword } = user;

    return success(res, { token, user: userSansPassword }, 'Connexion réussie');
  } catch (err) {
    console.error('Login error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── MOI (profil connecté) ─────────────────────────────────
const me = async (req, res) => {
  try {
    return success(res, req.user, 'Profil récupéré');
  } catch (err) {
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── CHANGER MOT DE PASSE ──────────────────────────────────
const changerMotDePasse = async (req, res) => {
  try {
    const { ancien_mot_de_passe, nouveau_mot_de_passe, confirmation } = req.body;
    const userId = req.user.id;

    if (!ancien_mot_de_passe || !nouveau_mot_de_passe || !confirmation) {
      return error(res, 'Tous les champs sont requis', 400);
    }

    if (nouveau_mot_de_passe !== confirmation) {
      return error(res, 'Le nouveau mot de passe et la confirmation ne correspondent pas', 400);
    }

    if (nouveau_mot_de_passe.length < 6) {
      return error(res, 'Le nouveau mot de passe doit contenir au moins 6 caractères', 400);
    }

    const [rows] = await db.query(
      'SELECT mot_de_passe FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return error(res, 'Utilisateur introuvable', 404);
    }

    const ancienValide = await bcrypt.compare(ancien_mot_de_passe, rows[0].mot_de_passe);
    if (!ancienValide) {
      return error(res, 'Ancien mot de passe incorrect', 401);
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);

    await db.query(
      'UPDATE users SET mot_de_passe = ? WHERE id = ?',
      [hash, userId]
    );

    return success(res, null, 'Mot de passe modifié avec succès');
  } catch (err) {
    console.error('Change password error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = { login, me, changerMotDePasse };