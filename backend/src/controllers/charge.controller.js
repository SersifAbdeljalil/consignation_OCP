// src/controllers/charge.controller.js
// ═══════════════════════════════════════════════════════════════════
// DOUBLE VALIDATION : Chargé + Process — ORDRE FLEXIBLE
//
// Statuts :
//   consigne_charge  = chargé a validé EN PREMIER, process n'a pas encore validé
//   consigne_process = process a validé EN PREMIER, chargé n'a pas encore validé
//   consigne         = les 2 ont validé OU intervention mono-équipe
//
// ✅ RÈGLE : Peu importe qui valide en premier.
//    - Si chargé valide en premier  → statut = consigne_charge  (attente process)
//    - Si process valide en premier → statut = consigne_process (attente chargé)
//    - Le 2ème qui valide finalise  → statut = consigne
//
// ✅ FIX HEURE MAROC : CONVERT_TZ(col, '+00:00', '+01:00') sur tous
//    les SELECT qui retournent des champs datetime au frontend.
//    Le Maroc est UTC+1 toute l'année depuis 2018 (pas de changement d'heure).
// ═══════════════════════════════════════════════════════════════════
const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');
const { success, error } = require('../utils/response');
const {
  envoyerNotification,
  envoyerNotificationMultiple,
} = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');
const { genererPDFUnifie } = require('../services/pdf.service');

// ── Helper timezone Maroc pour le PDF (UTC+1 fixe) ───────────────
// Utilisé UNIQUEMENT dans genererPDFInitial pour formater les dates dans le PDF.
// Les données retournées au frontend sont converties via CONVERT_TZ dans les requêtes SQL.
const toMaroc = (d) => {
  if (!d) return null;
  // UTC+1 fixe (Maroc depuis 2018)
  return new Date(new Date(d).getTime() + 3600000);
};
const fmtDateMarocPDF = (d) => {
  if (!d) return '';
  const dt = toMaroc(d);
  return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
};

