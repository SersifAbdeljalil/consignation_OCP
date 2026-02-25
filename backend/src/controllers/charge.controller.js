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

// ─────────────────────────────────────────────
// GET /charge/demandes
// Toutes les demandes en_attente ou en_cours
// ─────────────────────────────────────────────
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
       WHERE d.statut IN ('en_attente', 'en_cours')
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

// ─────────────────────────────────────────────
// GET /charge/demandes/:id
// Détail demande + points (sans plan HSE requis)
// ─────────────────────────────────────────────
const getDemandeDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // Demande complète
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

    // Points depuis le plan (si plan existe)
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

// ─────────────────────────────────────────────
// POST /charge/demandes/:id/demarrer
// Démarre la consignation → statut en_cours
// ─────────────────────────────────────────────
const demarrerConsignation = async (req, res) => {
  try {
    const { id } = req.params;
    const charge_id = req.user.id;

    const [rows] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?', [id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    if (rows[0].statut === 'en_cours') {
      return success(res, null, 'Consignation déjà en cours');
    }

    await db.query(
      `UPDATE demandes_consignation
       SET statut = 'en_cours', charge_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [charge_id, id]
    );

    return success(res, null, 'Consignation démarrée');
  } catch (err) {
    console.error('demarrerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─────────────────────────────────────────────
// POST /charge/points/:pointId/cadenas
// Enregistre le scan NFC cadenas
// Body: { numero_cadenas, mcc_ref }
// ─────────────────────────────────────────────
const scannerCadenas = async (req, res) => {
  try {
    const { pointId } = req.params;
    const { numero_cadenas, mcc_ref } = req.body;
    const charge_id = req.user.id;

    if (!numero_cadenas || !mcc_ref) {
      return error(res, 'numero_cadenas et mcc_ref sont requis', 400);
    }

    const [points] = await db.query(
      'SELECT id, statut FROM points_consignation WHERE id = ?', [pointId]
    );
    if (!points.length) return error(res, 'Point introuvable', 404);

    const [existant] = await db.query(
      'SELECT id FROM executions_consignation WHERE point_id = ?', [pointId]
    );

    if (existant.length > 0) {
      await db.query(
        `UPDATE executions_consignation
         SET numero_cadenas = ?, mcc_ref = ?, consigne_par = ?, date_consigne = NOW()
         WHERE point_id = ?`,
        [numero_cadenas, mcc_ref, charge_id, pointId]
      );
    } else {
      await db.query(
        `INSERT INTO executions_consignation
         (point_id, numero_cadenas, mcc_ref, consigne_par, date_consigne)
         VALUES (?, ?, ?, ?, NOW())`,
        [pointId, numero_cadenas, mcc_ref, charge_id]
      );
    }

    await db.query(
      `UPDATE points_consignation SET statut = 'consigne' WHERE id = ?`,
      [pointId]
    );

    return success(res, { pointId, numero_cadenas, mcc_ref }, 'Cadenas scanné avec succès');
  } catch (err) {
    console.error('scannerCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─────────────────────────────────────────────
// POST /charge/demandes/:id/photo
// Enregistre la photo (base64)
// ─────────────────────────────────────────────
const enregistrerPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const { photo_base64 } = req.body;

    if (!photo_base64) return error(res, 'Photo requise', 400);

    const uploadsDir = path.join(__dirname, '../../uploads/consignations', id.toString());
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName   = `photo_${Date.now()}.jpg`;
    const filePath   = path.join(uploadsDir, fileName);
    const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const photoPath = `uploads/consignations/${id}/${fileName}`;

    await db.query(
      'UPDATE demandes_consignation SET photo_path = ? WHERE id = ?',
      [photoPath, id]
    );

    return success(res, { photo_path: photoPath }, 'Photo enregistrée');
  } catch (err) {
    console.error('enregistrerPhoto error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─────────────────────────────────────────────
// POST /charge/demandes/:id/valider
// Validation finale → génère PDF → notifications
// FLUX : Chargé seul, sans HSE
// ─────────────────────────────────────────────
const validerConsignation = async (req, res) => {
  try {
    const { id }    = req.params;
    const charge_id = req.user.id;

    // ── 1. Récupérer la demande complète ──────
    const [demandes] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              e.localisation    AS equipement_localisation,
              e.entite          AS equipement_entite,
              l.code            AS lot_code,
              CONCAT(ua.prenom, ' ', ua.nom) AS demandeur_nom,
              ua.id             AS agent_id_val
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users ua      ON d.agent_id = ua.id
       WHERE d.id = ?`,
      [id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    demande.types_intervenants = demande.types_intervenants
      ? JSON.parse(demande.types_intervenants) : [];

    // ── 2. Récupérer plan et points ───────────
    const [plans] = await db.query(
      `SELECT p.*,
              CONCAT(ue.prenom, ' ', ue.nom) AS etabli_nom,
              CONCAT(ua2.prenom, ' ', ua2.nom) AS approuve_nom
       FROM plans_consignation p
       LEFT JOIN users ue  ON p.etabli_par   = ue.id
       LEFT JOIN users ua2 ON p.approuve_par = ua2.id
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
                ex.date_consigne
         FROM points_consignation pc
         LEFT JOIN executions_consignation ex ON ex.point_id = pc.id
         WHERE pc.plan_id = ?
         ORDER BY pc.numero_ligne ASC`,
        [plan.id]
      );
      points = pts;
    }

    // ── 3. Info du chargé connecté ────────────
    const [chargeInfo] = await db.query(
      'SELECT prenom, nom, matricule FROM users WHERE id = ?',
      [charge_id]
    );
    if (!chargeInfo.length) return error(res, 'Chargé introuvable', 404);
    const charge = chargeInfo[0];

    // ── 4. Vérifications ──────────────────────
    // Si des points existent en BDD, vérifier qu'ils sont tous consignés
    if (points.length > 0) {
      const tousConsignes = points.every(p => p.numero_cadenas !== null);
      if (!tousConsignes) {
        return error(res, 'Tous les cadenas doivent être scannés avant validation', 400);
      }
    }
    // Photo obligatoire
    if (!demande.photo_path) {
      return error(res, 'La photo du départ consigné est obligatoire', 400);
    }

    // ── 5. Générer le PDF ─────────────────────
    const pdfDir = path.join(__dirname, '../../uploads/pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const pdfFileName = `F-HSE-SEC-22-01_${demande.numero_ordre}_${Date.now()}.pdf`;
    const pdfPath     = path.join(pdfDir, pdfFileName);
    const photoAbsPath = demande.photo_path
      ? path.join(__dirname, '../../', demande.photo_path)
      : null;

    await genererPDF({ demande, plan, points, charge, pdfPath, photoAbsPath });

    const pdfRelPath = `uploads/pdfs/${pdfFileName}`;

    // ── 6. Mettre à jour la BDD ───────────────
    await db.query(
      `UPDATE demandes_consignation
       SET statut = 'en_cours', charge_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [charge_id, id]
    );

    if (plan) {
      await db.query(
        `UPDATE plans_consignation SET statut = 'en_execution', updated_at = NOW()
         WHERE id = ?`,
        [plan.id]
      );
    }

    // Archiver le PDF
    const [archiveExist] = await db.query(
      'SELECT id FROM dossiers_archives WHERE demande_id = ?', [id]
    );
    if (archiveExist.length > 0) {
      await db.query(
        'UPDATE dossiers_archives SET pdf_path = ?, cloture_par = ? WHERE demande_id = ?',
        [pdfRelPath, charge_id, id]
      );
    } else {
      await db.query(
        `INSERT INTO dossiers_archives (demande_id, pdf_path, cloture_par, remarques)
         VALUES (?, ?, ?, 'Consignation validée par le chargé')`,
        [id, pdfRelPath, charge_id]
      );
    }

    // ── 7. Notification → Demandeur ───────────
    await envoyerNotification(
      demande.agent_id_val,
      'Consignation effectuée',
      `Votre demande ${demande.numero_ordre} — TAG ${demande.tag} est consignée. Les travaux peuvent démarrer.`,
      'execution',
      `demande/${id}`
    );

    await envoyerPushNotification(
      [demande.agent_id_val],
      'Consignation effectuée',
      `${demande.numero_ordre} — ${demande.tag} consigné. Travaux autorisés.`,
      { demande_id: id, statut: 'en_cours' }
    );

    // ── 8. Notifications → Chefs intervenants ─
    const types = demande.types_intervenants || [];
    if (types.length > 0) {
      const placeholders = types.map(() => '?').join(', ');
      const [chefsCibles] = await db.query(
        `SELECT u.id FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE r.nom IN ('chef_genie_civil','chef_mecanique','chef_electrique','chef_process')
           AND u.actif = 1
           AND u.type_metier IN (${placeholders})`,
        types
      );

      if (chefsCibles.length > 0) {
        const chefIds = chefsCibles.map(u => u.id);

        await envoyerNotificationMultiple(
          chefIds,
          'Autorisation de travail disponible',
          `Le départ ${demande.tag} (LOT ${demande.lot_code}) est consigné. Votre équipe peut intervenir.`,
          'autorisation',
          `demande/${id}`
        );

        await envoyerPushNotification(
          chefIds,
          'Autorisation de travail disponible',
          `${demande.tag} (LOT ${demande.lot_code}) consigné — Intervention autorisée`,
          { demande_id: id, statut: 'en_cours' }
        );
      }
    }

    return success(res, { pdf_path: pdfRelPath }, 'Consignation validée avec succès');
  } catch (err) {
    console.error('validerConsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ─────────────────────────────────────────────
// GET /charge/historique
// ─────────────────────────────────────────────
const getHistorique = async (req, res) => {
  try {
    const charge_id = req.user.id;
    const [rows] = await db.query(
      `SELECT d.*,
              e.nom             AS equipement_nom,
              e.code_equipement AS tag,
              l.code            AS lot_code,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l   ON d.lot_id = l.id
       JOIN users u       ON d.agent_id = u.id
       WHERE d.charge_id = ?
       ORDER BY d.updated_at DESC`,
      [charge_id]
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

// ═════════════════════════════════════════════
// HELPER — Générer PDF F-HSE-SEC-22-01
// Fidèle à la maquette originale OCP
// ═════════════════════════════════════════════
const genererPDF = ({ demande, plan, points, charge, pdfPath, photoAbsPath }) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 30, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // ── Constantes de mise en page ────────────
    const ML  = 30;          // marge gauche
    const MR  = 30;          // marge droite
    const PW  = 595 - ML - MR; // largeur utile ≈ 535
    const BLEU     = '#003087';
    const BLEU_CLR = '#d0e4f7';  // bleu clair colonnes plan
    const GRIS_H   = '#f0f0f0';  // gris entête tableau

    const fmtDate = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
    };
    const fmtHeure = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    };

    // ══════════════════════════════════════════
    // EN-TÊTE — Logo | Titre | Référence
    // ══════════════════════════════════════════
    const hdrH   = 65;
    const LOGO_PATH = path.join(__dirname, '../utils/OCPLOGO.png');

    // Cadre logo (gauche)
    doc.rect(ML, 30, 80, hdrH).stroke('#000');
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, ML + 5, 33, { width: 70, height: 58, fit: [70, 58], align: 'center', valign: 'center' });
      } catch (e) {
        // fallback texte si image corrompue
        doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU)
           .text('OCP', ML, 55, { width: 80, align: 'center' });
      }
    } else {
      doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU)
         .text('OCP', ML, 55, { width: 80, align: 'center' });
      doc.fontSize(6).fillColor('#666')
         .text('Groupe OCP', ML, 64, { width: 80, align: 'center' });
    }

    // Titre (centre)
    const titleX = ML + 82;
    const titleW = PW - 82 - 102;
    doc.rect(titleX, 30, titleW, hdrH).stroke('#000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
       .text('Formulaire', titleX, 40, { width: titleW, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold')
       .text('Fiche Consignation/Déconsignation des', titleX, 54, { width: titleW, align: 'center' });
    doc.text('Energies et Produits Dangereux', titleX, 64, { width: titleW, align: 'center' });

    // Référence (droite) — 4 cases empilées
    const refX = ML + 82 + titleW + 2;
    const refW = PW - 82 - titleW - 2;
    const refRows = ['F-HSE-SEC-22-01', 'Edition : 2.0', "Date d'émission\n1/9/2015", 'Page : 1/1'];
    let ry = 30;
    refRows.forEach(txt => {
      const rh = txt.includes('\n') ? 20 : 14;
      doc.rect(refX, ry, refW, rh).stroke('#000');
      doc.fontSize(6).font('Helvetica').fillColor('#000')
         .text(txt, refX + 2, ry + 3, { width: refW - 4, align: 'center' });
      ry += rh;
    });

    // ══════════════════════════════════════════
    // CHAMPS GÉNÉRAUX
    // ══════════════════════════════════════════
    let y = 30 + hdrH + 8;

    // Entité
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#000')
       .text('Entité : ', ML, y, { continued: true })
       .font('Helvetica').text(demande.lot_code || '');
    y += 14;

    // N° d'ordre + Date (sur la même ligne)
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text("N° d'ordre de la fiche de", ML, y);
    doc.font('Helvetica-Oblique')
       .text('cadenassage', ML, y + 9, { continued: true })
       .font('Helvetica').text(' : ', { continued: true })
       .font('Helvetica-Bold').text(demande.numero_ordre || '');

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000')
       .text('Date : ', ML + 270, y + 9, { continued: true })
       .font('Helvetica').text(fmtDate(new Date()));
    y += 22;

    // Equipement
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text("Equipements ou Installation de l'", ML, y, { continued: true })
       .font('Helvetica-Oblique').text('entité', { continued: true })
       .font('Helvetica').text(' concernée : ', { continued: true })
       .font('Helvetica-Bold').text(`${demande.equipement_nom || ''} (${demande.tag || ''})`);
    // Ligne de soulignement
    doc.moveTo(ML + 210, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    // Raison
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text('Raison du ', ML, y, { continued: true })
       .font('Helvetica-Oblique').text('cadenassage', { continued: true })
       .font('Helvetica').text(' (intervention prévue) : ', { continued: true })
       .font('Helvetica-Bold').text(demande.raison || '');
    doc.moveTo(ML + 195, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    // Références plans — cadre pleine largeur
    doc.rect(ML, y, PW, 14).stroke('#000');
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text(`Références des plans et schémas de l'installation ou équipement à consigner : ${plan?.schema_ref || ''}`,
             ML + 3, y + 3, { width: PW - 6 });
    y += 18;

    // ══════════════════════════════════════════
    // TABLEAU PRINCIPAL
    // ══════════════════════════════════════════

    // Largeurs colonnes (total = PW)
    // Plan de consignation (colonnes bleues) | Exécution (colonnes blanches)
    const C = {
      num:    18,   // N°
      repere: 70,   // Repère du point
      local:  75,   // Localisation
      disp:   67,   // Dispositif
      etat:   42,   // Etat
      charge: 55,   // Chargé  → total plan = 327
      cad:    40,   // N° cadenas
      cNom:   28,   // Consigné Nom
      cDate:  28,   // Consigné Date
      cHeure: 25,   // Consigné Heure
      vNom:   28,   // Vérifié Nom
      vDate:  28,   // Vérifié Date
      dNom:   28,   // Déconsigné Nom
      dDate:  25,   // Déconsigné Date
    };
    // Ajuster pour que total = PW (535)
    // Actuellement : 18+70+75+67+42+55 + 40+28+28+25+28+28+28+25 = 327+230 = ... recalcul
    const planW  = C.num + C.repere + C.local + C.disp + C.etat + C.charge;  // 327
    const execW  = PW - planW;
    // Répartir execW dans 8 colonnes
    C.cad   = 45;
    C.cNom  = 32;
    C.cDate = 30;
    C.cHeure= 25;
    C.vNom  = 32;
    C.vDate = 30;
    C.dNom  = 32;
    C.dDate = execW - 45 - 32 - 30 - 25 - 32 - 30 - 32; // reste

    const ROW_H1 = 12; // ligne titre grand
    const ROW_H2 = 18; // ligne sous-titre (2 lignes)
    const ROW_DATA = 13; // lignes données

    // ── Ligne 1 : "Plan de consignation" | "Exécution du plan de consignation"
    doc.rect(ML, y, planW, ROW_H1).fillAndStroke(BLEU, BLEU);
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#fff')
       .text('Plan de consignation', ML, y + 3, { width: planW, align: 'center' });

    doc.rect(ML + planW, y, execW, ROW_H1).fillAndStroke(BLEU, BLEU);
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#fff')
       .text('Exécution du plan de consignation', ML + planW, y + 3, { width: execW, align: 'center' });
    y += ROW_H1;

    // ── Ligne 2 : sous-groupes "Consigné par" | "Vérifié par" | "Déconsigné par"
    // Colonnes plan → fond bleu clair
    doc.rect(ML, y, planW, ROW_H2).fillAndStroke(BLEU_CLR, '#000');

    // Sous-groupes exécution
    const consigneW = C.cad + C.cNom + C.cDate + C.cHeure;
    const verifieW  = C.vNom + C.vDate;
    const dConsigneW= C.dNom + C.dDate;

    let gx = ML + planW;
    doc.rect(gx, y, consigneW, ROW_H2).fillAndStroke('#fff', '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000')
       .text('Consigné par', gx, y + 2, { width: consigneW, align: 'center' });
    gx += consigneW;

    doc.rect(gx, y, verifieW, ROW_H2).fillAndStroke('#fff', '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000')
       .text('Vérifié par', gx, y + 2, { width: verifieW, align: 'center' });
    gx += verifieW;

    doc.rect(gx, y, dConsigneW, ROW_H2).fillAndStroke('#fff', '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000')
       .text('Déconsigné par', gx, y + 2, { width: dConsigneW, align: 'center' });

    // Sous-titres ligne 2 (au bas de ROW_H2)
    const sy = y + ROW_H2 / 2 + 1;
    const drawSubHdr = (txt, wx, wy, ww) => {
      doc.rect(wx, wy, ww, ROW_H2 / 2).stroke('#000');
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000')
         .text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };

    let sx = ML;
    drawSubHdr('N°',                    sx, sy, C.num);    sx += C.num;
    drawSubHdr('Repère du\npoint de\nconsignation', sx, sy, C.repere); sx += C.repere;
    drawSubHdr('Localisation\ndu point de\nconsignation',sx, sy, C.local);  sx += C.local;
    drawSubHdr('Dispositif (1)\nde\ncondamnation', sx, sy, C.disp);  sx += C.disp;
    drawSubHdr('Etat du (2)\npoint de\nconsignation', sx, sy, C.etat);  sx += C.etat;
    drawSubHdr('Chargé (3)\nde la\nconsignation', sx, sy, C.charge); sx += C.charge;

    drawSubHdr('N° du\ncadenas', sx, sy, C.cad);    sx += C.cad;
    drawSubHdr('Nom',  sx, sy, C.cNom);   sx += C.cNom;
    drawSubHdr('date', sx, sy, C.cDate);  sx += C.cDate;
    drawSubHdr('heure',sx, sy, C.cHeure); sx += C.cHeure;
    drawSubHdr('Nom',  sx, sy, C.vNom);   sx += C.vNom;
    drawSubHdr('Date', sx, sy, C.vDate);  sx += C.vDate;
    drawSubHdr('Nom',  sx, sy, C.dNom);   sx += C.dNom;
    drawSubHdr('date', sx, sy, C.dDate);

    y += ROW_H2;

    // ── Lignes de données (toujours 9 lignes) ─
    const chargeNomComplet = `${charge.prenom} ${charge.nom}`;
    const ORDERED = Array.from({ length: 9 }, (_, i) => points[i] || null);

    ORDERED.forEach((pt, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : BLEU_CLR;
      // fond colonnes plan
      doc.rect(ML, y, planW, ROW_DATA).fillAndStroke(bg, '#000');
      // fond colonnes exec (toujours blanc)
      doc.rect(ML + planW, y, execW, ROW_DATA).fillAndStroke('#fff', '#000');

      const cell = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000')
           .text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };

      let dx = ML;
      cell(pt ? pt.numero_ligne       : '',  dx, C.num);    dx += C.num;
      cell(pt ? pt.repere_point       : '',  dx, C.repere); dx += C.repere;
      cell(pt ? pt.localisation       : '',  dx, C.local);  dx += C.local;
      cell(pt ? pt.dispositif_condamnation : '', dx, C.disp); dx += C.disp;
      cell(pt ? pt.etat_requis        : '',  dx, C.etat);   dx += C.etat;
      cell(pt ? chargeNomComplet      : '',  dx, C.charge); dx += C.charge;
      cell(pt ? (pt.numero_cadenas || '') : '', dx, C.cad); dx += C.cad;
      cell(pt ? chargeNomComplet      : '',  dx, C.cNom);   dx += C.cNom;
      cell(pt ? fmtDate(pt.date_consigne) : '', dx, C.cDate); dx += C.cDate;
      cell(pt ? fmtHeure(pt.date_consigne): '', dx, C.cHeure); dx += C.cHeure;
      cell('', dx, C.vNom);  dx += C.vNom;
      cell('', dx, C.vDate); dx += C.vDate;
      cell('', dx, C.dNom);  dx += C.dNom;
      cell('', dx, C.dDate);
      y += ROW_DATA;
    });

    // ── Bas formulaire : Plan établi / approuvé
    const basH = 44;
    const basW = PW / 2;

    // Plan établi par (gauche)
    doc.rect(ML, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000')
       .text('Plan établi par :', ML + 4, y + 4);
    doc.font('Helvetica').fontSize(7)
       .text(plan?.etabli_nom || '—', ML + 4, y + 14);
    doc.font('Helvetica-Bold')
       .text('Date : ', ML + 4, y + 24, { continued: true })
       .font('Helvetica').text(fmtDate(plan?.date_etabli));
    doc.font('Helvetica-Bold')
       .text('Signature :', ML + 4, y + 34);

    // Plan approuvé par (droite)
    doc.rect(ML + basW, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000')
       .text('Plan approuvé par :', ML + basW + 4, y + 4);
    doc.font('Helvetica').fontSize(7)
       .text(plan?.approuve_nom || '—', ML + basW + 4, y + 14);
    doc.font('Helvetica-Bold')
       .text('Date : ', ML + basW + 4, y + 24, { continued: true })
       .font('Helvetica').text(fmtDate(plan?.date_approuve));
    doc.font('Helvetica-Bold')
       .text('Signature :', ML + basW + 4, y + 34);
    y += basH + 6;

    // ── Remarques ─────────────────────────────
    doc.fontSize(7).font('Helvetica').fillColor('#000')
       .text('Remarques : ', ML, y, { continued: true });
    // ligne pointillée
    doc.moveTo(ML + 60, y + 8).lineTo(ML + PW, y + 8).dash(2, { space: 2 }).stroke('#000');
    doc.undash();
    y += 10;

    const notes = [
      "(1) : Indiquer le dispositif adéquat pour la condamnation (cadenas, chaîne, accessoires de vanne à volant...etc)",
      "(2) : Indiquer la position de séparation (ouvert ou fermer)",
      "(3) : Indiquer la personne ou la fonction habilitée à réaliser la consignation (électricien, chef d'équipe production).",
    ];
    notes.forEach(n => {
      doc.fontSize(5.8).font('Helvetica').fillColor('#000').text(n, ML, y);
      y += 8;
    });

    // ── PHOTO ─────────────────────────────────
    if (photoAbsPath && fs.existsSync(photoAbsPath)) {
      y += 8;
      // Titre section photo
      doc.rect(ML, y, PW, 14).fillAndStroke(BLEU, BLEU);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff')
         .text('Photo du départ consigné', ML, y + 3, { width: PW, align: 'center' });
      y += 16;

      // Encadrer la photo
      const photoH = 160;
      doc.rect(ML, y, PW, photoH).stroke('#000');
      try {
        doc.image(photoAbsPath, ML + 2, y + 2, {
          width:  PW - 4,
          height: photoH - 4,
          fit:    [PW - 4, photoH - 4],
          align:  'center',
          valign: 'center',
        });
      } catch (imgErr) {
        doc.fontSize(8).fillColor('#999')
           .text('Photo non disponible', ML, y + photoH / 2 - 6, { width: PW, align: 'center' });
      }
      y += photoH + 4;

      // Caption
      doc.fontSize(7).font('Helvetica').fillColor('#555')
         .text(`Photo prise par ${chargeNomComplet} le ${fmtDate(new Date())} à ${fmtHeure(new Date())}`,
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
  scannerCadenas,
  enregistrerPhoto,
  validerConsignation,
  getHistorique,
};