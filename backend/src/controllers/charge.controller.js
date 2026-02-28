// src/controllers/charge.controller.js
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

const getTagImagePath = (codeEquipement) => {
  if (!codeEquipement) return null;
  const tagImageDir = path.join(__dirname, '../../TAG_Image');
  const filePath = path.join(tagImageDir, `${codeEquipement}.png`);
  console.log(`[TAG_IMAGE] Recherche : ${filePath} — existe : ${fs.existsSync(filePath)}`);
  return fs.existsSync(filePath) ? filePath : null;
};

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
    console.error('getDemandeDetail error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

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
    await envoyerNotification(dem.agent_id, '⏸️ Consignation suspendue',
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
    await db.query(
      `UPDATE points_consignation SET statut='consigne' WHERE id=?`, [pointId]
    );
    return success(res, { pointId, numero_cadenas, mcc_ref: mccRefVal }, 'Cadenas scanné avec succès');
  } catch (err) {
    console.error('scannerCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

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

const validerConsignation = async (req, res) => {
  try {
    const { id }    = req.params;
    const charge_id = req.user.id;

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
         LEFT JOIN executions_consignation ex ON ex.point_id=pc.id
         LEFT JOIN users uc ON ex.consigne_par=uc.id
         WHERE pc.plan_id=? ORDER BY pc.numero_ligne ASC`, [plan.id]
      );
      points = pts;
    }

    const [chargeInfo] = await db.query(
      'SELECT prenom, nom, matricule, badge_ocp_id FROM users WHERE id=?', [charge_id]
    );
    if (!chargeInfo.length) return error(res, 'Chargé introuvable', 404);
    const charge = chargeInfo[0];

    if (points.length > 0) {
      // Vérifier UNIQUEMENT les points electricien — les points process sont gérés par le Chef Process
      const pointsElec = points.filter(p => p.charge_type === 'electricien' || !p.charge_type);
      const tousElecConsignes = pointsElec.every(p => p.numero_cadenas !== null);
      if (!tousElecConsignes) return error(res, 'Tous les cadenas électriques doivent être scannés avant validation', 400);
    }
    if (!demande.photo_path) return error(res, 'La photo du départ consigné est obligatoire', 400);

    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfFileName  = `F-HSE-SEC-22-01_${demande.numero_ordre}_${Date.now()}.pdf`;
    const pdfPath      = path.join(pdfDir, pdfFileName);
    const photoAbsPath = demande.photo_path ? path.join(__dirname, '../../', demande.photo_path) : null;
    const tagImagePath = getTagImagePath(demande.tag);

    await genererPDFFinal({ demande, plan, points, charge, pdfPath, photoAbsPath, tagImagePath });

    const pdfRelPath = `uploads/pdfs/${pdfFileName}`;

    await db.query(
      `UPDATE demandes_consignation SET statut='consigne', charge_id=?, updated_at=NOW() WHERE id=?`,
      [charge_id, id]
    );
    if (plan) {
      await db.query(
        `UPDATE plans_consignation SET statut='execute', updated_at=NOW() WHERE id=?`, [plan.id]
      );
    }
    if (points.length > 0) {
      await db.query(
        `UPDATE points_consignation SET statut='verifie' WHERE plan_id=? AND statut='consigne'`,
        [plan ? plan.id : 0]
      );
    }

    const [archiveExist] = await db.query(
      'SELECT id FROM dossiers_archives WHERE demande_id=?', [id]
    );
    if (archiveExist.length > 0) {
      await db.query(
        'UPDATE dossiers_archives SET pdf_path=?, cloture_par=?, date_cloture=NOW(), remarques=? WHERE demande_id=?',
        [pdfRelPath, charge_id, 'Consignation validée — PDF final', id]
      );
    } else {
      await db.query(
        `INSERT INTO dossiers_archives (demande_id, pdf_path, cloture_par, date_cloture, remarques) VALUES (?,?,?,NOW(),'Consignation validée')`,
        [id, pdfRelPath, charge_id]
      );
    }

    await envoyerNotification(demande.agent_id_val, '✅ Consignation effectuée',
      `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} est consignée.`,
      'execution', `demande/${id}`);
    await envoyerPushNotification([demande.agent_id_val], '✅ Consignation effectuée',
      `${demande.numero_ordre} — ${demande.tag} consigné.`,
      { demande_id: id, statut: 'consigne' });

    const types = demande.types_intervenants || [];
    if (types.length > 0) {
      const roleNomMap = {
        genie_civil: 'chef_genie_civil',
        mecanique:   'chef_mecanique',
        electrique:  'chef_electrique',
        process:     'chef_process',
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
          await envoyerNotificationMultiple(chefIds, '🔑 Autorisation de travail disponible',
            `Le départ ${demande.tag} (LOT ${demande.lot_code}) est consigné. Vos équipes peuvent intervenir.`,
            'autorisation', `demande/${id}`);
          await envoyerPushNotification(chefIds, 'Autorisation de travail disponible',
            `${demande.tag} (LOT ${demande.lot_code}) consigné`,
            { demande_id: id, statut: 'consigne' });
        }
      }
    }

    return success(res, { pdf_path: pdfRelPath }, 'Consignation validée avec succès');
  } catch (err) {
    console.error('validerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

const getHistorique = async (req, res) => {
  try {
    const charge_id = req.user.id;
    const [rows] = await db.query(
      `SELECT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              l.code AS lot_code, CONCAT(u.prenom,' ',u.nom) AS demandeur_nom,
              da.pdf_path
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id=e.id
       LEFT JOIN lots l ON d.lot_id=l.id
       JOIN users u ON d.agent_id=u.id
       LEFT JOIN dossiers_archives da ON da.demande_id=d.id
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

const servirPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT pdf_path FROM dossiers_archives WHERE demande_id=?', [id]);
    if (!rows.length || !rows[0].pdf_path)
      return res.status(404).json({ message: 'PDF non disponible pour cette demande' });
    const pdfAbsPath = path.join(__dirname, '../../', rows[0].pdf_path);
    if (!fs.existsSync(pdfAbsPath))
      return res.status(404).json({ message: 'Fichier PDF introuvable sur le serveur' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="consignation_${id}.pdf"`);
    fs.createReadStream(pdfAbsPath).pipe(res);
  } catch (err) {
    console.error('servirPDF error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// HELPER — Générer PDF FINAL
//
// ✅ CORRECTIONS :
//   1. "Plan de consignation" → même couleur bleu foncé (#003087) que "Exécution..."
//   2. Colonne "Chargé (3)" → affiche directement charge_type depuis BDD
//   3. "Date d'émission" → toujours date du jour (fmtDate(new Date()))
//   4. ✅ FIX PRINCIPAL : colonnes Exécution vides pour les points 'process'
//      Le chargé ne remplit QUE les lignes charge_type='electricien'
// ═══════════════════════════════════════════════════════════════════
const genererPDFFinal = ({ demande, plan, points, charge, pdfPath, photoAbsPath, tagImagePath }) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 30, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const ML  = 30;
    const PW  = 595 - ML - 30;

    const BLEU_HEADER   = '#003087';
    const BLEU_PLAN     = '#5B9BD5';
    const BLEU_PLAN_CLR = '#D6E4F3';
    const BLANC         = '#FFFFFF';

    const toMaroc = (d) => {
      if (!d) return null;
      const dt = new Date(d);
      return new Date(dt.getTime() + 1 * 60 * 60 * 1000);
    };
    const fmtDate = (d) => {
      if (!d) return '';
      const dt = toMaroc(d);
      return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
    };
    const fmtHeureComplete = (d) => {
      if (!d) return '';
      const dt = toMaroc(d);
      return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`;
    };

    const hdrH = 65;
    const LOGO_PATH = path.join(__dirname, '../utils/OCPLOGO.png');

    // ── Logo OCP ──
    doc.rect(ML, 30, 80, hdrH).stroke('#000');
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, ML + 5, 33, { width: 70, height: 58, fit: [70, 58], align: 'center', valign: 'center' });
      } catch (e) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' });
      }
    } else {
      doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' });
    }

    // ── Titre central ──
    const titleX = ML + 82;
    const titleW = PW - 82 - 102;
    doc.rect(titleX, 30, titleW, hdrH).stroke('#000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Formulaire', titleX, 40, { width: titleW, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').text('Fiche Consignation/Déconsignation des', titleX, 54, { width: titleW, align: 'center' });
    doc.text('Energies et Produits Dangereux', titleX, 64, { width: titleW, align: 'center' });

    // ── Référence ──
    const refX = ML + 82 + titleW + 2;
    const refW = PW - 82 - titleW - 2;
    const today = new Date();
    const refRows = [
      'F-HSE-SEC-22-01',
      'Edition : 2.0',
      `Date d'émission\n${fmtDate(today)}`,
      'Page : 1/1',
    ];
    let ry = 30;
    refRows.forEach(txt => {
      const rh = txt.includes('\n') ? 20 : 14;
      doc.rect(refX, ry, refW, rh).stroke('#000');
      doc.fontSize(6).font('Helvetica').fillColor('#000').text(txt, refX + 2, ry + 3, { width: refW - 4, align: 'center' });
      ry += rh;
    });

    let y = 30 + hdrH + 8;

    // ── Entité / LOT ──
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#000').text('Entité : ', ML, y, { continued: true })
       .font('Helvetica').text(demande.lot_code || '');
    y += 14;

    // ── N° ordre + Date ──
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text("N° d'ordre de la fiche de", ML, y);
    doc.font('Helvetica-Oblique').text('cadenassage', ML, y + 9, { continued: true })
       .font('Helvetica').text(' : ', { continued: true })
       .font('Helvetica-Bold').text(demande.numero_ordre || '');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000')
       .text('Date : ', ML + 270, y + 9, { continued: true })
       .font('Helvetica').text(fmtDate(today));
    y += 22;

    // ── Équipement ──
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text("Equipements ou Installation de l'", ML, y, { continued: true })
       .font('Helvetica-Oblique').text('entité', { continued: true })
       .font('Helvetica').text(' concernée : ', { continued: true })
       .font('Helvetica-Bold').text(`${demande.equipement_nom || ''} (${demande.tag || ''})`);
    doc.moveTo(ML + 210, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    // ── Raison ──
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text('Raison du ', ML, y, { continued: true })
       .font('Helvetica-Oblique').text('cadenassage', { continued: true })
       .font('Helvetica').text(' (intervention prévue) : ', { continued: true })
       .font('Helvetica-Bold').text(demande.raison || '');
    doc.moveTo(ML + 195, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    // ── Références plans ──
    doc.rect(ML, y, PW, 14).stroke('#000');
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text(`Références des plans et schémas : ${plan?.schema_ref || demande.tag || ''}`, ML + 3, y + 3, { width: PW - 6 });
    y += 18;

    // ── Colonnes tableau ──
    const C = { num: 18, repere: 65, local: 70, disp: 62, etat: 38, charge: 52 };
    const planW = C.num + C.repere + C.local + C.disp + C.etat + C.charge;
    const execW = PW - planW;

    C.cad   = 44; C.cNom  = 30; C.cDate = 28; C.cHeure = 26;
    C.vNom  = 30; C.vDate = 28; C.dNom  = 30;
    C.dDate = execW - C.cad - C.cNom - C.cDate - C.cHeure - C.vNom - C.vDate - C.dNom;

    const ROW_H1   = 12;
    const ROW_H2   = 20;
    const ROW_DATA = 13;

    doc.rect(ML, y, planW, ROW_H1).fillAndStroke(BLEU_HEADER, BLEU_HEADER);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(BLANC)
       .text('Plan de consignation', ML, y + 3, { width: planW, align: 'center' });

    doc.rect(ML + planW, y, execW, ROW_H1).fillAndStroke(BLEU_HEADER, BLEU_HEADER);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(BLANC)
       .text('Exécution du plan de consignation', ML + planW, y + 3, { width: execW, align: 'center' });
    y += ROW_H1;

    // ── Sous-en-têtes groupes ──
    doc.rect(ML, y, planW, ROW_H2).fillAndStroke(BLEU_PLAN, BLEU_PLAN);

    const consigneW  = C.cad + C.cNom + C.cDate + C.cHeure;
    const verifieW   = C.vNom + C.vDate;
    const dConsigneW = C.dNom + C.dDate;

    let gx = ML + planW;
    doc.rect(gx, y, consigneW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Consigné par', gx, y + 2, { width: consigneW, align: 'center' });
    gx += consigneW;

    doc.rect(gx, y, verifieW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Vérifié par', gx, y + 2, { width: verifieW, align: 'center' });
    gx += verifieW;

    doc.rect(gx, y, dConsigneW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Déconsigné par', gx, y + 2, { width: dConsigneW, align: 'center' });

    const sy = y + ROW_H2 / 2 + 1;

    const drawSubHdrPlan = (txt, wx, wy, ww) => {
      doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor(BLANC)
         .text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };
    const drawSubHdrExec = (txt, wx, wy, ww) => {
      doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLANC, '#000');
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000')
         .text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };

    let sx = ML;
    drawSubHdrPlan('N°',                       sx, sy, C.num);    sx += C.num;
    drawSubHdrPlan('Repère du\npoint',          sx, sy, C.repere); sx += C.repere;
    drawSubHdrPlan('Localisation\n(MCC)',       sx, sy, C.local);  sx += C.local;
    drawSubHdrPlan('Dispositif (1)\n(Cadenas)', sx, sy, C.disp);   sx += C.disp;
    drawSubHdrPlan('Etat (2)\nouvert/fermé',    sx, sy, C.etat);   sx += C.etat;
    drawSubHdrPlan('Chargé (3)',                sx, sy, C.charge); sx += C.charge;

    drawSubHdrExec('N° du\ncadenas', sx, sy, C.cad);    sx += C.cad;
    drawSubHdrExec('Nom',            sx, sy, C.cNom);   sx += C.cNom;
    drawSubHdrExec('date',           sx, sy, C.cDate);  sx += C.cDate;
    drawSubHdrExec('heure',          sx, sy, C.cHeure); sx += C.cHeure;
    drawSubHdrExec('Nom',            sx, sy, C.vNom);   sx += C.vNom;
    drawSubHdrExec('Date',           sx, sy, C.vDate);  sx += C.vDate;
    drawSubHdrExec('Nom',            sx, sy, C.dNom);   sx += C.dNom;
    drawSubHdrExec('date',           sx, sy, C.dDate);

    y += ROW_H2;

    const chargeNomComplet = `${charge.prenom} ${charge.nom}`;
    const dateValidation   = fmtDate(today);

    const ORDERED = Array.from({ length: 9 }, (_, i) => points[i] || null);

    ORDERED.forEach((pt, i) => {
      const bgPlan = i % 2 === 0 ? BLEU_PLAN : BLEU_PLAN_CLR;
      const bgExec = i % 2 === 0 ? BLANC : '#F5F9FF';

      doc.rect(ML, y, planW, ROW_DATA).fillAndStroke(bgPlan, '#000');
      doc.rect(ML + planW, y, execW, ROW_DATA).fillAndStroke(bgExec, '#000');

      const cellPlan = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000')
           .text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };
      const cellExec = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000')
           .text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };

      let dx = ML;

      if (pt) {
        // ✅ FIX : le chargé ne remplit les colonnes Exécution QUE pour les points electricien
        // Les points 'process' sont gérés par le Chef Process — leurs colonnes restent vides
        const isElec       = pt.charge_type === 'electricien' || !pt.charge_type;
        const executantNom = pt.consigne_par_nom || (isElec ? chargeNomComplet : '');
        const chargeLabel  = pt.charge_type || 'electricien';

        // Colonnes "Plan de consignation" — toujours remplies pour tous les points
        cellPlan(pt.numero_ligne,                dx, C.num);    dx += C.num;
        cellPlan(pt.repere_point || demande.tag, dx, C.repere); dx += C.repere;
        cellPlan(pt.mcc_ref || pt.localisation,  dx, C.local);  dx += C.local;
        cellPlan(pt.dispositif_condamnation,     dx, C.disp);   dx += C.disp;
        cellPlan(pt.etat_requis,                 dx, C.etat);   dx += C.etat;
        cellPlan(chargeLabel,                    dx, C.charge); dx += C.charge;

        // Colonnes "Exécution" — vides pour les points process, remplies pour electricien
        cellExec(isElec ? (pt.numero_cadenas || '')       : '', dx, C.cad);    dx += C.cad;
        cellExec(isElec ? executantNom                    : '', dx, C.cNom);   dx += C.cNom;
        cellExec(isElec ? fmtDate(pt.date_consigne)       : '', dx, C.cDate);  dx += C.cDate;
        cellExec(isElec ? fmtHeureComplete(pt.date_consigne) : '', dx, C.cHeure); dx += C.cHeure;
        cellExec(isElec ? chargeNomComplet                : '', dx, C.vNom);   dx += C.vNom;
        cellExec(isElec ? dateValidation                  : '', dx, C.vDate);  dx += C.vDate;
        cellExec('',                                           dx, C.dNom);   dx += C.dNom;
        cellExec('',                                           dx, C.dDate);
      } else {
        [C.num, C.repere, C.local, C.disp, C.etat, C.charge].forEach(cw => { cellPlan('', dx, cw); dx += cw; });
        [C.cad, C.cNom, C.cDate, C.cHeure, C.vNom, C.vDate, C.dNom, C.dDate].forEach(cw => { cellExec('', dx, cw); dx += cw; });
      }
      y += ROW_DATA;
    });

    // ── Bas — Plan établi / approuvé ──
    const basH = 44;
    const basW = PW / 2;

    doc.rect(ML, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan établi par :', ML + 4, y + 4);
    doc.font('Helvetica').fontSize(7).text(chargeNomComplet, ML + 4, y + 14);
    doc.font('Helvetica-Bold').text('Date : ', ML + 4, y + 24, { continued: true }).font('Helvetica').text(dateValidation);
    doc.font('Helvetica-Bold').text('Signature :', ML + 4, y + 34);

    doc.rect(ML + basW, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan approuvé par :', ML + basW + 4, y + 4);
    doc.font('Helvetica').fontSize(7).text(chargeNomComplet, ML + basW + 4, y + 14);
    doc.font('Helvetica-Bold').text('Date : ', ML + basW + 4, y + 24, { continued: true }).font('Helvetica').text(dateValidation);
    doc.font('Helvetica-Bold').text('Signature :', ML + basW + 4, y + 34);
    y += basH + 6;

    doc.fontSize(7).font('Helvetica').fillColor('#000').text('Remarques : ', ML, y, { continued: true });
    doc.moveTo(ML + 60, y + 8).lineTo(ML + PW, y + 8).dash(2, { space: 2 }).stroke('#000');
    doc.undash();
    y += 10;

    const notes = [
      "(1) : Indiquer le dispositif adéquat pour la condamnation (cadenas, chaîne, accessoires de vanne à volant...etc)",
      "(2) : Indiquer la position de séparation (ouvert ou fermer)",
      "(3) : Indiquer la personne ou la fonction habilitée à réaliser la consignation (électricien, chef d'équipe production).",
    ];
    notes.forEach(n => { doc.fontSize(5.8).font('Helvetica').fillColor('#000').text(n, ML, y); y += 8; });

    // ── Photo schéma TAG ──
    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC)
       .text('Schéma / Plan de l\'équipement', ML, y + 3, { width: PW, align: 'center' });
    y += 16;

    const schemaH = 160;
    doc.rect(ML, y, PW, schemaH).stroke('#000');
    if (tagImagePath) {
      try {
        doc.image(tagImagePath, ML + 2, y + 2, {
          width: PW - 4, height: schemaH - 4,
          fit: [PW - 4, schemaH - 4], align: 'center', valign: 'center',
        });
      } catch (imgErr) {}
    }
    y += schemaH + 4;

    // ── Photo terrain ──
    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC)
       .text('Photo du départ consigné', ML, y + 3, { width: PW, align: 'center' });
    y += 16;

    const photoH = 160;
    doc.rect(ML, y, PW, photoH).stroke('#000');
    if (photoAbsPath && fs.existsSync(photoAbsPath)) {
      try {
        doc.image(photoAbsPath, ML + 2, y + 2, {
          width: PW - 4, height: photoH - 4,
          fit: [PW - 4, photoH - 4], align: 'center', valign: 'center',
        });
      } catch (imgErr) {}
      y += photoH + 4;
      doc.fontSize(7).font('Helvetica').fillColor('#555')
         .text(`Photo prise par ${chargeNomComplet} le ${dateValidation} à ${fmtHeureComplete(today)}`,
           ML, y, { width: PW, align: 'center' });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
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