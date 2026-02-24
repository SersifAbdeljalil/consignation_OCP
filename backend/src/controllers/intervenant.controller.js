// src/controllers/intervenant.controller.js
const db = require('../config/db');
const { success, error } = require('../utils/response');

const TYPES_VALIDES = ['genie_civil', 'mecanique', 'electrique', 'process'];

// ─── GET /intervenants/mes-demandes ───────────────────────
// Le chef intervenant voit TOUTES les demandes qui contiennent
// son type_metier — y compris en_attente (nouvelle demande soumise)
const getMesDemandes = async (req, res) => {
  try {
    const chefType = req.user.type_metier;
    if (!chefType) return error(res, 'Type métier non défini pour cet utilisateur', 400);

    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              l.code            AS lot_code,
              l.description     AS lot_description,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              u.matricule       AS demandeur_matricule
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       JOIN users u ON d.agent_id = u.id
       LEFT JOIN lots l ON d.lot_id = l.id
       WHERE d.statut IN ('en_attente', 'validee', 'en_cours', 'deconsignee', 'cloturee')
         AND JSON_CONTAINS(d.types_intervenants, ?, '$')
       ORDER BY d.created_at DESC`,
      [JSON.stringify(chefType)]
    );

    const demandes = rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    }));

    return success(res, demandes, 'Demandes récupérées');
  } catch (err) {
    console.error('getMesDemandes error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── GET /intervenants/autorisation/:demande_id ────────────
const getAutorisation = async (req, res) => {
  try {
    const { demande_id } = req.params;

    const [aut] = await db.query(
      `SELECT at.*,
              p.id              AS plan_id,
              p.statut          AS plan_statut,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation,
              d.numero_ordre,
              d.lot,
              d.raison,
              d.types_intervenants,
              d.statut          AS demande_statut,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom
       FROM autorisations_travail at
       JOIN plans_consignation p    ON at.plan_id = p.id
       JOIN demandes_consignation d ON p.demande_id = d.id
       JOIN equipements e           ON d.equipement_id = e.id
       JOIN users u                 ON d.agent_id = u.id
       WHERE p.demande_id = ?`,
      [demande_id]
    );

    if (!aut.length) return error(res, 'Autorisation introuvable pour cette demande', 404);

    const [intervenants] = await db.query(
      `SELECT i.*,
              CONCAT(c.prenom, ' ', c.nom) AS chef_nom
       FROM intervenants i
       JOIN users c ON i.chef_equipe_id = c.id
       WHERE i.autorisation_id = ?
       ORDER BY i.created_at`,
      [aut[0].id]
    );

    return success(res, {
      ...aut[0],
      types_intervenants: aut[0].types_intervenants
        ? JSON.parse(aut[0].types_intervenants) : [],
      intervenants,
    }, 'Autorisation récupérée');
  } catch (err) {
    console.error('getAutorisation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── GET /intervenants/mes-intervenants ───────────────────
const getMesIntervenants = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.*,
              at.statut         AS autorisation_statut,
              d.numero_ordre,
              e.code_equipement AS tag,
              e.nom             AS equipement_nom
       FROM intervenants i
       JOIN autorisations_travail at ON i.autorisation_id = at.id
       JOIN plans_consignation p     ON at.plan_id = p.id
       JOIN demandes_consignation d  ON p.demande_id = d.id
       JOIN equipements e            ON d.equipement_id = e.id
       WHERE i.chef_equipe_id = ?
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    return success(res, rows, 'Intervenants récupérés');
  } catch (err) {
    console.error('getMesIntervenants error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── POST /intervenants/ajouter ───────────────────────────
const ajouterIntervenant = async (req, res) => {
  try {
    const { autorisation_id, nom, prenom, matricule, badge_ocp_id, type_metier } = req.body;

    if (!autorisation_id || !nom || !prenom || !type_metier)
      return error(res, 'Champs requis : autorisation_id, nom, prenom, type_metier', 400);

    if (!TYPES_VALIDES.includes(type_metier))
      return error(res, `type_metier invalide. Valeurs : ${TYPES_VALIDES.join(', ')}`, 400);

    const [aut] = await db.query(
      'SELECT id FROM autorisations_travail WHERE id = ?', [autorisation_id]
    );
    if (!aut.length) return error(res, 'Autorisation introuvable', 404);

    const [result] = await db.query(
      `INSERT INTO intervenants
         (autorisation_id, nom, prenom, matricule, badge_ocp_id, type_metier, chef_equipe_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [autorisation_id, nom.trim(), prenom.trim(),
       matricule || null, badge_ocp_id || null,
       type_metier, req.user.id]
    );

    const [nouveau] = await db.query(
      'SELECT * FROM intervenants WHERE id = ?', [result.insertId]
    );

    return success(res, nouveau[0], 'Intervenant ajouté avec succès', 201);
  } catch (err) {
    console.error('ajouterIntervenant error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── PUT /intervenants/:id/entree ─────────────────────────
const marquerEntree = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM intervenants WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Intervenant introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id)
      return error(res, 'Non autorisé — pas votre intervenant', 403);
    if (rows[0].heure_entree)
      return error(res, 'Entrée déjà enregistrée', 400);

    await db.query('UPDATE intervenants SET heure_entree = NOW() WHERE id = ?', [id]);
    return success(res, null, 'Heure d\'entrée enregistrée');
  } catch (err) {
    console.error('marquerEntree error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── PUT /intervenants/:id/sortie ─────────────────────────
const marquerSortie = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM intervenants WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Intervenant introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id)
      return error(res, 'Non autorisé — pas votre intervenant', 403);
    if (!rows[0].heure_entree)
      return error(res, 'L\'entrée n\'a pas encore été enregistrée', 400);
    if (rows[0].heure_sortie)
      return error(res, 'Sortie déjà enregistrée', 400);

    await db.query('UPDATE intervenants SET heure_sortie = NOW() WHERE id = ?', [id]);
    return success(res, null, 'Heure de sortie enregistrée');
  } catch (err) {
    console.error('marquerSortie error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─── DELETE /intervenants/:id ─────────────────────────────
const supprimerIntervenant = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM intervenants WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Intervenant introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id)
      return error(res, 'Non autorisé — pas votre intervenant', 403);
    if (rows[0].heure_entree)
      return error(res, 'Impossible — intervenant déjà entré sur site', 400);

    await db.query('DELETE FROM intervenants WHERE id = ?', [id]);
    return success(res, null, 'Intervenant supprimé');
  } catch (err) {
    console.error('supprimerIntervenant error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getMesDemandes,
  getAutorisation,
  getMesIntervenants,
  ajouterIntervenant,
  marquerEntree,
  marquerSortie,
  supprimerIntervenant,
};