// ── Liste demandes à consigner ────────────────────────────────────
const getDemandesAConsigner = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              l.code            AS lot_code,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              CONVERT_TZ(d.created_at,  '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at,  '+00:00', '+01:00') AS updated_at
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users u       ON d.agent_id = u.id
       WHERE d.statut IN ('en_attente', 'en_cours', 'validee', 'consigne_process')
       ORDER BY d.created_at DESC`
    );
    return success(res, rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    })), 'Demandes récupérées');
  } catch (err) {
    console.error('getDemandesAConsigner error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Détail ────────────────────────────────────────────────────────
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
              CONVERT_TZ(d.created_at,         '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at,         '+00:00', '+01:00') AS updated_at,
              CONVERT_TZ(d.date_validation,    '+00:00', '+01:00') AS date_validation,
              CONVERT_TZ(d.date_validation_charge, '+00:00', '+01:00') AS date_validation_charge
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
                ex.numero_cadenas,
                ex.mcc_ref,
                ex.charge_type  AS exec_charge_type,
                CONVERT_TZ(ex.date_consigne, '+00:00', '+01:00') AS date_consigne,
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
    console.error('getDemandeDetail error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Démarrer ──────────────────────────────────────────────────────
const demarrerConsignation = async (req, res) => {
  try {
    const { id } = req.params;
    const charge_id = req.user.id;
    const [rows] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?', [id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    if (rows[0].statut === 'en_cours') return success(res, null, 'Consignation déjà en cours');
    await db.query(
      `UPDATE demandes_consignation SET statut='en_cours', charge_id=?, updated_at=NOW() WHERE id=?`,
      [charge_id, id]
    );
    return success(res, null, 'Consignation démarrée');
  } catch (err) {
    console.error('demarrerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Refuser ───────────────────────────────────────────────────────
const refuserDemande = async (req, res) => {
  try {
    const { id } = req.params;
    const { motif } = req.body;
    const charge_id = req.user.id;
    if (!motif || !motif.trim()) return error(res, 'Le motif de refus est obligatoire', 400);
    const [rows] = await db.query(
      'SELECT statut, agent_id, numero_ordre FROM demandes_consignation WHERE id = ?', [id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    const dem = rows[0];
    if (!['en_attente', 'en_cours'].includes(dem.statut))
      return error(res, `Impossible de refuser une demande avec statut: ${dem.statut}`, 400);
    await db.query(
      `UPDATE demandes_consignation SET statut='rejetee', commentaire_rejet=?, charge_id=?, updated_at=NOW() WHERE id=?`,
      [motif.trim(), charge_id, id]
    );
    const [chargeInfo] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [charge_id]);
    const chargeNom = chargeInfo.length ? `${chargeInfo[0].prenom} ${chargeInfo[0].nom}` : 'Chargé';
    await envoyerNotification(dem.agent_id, '❌ Demande refusée',
      `Votre demande ${dem.numero_ordre} a été refusée par ${chargeNom}. Motif : ${motif.trim()}`,
      'rejet', `demande/${id}`);
    await envoyerPushNotification([dem.agent_id], 'Demande refusée',
      `${dem.numero_ordre} refusée — ${motif.trim()}`, { demande_id: id, statut: 'rejetee' });
    return success(res, null, 'Demande refusée avec succès');
  } catch (err) {
    console.error('refuserDemande error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Suspendre ─────────────────────────────────────────────────────
const mettreEnAttente = async (req, res) => {
  try {
    const { id } = req.params;
    const { motif, heure_reprise } = req.body;
    const charge_id = req.user.id;
    const [rows] = await db.query(
      'SELECT statut, agent_id, numero_ordre FROM demandes_consignation WHERE id=?', [id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    const dem = rows[0];
    const noteAttente = motif
      ? `En attente — ${motif}${heure_reprise ? ` — Reprise prévue : ${heure_reprise}` : ''}`
      : `Remise en attente par le chargé`;
    await db.query(
      `UPDATE demandes_consignation SET statut='en_attente', charge_id=?, updated_at=NOW(), commentaire_rejet=? WHERE id=?`,
      [charge_id, noteAttente, id]
    );
    const [chargeInfo] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [charge_id]);
    const chargeNom = chargeInfo.length ? `${chargeInfo[0].prenom} ${chargeInfo[0].nom}` : 'Chargé';
    await envoyerNotification(dem.agent_id, 'Consignation suspendue',
      `La consignation ${dem.numero_ordre} a été suspendue par ${chargeNom}.${heure_reprise ? ` Reprise prévue : ${heure_reprise}` : ''} Motif : ${motif || 'Non précisé'}`,
      'plan', `demande/${id}`);
    await envoyerPushNotification([dem.agent_id], 'Consignation suspendue',
      `${dem.numero_ordre} suspendue${heure_reprise ? ` — Reprise : ${heure_reprise}` : ''}`,
      { demande_id: id, statut: 'en_attente' });
    return success(res, null, 'Demande remise en attente');
  } catch (err) {
    console.error('mettreEnAttente error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Scanner cadenas ───────────────────────────────────────────────
const scannerCadenas = async (req, res) => {
  try {
    const { pointId } = req.params;
    const { numero_cadenas, mcc_ref } = req.body;
    const charge_id = req.user.id;
    if (!numero_cadenas) return error(res, 'numero_cadenas est requis', 400);
    const mccRefVal = mcc_ref || '';
    const [points] = await db.query(
      'SELECT id, charge_type FROM points_consignation WHERE id=?', [pointId]
    );
    if (!points.length) return error(res, 'Point introuvable', 404);
    const [existant] = await db.query(
      'SELECT id FROM executions_consignation WHERE point_id=?', [pointId]
    );
    if (existant.length > 0) {
      await db.query(
        `UPDATE executions_consignation
         SET numero_cadenas=?, mcc_ref=?, consigne_par=?, date_consigne=NOW(), charge_type=?
         WHERE point_id=?`,
        [numero_cadenas, mccRefVal, charge_id, points[0].charge_type, pointId]
      );
    } else {
      await db.query(
        `INSERT INTO executions_consignation
           (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type)
         VALUES (?,?,?,?,NOW(),?)`,
        [pointId, numero_cadenas, mccRefVal, charge_id, points[0].charge_type]
      );
    }
    await db.query(`UPDATE points_consignation SET statut='consigne' WHERE id=?`, [pointId]);
    return success(res, { pointId, numero_cadenas, mcc_ref: mccRefVal }, 'Cadenas scanné avec succès');
  } catch (err) {
    console.error('scannerCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Scanner cadenas libre ─────────────────────────────────────────
const scannerCadenasLibre = async (req, res) => {
  try {
    const { demande_id, numero_cadenas, mcc_ref, repere, localisation, dispositif, etat_requis, charge_type } = req.body;
    const charge_id = req.user.id;
    if (!demande_id || !numero_cadenas) return error(res, 'demande_id et numero_cadenas sont requis', 400);
    const mccRefVal  = mcc_ref || '';
    const chargeType = charge_type || 'electricien';
    let [plans] = await db.query('SELECT id FROM plans_consignation WHERE demande_id=?', [demande_id]);
    let plan_id;
    if (plans.length === 0) {
      const [planResult] = await db.query(
        `INSERT INTO plans_consignation (demande_id, etabli_par, approuve_par, date_etabli, date_approuve, statut, remarques)
         VALUES (?,?,?,NOW(),NOW(),'en_execution','Plan créé automatiquement')`,
        [demande_id, charge_id, charge_id]
      );
      plan_id = planResult.insertId;
    } else {
      plan_id = plans[0].id;
      await db.query(`UPDATE plans_consignation SET statut='en_execution', updated_at=NOW() WHERE id=?`, [plan_id]);
    }
    const [lineCount] = await db.query(
      'SELECT MAX(numero_ligne) AS max_ligne FROM points_consignation WHERE plan_id=?', [plan_id]
    );
    const nextLigne = (lineCount[0].max_ligne || 0) + 1;
    const [pointResult] = await db.query(
      `INSERT INTO points_consignation
         (plan_id, numero_ligne, repere_point, localisation, dispositif_condamnation, etat_requis, electricien_id, statut, charge_type)
       VALUES (?,?,?,?,?,?,?,'consigne',?)`,
      [plan_id, nextLigne, repere || `Point-${nextLigne}`, localisation || '—',
       dispositif || '—', etat_requis || 'ouvert', charge_id, chargeType]
    );
    const point_id = pointResult.insertId;
    await db.query(
      `INSERT INTO executions_consignation (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type)
       VALUES (?,?,?,?,NOW(),?)`,
      [point_id, numero_cadenas, mccRefVal, charge_id, chargeType]
    );
    return success(res, { point_id, plan_id, numero_cadenas, mcc_ref: mccRefVal, numero_ligne: nextLigne }, 'Cadenas enregistré');
  } catch (err) {
    console.error('scannerCadenasLibre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Enregistrer photo ─────────────────────────────────────────────
const enregistrerPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { photo_base64 } = req.body;
    if (!photo_base64) return error(res, 'Photo requise', 400);
    const uploadsDir = path.join(__dirname, '../../uploads/consignations', id.toString());
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName   = `photo_${Date.now()}.jpg`;
    const filePath   = path.join(uploadsDir, fileName);
    const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    const photoPath = `uploads/consignations/${id}/${fileName}`;
    await db.query('UPDATE demandes_consignation SET photo_path=? WHERE id=?', [photoPath, id]);
    return success(res, { photo_path: photoPath }, 'Photo enregistrée');
  } catch (err) {
    console.error('enregistrerPhoto error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// ── VALIDER CONSIGNATION (Chargé) ─────────────────────────────────
// ✅ ORDRE FLEXIBLE : le chargé peut valider avant ou après le process
// ═══════════════════════════════════════════════════════════════════
const validerConsignation = async (req, res) => {
  try {
    const { id }    = req.params;
    const charge_id = req.user.id;

    // ── 1. Récupérer la demande ──
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

    // ── 2. Vérifier que le CHARGÉ n'a pas déjà validé ──
    if (['consigne_charge', 'consigne'].includes(demande.statut)) {
      return error(res, 'Vous avez déjà validé cette consignation', 400);
    }

    // ── 3. Récupérer plan + points ──
    const [plans] = await db.query(
      `SELECT p.*, CONCAT(ue.prenom,' ',ue.nom) AS etabli_nom,
              CONCAT(ua2.prenom,' ',ua2.nom) AS approuve_nom
       FROM plans_consignation p
       LEFT JOIN users ue  ON p.etabli_par=ue.id
       LEFT JOIN users ua2 ON p.approuve_par=ua2.id
       WHERE p.demande_id=?`, [id]
    );
    const plan = plans[0] || null;

    let points = [];
    if (plan) {
      const [pts] = await db.query(
        `SELECT pc.*,
                ex.numero_cadenas, ex.mcc_ref, ex.date_consigne,
                ex.charge_type AS exec_charge_type,
                CONCAT(uc.prenom,' ',uc.nom) AS consigne_par_nom
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         LEFT JOIN users uc ON ex.consigne_par = uc.id
         WHERE pc.plan_id=?
         ORDER BY pc.numero_ligne ASC`, [plan.id]
      );
      points = pts;
    }

    // ── 4. Vérifier tous les cadenas électriques ──
    const pointsElec = points.filter(p => p.charge_type === 'electricien' || !p.charge_type);
    if (pointsElec.length > 0) {
      const tousElecConsignes = pointsElec.every(p => p.numero_cadenas !== null);
      if (!tousElecConsignes) return error(res, 'Tous les cadenas électriques doivent être scannés avant validation', 400);
    }
    if (!demande.photo_path) return error(res, 'La photo du départ consigné est obligatoire', 400);

    // ── 5. Info chargé ──
    const [chargeInfo] = await db.query(
      'SELECT prenom, nom, matricule, badge_ocp_id FROM users WHERE id=?', [charge_id]
    );
    if (!chargeInfo.length) return error(res, 'Chargé introuvable', 404);
    const charge = chargeInfo[0];

    // ── 6. Vérifier si le PROCESS a déjà validé EN PREMIER ──
    const processDejaValide = demande.statut === 'consigne_process';

    // ── 7. Récupérer info process si déjà validé ──
    let processInfo = null;
    if (processDejaValide && demande.pdf_path_process) {
      const [procExec] = await db.query(
        `SELECT DISTINCT CONCAT(u.prenom,' ',u.nom) AS nom, u.prenom, u.nom
         FROM executions_consignation ex
         JOIN points_consignation pc ON pc.id = ex.point_id
         JOIN plans_consignation pl ON pl.id = pc.plan_id
         JOIN users u ON u.id = ex.consigne_par
         WHERE pl.demande_id = ? AND ex.charge_type = 'process'
         LIMIT 1`, [id]
      );
      if (procExec.length) {
        processInfo = { prenom: procExec[0].prenom, nom: procExec[0].nom };
      }
    }

    // ── 8. Générer le PDF UNIFIÉ ──
    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfFileName  = `F-HSE-SEC-22-01_${demande.numero_ordre}_unifie_${Date.now()}.pdf`;
    const pdfPath      = path.join(pdfDir, pdfFileName);
    const photoAbsPath = demande.photo_path ? path.join(__dirname, '../../', demande.photo_path) : null;

    await genererPDFUnifie({
      demande, plan, points,
      chargeInfo:  charge,
      processInfo: processInfo,
      pdfPath, photoAbsPath,
    });
    const pdfRelPath = `uploads/pdfs/${pdfFileName}`;

    // ── 9. Déterminer le nouveau statut ──
    const pointsProcess = points.filter(p => p.charge_type === 'process');
    const hasProcess    = pointsProcess.length > 0 ||
                          (demande.types_intervenants || []).includes('process');

    let nouveauStatut;
    if (!hasProcess) {
      nouveauStatut = 'consigne';
    } else if (processDejaValide) {
      nouveauStatut = 'consigne';
    } else {
      nouveauStatut = 'consigne_charge';
    }

    // ── 10. Mettre à jour la demande ──
    const dateValidationFinal = nouveauStatut === 'consigne' ? ', date_validation=NOW()' : '';
    await db.query(
      `UPDATE demandes_consignation
       SET statut=?, charge_id=?, date_validation_charge=NOW(),
           pdf_path_charge=?, pdf_path_final=?, updated_at=NOW()
           ${dateValidationFinal}
       WHERE id=?`,
      [nouveauStatut, charge_id, pdfRelPath, pdfRelPath, id]
    );

    // ── 11. Mettre à jour plan + points ──
    if (plan && nouveauStatut === 'consigne') {
      await db.query(`UPDATE plans_consignation SET statut='execute', updated_at=NOW() WHERE id=?`, [plan.id]);
    }
    if (pointsElec.length > 0) {
      await db.query(
        `UPDATE points_consignation SET statut='verifie' WHERE plan_id=? AND charge_type IN ('electricien','') AND statut='consigne'`,
        [plan ? plan.id : 0]
      );
    }

    // ── 12. Archiver PDF ──
    const [archiveExist] = await db.query('SELECT id FROM dossiers_archives WHERE demande_id=?', [id]);
    const remarques = nouveauStatut === 'consigne'
      ? 'Consignation complète — PDF unifié final'
      : 'Consignation chargé validée EN PREMIER — en attente process — PDF unifié partiel';
    if (archiveExist.length > 0) {
      await db.query(
        `UPDATE dossiers_archives SET pdf_path=?, cloture_par=?, date_cloture=NOW(), remarques=? WHERE demande_id=?`,
        [pdfRelPath, charge_id, remarques, id]
      );
    } else {
      await db.query(
        `INSERT INTO dossiers_archives (demande_id, pdf_path, cloture_par, date_cloture, remarques) VALUES (?,?,?,NOW(),?)`,
        [id, pdfRelPath, charge_id, remarques]
      );
    }

    // ── 13. Notifications selon statut ──
    if (nouveauStatut === 'consigne') {
      await envoyerNotification(demande.agent_id_val, '✅ Consignation complète',
        `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} est entièrement consignée. Les deux équipes ont validé.`,
        'execution', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], '✅ Consignation complète',
        `${demande.numero_ordre} — ${demande.tag} entièrement consigné.`,
        { demande_id: id, statut: 'consigne' });
      await _notifierChefsIntervenants(demande, id);
    } else {
      await envoyerNotification(demande.agent_id_val, '⚡ Consignation électrique effectuée',
        `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} : points électriques consignés par ${charge.prenom} ${charge.nom}. En attente de la validation process.`,
        'execution', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], '⚡ Consignation électrique effectuée',
        `${demande.numero_ordre} — points électriques consignés. En attente process.`,
        { demande_id: id, statut: 'consigne_charge' });

      const [chefProcess] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom='chef_process' AND u.actif=1`
      );
      if (chefProcess.length > 0) {
        const chefProcessIds = chefProcess.map(u => u.id);
        await envoyerNotificationMultiple(chefProcessIds, '🔔 Validation process requise',
          `Le chargé a validé les points électriques du départ ${demande.tag} (${demande.numero_ordre}). Veuillez valider vos points process.`,
          'intervention', `demande/${id}`);
        await envoyerPushNotification(chefProcessIds, '🔔 Validation process requise',
          `${demande.tag} — points process en attente de votre validation`,
          { demande_id: id, statut: 'consigne_charge' });
      }
    }

    return success(res, {
      pdf_path:       pdfRelPath,
      nouveau_statut: nouveauStatut,
      message: nouveauStatut === 'consigne'
        ? 'Consignation complète validée'
        : 'Consignation chargé validée EN PREMIER — en attente de la validation process',
    }, 'Validation chargé effectuée');
  } catch (err) {
    console.error('validerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── HELPER : Notifier les chefs intervenants (PAS le process) ────
const _notifierChefsIntervenants = async (demande, demandeId) => {
  const types = demande.types_intervenants || [];
  if (types.length === 0) return;

  const roleNomMap = {
    genie_civil: 'chef_genie_civil',
    mecanique:   'chef_mecanique',
    electrique:  'chef_electrique',
  };

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
        `${demande.tag} (LOT ${demande.lot_code}) consigné`,
        { demande_id: demandeId, statut: 'consigne' });
      await envoyerNotificationMultiple(chefIds, '👷 Entrez vos équipes SVP',
        `Le départ ${demande.tag} (${demande.numero_ordre}) est consigné. Veuillez enregistrer les membres de votre équipe avant d'entrer sur le chantier.`,
        'intervention', `equipe/${demandeId}`);
      await envoyerPushNotification(chefIds, '👷 Entrez vos équipes SVP',
        `${demande.tag} consigné — Enregistrez votre équipe maintenant`,
        { demande_id: demandeId, statut: 'consigne', action: 'enregistrer_equipe' });
    }
  }
};

