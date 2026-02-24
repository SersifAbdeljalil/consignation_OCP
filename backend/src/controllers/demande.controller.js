// src/controllers/demande.controller.js
const db = require('../config/db');
const { success, error } = require('../utils/response');
const {
  envoyerNotification,
  envoyerNotificationMultiple,
} = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller'); // ✅ NOUVEAU

// ── Générer numéro ordre unique ──────────────
const genererNumero = async () => {
  const annee = new Date().getFullYear();
  const [rows] = await db.query(
    'SELECT COUNT(*) AS total FROM demandes_consignation WHERE YEAR(created_at) = ?',
    [annee]
  );
  const num = (rows[0].total + 1).toString().padStart(4, '0');
  return `CONS-${annee}-${num}`;
};

// ── POST /demandes — Créer une demande ────────
const creerDemande = async (req, res) => {
  try {
    const { equipement_id, lot_id, raison, types_intervenants } = req.body;
    const agent_id = req.user.id;

    if (!equipement_id || !lot_id || !raison) {
      return error(res, 'LOT, équipement (TAG) et raison sont requis', 400);
    }
    if (!types_intervenants || !Array.isArray(types_intervenants) || types_intervenants.length === 0) {
      return error(res, "Sélectionnez au moins un type d'intervenant", 400);
    }

    const [eq] = await db.query(
      'SELECT id, nom, code_equipement FROM equipements WHERE id = ? AND actif = 1',
      [equipement_id]
    );
    if (!eq.length) return error(res, 'Équipement (TAG) introuvable', 404);

    const [lotRow] = await db.query(
      'SELECT id, code FROM lots WHERE id = ? AND actif = 1',
      [lot_id]
    );
    if (!lotRow.length) return error(res, 'LOT introuvable', 404);

    const [demandeur] = await db.query(
      'SELECT nom, prenom FROM users WHERE id = ?',
      [agent_id]
    );

    const numero_ordre = await genererNumero();
    const tag          = eq[0].code_equipement;
    const lotCode      = lotRow[0].code;
    const demNom       = `${demandeur[0].prenom} ${demandeur[0].nom}`;

    const [result] = await db.query(
      `INSERT INTO demandes_consignation
       (numero_ordre, equipement_id, agent_id, lot, lot_id, raison, types_intervenants, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')`,
      [numero_ordre, equipement_id, agent_id, lotCode, lot_id, raison.trim(), JSON.stringify(types_intervenants)]
    );
    const demandeId = result.insertId;

    // ── NOTIFICATION 1 : Chefs de production ──────────────────
    const [charges] = await db.query(
      `SELECT u.id FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.nom = 'chef_prod' AND u.actif = 1`
    );

    const chefProdIds = charges.map(c => c.id);

    for (const c of charges) {
      await envoyerNotification(
        c.id,
        '📋 Nouvelle demande de consignation',
        `${demNom} — TAG : ${tag} — LOT : ${lotCode}`,
        'demande',
        `demande/${demandeId}`
      );
    }

    // ✅ Push pour chefs production
    await envoyerPushNotification(
      chefProdIds,
      '📋 Nouvelle demande de consignation',
      `${demNom} — TAG : ${tag} — LOT : ${lotCode}`,
      {
        demande_id:     demandeId,
        numero_ordre,
        equipement_nom: eq[0].nom,
        statut:         'en_attente',
      }
    );

    // ── NOTIFICATION 2 : Chefs intervenants ciblés ────────────
    if (types_intervenants.length > 0) {
      const placeholders = types_intervenants.map(() => '?').join(', ');

      const [chefsCibles] = await db.query(
        `SELECT u.id FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE r.nom IN ('chef_genie_civil','chef_mecanique','chef_electrique','chef_process')
           AND u.actif      = 1
           AND u.type_metier IN (${placeholders})`,
        types_intervenants
      );

      if (chefsCibles.length > 0) {
        const chefIds = chefsCibles.map(u => u.id);

        // Notif in-app (existante)
        await envoyerNotificationMultiple(
          chefIds,
          '⚡ Consignation en cours',
          `Le départ ${tag} (LOT : ${lotCode}) va être consigné. Préparez vos équipes à intervenir.`,
          'intervention',
          `demande/${demandeId}`
        );

        // ✅ Push notification pour chefs intervenants
        await envoyerPushNotification(
          chefIds,
          '⚡ Consignation en cours',
          `Le départ ${tag} (LOT : ${lotCode}) va être consigné. Préparez vos équipes à intervenir.`,
          {
            demande_id:     demandeId,
            numero_ordre,
            equipement_nom: eq[0].nom,
            statut:         'en_attente',
          }
        );
      }
    }

    return success(
      res,
      { id: demandeId, numero_ordre, lot: lotCode, tag },
      'Demande soumise avec succès',
      201
    );
  } catch (err) {
    console.error('creerDemande error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /demandes/mes-demandes ───────────────
const getMesDemandes = async (req, res) => {
  try {
    const { statut } = req.query;
    let query = `
      SELECT d.*,
             e.nom             AS equipement_nom,
             e.code_equipement AS tag,
             e.localisation    AS equipement_localisation,
             l.code            AS lot_code,
             l.description     AS lot_description
      FROM demandes_consignation d
      JOIN equipements e ON d.equipement_id = e.id
      LEFT JOIN lots l ON d.lot_id = l.id
      WHERE d.agent_id = ?
    `;
    const params = [req.user.id];
    if (statut) { query += ' AND d.statut = ?'; params.push(statut); }
    query += ' ORDER BY d.created_at DESC';

    const [rows] = await db.query(query, params);
    return success(res, rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    })), 'Demandes récupérées');
  } catch (err) {
    console.error('getMesDemandes error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /demandes/:id ─────────────────────────
const getDemandeById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              e.entite          AS equipement_entite,
              l.code            AS lot_code,
              l.description     AS lot_description,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              u.matricule       AS demandeur_matricule,
              u.zone            AS demandeur_zone
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l ON d.lot_id = l.id
       JOIN users u ON d.agent_id = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    return success(res, {
      ...rows[0],
      types_intervenants: rows[0].types_intervenants
        ? JSON.parse(rows[0].types_intervenants) : [],
    }, 'Demande récupérée');
  } catch (err) {
    console.error('getDemandeById error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = { creerDemande, getMesDemandes, getDemandeById };