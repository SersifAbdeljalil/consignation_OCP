// src/controllers/process.controller.js
// Chef Process — gère les points charge_type='process'
// Workflow identique au chargé mais limité aux points process
const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const { success, error } = require('../utils/response');
const {
  envoyerNotification,
  envoyerNotificationMultiple,
} = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');

// ── Demandes où "process" est dans types_intervenants ──────────────
const getDemandesAConsigner = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              l.code            AS lot_code,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users u       ON d.agent_id = u.id
       WHERE d.statut IN ('en_attente', 'en_cours', 'validee')
         AND JSON_CONTAINS(d.types_intervenants, '"process"')
       ORDER BY d.created_at DESC`
    );
    return success(res, rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    })), 'Demandes récupérées');
  } catch (err) {
    console.error('process.getDemandesAConsigner error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Détail d'une demande ───────────────────────────────────────────
const getDemandeDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const [demandes] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              e.entite          AS equipement_entite,
              l.code            AS lot_code,
              l.description     AS lot_description,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              u.matricule       AS demandeur_matricule
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users u       ON d.agent_id = u.id
       WHERE d.id = ?`,
      [id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    demande.types_intervenants = demande.types_intervenants
      ? JSON.parse(demande.types_intervenants) : [];

    const [plans] = await db.query(
      `SELECT p.*,
              CONCAT(ue.prenom, ' ', ue.nom) AS etabli_nom,
              CONCAT(ua.prenom, ' ', ua.nom) AS approuve_nom
       FROM plans_consignation p
       LEFT JOIN users ue ON p.etabli_par   = ue.id
       LEFT JOIN users ua ON p.approuve_par = ua.id
       WHERE p.demande_id = ?`,
      [id]
    );
    const plan = plans[0] || null;

    let points = [];
    if (plan) {
      const [pts] = await db.query(
        `SELECT pc.*,
                ex.numero_cadenas,
                ex.mcc_ref,
                ex.date_consigne,
                ex.charge_type  AS exec_charge_type,
                CONCAT(uc.prenom, ' ', uc.nom) AS consigne_par_nom
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         LEFT JOIN users uc ON ex.consigne_par = uc.id
         WHERE pc.plan_id = ?
         ORDER BY pc.numero_ligne ASC`,
        [plan.id]
      );
      points = pts;
    }
    return success(res, { demande, plan, points }, 'Détail récupéré');
  } catch (err) {
    console.error('process.getDemandeDetail error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Démarrer (marquer en_cours si pas déjà) ───────────────────────
const demarrerConsignation = async (req, res) => {
  try {
    const { id } = req.params;
    const process_id = req.user.id;
    const [rows] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?', [id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    if (rows[0].statut === 'en_cours') return success(res, null, 'Consignation déjà en cours');
    // Ne pas écraser charge_id — juste passer en_cours si en_attente
    await db.query(
      `UPDATE demandes_consignation SET statut='en_cours', updated_at=NOW() WHERE id=? AND statut='en_attente'`,
      [id]
    );
    return success(res, null, 'Consignation process démarrée');
  } catch (err) {
    console.error('process.demarrerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Scanner un cadenas process (par point_id) ─────────────────────
const scannerCadenas = async (req, res) => {
  try {
    const { pointId } = req.params;
    const { numero_cadenas, mcc_ref } = req.body;
    const process_id = req.user.id;

    if (!numero_cadenas) return error(res, 'numero_cadenas est requis', 400);
    const mccRefVal = mcc_ref || '';

    const [points] = await db.query(
      'SELECT id, charge_type FROM points_consignation WHERE id=?', [pointId]
    );
    if (!points.length) return error(res, 'Point introuvable', 404);

    // Vérifier que c'est bien un point process
    if (points[0].charge_type !== 'process') {
      return error(res, 'Ce point n\'est pas de type process', 403);
    }

    const [existant] = await db.query(
      'SELECT id FROM executions_consignation WHERE point_id=?', [pointId]
    );
    if (existant.length > 0) {
      await db.query(
        `UPDATE executions_consignation
         SET numero_cadenas=?, mcc_ref=?, consigne_par=?, date_consigne=NOW(), charge_type='process'
         WHERE point_id=?`,
        [numero_cadenas, mccRefVal, process_id, pointId]
      );
    } else {
      await db.query(
        `INSERT INTO executions_consignation
           (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type)
         VALUES (?,?,?,?,NOW(),'process')`,
        [pointId, numero_cadenas, mccRefVal, process_id]
      );
    }
    await db.query(
      `UPDATE points_consignation SET statut='consigne' WHERE id=?`, [pointId]
    );
    return success(res, { pointId, numero_cadenas, mcc_ref: mccRefVal }, 'Cadenas process scanné');
  } catch (err) {
    console.error('process.scannerCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Scanner un cadenas libre (créer point à la volée) ─────────────
const scannerCadenasLibre = async (req, res) => {
  try {
    const { demande_id, numero_cadenas, mcc_ref, repere, localisation, dispositif, etat_requis } = req.body;
    const process_id = req.user.id;

    if (!demande_id || !numero_cadenas) return error(res, 'demande_id et numero_cadenas sont requis', 400);
    const mccRefVal = mcc_ref || '';

    let [plans] = await db.query('SELECT id FROM plans_consignation WHERE demande_id=?', [demande_id]);
    let plan_id;
    if (plans.length === 0) {
      const [planResult] = await db.query(
        `INSERT INTO plans_consignation (demande_id, etabli_par, approuve_par, date_etabli, date_approuve, statut, remarques)
         VALUES (?,?,?,NOW(),NOW(),'en_execution','Plan créé automatiquement par process')`,
        [demande_id, process_id, process_id]
      );
      plan_id = planResult.insertId;
    } else {
      plan_id = plans[0].id;
      await db.query(
        `UPDATE plans_consignation SET statut='en_execution', updated_at=NOW() WHERE id=?`, [plan_id]
      );
    }

    const [lineCount] = await db.query(
      'SELECT MAX(numero_ligne) AS max_ligne FROM points_consignation WHERE plan_id=?', [plan_id]
    );
    const nextLigne = (lineCount[0].max_ligne || 0) + 1;

    const [pointResult] = await db.query(
      `INSERT INTO points_consignation
         (plan_id, numero_ligne, repere_point, localisation, dispositif_condamnation, etat_requis, electricien_id, statut, charge_type)
       VALUES (?,?,?,?,?,?,?,'consigne','process')`,
      [plan_id, nextLigne, repere || `Point-P${nextLigne}`, localisation || '—',
       dispositif || '—', etat_requis || 'ouvert', process_id]
    );
    const point_id = pointResult.insertId;

    await db.query(
      `INSERT INTO executions_consignation (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type)
       VALUES (?,?,?,?,NOW(),'process')`,
      [point_id, numero_cadenas, mccRefVal, process_id]
    );

    return success(res, { point_id, plan_id, numero_cadenas, mcc_ref: mccRefVal, numero_ligne: nextLigne }, 'Cadenas process enregistré');
  } catch (err) {
    console.error('process.scannerCadenasLibre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Valider la partie process ─────────────────────────────────────
// ✅ FIX : UPDATE statut='consigne' + date_validation ajoutés
const validerConsignation = async (req, res) => {
  try {
    const { id } = req.params;
    const process_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              e.localisation AS equipement_localisation, e.entite AS equipement_entite,
              l.code AS lot_code, CONCAT(ua.prenom,' ',ua.nom) AS demandeur_nom,
              ua.id AS agent_id_val
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l ON d.lot_id = l.id
       JOIN users ua ON d.agent_id = ua.id
       WHERE d.id=?`, [id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    demande.types_intervenants = demande.types_intervenants ? JSON.parse(demande.types_intervenants) : [];

    const [plans] = await db.query(
      'SELECT id FROM plans_consignation WHERE demande_id=?', [id]
    );
    const plan = plans[0] || null;

    if (plan) {
      const [pointsProcess] = await db.query(
        `SELECT pc.id, pc.repere_point, ex.numero_cadenas
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         WHERE pc.plan_id = ? AND pc.charge_type = 'process'`,
        [plan.id]
      );

      if (pointsProcess.length > 0) {
        const nonConsignes = pointsProcess.filter(p => !p.numero_cadenas);
        if (nonConsignes.length > 0) {
          return error(res, `${nonConsignes.length} point(s) process non consigné(s)`, 400);
        }
      }
    }

    const [processInfo] = await db.query(
      'SELECT prenom, nom, matricule FROM users WHERE id=?', [process_id]
    );
    if (!processInfo.length) return error(res, 'Chef Process introuvable', 404);
    const chef = processInfo[0];

    // ✅ FIX PRINCIPAL — Mettre à jour le statut + date_validation
    await db.query(
      `UPDATE demandes_consignation
       SET statut = 'consigne',
           date_validation = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [id]
    );

    // Notifier l'agent demandeur
    await envoyerNotification(
      demande.agent_id_val,
      '⚙️ Consignation process effectuée',
      `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} : les points process sont consignés par ${chef.prenom} ${chef.nom}.`,
      'execution',
      `demande/${id}`
    );
    await envoyerPushNotification(
      [demande.agent_id_val],
      '⚙️ Consignation process effectuée',
      `${demande.numero_ordre} — points process consignés`,
      { demande_id: id, statut: 'process_consigne' }
    );

    // Notifier les chefs intervenants sélectionnés
    const types = demande.types_intervenants || [];
    if (types.length > 0) {
      const roleNomMap = {
        genie_civil: 'chef_genie_civil',
        mecanique:   'chef_mecanique',
        electrique:  'chef_electrique',
        process:     'chef_process',
      };
      const roleNomsCibles = types
        .filter(t => t !== 'process') // ne pas se notifier soi-même
        .map(t => roleNomMap[t]).filter(Boolean);

      if (roleNomsCibles.length > 0) {
        const placeholders = roleNomsCibles.map(() => '?').join(', ');
        const [chefsCibles] = await db.query(
          `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom IN (${placeholders}) AND u.actif=1`,
          roleNomsCibles
        );
        if (chefsCibles.length > 0) {
          const chefIds = chefsCibles.map(u => u.id);
          await envoyerNotificationMultiple(
            chefIds,
            '⚙️ Points process consignés',
            `Les points process de ${demande.tag} (LOT ${demande.lot_code}) sont consignés. En attente de la consignation électrique.`,
            'autorisation',
            `demande/${id}`
          );
          await envoyerPushNotification(
            chefIds,
            'Points process consignés',
            `${demande.tag} (LOT ${demande.lot_code}) — process OK`,
            { demande_id: id }
          );
        }
      }
    }

    return success(res, null, 'Consignation process validée avec succès');
  } catch (err) {
    console.error('process.validerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Historique ────────────────────────────────────────────────────
const getHistorique = async (req, res) => {
  try {
    const process_id = req.user.id;
    // Historique = demandes où ce chef_process a scanné au moins un point
    const [rows] = await db.query(
      `SELECT DISTINCT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              l.code AS lot_code, CONCAT(u.prenom,' ',u.nom) AS demandeur_nom
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id=e.id
       LEFT JOIN lots l ON d.lot_id=l.id
       JOIN users u ON d.agent_id=u.id
       JOIN plans_consignation p ON p.demande_id=d.id
       JOIN points_consignation pc ON pc.plan_id=p.id
       JOIN executions_consignation ex ON ex.point_id=pc.id
       WHERE ex.consigne_par=? AND ex.charge_type='process'
       ORDER BY d.updated_at DESC`, [process_id]
    );
    return success(res, rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    })), 'Historique récupéré');
  } catch (err) {
    console.error('process.getHistorique error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Servir le PDF ─────────────────────────────────────────────────
const servirPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT pdf_path FROM dossiers_archives WHERE demande_id=?', [id]);
    if (!rows.length || !rows[0].pdf_path)
      return res.status(404).json({ message: 'PDF non disponible' });
    const pdfAbsPath = path.join(__dirname, '../../', rows[0].pdf_path);
    if (!fs.existsSync(pdfAbsPath))
      return res.status(404).json({ message: 'Fichier PDF introuvable' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="consignation_${id}.pdf"`);
    fs.createReadStream(pdfAbsPath).pipe(res);
  } catch (err) {
    console.error('process.servirPDF error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getDemandesAConsigner,
  getDemandeDetail,
  demarrerConsignation,
  scannerCadenas,
  scannerCadenasLibre,
  validerConsignation,
  getHistorique,
  servirPDF,
};