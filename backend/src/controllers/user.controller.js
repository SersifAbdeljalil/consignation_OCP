// src/controllers/user.controller.js
// CORRIGE : colonne type_metier supprimee de la BDD
const bcrypt = require('bcryptjs');
const db     = require('../config/db');
const { success, error } = require('../utils/response');
const { genererCode, envoyerSMS, formaterNumero } = require('../services/sms.service');

const getUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.username, u.matricule,
              u.telephone, u.badge_ocp_id, u.entite, u.zone, u.actif, u.created_at,
              r.nom AS role, r.id AS role_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at DESC`
    );
    return success(res, rows, 'Liste des utilisateurs recuperee');
  } catch (err) {
    console.error('getUsers error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.username, u.matricule,
              u.telephone, u.badge_ocp_id, u.entite, u.zone, u.actif, u.created_at,
              r.nom AS role, r.id AS role_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [id]
    );
    if (!rows.length) return error(res, 'Utilisateur introuvable', 404);
    return success(res, rows[0], 'Utilisateur recupere');
  } catch (err) {
    console.error('getUserById error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// CORRIGE : pas de type_metier dans INSERT (colonne supprimee)
const createUser = async (req, res) => {
  try {
    const {
      nom, prenom, username, mot_de_passe, matricule,
      telephone, badge_ocp_id, role_id, entite, zone
    } = req.body;

    if (!nom || !prenom || !username || !mot_de_passe || !role_id) {
      return error(res, 'Champs obligatoires : nom, prenom, username, mot_de_passe, role_id', 400);
    }
    if (mot_de_passe.length < 6) {
      return error(res, 'Le mot de passe doit contenir au moins 6 caracteres', 400);
    }

    const [roles] = await db.query('SELECT id FROM roles WHERE id = ?', [role_id]);
    if (!roles.length) return error(res, 'Role invalide', 400);

    const [existUser] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existUser.length) return error(res, "Ce nom d'utilisateur est deja pris", 409);

    if (matricule) {
      const [existMat] = await db.query('SELECT id FROM users WHERE matricule = ?', [matricule]);
      if (existMat.length) return error(res, 'Ce matricule est deja utilise', 409);
    }

    if (badge_ocp_id) {
      const [existBadge] = await db.query('SELECT id FROM users WHERE badge_ocp_id = ?', [badge_ocp_id]);
      if (existBadge.length) return error(res, 'Ce badge OCP est deja utilise', 409);
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);

    const [result] = await db.query(
      `INSERT INTO users
         (nom, prenom, username, mot_de_passe, matricule,
          telephone, badge_ocp_id, role_id, entite, zone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nom, prenom, username, hash,
        matricule    || null,
        telephone    || null,
        badge_ocp_id || null,
        role_id,
        entite       || null,
        zone         || null,
      ]
    );

    const [newUser] = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.username, u.matricule,
              u.telephone, u.badge_ocp_id, u.entite, u.zone,
              u.actif, u.created_at,
              r.nom AS role, r.id AS role_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [result.insertId]
    );

    return success(res, newUser[0], 'Utilisateur cree avec succes', 201);
  } catch (err) {
    console.error('createUser error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, prenom, username, matricule,
            telephone, badge_ocp_id, role_id, entite, zone, actif } = req.body;

    const [exist] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (!exist.length) return error(res, 'Utilisateur introuvable', 404);

    if (username) {
      const [existUser] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, id]);
      if (existUser.length) return error(res, "Ce nom d'utilisateur est deja pris", 409);
    }
    if (matricule) {
      const [existMat] = await db.query('SELECT id FROM users WHERE matricule = ? AND id != ?', [matricule, id]);
      if (existMat.length) return error(res, 'Ce matricule est deja utilise', 409);
    }
    if (role_id) {
      const [roles] = await db.query('SELECT id FROM roles WHERE id = ?', [role_id]);
      if (!roles.length) return error(res, 'Role invalide', 400);
    }

    await db.query(
      `UPDATE users SET
        nom          = COALESCE(?, nom),
        prenom       = COALESCE(?, prenom),
        username     = COALESCE(?, username),
        matricule    = COALESCE(?, matricule),
        telephone    = COALESCE(?, telephone),
        badge_ocp_id = COALESCE(?, badge_ocp_id),
        role_id      = COALESCE(?, role_id),
        entite       = COALESCE(?, entite),
        zone         = COALESCE(?, zone),
        actif        = COALESCE(?, actif)
       WHERE id = ?`,
      [nom, prenom, username, matricule, telephone,
       badge_ocp_id, role_id, entite, zone,
       actif !== undefined ? actif : null, id]
    );

    const [updated] = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.username, u.matricule,
              u.telephone, u.badge_ocp_id, u.entite, u.zone, u.actif, u.created_at,
              r.nom AS role, r.id AS role_id
       FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
      [id]
    );
    return success(res, updated[0], 'Utilisateur modifie avec succes');
  } catch (err) {
    console.error('updateUser error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const toggleUserActif = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT id, actif FROM users WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Utilisateur introuvable', 404);
    if (parseInt(id) === req.user.id) {
      return error(res, 'Vous ne pouvez pas desactiver votre propre compte', 400);
    }
    const nouvelEtat = !rows[0].actif;
    await db.query('UPDATE users SET actif = ? WHERE id = ?', [nouvelEtat, id]);
    return success(res, { actif: nouvelEtat },
      nouvelEtat ? 'Compte active avec succes' : 'Compte desactive avec succes');
  } catch (err) {
    console.error('toggleUserActif error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const resetMotDePasse = async (req, res) => {
  try {
    const { id } = req.params;
    const { nouveau_mot_de_passe } = req.body;
    if (!nouveau_mot_de_passe || nouveau_mot_de_passe.length < 6) {
      return error(res, 'Le mot de passe doit contenir au moins 6 caracteres', 400);
    }
    const [rows] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Utilisateur introuvable', 404);
    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await db.query('UPDATE users SET mot_de_passe = ? WHERE id = ?', [hash, id]);
    return success(res, null, 'Mot de passe reinitialise avec succes');
  } catch (err) {
    console.error('resetMotDePasse error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const changerMotDePasse = async (req, res) => {
  try {
    const { ancien_mot_de_passe, nouveau_mot_de_passe, confirmation } = req.body;
    if (!ancien_mot_de_passe || !nouveau_mot_de_passe || !confirmation) {
      return error(res, 'Tous les champs sont requis', 400);
    }
    if (nouveau_mot_de_passe.length < 6) {
      return error(res, 'Le nouveau mot de passe doit contenir au moins 6 caracteres', 400);
    }
    if (nouveau_mot_de_passe !== confirmation) {
      return error(res, 'La confirmation ne correspond pas', 400);
    }
    const [rows] = await db.query('SELECT mot_de_passe FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return error(res, 'Utilisateur introuvable', 404);
    const valide = await bcrypt.compare(ancien_mot_de_passe, rows[0].mot_de_passe);
    if (!valide) return error(res, "L'ancien mot de passe est incorrect", 401);
    const hash = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await db.query('UPDATE users SET mot_de_passe = ? WHERE id = ?', [hash, req.user.id]);
    return success(res, null, 'Mot de passe modifie avec succes');
  } catch (err) {
    console.error('changerMotDePasse error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const getRoles = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM roles ORDER BY id');
    return success(res, rows, 'Roles recuperes');
  } catch (err) {
    console.error('getRoles error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const updateTelephone = async (req, res) => {
  try {
    const { telephone } = req.body;
    if (!telephone || telephone.trim().length < 8) {
      return error(res, 'Numero de telephone invalide', 400);
    }
    const numeroFormate = formaterNumero(telephone.trim());
    const code   = genererCode();
    const expire = new Date(Date.now() + 10 * 60 * 1000);
    await db.query(
      'UPDATE users SET otp_code = ?, otp_expire = ?, otp_telephone = ? WHERE id = ?',
      [code, expire, numeroFormate, req.user.id]
    );
    const sms = await envoyerSMS(numeroFormate, code);
    if (!sms.success) {
      await db.query(
        'UPDATE users SET otp_code=NULL, otp_expire=NULL, otp_telephone=NULL WHERE id=?',
        [req.user.id]
      );
      return error(res, `Echec envoi SMS : ${sms.erreur}`, 500);
    }
    return success(res, { telephone: numeroFormate }, `SMS envoye au ${numeroFormate}`);
  } catch (err) {
    console.error('updateTelephone error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const verifierTelephone = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.toString().length !== 6) {
      return error(res, 'Code invalide - 6 chiffres requis', 400);
    }
    const [rows] = await db.query(
      'SELECT otp_code, otp_expire, otp_telephone FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return error(res, 'Utilisateur introuvable', 404);
    const { otp_code, otp_expire, otp_telephone } = rows[0];
    if (!otp_code || !otp_telephone) {
      return error(res, 'Aucun code en attente', 400);
    }
    if (new Date() > new Date(otp_expire)) {
      await db.query(
        'UPDATE users SET otp_code=NULL, otp_expire=NULL, otp_telephone=NULL WHERE id=?',
        [req.user.id]
      );
      return error(res, 'Code expire', 400);
    }
    if (code.toString() !== otp_code.toString()) {
      return error(res, 'Code incorrect', 400);
    }
    await db.query(
      'UPDATE users SET telephone = ?, otp_code=NULL, otp_expire=NULL, otp_telephone=NULL WHERE id=?',
      [otp_telephone, req.user.id]
    );
    return success(res, { telephone: otp_telephone }, 'Telephone verifie et enregistre !');
  } catch (err) {
    console.error('verifierTelephone error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const getEquipements = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, code_equipement, nom, localisation, type FROM equipements WHERE actif = 1 ORDER BY nom'
    );
    return success(res, rows, 'Equipements recuperes');
  } catch (err) {
    console.error('getEquipements error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const updateTelephoneAdmin = async (req, res) => {
  try {
    const { telephone } = req.body;
    if (!telephone) return error(res, 'Numero requis', 400);
    await db.query('UPDATE users SET telephone = ? WHERE id = ?', [telephone, req.user.id]);
    return success(res, { telephone }, 'Telephone mis a jour');
  } catch (err) {
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getUsers, getUserById, createUser, updateUser,
  toggleUserActif, resetMotDePasse, changerMotDePasse,
  getRoles, updateTelephone, verifierTelephone,
  getEquipements, updateTelephoneAdmin,
};