// src/controllers/equipeIntervention.controller.js
const db = require('../config/db');
const { success, error } = require('../utils/response');
const { envoyerNotification } = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');

// ✅ Tous les statuts où l'équipe peut être enregistrée
const STATUTS_AUTORISES = ['consigne', 'consigne_charge', 'consigne_process'];

// ── GET /equipe-intervention/mes-membres ──────────────────────
const getMesMembres = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ei.*,
              d.numero_ordre,
              e.code_equipement AS tag,
              e.nom             AS equipement_nom
       FROM equipe_intervention ei
       JOIN demandes_consignation d ON ei.demande_id = d.id
       JOIN equipements e           ON d.equipement_id = e.id
       WHERE ei.chef_equipe_id = ?
       ORDER BY ei.created_at DESC`,
      [req.user.id]
    );
    return success(res, rows, 'Membres récupérés');
  } catch (err) {
    console.error('getMesMembres error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /equipe-intervention/:demande_id ──────────────────────
const getEquipe = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.id, d.statut, d.numero_ordre, d.agent_id,
              e.code_equipement AS tag
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       WHERE d.id = ?`,
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    const demande = demandes[0];

    if (!STATUTS_AUTORISES.includes(demande.statut)) {
      return error(res, `Statut invalide pour enregistrer une équipe (statut: ${demande.statut})`, 400);
    }

    const [membres] = await db.query(
      `SELECT * FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?
       ORDER BY created_at ASC`,
      [demande_id, chef_id]
    );

    const equipeValidee = membres.some(m => m.equipe_validee === 1) ? 1 : 0;

    return success(res, {
      demande_id:     parseInt(demande_id),
      membres,
      equipe_validee: equipeValidee,
      tag:            demande.tag,
      numero_ordre:   demande.numero_ordre,
    }, 'Équipe récupérée');
  } catch (err) {
    console.error('getEquipe error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/membre ─────────────────────────
const enregistrerMembre = async (req, res) => {
  try {
    const { demande_id, nom, matricule, badge_ocp_id, numero_cadenas } = req.body;
    const chef_id = req.user.id;

    if (!demande_id || !nom || !nom.trim()) {
      return error(res, 'demande_id et nom sont obligatoires', 400);
    }
    if (!badge_ocp_id && !numero_cadenas) {
      return error(res, 'Badge OCP ou numéro de cadenas est requis', 400);
    }

    const [demandes] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?',
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) {
      return error(res, `Statut invalide pour enregistrer un membre (statut: ${demandes[0].statut})`, 400);
    }

    if (badge_ocp_id) {
      const [existing] = await db.query(
        'SELECT id FROM equipe_intervention WHERE demande_id = ? AND badge_ocp_id = ?',
        [demande_id, badge_ocp_id]
      );
      if (existing.length > 0) {
        return error(res, 'Ce badge est déjà enregistré pour cette demande', 400);
      }
    }

    const [result] = await db.query(
      `INSERT INTO equipe_intervention
         (demande_id, chef_equipe_id, nom, matricule, badge_ocp_id, numero_cadenas, equipe_validee)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        demande_id,
        chef_id,
        nom.trim(),
        matricule?.trim() || null,
        badge_ocp_id?.trim()   || null,
        numero_cadenas?.trim() || null,
      ]
    );

    const [nouveau] = await db.query(
      'SELECT * FROM equipe_intervention WHERE id = ?',
      [result.insertId]
    );

    return success(res, nouveau[0], 'Membre enregistré avec succès', 201);
  } catch (err) {
    console.error('enregistrerMembre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/valider ─────────────
const validerEquipe = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.id, d.statut, d.numero_ordre, d.agent_id,
              e.code_equipement AS tag,
              e.nom             AS equipement_nom,
              l.code            AS lot_code
       FROM demandes_consignation d
       JOIN equipements e  ON d.equipement_id = e.id
       LEFT JOIN lots l    ON d.lot_id = l.id
       WHERE d.id = ?`,
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    const demande = demandes[0];

    if (!STATUTS_AUTORISES.includes(demande.statut)) {
      return error(res, 'La demande doit être consignée pour valider une équipe', 400);
    }

    const [membres] = await db.query(
      'SELECT id FROM equipe_intervention WHERE demande_id = ? AND chef_equipe_id = ?',
      [demande_id, chef_id]
    );
    if (!membres.length) {
      return error(res, 'Enregistrez au moins un membre avant de valider', 400);
    }

    await db.query(
      'UPDATE equipe_intervention SET equipe_validee = 1 WHERE demande_id = ? AND chef_equipe_id = ?',
      [demande_id, chef_id]
    );

    const [chefInfo] = await db.query(
      'SELECT prenom, nom, type_metier FROM users WHERE id = ?',
      [chef_id]
    );
    const chef = chefInfo[0];
    const metierLabel = {
      genie_civil: 'Génie Civil',
      mecanique:   'Mécanique',
      electrique:  'Électrique',
      process:     'Process',
    }[chef.type_metier] || chef.type_metier;

    await envoyerNotification(
      demande.agent_id,
      '👷 Équipe entrée sur chantier',
      `L'équipe ${metierLabel} de ${chef.prenom} ${chef.nom} (${membres.length} membre${membres.length > 1 ? 's' : ''}) est entrée sur le chantier pour la demande ${demande.numero_ordre} — TAG ${demande.tag}.`,
      'intervention',
      `demande/${demande_id}`
    );

    await envoyerPushNotification(
      [demande.agent_id],
      '👷 Équipe entrée sur chantier',
      `Équipe ${metierLabel} (${membres.length} membre${membres.length > 1 ? 's' : ''}) — ${demande.tag}`,
      { demande_id: parseInt(demande_id), statut: demande.statut, action: 'equipe_validee' }
    );

    return success(res, {
      demande_id:     parseInt(demande_id),
      nb_membres:     membres.length,
      equipe_validee: 1,
    }, 'Équipe validée — agent notifié');
  } catch (err) {
    console.error('validerEquipe error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/entree ────────────────
const marquerEntree = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].heure_entree) return error(res, 'Entrée déjà enregistrée', 400);
    await db.query('UPDATE equipe_intervention SET heure_entree = NOW() WHERE id = ?', [id]);
    return success(res, null, "Heure d'entrée enregistrée");
  } catch (err) {
    console.error('marquerEntree error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/sortie ────────────────
const marquerSortie = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (!rows[0].heure_entree) return error(res, "L'entrée n'a pas encore été enregistrée", 400);
    if (rows[0].heure_sortie) return error(res, 'Sortie déjà enregistrée', 400);
    await db.query('UPDATE equipe_intervention SET heure_sortie = NOW() WHERE id = ?', [id]);
    return success(res, null, 'Heure de sortie enregistrée');
  } catch (err) {
    console.error('marquerSortie error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getMesMembres,
  getEquipe,
  enregistrerMembre,
  validerEquipe,
  marquerEntree,
  marquerSortie,
};