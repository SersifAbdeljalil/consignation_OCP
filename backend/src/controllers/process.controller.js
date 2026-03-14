// src/controllers/process.controller.js
// ✅ FIX PDF : servirPDF autorise tous les statuts post-consigne
// ✅ NOUVEAU : validerDeconsignationFinale — PDF déconsignation process
const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');
const { success, error } = require('../utils/response');
const {
  envoyerNotification,
  envoyerNotificationMultiple,
} = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');
const { genererPDFUnifie, genererPDFDeconsignation } = require('../services/pdf.service');

const getDemandesAConsigner = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              l.code            AS lot_code,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              CONVERT_TZ(d.created_at, '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at, '+00:00', '+01:00') AS updated_at
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users u       ON d.agent_id = u.id
       WHERE d.statut IN ('en_attente', 'en_cours', 'validee', 'consigne_charge')
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

// ── Liste demandes à déconsigner (process) ────────────────────────
const getDemandesADeconsigner = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              l.code            AS lot_code,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              CONVERT_TZ(d.created_at, '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at, '+00:00', '+01:00') AS updated_at
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users u       ON d.agent_id = u.id
       WHERE d.statut IN (
         'deconsigne_genie_civil', 'deconsigne_mecanique', 'deconsigne_electrique',
         'deconsigne_charge', 'deconsigne_process'
       )
         AND d.deconsignation_demandee = 1
         AND JSON_CONTAINS(d.types_intervenants, '"process"')
       ORDER BY d.updated_at DESC`
    );
    return success(res, rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    })), 'Demandes à déconsigner récupérées');
  } catch (err) {
    console.error('process.getDemandesADeconsigner error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

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
              u.matricule       AS demandeur_matricule,
              CONVERT_TZ(d.created_at,             '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at,             '+00:00', '+01:00') AS updated_at,
              CONVERT_TZ(d.date_validation,        '+00:00', '+01:00') AS date_validation,
              CONVERT_TZ(d.date_validation_process,'+00:00', '+01:00') AS date_validation_process
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
              CONCAT(ua.prenom, ' ', ua.nom) AS approuve_nom,
              CONVERT_TZ(p.date_etabli,   '+00:00', '+01:00') AS date_etabli,
              CONVERT_TZ(p.date_approuve, '+00:00', '+01:00') AS date_approuve,
              CONVERT_TZ(p.created_at,    '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(p.updated_at,    '+00:00', '+01:00') AS updated_at
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
                ex.numero_cadenas, ex.mcc_ref, ex.charge_type AS exec_charge_type,
                CONVERT_TZ(ex.date_consigne, '+00:00', '+01:00') AS date_consigne,
                CONCAT(uc.prenom, ' ', uc.nom) AS consigne_par_nom
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         LEFT JOIN users uc ON ex.consigne_par = uc.id
         WHERE pc.plan_id = ? ORDER BY pc.numero_ligne ASC`, [plan.id]
      );
      points = pts;
    }
    return success(res, { demande, plan, points }, 'Détail récupéré');
  } catch (err) {
    console.error('process.getDemandeDetail error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const demarrerConsignation = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT statut FROM demandes_consignation WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    if (['en_cours', 'consigne_charge'].includes(rows[0].statut))
      return success(res, null, 'Consignation déjà en cours ou chargé déjà validé');
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

const scannerCadenas = async (req, res) => {
  try {
    const { pointId } = req.params;
    const { numero_cadenas, mcc_ref } = req.body;
    const process_id = req.user.id;
    if (!numero_cadenas) return error(res, 'numero_cadenas est requis', 400);
    const mccRefVal = mcc_ref || '';
    const [points] = await db.query('SELECT id, charge_type FROM points_consignation WHERE id=?', [pointId]);
    if (!points.length) return error(res, 'Point introuvable', 404);
    if (points[0].charge_type !== 'process') return error(res, "Ce point n'est pas de type process", 403);
    const [existant] = await db.query('SELECT id FROM executions_consignation WHERE point_id=?', [pointId]);
    if (existant.length > 0) {
      await db.query(
        `UPDATE executions_consignation SET numero_cadenas=?, mcc_ref=?, consigne_par=?, date_consigne=NOW(), charge_type='process' WHERE point_id=?`,
        [numero_cadenas, mccRefVal, process_id, pointId]
      );
    } else {
      await db.query(
        `INSERT INTO executions_consignation (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type) VALUES (?,?,?,?,NOW(),'process')`,
        [pointId, numero_cadenas, mccRefVal, process_id]
      );
    }
    await db.query(`UPDATE points_consignation SET statut='consigne' WHERE id=?`, [pointId]);
    return success(res, { pointId, numero_cadenas, mcc_ref: mccRefVal }, 'Cadenas process scanné');
  } catch (err) {
    console.error('process.scannerCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

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
        `INSERT INTO plans_consignation (demande_id, etabli_par, approuve_par, date_etabli, date_approuve, statut, remarques) VALUES (?,?,?,NOW(),NOW(),'en_execution','Plan créé automatiquement par process')`,
        [demande_id, process_id, process_id]
      );
      plan_id = planResult.insertId;
    } else {
      plan_id = plans[0].id;
      await db.query(`UPDATE plans_consignation SET statut='en_execution', updated_at=NOW() WHERE id=?`, [plan_id]);
    }
    const [lineCount] = await db.query('SELECT MAX(numero_ligne) AS max_ligne FROM points_consignation WHERE plan_id=?', [plan_id]);
    const nextLigne = (lineCount[0].max_ligne || 0) + 1;
    const [pointResult] = await db.query(
      `INSERT INTO points_consignation (plan_id, numero_ligne, repere_point, localisation, dispositif_condamnation, etat_requis, electricien_id, statut, charge_type) VALUES (?,?,?,?,?,?,?,'consigne','process')`,
      [plan_id, nextLigne, repere || `Point-P${nextLigne}`, localisation || '—', dispositif || '—', etat_requis || 'ouvert', process_id]
    );
    await db.query(
      `INSERT INTO executions_consignation (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type) VALUES (?,?,?,?,NOW(),'process')`,
      [pointResult.insertId, numero_cadenas, mccRefVal, process_id]
    );
    return success(res, { point_id: pointResult.insertId, plan_id, numero_cadenas, mcc_ref: mccRefVal, numero_ligne: nextLigne }, 'Cadenas process enregistré');
  } catch (err) {
    console.error('process.scannerCadenasLibre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const validerConsignation = async (req, res) => {
  try {
    const { id }     = req.params;
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

    if (['consigne_process', 'consigne'].includes(demande.statut))
      return error(res, 'Vous avez déjà validé cette consignation', 400);

    const [plans] = await db.query(
      `SELECT p.*, CONCAT(ue.prenom,' ',ue.nom) AS etabli_nom, CONCAT(ua2.prenom,' ',ua2.nom) AS approuve_nom
       FROM plans_consignation p
       LEFT JOIN users ue  ON p.etabli_par=ue.id
       LEFT JOIN users ua2 ON p.approuve_par=ua2.id
       WHERE p.demande_id=?`, [id]
    );
    const plan = plans[0] || null;
    let points = [];
    if (plan) {
      const [pts] = await db.query(
        `SELECT pc.*, ex.numero_cadenas, ex.mcc_ref, ex.date_consigne, ex.charge_type AS exec_charge_type,
                CONCAT(uc.prenom,' ',uc.nom) AS consigne_par_nom
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         LEFT JOIN users uc ON ex.consigne_par = uc.id
         WHERE pc.plan_id=? ORDER BY pc.numero_ligne ASC`, [plan.id]
      );
      points = pts;
    }

    const pointsProcess = points.filter(p => p.charge_type === 'process');
    if (pointsProcess.length > 0) {
      const tousProcessConsignes = pointsProcess.every(p => p.numero_cadenas !== null);
      if (!tousProcessConsignes)
        return error(res, 'Tous les cadenas process doivent être scannés avant validation', 400);
    }

    const [processInfoRows] = await db.query(
      'SELECT prenom, nom, matricule, badge_ocp_id FROM users WHERE id=?', [process_id]
    );
    if (!processInfoRows.length) return error(res, 'Chef process introuvable', 404);
    const processUser = processInfoRows[0];

    const chargeDejaValide = demande.statut === 'consigne_charge';
    let chargeInfo = null;
    if (chargeDejaValide && demande.charge_id) {
      const [chargeRow] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [demande.charge_id]);
      if (chargeRow.length) chargeInfo = chargeRow[0];
    }

    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfFileName  = `F-HSE-SEC-22-01_${demande.numero_ordre}_unifie_${Date.now()}.pdf`;
    const pdfPath      = path.join(pdfDir, pdfFileName);
    const photoAbsPath = demande.photo_path ? path.join(__dirname, '../../', demande.photo_path) : null;

    await genererPDFUnifie({
      demande, plan, points,
      chargeInfo, processInfo: processUser,
      pdfPath, photoAbsPath,
    });
    const pdfRelPath = `uploads/pdfs/${pdfFileName}`;

    const pointsElec = points.filter(p => p.charge_type === 'electricien' || !p.charge_type);
    const hasElec    = pointsElec.length > 0 ||
                       (demande.types_intervenants || []).includes('electrique') ||
                       (demande.types_intervenants || []).includes('electricien');

    let nouveauStatut;
    if (!hasElec)             nouveauStatut = 'consigne';
    else if (chargeDejaValide) nouveauStatut = 'consigne';
    else                       nouveauStatut = 'consigne_process';

    const dateValidationFinal = nouveauStatut === 'consigne' ? ', date_validation=NOW()' : '';
    await db.query(
      `UPDATE demandes_consignation
       SET statut=?, date_validation_process=NOW(), pdf_path_process=?, pdf_path_final=?, updated_at=NOW()
       ${dateValidationFinal}
       WHERE id=?`,
      [nouveauStatut, pdfRelPath, pdfRelPath, id]
    );

    if (plan && nouveauStatut === 'consigne') {
      await db.query(`UPDATE plans_consignation SET statut='execute', updated_at=NOW() WHERE id=?`, [plan.id]);
    }

    const [archiveExist] = await db.query('SELECT id FROM dossiers_archives WHERE demande_id=?', [id]);
    const remarques = nouveauStatut === 'consigne'
      ? 'Consignation complète — PDF unifié final'
      : 'Consignation process validée EN PREMIER — en attente chargé';
    if (archiveExist.length > 0) {
      await db.query(
        `UPDATE dossiers_archives SET pdf_path=?, cloture_par=?, date_cloture=NOW(), remarques=? WHERE demande_id=?`,
        [pdfRelPath, process_id, remarques, id]
      );
    } else {
      await db.query(
        `INSERT INTO dossiers_archives (demande_id, pdf_path, cloture_par, date_cloture, remarques) VALUES (?,?,?,NOW(),?)`,
        [id, pdfRelPath, process_id, remarques]
      );
    }

    if (nouveauStatut === 'consigne') {
      await envoyerNotification(demande.agent_id_val, '✅ Consignation complète',
        `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} est entièrement consignée.`,
        'execution', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], '✅ Consignation complète',
        `${demande.numero_ordre} — ${demande.tag} entièrement consigné.`,
        { demande_id: id, statut: 'consigne' });
      await _notifierChefsIntervenants(demande, id);
    } else {
      await envoyerNotification(demande.agent_id_val, '⚙️ Consignation process effectuée',
        `Points process consignés par ${processUser.prenom} ${processUser.nom}. En attente de la validation du chargé.`,
        'execution', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], '⚙️ Consignation process effectuée',
        `${demande.numero_ordre} — points process consignés. En attente chargé.`,
        { demande_id: id, statut: 'consigne_process' });

      const [charges] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom='charge_consignation' AND u.actif=1`
      );
      let chargeIds = charges.map(u => u.id);
      if (demande.charge_id && !chargeIds.includes(demande.charge_id)) chargeIds.push(demande.charge_id);
      if (chargeIds.length > 0) {
        await envoyerNotificationMultiple(chargeIds, '🔔 Validation électrique requise',
          `Le process a validé ses points en premier sur le départ ${demande.tag}. C'est votre tour.`,
          'intervention', `demande/${id}`);
        await envoyerPushNotification(chargeIds, '🔔 Validation électrique requise',
          `${demande.tag} — points électriques en attente de votre validation`,
          { demande_id: id, statut: 'consigne_process' });
      }
    }

    return success(res, { pdf_path: pdfRelPath, nouveau_statut: nouveauStatut }, 'Validation process effectuée');
  } catch (err) {
    console.error('process.validerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// ✅ NOUVEAU — Valider la déconsignation finale (process)
// ════════════════════════════════════════════════════════════════
const validerDeconsignationFinale = async (req, res) => {
  try {
    const { id }     = req.params;
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

    // APRÈS
const STATUTS_DECONS_OK = [
  'deconsigne_genie_civil', 'deconsigne_mecanique', 'deconsigne_electrique',
  'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
  'deconsigne_intervent',
  'deconsigne_process', 'consigne',
];
    if (!STATUTS_DECONS_OK.includes(demande.statut)) {
      return error(res, `Statut invalide pour déconsigner (${demande.statut})`, 400);
    }

    const [plans] = await db.query(`SELECT * FROM plans_consignation WHERE demande_id=?`, [id]);
    const plan = plans[0] || null;
    let points = [];
    if (plan) {
      const [pts] = await db.query(
        `SELECT pc.*, ex.numero_cadenas, ex.mcc_ref,
                CONVERT_TZ(ex.date_consigne,'+00:00','+01:00') AS date_consigne,
                ex.charge_type AS exec_charge_type,
                CONCAT(uc.prenom,' ',uc.nom) AS consigne_par_nom
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         LEFT JOIN users uc ON ex.consigne_par = uc.id
         WHERE pc.plan_id=? ORDER BY pc.numero_ligne ASC`, [plan.id]
      );
      points = pts;
    }

    const [processInfoRows] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [process_id]);
    if (!processInfoRows.length) return error(res, 'Chef process introuvable', 404);
    const processUser = processInfoRows[0];

    let chargeInfo = null;
    if (demande.statut === 'deconsigne_charge' && demande.charge_id) {
      const [ci] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [demande.charge_id]);
      if (ci.length) chargeInfo = ci[0];
    }

    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfFileName  = `F-HSE-SEC-22-01_${demande.numero_ordre}_decons_process_${Date.now()}.pdf`;
    const pdfPath      = path.join(pdfDir, pdfFileName);
    const photoAbsPath = demande.photo_path ? path.join(__dirname, '../../', demande.photo_path) : null;

    await genererPDFDeconsignation({
      demande, plan, points,
      chargeInfo,
      processInfo: processUser,
      pdfPath, photoAbsPath,
      typeDeconsignation: 'process',
    });
    const pdfRelPath = `uploads/pdfs/${pdfFileName}`;

    const hasElec          = demande.types_intervenants.includes('electrique') || demande.types_intervenants.includes('electricien');
    const chargeDejaDecons  = demande.statut === 'deconsigne_charge';

    let nouveauStatut;
    if (!hasElec || chargeDejaDecons) {
      nouveauStatut = 'deconsignee';
    } else {
      nouveauStatut = 'deconsigne_process';
    }

    const dateCol = nouveauStatut === 'deconsignee' ? ', date_deconsignation=NOW()' : '';
    await db.query(
      `UPDATE demandes_consignation
       SET statut=?, pdf_path_final=?, updated_at=NOW() ${dateCol}
       WHERE id=?`,
      [nouveauStatut, pdfRelPath, id]
    );

    await db.query(
      `UPDATE dossiers_archives SET pdf_path=?, cloture_par=?, date_cloture=NOW(), remarques=? WHERE demande_id=?`,
      [pdfRelPath, process_id, `PDF déconsignation — ${nouveauStatut}`, id]
    );

    if (nouveauStatut === 'deconsignee') {
      await envoyerNotification(demande.agent_id_val, '🔓 Déconsignation complète — PDF disponible',
        `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} est entièrement déconsignée.`,
        'deconsignation', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], '🔓 Déconsignation complète',
        `${demande.numero_ordre} — ${demande.tag} déconsigné.`,
        { demande_id: id, statut: 'deconsignee' });
    } else {
      await envoyerNotification(demande.agent_id_val, '⚙️ Déconsignation process validée',
        `Déconsignation process effectuée par ${processUser.prenom} ${processUser.nom}. En attente du chargé.`,
        'deconsignation', `demande/${id}`);

      const [charges] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom='charge_consignation' AND u.actif=1`
      );
      let chargeIds = charges.map(u => u.id);
      if (demande.charge_id && !chargeIds.includes(demande.charge_id)) chargeIds.push(demande.charge_id);
      if (chargeIds.length > 0) {
        await envoyerNotificationMultiple(chargeIds, '🔔 Déconsignation électrique requise',
          `Le process a déconsigné ses points sur ${demande.tag}. C'est votre tour de déconsigner les points électriques.`,
          'deconsignation', `demande/${id}`);
        await envoyerPushNotification(chargeIds, '🔔 Déconsignation électrique requise',
          `${demande.tag} — déconsignation électrique en attente`,
          { demande_id: id, statut: nouveauStatut });
      }
    }

    return success(res, { pdf_path: pdfRelPath, nouveau_statut: nouveauStatut },
      'Déconsignation process validée');
  } catch (err) {
    console.error('process.validerDeconsignationFinale error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const _notifierChefsIntervenants = async (demande, demandeId) => {
  const types = demande.types_intervenants || [];
  if (types.length === 0) return;
  const roleNomMap = { genie_civil: 'chef_genie_civil', mecanique: 'chef_mecanique', electrique: 'chef_electrique' };
  const typesSansProcess = types.filter(t => t !== 'process');
  const roleNomsCibles   = typesSansProcess.map(t => roleNomMap[t]).filter(Boolean);
  if (roleNomsCibles.length > 0) {
    const placeholders = roleNomsCibles.map(() => '?').join(', ');
    const [chefsCibles] = await db.query(
      `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom IN (${placeholders}) AND u.actif=1`,
      roleNomsCibles
    );
    if (chefsCibles.length > 0) {
      const chefIds = chefsCibles.map(u => u.id);
      await envoyerNotificationMultiple(chefIds, '🔓 Autorisation de travail disponible',
        `Le départ ${demande.tag} (LOT ${demande.lot_code}) est consigné. Vos équipes peuvent intervenir.`,
        'autorisation', `demande/${demandeId}`);
      await envoyerPushNotification(chefIds, '🔓 Autorisation de travail disponible',
        `${demande.tag} (LOT ${demande.lot_code}) consigné`, { demande_id: demandeId, statut: 'consigne' });
      await envoyerNotificationMultiple(chefIds, '👷 Entrez vos équipes SVP',
        `Le départ ${demande.tag} est consigné. Enregistrez les membres de votre équipe.`,
        'intervention', `equipe/${demandeId}`);
      await envoyerPushNotification(chefIds, '👷 Entrez vos équipes SVP',
        `${demande.tag} consigné — Enregistrez votre équipe maintenant`,
        { demande_id: demandeId, statut: 'consigne', action: 'enregistrer_equipe' });
    }
  }
};

const getHistorique = async (req, res) => {
  try {
    const process_id = req.user.id;
    const [rows] = await db.query(
      `SELECT DISTINCT d.*,
              e.nom AS equipement_nom, e.code_equipement AS tag,
              l.code AS lot_code, CONCAT(u.prenom,' ',u.nom) AS demandeur_nom,
              d.pdf_path_final AS pdf_path,
              CONVERT_TZ(d.created_at,              '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at,              '+00:00', '+01:00') AS updated_at,
              CONVERT_TZ(d.date_validation,         '+00:00', '+01:00') AS date_validation,
              CONVERT_TZ(d.date_validation_process, '+00:00', '+01:00') AS date_validation_process
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

// ════════════════════════════════════════════════════════════════
// ✅ FIX : servirPDF — autorise tous les statuts post-consigne
// ════════════════════════════════════════════════════════════════
const servirPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT statut, pdf_path_final, pdf_path_process, types_intervenants FROM demandes_consignation WHERE id=?`, [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable' });

    const demande = rows[0];
    const types   = demande.types_intervenants ? JSON.parse(demande.types_intervenants) : [];
    const hasElec = types.includes('electrique') || types.includes('electricien');

    // APRÈS
const STATUTS_PDF_OK = [
  'consigne',
  // variantes backend
  'deconsigne_genie_civil', 'deconsigne_mecanique', 'deconsigne_electrique',
  // variantes frontend (noms courts)
  'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
  'deconsigne_intervent',
  'deconsigne_charge',
  'deconsigne_process',
  'deconsignee',
  'cloturee',
];

    const peutVoir =
      STATUTS_PDF_OK.includes(demande.statut) ||
      (demande.statut === 'consigne_process' && !hasElec);

    if (!peutVoir) {
      if (demande.statut === 'consigne_process') {
        return res.status(403).json({
          message: 'Le PDF final sera disponible une fois que le chargé aura également validé.',
          statut:  demande.statut,
          besoin:  'validation_charge',
        });
      }
      return res.status(403).json({
        message: 'Vous devez valider la consignation process avant de pouvoir accéder au PDF',
        statut:  demande.statut,
        besoin:  'validation_process',
      });
    }

    const pdfRelPath = demande.pdf_path_final || demande.pdf_path_process;
    if (!pdfRelPath) return res.status(404).json({ message: 'PDF non encore généré' });

    const pdfAbsPath = path.join(__dirname, '../../', pdfRelPath);
    if (!fs.existsSync(pdfAbsPath)) {
      const [archive] = await db.query('SELECT pdf_path FROM dossiers_archives WHERE demande_id=?', [id]);
      if (archive.length && archive[0].pdf_path) {
        const fallbackPath = path.join(__dirname, '../../', archive[0].pdf_path);
        if (fs.existsSync(fallbackPath)) {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `inline; filename="consignation_${id}.pdf"`);
          return fs.createReadStream(fallbackPath).pipe(res);
        }
      }
      return res.status(404).json({ message: 'Fichier PDF introuvable sur le serveur' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="consignation_${id}.pdf"`);
    fs.createReadStream(pdfAbsPath).pipe(res);
  } catch (err) {
    console.error('process.servirPDF error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};
const deconsignerPointProcess = async (req, res) => {
  try {
    const { pointId }        = req.params;
    const { numero_cadenas } = req.body;
    const process_id         = req.user.id;
 
    if (!numero_cadenas) return error(res, 'numero_cadenas requis', 400);
 
    const [points] = await db.query(
      `SELECT pc.*, ec.numero_cadenas AS cadenas_pose
       FROM points_consignation pc
       LEFT JOIN executions_consignation ec ON ec.point_id = pc.id AND ec.charge_type = 'process'
       WHERE pc.id = ? AND pc.charge_type = 'process'
       LIMIT 1`,
      [pointId]
    );
    if (!points.length) return error(res, 'Point process introuvable', 404);
 
    const point = points[0];
 
    // Vérification stricte
    if (
      point.cadenas_pose &&
      point.cadenas_pose.trim().toUpperCase() !== numero_cadenas.trim().toUpperCase()
    ) {
      return error(
        res,
        `Cadenas incorrect. Attendu : ${point.cadenas_pose} — Scanné : ${numero_cadenas}`,
        400
      );
    }
 
    await db.query(
      `UPDATE points_consignation SET statut = 'deconsigne' WHERE id = ?`,
      [pointId]
    );
 
    const [dejaTrace] = await db.query(
      `SELECT id FROM deconsignations WHERE point_id = ?`, [pointId]
    );
    if (dejaTrace.length) {
      await db.query(
        `UPDATE deconsignations SET numero_cadenas = ?, deconsigne_par = ?, date_deconsigne = NOW() WHERE point_id = ?`,
        [numero_cadenas.trim(), process_id, pointId]
      );
    } else {
      await db.query(
        `INSERT INTO deconsignations (point_id, numero_cadenas, deconsigne_par, date_deconsigne)
         VALUES (?, ?, ?, NOW())`,
        [pointId, numero_cadenas.trim(), process_id]
      );
    }
 
    return success(res, { point_id: parseInt(pointId), statut: 'deconsigne', numero_cadenas }, 'Point process déconsigné');
  } catch (err) {
    console.error('deconsignerPointProcess error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getDemandesAConsigner,
  getDemandesADeconsigner,
  getDemandeDetail,
  demarrerConsignation,
  scannerCadenas,
  scannerCadenasLibre,
  validerConsignation,
  validerDeconsignationFinale,
  getHistorique,
  servirPDF,
  deconsignerPointProcess,
};