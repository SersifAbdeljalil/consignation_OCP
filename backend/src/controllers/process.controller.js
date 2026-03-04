// src/controllers/process.controller.js
// ═══════════════════════════════════════════════════════════════════
// DOUBLE VALIDATION : Chargé + Process
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

// ── Liste des demandes process ────────────────────────────────────
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

// ── Détail d'une demande ──────────────────────────────────────────
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

// ── Démarrer ──────────────────────────────────────────────────────
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

// ── Scanner cadenas (point prédéfini) ────────────────────────────
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

// ── Scanner cadenas libre ─────────────────────────────────────────
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
    const point_id = pointResult.insertId;
    await db.query(
      `INSERT INTO executions_consignation (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne, charge_type) VALUES (?,?,?,?,NOW(),'process')`,
      [point_id, numero_cadenas, mccRefVal, process_id]
    );
    return success(res, { point_id, plan_id, numero_cadenas, mcc_ref: mccRefVal, numero_ligne: nextLigne }, 'Cadenas process enregistré');
  } catch (err) {
    console.error('process.scannerCadenasLibre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ═══════════════════════════════════════════════════════════════════
// ── VALIDER CONSIGNATION (Process) ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
const validerConsignation = async (req, res) => {
  try {
    const { id }     = req.params;
    const process_id = req.user.id;

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

    // ── 2. Vérifier que le process n'a pas déjà validé ──
    if (['consigne_process', 'consigne'].includes(demande.statut)) {
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

    // ── 4. Vérifier tous les cadenas process ──
    const pointsProcess = points.filter(p => p.charge_type === 'process');
    if (pointsProcess.length > 0) {
      const tousProcessConsignes = pointsProcess.every(p => p.numero_cadenas !== null);
      if (!tousProcessConsignes)
        return error(res, 'Tous les cadenas process doivent être scannés avant validation', 400);
    }

    // ── 5. Info chef process ──
    const [processInfo] = await db.query(
      'SELECT prenom, nom, matricule, badge_ocp_id FROM users WHERE id=?', [process_id]
    );
    if (!processInfo.length) return error(res, 'Chef process introuvable', 404);
    const processUser = processInfo[0];

    // ── 6. Récupérer info chargé si déjà validé ──
    let chargeInfo = null;
    if (demande.statut === 'consigne_charge' && demande.charge_id) {
      const [chargeRow] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [demande.charge_id]);
      if (chargeRow.length) chargeInfo = chargeRow[0];
    }

    // ── 7. Générer le PDF UNIFIÉ ──
    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfFileName  = `F-HSE-SEC-22-01_${demande.numero_ordre}_unifie_${Date.now()}.pdf`;
    const pdfPath      = path.join(pdfDir, pdfFileName);
    const photoAbsPath = demande.photo_path ? path.join(__dirname, '../../', demande.photo_path) : null;

    await genererPDFUnifie({
      demande, plan, points,
      chargeInfo:  chargeInfo,
      processInfo: processUser,
      pdfPath, photoAbsPath,
    });
    const pdfRelPath = `uploads/pdfs/${pdfFileName}`;

    // ── 8. Déterminer le nouveau statut ──
    const pointsElec = points.filter(p => p.charge_type === 'electricien' || !p.charge_type);
    const hasElec    = pointsElec.length > 0 ||
                       (demande.types_intervenants || []).includes('electrique') ||
                       (demande.types_intervenants || []).includes('electricien');
    const chargeDejaValide = demande.statut === 'consigne_charge';

    let nouveauStatut;
    if (!hasElec || chargeDejaValide) {
      nouveauStatut = 'consigne';
    } else {
      nouveauStatut = 'consigne_process';
    }

    // ── 9. Mettre à jour la demande ──
    const dateValidationFinal = nouveauStatut === 'consigne' ? ', date_validation=NOW()' : '';
    await db.query(
      `UPDATE demandes_consignation
       SET statut=?, date_validation_process=NOW(),
           pdf_path_process=?, pdf_path_final=?, updated_at=NOW()
           ${dateValidationFinal}
       WHERE id=?`,
      [nouveauStatut, pdfRelPath, pdfRelPath, id]
    );

    // ── 10. Mettre à jour plan + points process ──
    if (plan && nouveauStatut === 'consigne') {
      await db.query(`UPDATE plans_consignation SET statut='execute', updated_at=NOW() WHERE id=?`, [plan.id]);
    }
    if (pointsProcess.length > 0) {
      await db.query(
        `UPDATE points_consignation SET statut='verifie' WHERE plan_id=? AND charge_type='process' AND statut='consigne'`,
        [plan ? plan.id : 0]
      );
    }

    // ── 11. Archiver PDF process ──
    const [archiveExist] = await db.query('SELECT id FROM dossiers_archives WHERE demande_id=?', [id]);
    const remarques = nouveauStatut === 'consigne'
      ? 'Consignation complète — validé par process — PDF unifié final'
      : 'Consignation process validée — en attente chargé — PDF unifié partiel';
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

    // ── 12. Notifications selon statut ──
    if (nouveauStatut === 'consigne') {
      // ── Notif agent ──
      await envoyerNotification(demande.agent_id_val, 'Consignation complète',
        `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} est entièrement consignée. Les deux équipes ont validé.`,
        'execution', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], 'Consignation complète',
        `${demande.numero_ordre} — ${demande.tag} entièrement consigné.`,
        { demande_id: id, statut: 'consigne' });

      // ── Notif chefs intervenants ──
      const types = demande.types_intervenants || [];
      if (types.length > 0) {
        const roleNomMap = {
          genie_civil: 'chef_genie_civil', mecanique: 'chef_mecanique',
          electrique: 'chef_electrique',  process: 'chef_process',
        };
        const roleNomsCibles = types.map(t => roleNomMap[t]).filter(Boolean);
        if (roleNomsCibles.length > 0) {
          const placeholders = roleNomsCibles.map(() => '?').join(', ');
          const [chefsCibles] = await db.query(
            `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom IN (${placeholders}) AND u.actif=1`,
            roleNomsCibles
          );
          if (chefsCibles.length > 0) {
            const chefIds = chefsCibles.map(u => u.id);

            // Notif existante — autorisation de travail
            await envoyerNotificationMultiple(chefIds, 'Autorisation de travail disponible',
              `Le départ ${demande.tag} (LOT ${demande.lot_code}) est consigné. Vos équipes peuvent intervenir.`,
              'autorisation', `demande/${id}`);
            await envoyerPushNotification(chefIds, 'Autorisation de travail disponible',
              `${demande.tag} (LOT ${demande.lot_code}) consigné`,
              { demande_id: id, statut: 'consigne' });

            // ✅ NOUVEAU — notif enregistrement équipe
            await envoyerNotificationMultiple(chefIds, 'Entrez vos équipes SVP',
              `Le départ ${demande.tag} (${demande.numero_ordre}) est consigné. Veuillez enregistrer les membres de votre équipe avant d'entrer sur le chantier.`,
              'intervention', `equipe/${id}`);
            await envoyerPushNotification(chefIds, 'Entrez vos équipes SVP',
              `${demande.tag} consigné — Enregistrez votre équipe maintenant`,
              { demande_id: id, statut: 'consigne', action: 'enregistrer_equipe' });
          }
        }
      }
    } else {
      // consigne_process → notifier agent + chargé
      await envoyerNotification(demande.agent_id_val, 'Consignation process effectuée',
        `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} : points process consignés par ${processUser.prenom} ${processUser.nom}. En attente de la validation du chargé.`,
        'execution', `demande/${id}`);
      await envoyerPushNotification([demande.agent_id_val], 'Consignation process effectuée',
        `${demande.numero_ordre} — points process consignés. En attente chargé.`,
        { demande_id: id, statut: 'consigne_process' });

      const [charges] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id=r.id WHERE r.nom='charge_consignation' AND u.actif=1`
      );
      let chargeIds = charges.map(u => u.id);
      if (demande.charge_id && !chargeIds.includes(demande.charge_id)) {
        chargeIds.push(demande.charge_id);
      }
      if (chargeIds.length > 0) {
        await envoyerNotificationMultiple(chargeIds, 'Validation électrique requise',
          `Les points process du départ ${demande.tag} (${demande.numero_ordre}) ont été consignés. Veuillez valider les points électriques.`,
          'intervention', `demande/${id}`);
        await envoyerPushNotification(chargeIds, 'Validation électrique requise',
          `${demande.tag} — points électriques en attente de votre validation`,
          { demande_id: id, statut: 'consigne_process' });
      }
    }

    return success(res, {
      pdf_path:       pdfRelPath,
      nouveau_statut: nouveauStatut,
      message: nouveauStatut === 'consigne'
        ? 'Consignation complète validée'
        : 'Consignation process validée — en attente de la validation du chargé',
    }, 'Validation process effectuée');
  } catch (err) {
    console.error('process.validerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── Historique ────────────────────────────────────────────────────
const getHistorique = async (req, res) => {
  try {
    const process_id = req.user.id;
    const [rows] = await db.query(
      `SELECT DISTINCT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              l.code AS lot_code, CONCAT(u.prenom,' ',u.nom) AS demandeur_nom,
              d.pdf_path_final AS pdf_path
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

// ── Servir PDF UNIFIÉ (Process) ───────────────────────────────────
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

    const peutVoir =
      demande.statut === 'consigne' ||
      (demande.statut === 'consigne_process' && !hasElec);

    if (!peutVoir) {
      if (demande.statut === 'consigne_process') {
        return res.status(403).json({
          message: 'Le PDF final sera disponible une fois que le chargé aura également validé.',
          statut: demande.statut,
        });
      }
      return res.status(403).json({
        message: 'Vous devez valider la consignation process avant de pouvoir accéder au PDF',
        statut: demande.statut,
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