// ── Historique ────────────────────────────────────────────────────
const getHistorique = async (req, res) => {
  try {
    const charge_id = req.user.id;
    const [rows] = await db.query(
      `SELECT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              l.code AS lot_code, CONCAT(u.prenom,' ',u.nom) AS demandeur_nom,
              d.pdf_path_final AS pdf_path,
              CONVERT_TZ(d.created_at,         '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at,         '+00:00', '+01:00') AS updated_at,
              CONVERT_TZ(d.date_validation,    '+00:00', '+01:00') AS date_validation,
              CONVERT_TZ(d.date_validation_charge, '+00:00', '+01:00') AS date_validation_charge
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id=e.id
       LEFT JOIN lots l ON d.lot_id=l.id
       JOIN users u ON d.agent_id=u.id
       WHERE d.charge_id=? ORDER BY d.updated_at DESC`, [charge_id]
    );
    return success(res, rows.map(d => ({
      ...d,
      types_intervenants: d.types_intervenants ? JSON.parse(d.types_intervenants) : [],
    })), 'Historique récupéré');
  } catch (err) {
    console.error('getHistorique error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Servir PDF UNIFIÉ (Chargé) ────────────────────────────────────
const servirPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT statut, pdf_path_final, pdf_path_charge, types_intervenants FROM demandes_consignation WHERE id=?`, [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Demande introuvable' });

    const demande = rows[0];
    const types   = demande.types_intervenants ? JSON.parse(demande.types_intervenants) : [];
    const hasProcess = types.includes('process');

    const peutVoir =
      demande.statut === 'consigne' ||
      (demande.statut === 'consigne_charge' && !hasProcess);

    if (!peutVoir) {
      if (demande.statut === 'consigne_charge') {
        return res.status(403).json({
          message: 'Le PDF final sera disponible une fois que le chef process aura également validé.',
          statut: demande.statut,
        });
      }
      return res.status(403).json({
        message: 'Vous devez valider la consignation avant de pouvoir accéder au PDF',
        statut: demande.statut,
      });
    }

    const pdfRelPath = demande.pdf_path_final || demande.pdf_path_charge;
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
    console.error('servirPDF error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getDemandesAConsigner,
  getDemandeDetail,
  demarrerConsignation,
  refuserDemande,
  mettreEnAttente,
  scannerCadenas,
  scannerCadenasLibre,
  enregistrerPhoto,
  validerConsignation,
  getHistorique,
  servirPDF,
};