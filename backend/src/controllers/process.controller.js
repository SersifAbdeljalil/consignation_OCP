// src/controllers/process.controller.js
// Chef Process — gère les points charge_type='process'
//
// ✅ FIX PRINCIPAL : validerConsignation régénère maintenant le PDF FINAL
//    avec les colonnes Exécution remplies pour les points process ET electricien
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
  const filePath    = path.join(tagImageDir, `${codeEquipement}.png`);
  return fs.existsSync(filePath) ? filePath : null;
};

// ── Liste des demandes process ─────────────────────────────────────
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

// ── Démarrer ──────────────────────────────────────────────────────
const demarrerConsignation = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT statut FROM demandes_consignation WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    if (rows[0].statut === 'en_cours') return success(res, null, 'Consignation déjà en cours');
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

// ── Scanner cadenas (point prédéfini) ─────────────────────────────
const scannerCadenas = async (req, res) => {
  try {
    const { pointId } = req.params;
    const { numero_cadenas, mcc_ref } = req.body;
    const process_id = req.user.id;
    if (!numero_cadenas) return error(res, 'numero_cadenas est requis', 400);
    const mccRefVal = mcc_ref || '';
    const [points] = await db.query('SELECT id, charge_type FROM points_consignation WHERE id=?', [pointId]);
    if (!points.length) return error(res, 'Point introuvable', 404);
    if (points[0].charge_type !== 'process') return error(res, 'Ce point n\'est pas de type process', 403);
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
// ── Valider la consignation process ──────────────────────────────
//
// ✅ FIX COMPLET :
//   1. Récupère TOUS les points (process + electricien) avec leurs exécutions
//   2. Récupère la photo terrain enregistrée par le chargé
//   3. Récupère le nom du chargé principal (pour le PDF)
//   4. RÉGÉNÈRE le PDF FINAL avec les colonnes process ET electricien remplies
//   5. Met à jour dossiers_archives avec le nouveau PDF
//   6. Met à jour statut = 'consigne' + date_validation
// ═══════════════════════════════════════════════════════════════════
const validerConsignation = async (req, res) => {
  try {
    const { id }     = req.params;
    const process_id = req.user.id;

    // ── 1. Demande complète ──
    const [demandes] = await db.query(
      `SELECT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              e.localisation AS equipement_localisation, e.entite AS equipement_entite,
              l.code AS lot_code, CONCAT(ua.prenom,' ',ua.nom) AS demandeur_nom,
              ua.id AS agent_id_val
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users ua      ON d.agent_id = ua.id
       WHERE d.id = ?`, [id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    demande.types_intervenants = demande.types_intervenants
      ? JSON.parse(demande.types_intervenants) : [];

    // ── 2. Plan ──
    const [plans] = await db.query(
      `SELECT p.*, CONCAT(ue.prenom,' ',ue.nom) AS etabli_nom,
              CONCAT(ua2.prenom,' ',ua2.nom) AS approuve_nom
       FROM plans_consignation p
       LEFT JOIN users ue  ON p.etabli_par  = ue.id
       LEFT JOIN users ua2 ON p.approuve_par = ua2.id
       WHERE p.demande_id = ?`, [id]
    );
    const plan = plans[0] || null;

    // ── 3. TOUS les points avec leurs exécutions (process + electricien) ──
    let points = [];
    if (plan) {
      const [pts] = await db.query(
        `SELECT pc.*,
                ex.numero_cadenas,
                ex.mcc_ref,
                ex.date_consigne,
                ex.charge_type AS exec_charge_type,
                CONCAT(uc.prenom,' ',uc.nom) AS consigne_par_nom
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         LEFT JOIN users uc ON ex.consigne_par = uc.id
         WHERE pc.plan_id = ?
         ORDER BY pc.numero_ligne ASC`, [plan.id]
      );
      points = pts;
    }

    // ── 4. Vérifier que tous les points process sont consignés ──
    const pointsProcess = points.filter(p => p.charge_type === 'process');
    if (pointsProcess.length > 0) {
      const nonConsignes = pointsProcess.filter(p => !p.numero_cadenas);
      if (nonConsignes.length > 0)
        return error(res, `${nonConsignes.length} point(s) process non consigné(s)`, 400);
    }

    // ── 5. Infos chef process ──
    const [processInfo] = await db.query(
      'SELECT prenom, nom, matricule FROM users WHERE id=?', [process_id]
    );
    if (!processInfo.length) return error(res, 'Chef Process introuvable', 404);
    const chef = processInfo[0];

    // ── 6. Infos chargé principal (pour le PDF — nom dans "Plan établi par") ──
    // Priorité : chargé qui a déjà validé la partie élec, sinon chef process
    let chargeForPDF = { prenom: chef.prenom, nom: chef.nom, matricule: chef.matricule };
    if (demande.charge_id) {
      const [chargeInfo] = await db.query(
        'SELECT prenom, nom, matricule FROM users WHERE id=?', [demande.charge_id]
      );
      if (chargeInfo.length) chargeForPDF = chargeInfo[0];
    }

    // ── 7. Chemins photo + tag ──
    const photoAbsPath = demande.photo_path
      ? path.join(__dirname, '../../', demande.photo_path)
      : null;
    const tagImagePath = getTagImagePath(demande.tag);

    // ── 8. Générer le nouveau PDF avec TOUS les points remplis ──
    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const pdfFileName = `F-HSE-SEC-22-01_${demande.numero_ordre}_process_${Date.now()}.pdf`;
    const pdfAbsPath  = path.join(pdfDir, pdfFileName);
    const pdfRelPath  = `uploads/pdfs/${pdfFileName}`;

    await genererPDFFinal({
      demande,
      plan,
      points,          // ← TOUS les points : process remplis + electricien déjà remplis
      charge: chargeForPDF,
      pdfPath: pdfAbsPath,
      photoAbsPath,
      tagImagePath,
    });

    // ── 9. Mettre à jour dossiers_archives avec le nouveau PDF ──
    const [archiveExist] = await db.query(
      'SELECT id FROM dossiers_archives WHERE demande_id=?', [id]
    );
    if (archiveExist.length > 0) {
      await db.query(
        `UPDATE dossiers_archives
         SET pdf_path=?, cloture_par=?, date_cloture=NOW(),
             remarques='Consignation complète — process validé — PDF final mis à jour'
         WHERE demande_id=?`,
        [pdfRelPath, process_id, id]
      );
    } else {
      await db.query(
        `INSERT INTO dossiers_archives (demande_id, pdf_path, cloture_par, date_cloture, remarques)
         VALUES (?,?,?,NOW(),'Consignation validée par process')`,
        [id, pdfRelPath, process_id]
      );
    }

    // ── 10. Mettre à jour statut ──
    await db.query(
      `UPDATE demandes_consignation
       SET statut='consigne', date_validation=NOW(), updated_at=NOW()
       WHERE id=?`, [id]
    );

    // ── 11. Notifications ──
    await envoyerNotification(
      demande.agent_id_val,
      '⚙️ Consignation process effectuée',
      `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} : points process consignés. PDF mis à jour.`,
      'execution', `demande/${id}`
    );
    await envoyerPushNotification(
      [demande.agent_id_val],
      '⚙️ Consignation process effectuée',
      `${demande.numero_ordre} — points process consignés`,
      { demande_id: id, statut: 'consigne' }
    );

    const types = demande.types_intervenants || [];
    if (types.length > 0) {
      const roleNomMap = {
        genie_civil: 'chef_genie_civil',
        mecanique:   'chef_mecanique',
        electrique:  'chef_electrique',
        process:     'chef_process',
      };
      const roleNomsCibles = types
        .filter(t => t !== 'process')
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
            chefIds, '🔑 Autorisation de travail disponible',
            `Le départ ${demande.tag} (LOT ${demande.lot_code}) est consigné. Vos équipes peuvent intervenir.`,
            'autorisation', `demande/${id}`
          );
          await envoyerPushNotification(
            chefIds, 'Autorisation de travail disponible',
            `${demande.tag} (LOT ${demande.lot_code}) consigné`,
            { demande_id: id }
          );
        }
      }
    }

    return success(res, { pdf_path: pdfRelPath }, 'Consignation process validée avec succès');
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
              da.pdf_path
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id=e.id
       LEFT JOIN lots l ON d.lot_id=l.id
       JOIN users u ON d.agent_id=u.id
       LEFT JOIN dossiers_archives da ON da.demande_id=d.id
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

// ═══════════════════════════════════════════════════════════════════
// HELPER — Générer PDF FINAL
// Identique à charge.controller.js MAIS :
// ✅ Remplie les colonnes Exécution pour TOUS les types (electricien + process)
//    Chaque point affiche le nom de la personne qui l'a consigné (consigne_par_nom)
// ═══════════════════════════════════════════════════════════════════
const genererPDFFinal = ({ demande, plan, points, charge, pdfPath, photoAbsPath, tagImagePath }) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 30, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const ML = 30;
    const PW = 595 - ML - 30;
    const BLEU_HEADER   = '#003087';
    const BLEU_PLAN     = '#5B9BD5';
    const BLEU_PLAN_CLR = '#D6E4F3';
    const BLANC         = '#FFFFFF';

    const toMaroc = (d) => {
      if (!d) return null;
      return new Date(new Date(d).getTime() + 3600000);
    };
    const fmtDate = (d) => {
      if (!d) return '';
      const dt = toMaroc(d);
      return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
    };
    const fmtHeure = (d) => {
      if (!d) return '';
      const dt = toMaroc(d);
      return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`;
    };

    const today    = new Date();
    const hdrH     = 65;
    const LOGO_PATH = path.join(__dirname, '../utils/OCPLOGO.png');

    // ── Logo ──
    doc.rect(ML, 30, 80, hdrH).stroke('#000');
    if (fs.existsSync(LOGO_PATH)) {
      try { doc.image(LOGO_PATH, ML + 5, 33, { width: 70, height: 58, fit: [70, 58], align: 'center', valign: 'center' }); }
      catch (e) { doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' }); }
    }

    // ── Titre ──
    const titleX = ML + 82;
    const titleW = PW - 82 - 102;
    doc.rect(titleX, 30, titleW, hdrH).stroke('#000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Formulaire', titleX, 40, { width: titleW, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').text('Fiche Consignation/Déconsignation des', titleX, 54, { width: titleW, align: 'center' });
    doc.text('Energies et Produits Dangereux', titleX, 64, { width: titleW, align: 'center' });

    // ── Référence ──
    const refX = ML + 82 + titleW + 2;
    const refW = PW - 82 - titleW - 2;
    let ry = 30;
    ['F-HSE-SEC-22-01', 'Edition : 2.0', `Date d'émission\n${fmtDate(today)}`, 'Page : 1/1'].forEach(txt => {
      const rh = txt.includes('\n') ? 20 : 14;
      doc.rect(refX, ry, refW, rh).stroke('#000');
      doc.fontSize(6).font('Helvetica').fillColor('#000').text(txt, refX + 2, ry + 3, { width: refW - 4, align: 'center' });
      ry += rh;
    });

    let y = 30 + hdrH + 8;

    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#000').text('Entité : ', ML, y, { continued: true }).font('Helvetica').text(demande.lot_code || '');
    y += 14;

    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text("N° d'ordre de la fiche de", ML, y);
    doc.font('Helvetica-Oblique').text('cadenassage', ML, y + 9, { continued: true }).font('Helvetica').text(' : ', { continued: true }).font('Helvetica-Bold').text(demande.numero_ordre || '');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000').text('Date : ', ML + 270, y + 9, { continued: true }).font('Helvetica').text(fmtDate(today));
    y += 22;

    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text("Equipements ou Installation de l'", ML, y, { continued: true })
       .font('Helvetica-Oblique').text('entité', { continued: true })
       .font('Helvetica').text(' concernée : ', { continued: true })
       .font('Helvetica-Bold').text(`${demande.equipement_nom || ''} (${demande.tag || ''})`);
    doc.moveTo(ML + 210, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text('Raison du ', ML, y, { continued: true }).font('Helvetica-Oblique').text('cadenassage', { continued: true })
       .font('Helvetica').text(' (intervention prévue) : ', { continued: true }).font('Helvetica-Bold').text(demande.raison || '');
    doc.moveTo(ML + 195, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    doc.rect(ML, y, PW, 14).stroke('#000');
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text(`Références des plans et schémas : ${plan?.schema_ref || demande.tag || ''}`, ML + 3, y + 3, { width: PW - 6 });
    y += 18;

    // ── Colonnes ──
    const C = { num: 18, repere: 65, local: 70, disp: 62, etat: 38, charge: 52 };
    const planW = C.num + C.repere + C.local + C.disp + C.etat + C.charge;
    const execW = PW - planW;
    C.cad = 44; C.cNom = 30; C.cDate = 28; C.cHeure = 26;
    C.vNom = 30; C.vDate = 28; C.dNom = 30;
    C.dDate = execW - C.cad - C.cNom - C.cDate - C.cHeure - C.vNom - C.vDate - C.dNom;
    const ROW_H1 = 12, ROW_H2 = 20, ROW_DATA = 13;

    doc.rect(ML, y, planW, ROW_H1).fillAndStroke(BLEU_HEADER, BLEU_HEADER);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(BLANC).text('Plan de consignation', ML, y + 3, { width: planW, align: 'center' });
    doc.rect(ML + planW, y, execW, ROW_H1).fillAndStroke(BLEU_HEADER, BLEU_HEADER);
    doc.fontSize(7).font('Helvetica-Bold').fillColor(BLANC).text('Exécution du plan de consignation', ML + planW, y + 3, { width: execW, align: 'center' });
    y += ROW_H1;

    doc.rect(ML, y, planW, ROW_H2).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    const consigneW = C.cad + C.cNom + C.cDate + C.cHeure;
    const verifieW  = C.vNom + C.vDate;
    const dConsW    = C.dNom + C.dDate;
    let gx = ML + planW;
    doc.rect(gx, y, consigneW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Consigné par', gx, y + 2, { width: consigneW, align: 'center' }); gx += consigneW;
    doc.rect(gx, y, verifieW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Vérifié par', gx, y + 2, { width: verifieW, align: 'center' }); gx += verifieW;
    doc.rect(gx, y, dConsW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Déconsigné par', gx, y + 2, { width: dConsW, align: 'center' });

    const sy = y + ROW_H2 / 2 + 1;
    const subP = (txt, wx, wy, ww) => {
      doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor(BLANC).text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };
    const subE = (txt, wx, wy, ww) => {
      doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLANC, '#000');
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000').text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };
    let sx = ML;
    subP('N°',                       sx, sy, C.num);    sx += C.num;
    subP('Repère du\npoint',          sx, sy, C.repere); sx += C.repere;
    subP('Localisation\n(MCC)',       sx, sy, C.local);  sx += C.local;
    subP('Dispositif (1)\n(Cadenas)', sx, sy, C.disp);   sx += C.disp;
    subP('Etat (2)\nouvert/fermé',    sx, sy, C.etat);   sx += C.etat;
    subP('Chargé (3)',                sx, sy, C.charge); sx += C.charge;
    subE('N° du\ncadenas', sx, sy, C.cad);    sx += C.cad;
    subE('Nom',            sx, sy, C.cNom);   sx += C.cNom;
    subE('date',           sx, sy, C.cDate);  sx += C.cDate;
    subE('heure',          sx, sy, C.cHeure); sx += C.cHeure;
    subE('Nom',            sx, sy, C.vNom);   sx += C.vNom;
    subE('Date',           sx, sy, C.vDate);  sx += C.vDate;
    subE('Nom',            sx, sy, C.dNom);   sx += C.dNom;
    subE('date',           sx, sy, C.dDate);
    y += ROW_H2;

    const chargeNom    = `${charge.prenom} ${charge.nom}`;
    const dateValid    = fmtDate(today);
    const ORDERED      = Array.from({ length: 9 }, (_, i) => points[i] || null);

    ORDERED.forEach((pt, i) => {
      const bgPlan = i % 2 === 0 ? BLEU_PLAN : BLEU_PLAN_CLR;
      const bgExec = i % 2 === 0 ? BLANC : '#F5F9FF';
      doc.rect(ML, y, planW, ROW_DATA).fillAndStroke(bgPlan, '#000');
      doc.rect(ML + planW, y, execW, ROW_DATA).fillAndStroke(bgExec, '#000');

      const cellP = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000')
           .text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };
      const cellE = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000')
           .text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };

      let dx = ML;
      if (pt) {
        // ✅ FIX : consigne_par_nom = nom de la personne qui a réellement posé ce cadenas
        // (chargé pour electricien, chef process pour process — vient du JOIN users)
        const executantNom = pt.consigne_par_nom || chargeNom;
        const chargeLabel  = pt.charge_type || 'electricien';
        const aEteConsigne = !!pt.numero_cadenas;

        // Plan
        cellP(pt.numero_ligne,                dx, C.num);    dx += C.num;
        cellP(pt.repere_point || demande.tag, dx, C.repere); dx += C.repere;
        cellP(pt.mcc_ref || pt.localisation,  dx, C.local);  dx += C.local;
        cellP(pt.dispositif_condamnation,     dx, C.disp);   dx += C.disp;
        cellP(pt.etat_requis,                 dx, C.etat);   dx += C.etat;
        cellP(chargeLabel,                    dx, C.charge); dx += C.charge;

        // ✅ Exécution — remplie pour TOUS les types dès que le cadenas est posé
        cellE(aEteConsigne ? (pt.numero_cadenas || '')  : '', dx, C.cad);    dx += C.cad;
        cellE(aEteConsigne ? executantNom               : '', dx, C.cNom);   dx += C.cNom;
        cellE(aEteConsigne ? fmtDate(pt.date_consigne)  : '', dx, C.cDate);  dx += C.cDate;
        cellE(aEteConsigne ? fmtHeure(pt.date_consigne) : '', dx, C.cHeure); dx += C.cHeure;
        cellE(aEteConsigne ? chargeNom                  : '', dx, C.vNom);   dx += C.vNom;
        cellE(aEteConsigne ? dateValid                  : '', dx, C.vDate);  dx += C.vDate;
        cellE('', dx, C.dNom);   dx += C.dNom;
        cellE('', dx, C.dDate);
      } else {
        [C.num, C.repere, C.local, C.disp, C.etat, C.charge].forEach(cw => { cellP('', dx, cw); dx += cw; });
        [C.cad, C.cNom, C.cDate, C.cHeure, C.vNom, C.vDate, C.dNom, C.dDate].forEach(cw => { cellE('', dx, cw); dx += cw; });
      }
      y += ROW_DATA;
    });

    // ── Bas ──
    const basH = 44, basW = PW / 2;
    doc.rect(ML, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan établi par :', ML + 4, y + 4);
    doc.font('Helvetica').fontSize(7).text(chargeNom, ML + 4, y + 14);
    doc.font('Helvetica-Bold').text('Date : ', ML + 4, y + 24, { continued: true }).font('Helvetica').text(dateValid);
    doc.font('Helvetica-Bold').text('Signature :', ML + 4, y + 34);
    doc.rect(ML + basW, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan approuvé par :', ML + basW + 4, y + 4);
    doc.font('Helvetica').fontSize(7).text(chargeNom, ML + basW + 4, y + 14);
    doc.font('Helvetica-Bold').text('Date : ', ML + basW + 4, y + 24, { continued: true }).font('Helvetica').text(dateValid);
    doc.font('Helvetica-Bold').text('Signature :', ML + basW + 4, y + 34);
    y += basH + 6;

    doc.fontSize(7).font('Helvetica').fillColor('#000').text('Remarques : ', ML, y, { continued: true });
    doc.moveTo(ML + 60, y + 8).lineTo(ML + PW, y + 8).dash(2, { space: 2 }).stroke('#000'); doc.undash();
    y += 10;

    [
      "(1) : Indiquer le dispositif adéquat pour la condamnation (cadenas, chaîne, accessoires de vanne à volant...etc)",
      "(2) : Indiquer la position de séparation (ouvert ou fermer)",
      "(3) : Indiquer la personne ou la fonction habilitée à réaliser la consignation (électricien, chef d'équipe production).",
    ].forEach(n => { doc.fontSize(5.8).font('Helvetica').fillColor('#000').text(n, ML, y); y += 8; });

    // ── Schéma TAG ──
    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text("Schéma / Plan de l'équipement", ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const schemaH = 160;
    doc.rect(ML, y, PW, schemaH).stroke('#000');
    if (tagImagePath) {
      try { doc.image(tagImagePath, ML + 2, y + 2, { width: PW - 4, height: schemaH - 4, fit: [PW - 4, schemaH - 4], align: 'center', valign: 'center' }); }
      catch (e) {}
    }
    y += schemaH + 4;

    // ── Photo terrain ──
    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text('Photo du départ consigné', ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const photoH = 160;
    doc.rect(ML, y, PW, photoH).stroke('#000');
    if (photoAbsPath && fs.existsSync(photoAbsPath)) {
      try { doc.image(photoAbsPath, ML + 2, y + 2, { width: PW - 4, height: photoH - 4, fit: [PW - 4, photoH - 4], align: 'center', valign: 'center' }); }
      catch (e) {}
      y += photoH + 4;
      doc.fontSize(7).font('Helvetica').fillColor('#555')
         .text(`Photo prise le ${fmtDate(today)} à ${fmtHeure(today)}`, ML, y, { width: PW, align: 'center' });
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
  scannerCadenas,
  scannerCadenasLibre,
  validerConsignation,
  getHistorique,
  servirPDF,
};