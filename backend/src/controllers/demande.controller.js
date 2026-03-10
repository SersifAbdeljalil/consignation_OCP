// src/controllers/demande.controller.js
// ✅ REFONTE demanderDeconsignation :
//    - Notifie le CHARGÉ si le LOT a des points électriques (charge_type = 'electricien')
//    - Notifie le CHEF PROCESS si le LOT a du process
//    - Les deux valident INDÉPENDAMMENT (comme la consignation)
//    - getDemandeById : retourne deconsignation_par_metier depuis table deconsignation_metier
//      ET le statut de déconsignation chargé/process

const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { success, error } = require('../utils/response');
const {
  envoyerNotification,
  envoyerNotificationMultiple,
} = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');

const genererNumero = async () => {
  const annee = new Date().getFullYear();
  const [rows] = await db.query(
    'SELECT COUNT(*) AS total FROM demandes_consignation WHERE YEAR(created_at) = ?', [annee]
  );
  const num = (rows[0].total + 1).toString().padStart(4, '0');
  return `CONS-${annee}-${num}`;
};

const getTagImagePath = (codeEquipement) => {
  if (!codeEquipement) return null;
  const tagImageDir = path.join(__dirname, '../../TAG_Image');
  const filePath = path.join(tagImageDir, `${codeEquipement}.png`);
  return fs.existsSync(filePath) ? filePath : null;
};

const toMaroc = (d) => {
  if (!d) return null;
  return new Date(new Date(d).getTime() + 3600000);
};
const fmtDateMarocPDF = (d) => {
  if (!d) return '';
  const dt = toMaroc(d);
  return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
};

// ── Métiers équipe ─────────────────────────────────────────────────
const METIERS_EQUIPE = ['genie_civil', 'mecanique', 'electrique'];

const METIER_LABELS = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

// ═══════════════════════════════════════════════════════════════════
// HELPER — Générer PDF INITIAL (inchangé)
// ═══════════════════════════════════════════════════════════════════
const genererPDFInitial = ({ demande, lotCode, tag, points, pdfPath }) => {
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
    const fmtDate       = (d) => fmtDateMarocPDF(d);
    const hdrH          = 65;
    const LOGO_PATH     = path.join(__dirname, '../utils/OCPLOGO.png');

    doc.rect(ML, 30, 80, hdrH).stroke('#000');
    if (fs.existsSync(LOGO_PATH)) {
      try { doc.image(LOGO_PATH, ML + 5, 33, { width: 70, height: 58, fit: [70, 58], align: 'center', valign: 'center' }); }
      catch (e) { doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' }); }
    } else {
      doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' });
    }

    const titleX = ML + 82;
    const titleW = PW - 82 - 102;
    doc.rect(titleX, 30, titleW, hdrH).stroke('#000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Formulaire', titleX, 40, { width: titleW, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').text('Fiche Consignation/Déconsignation des', titleX, 54, { width: titleW, align: 'center' });
    doc.text('Energies et Produits Dangereux', titleX, 64, { width: titleW, align: 'center' });

    const refX = ML + 82 + titleW + 2;
    const refW = PW - 82 - titleW - 2;
    const refRows = ['F-HSE-SEC-22-01', 'Edition : 2.0', "Date d'émission\n01/09/2015", 'Page : 1/1'];
    let ry = 30;
    refRows.forEach(txt => {
      const rh = txt.includes('\n') ? 20 : 14;
      doc.rect(refX, ry, refW, rh).stroke('#000');
      doc.fontSize(6).font('Helvetica').fillColor('#000').text(txt, refX + 2, ry + 3, { width: refW - 4, align: 'center' });
      ry += rh;
    });

    const today = new Date();
    let y = 30 + hdrH + 8;

    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#000').text('Entité : ', ML, y, { continued: true })
       .font('Helvetica').text(lotCode || '');
    y += 14;

    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text("N° d'ordre de la fiche de", ML, y);
    doc.font('Helvetica-Oblique').text('cadenassage', ML, y + 9, { continued: true })
       .font('Helvetica').text(' : ', { continued: true })
       .font('Helvetica-Bold').text(demande.numero_ordre || '');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000')
       .text('Date : ', ML + 270, y + 9, { continued: true })
       .font('Helvetica').text(fmtDate(today));
    y += 22;

    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text("Equipements ou Installation de l'", ML, y, { continued: true })
       .font('Helvetica-Oblique').text('entité', { continued: true })
       .font('Helvetica').text(' concernée : ', { continued: true })
       .font('Helvetica-Bold').text(`${demande.equipement_nom || ''} (${tag || ''})`);
    doc.moveTo(ML + 210, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text('Raison du ', ML, y, { continued: true })
       .font('Helvetica-Oblique').text('cadenassage', { continued: true })
       .font('Helvetica').text(' (intervention prévue) : ', { continued: true })
       .font('Helvetica-Bold').text(demande.raison || '');
    doc.moveTo(ML + 195, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;

    doc.rect(ML, y, PW, 14).stroke('#000');
    doc.fontSize(7.5).font('Helvetica').fillColor('#000')
       .text(`Références des plans et schémas : ${tag || ''}`, ML + 3, y + 3, { width: PW - 6 });
    y += 18;

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
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor(BLANC).text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };
    const drawSubHdrExec = (txt, wx, wy, ww) => {
      doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLANC, '#000');
      doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000').text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' });
    };

    let sx = ML;
    drawSubHdrPlan('N°', sx, sy, C.num); sx += C.num;
    drawSubHdrPlan('Repère du\npoint', sx, sy, C.repere); sx += C.repere;
    drawSubHdrPlan('Localisation\n(MCC)', sx, sy, C.local); sx += C.local;
    drawSubHdrPlan('Dispositif (1)\n(Cadenas)', sx, sy, C.disp); sx += C.disp;
    drawSubHdrPlan('Etat (2)\nouvert/fermé', sx, sy, C.etat); sx += C.etat;
    drawSubHdrPlan('Chargé (3)', sx, sy, C.charge); sx += C.charge;
    drawSubHdrExec('N° du\ncadenas', sx, sy, C.cad); sx += C.cad;
    drawSubHdrExec('Nom', sx, sy, C.cNom); sx += C.cNom;
    drawSubHdrExec('date', sx, sy, C.cDate); sx += C.cDate;
    drawSubHdrExec('heure', sx, sy, C.cHeure); sx += C.cHeure;
    drawSubHdrExec('Nom', sx, sy, C.vNom); sx += C.vNom;
    drawSubHdrExec('Date', sx, sy, C.vDate); sx += C.vDate;
    drawSubHdrExec('Nom', sx, sy, C.dNom); sx += C.dNom;
    drawSubHdrExec('date', sx, sy, C.dDate);
    y += ROW_H2;

    const ORDERED = Array.from({ length: 9 }, (_, i) => points[i] || null);
    ORDERED.forEach((pt, i) => {
      const bgPlan = i % 2 === 0 ? BLEU_PLAN : BLEU_PLAN_CLR;
      const bgExec = i % 2 === 0 ? BLANC : '#F5F9FF';
      doc.rect(ML, y, planW, ROW_DATA).fillAndStroke(bgPlan, '#000');
      doc.rect(ML + planW, y, execW, ROW_DATA).fillAndStroke(bgExec, '#000');
      const cellPlan = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000').text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };
      const cellExec = (txt, cx, cw) => {
        doc.rect(cx, y, cw, ROW_DATA).stroke('#000');
        doc.fontSize(5.5).font('Helvetica').fillColor('#000').text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };
      let dx = ML;
      if (pt) {
        cellPlan(pt.numero_ligne, dx, C.num); dx += C.num;
        cellPlan(pt.repere_point || tag, dx, C.repere); dx += C.repere;
        cellPlan(pt.localisation, dx, C.local); dx += C.local;
        cellPlan(pt.dispositif_condamnation, dx, C.disp); dx += C.disp;
        cellPlan(pt.etat_requis, dx, C.etat); dx += C.etat;
        cellPlan(pt.charge_type || 'electricien', dx, C.charge); dx += C.charge;
        [C.cad, C.cNom, C.cDate, C.cHeure, C.vNom, C.vDate, C.dNom, C.dDate].forEach(cw => { cellExec('', dx, cw); dx += cw; });
      } else {
        [C.num, C.repere, C.local, C.disp, C.etat, C.charge].forEach(cw => { cellPlan('', dx, cw); dx += cw; });
        [C.cad, C.cNom, C.cDate, C.cHeure, C.vNom, C.vDate, C.dNom, C.dDate].forEach(cw => { cellExec('', dx, cw); dx += cw; });
      }
      y += ROW_DATA;
    });

    const basH = 44, basW = PW / 2;
    doc.rect(ML, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan établi par :', ML + 4, y + 4);
    doc.moveTo(ML + 4, y + 20).lineTo(ML + basW - 4, y + 20).dash(2, { space: 2 }).stroke('#ccc'); doc.undash();
    doc.font('Helvetica-Bold').text('Date : ', ML + 4, y + 24, { continued: true }).font('Helvetica').text('                              ');
    doc.font('Helvetica-Bold').text('Signature :', ML + 4, y + 34);
    doc.rect(ML + basW, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan approuvé par :', ML + basW + 4, y + 4);
    doc.moveTo(ML + basW + 4, y + 20).lineTo(ML + PW - 4, y + 20).dash(2, { space: 2 }).stroke('#ccc'); doc.undash();
    doc.font('Helvetica-Bold').text('Date : ', ML + basW + 4, y + 24, { continued: true }).font('Helvetica').text('                              ');
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

    y += 8;
    const tagImagePath = getTagImagePath(tag);
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text("Schéma / Plan de l'équipement", ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const schemaH = 160;
    doc.rect(ML, y, PW, schemaH).stroke('#000');
    if (tagImagePath) {
      try { doc.image(tagImagePath, ML + 2, y + 2, { width: PW - 4, height: schemaH - 4, fit: [PW - 4, schemaH - 4], align: 'center', valign: 'center' }); }
      catch (imgErr) {}
    }
    y += schemaH + 4;

    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text('Photo du départ consigné', ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const photoH = 160;
    doc.rect(ML, y, PW, photoH).dash(3, { space: 3 }).stroke('#BDBDBD'); doc.undash();
    doc.fontSize(9).font('Helvetica').fillColor('#BDBDBD').text('Photo à prendre lors de la consignation sur terrain', ML, y + photoH / 2 - 6, { width: PW, align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};

// ════════════════════════════════════════════════════════════
// POST /demandes — Créer une demande (inchangé)
// ════════════════════════════════════════════════════════════
const creerDemande = async (req, res) => {
  try {
    const { equipement_id, lot_id, raison, types_intervenants } = req.body;
    const agent_id = req.user.id;

    if (!equipement_id || !lot_id) return error(res, 'LOT et équipement (TAG) sont requis', 400);

    const [eq] = await db.query(
      'SELECT id, nom, code_equipement, raison_predefinie FROM equipements WHERE id = ? AND actif = 1', [equipement_id]
    );
    if (!eq.length) return error(res, 'Équipement (TAG) introuvable', 404);

    const [lotRow] = await db.query('SELECT id, code FROM lots WHERE id = ? AND actif = 1', [lot_id]);
    if (!lotRow.length) return error(res, 'LOT introuvable', 404);

    const [demandeur] = await db.query('SELECT nom, prenom FROM users WHERE id = ?', [agent_id]);
    const raisonFinale = (raison && raison.trim()) ? raison.trim() : (eq[0].raison_predefinie || '');
    if (!raisonFinale) return error(res, "La raison de l'intervention est requise", 400);

    const [pointsPredefinis] = await db.query(
      'SELECT * FROM plans_predefinis WHERE equipement_id = ? ORDER BY numero_ligne ASC', [equipement_id]
    );
    const hasProcess     = pointsPredefinis.some(p => p.charge_type === 'process');
    const hasElectricien = pointsPredefinis.some(p => p.charge_type === 'electricien');

    const typesFinaux = Array.isArray(types_intervenants) ? [...types_intervenants] : [];
    if (typesFinaux.length === 0) return error(res, "Sélectionnez au moins un type d'intervenant", 400);

    const numero_ordre = await genererNumero();
    const tag          = eq[0].code_equipement;
    const lotCode      = lotRow[0].code;
    const demNom       = `${demandeur[0].prenom} ${demandeur[0].nom}`;

    const [result] = await db.query(
      `INSERT INTO demandes_consignation
         (numero_ordre, equipement_id, agent_id, lot, lot_id, raison, types_intervenants, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'en_attente')`,
      [numero_ordre, equipement_id, agent_id, lotCode, lot_id, raisonFinale, JSON.stringify(typesFinaux)]
    );
    const demandeId = result.insertId;

    let pointsCrees = [];
    if (pointsPredefinis.length > 0) {
      const [planRes] = await db.query(
        `INSERT INTO plans_consignation (demande_id, etabli_par, approuve_par, date_etabli, date_approuve, statut, remarques)
         VALUES (?, ?, ?, NOW(), NOW(), 'approuve', 'Plan créé automatiquement depuis plan prédéfini')`,
        [demandeId, agent_id, agent_id]
      );
      const planId = planRes.insertId;
      for (const pt of pointsPredefinis) {
        await db.query(
          `INSERT INTO points_consignation (plan_id, numero_ligne, repere_point, localisation, dispositif_condamnation, etat_requis, charge_type, role_id_requis)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [planId, pt.numero_ligne, pt.repere_point, pt.localisation, pt.dispositif_condamnation, pt.etat_requis, pt.charge_type, pt.role_id_requis]
        );
      }
      pointsCrees = pointsPredefinis;
    }

    try {
      const pdfDir = path.join(__dirname, '../../uploads/pdfs');
      if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
      const pdfFileName = `F-HSE-SEC-22-01_${numero_ordre}_initial_${Date.now()}.pdf`;
      const pdfPath     = path.join(pdfDir, pdfFileName);
      await genererPDFInitial({
        demande: { numero_ordre, equipement_nom: eq[0].nom, raison: raisonFinale },
        lotCode, tag, points: pointsCrees, pdfPath,
      });
      await db.query(
        `INSERT INTO dossiers_archives (demande_id, pdf_path, cloture_par, date_cloture, remarques)
         VALUES (?, ?, ?, NOW(), 'PDF initial — en attente de consignation')`,
        [demandeId, `uploads/pdfs/${pdfFileName}`, agent_id]
      );
    } catch (pdfErr) {
      console.error('Erreur génération PDF initial:', pdfErr);
    }

    if (hasElectricien) {
      const [charges] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.nom = 'charge_consignation' AND u.actif = 1`
      );
      if (charges.length > 0) {
        const chargeIds = charges.map(c => c.id);
        for (const c of charges) {
          await envoyerNotification(c.id, '🔔 Nouvelle demande de consignation',
            `${demNom} — TAG : ${tag} — LOT : ${lotCode}\nVeuillez valider le plan de consignation électrique.`,
            'demande', `demande/${demandeId}`);
        }
        await envoyerPushNotification(chargeIds, 'Nouvelle demande de consignation',
          `${demNom} — TAG : ${tag} — LOT : ${lotCode}`,
          { demande_id: demandeId, numero_ordre, equipement_nom: eq[0].nom, statut: 'en_attente' });
      }
    }

    if (hasProcess) {
      const [chefsProcess] = await db.query('SELECT u.id FROM users u WHERE u.role_id = 19 AND u.actif = 1');
      if (chefsProcess.length > 0) {
        const chefProcessIds = chefsProcess.map(u => u.id);
        await envoyerNotificationMultiple(chefProcessIds, '🔔 Nouvelle demande de consignation process',
          `${demNom} — TAG : ${tag} — LOT : ${lotCode}\nVeuillez valider et consigner les points process.`,
          'demande', `demande/${demandeId}`);
        await envoyerPushNotification(chefProcessIds, 'Nouvelle demande — consignation process',
          `TAG ${tag} (LOT : ${lotCode}) — Préparez et validez vos vannes à consigner.`,
          { demande_id: demandeId, numero_ordre, equipement_nom: eq[0].nom, statut: 'en_attente' });
      }
    }

    if (typesFinaux.length > 0) {
      const roleNomMap = { genie_civil: 'chef_genie_civil', mecanique: 'chef_mecanique', electrique: 'chef_electrique' };
      const typesSansProcess = typesFinaux.filter(t => t !== 'process');
      const roleNomsCibles   = typesSansProcess.map(t => roleNomMap[t]).filter(Boolean);
      if (roleNomsCibles.length > 0) {
        const placeholders = roleNomsCibles.map(() => '?').join(', ');
        const [autresChefs] = await db.query(
          `SELECT u.id, r.nom AS role_nom FROM users u JOIN roles r ON u.role_id = r.id
           WHERE r.nom IN (${placeholders}) AND u.actif = 1`, roleNomsCibles
        );
        if (autresChefs.length > 0) {
          const ids = autresChefs.map(u => u.id);
          await envoyerNotificationMultiple(ids, '🔔 Consignation en cours — Préparez vos équipes',
            `Le départ ${tag} (LOT : ${lotCode}) va être consigné. Préparez vos intervenants.`,
            'intervention', `demande/${demandeId}`);
          await envoyerPushNotification(ids, 'Consignation en cours',
            `Le départ ${tag} (LOT : ${lotCode}) va être consigné.`,
            { demande_id: demandeId, numero_ordre, equipement_nom: eq[0].nom, statut: 'en_attente' });
        }
      }
    }

    return success(res, {
      id: demandeId, numero_ordre, lot: lotCode, tag,
      raison: raisonFinale, types_intervenants: typesFinaux,
      has_process: hasProcess, has_electricien: hasElectricien,
      plan_cree: pointsPredefinis.length > 0, nb_points: pointsPredefinis.length,
    }, 'Demande soumise avec succès', 201);

  } catch (err) {
    console.error('creerDemande error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /demandes/mes-demandes ────────────────────────────────────
const getMesDemandes = async (req, res) => {
  try {
    const { statut } = req.query;
    let query = `
      SELECT d.*,
             e.nom AS equipement_nom, e.code_equipement AS tag,
             e.localisation AS equipement_localisation,
             l.code AS lot_code, l.description AS lot_description,
             CONVERT_TZ(d.created_at,      '+00:00', '+01:00') AS created_at,
             CONVERT_TZ(d.updated_at,      '+00:00', '+01:00') AS updated_at,
             CONVERT_TZ(d.date_validation, '+00:00', '+01:00') AS date_validation
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

// ════════════════════════════════════════════════════════════════
// ✅ GET /demandes/:id — Retourne la demande avec :
//   - deconsignation_par_metier : état de chaque métier (depuis deconsignation_metier)
//   - deconsignation_charge_process : état chargé et process pour le pipeline final
// ════════════════════════════════════════════════════════════════
const getDemandeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT d.*,
              e.nom AS equipement_nom, e.code_equipement AS tag,
              e.localisation AS equipement_localisation, e.entite AS equipement_entite,
              l.code AS lot_code, l.description AS lot_description,
              CONCAT(u.prenom, ' ', u.nom) AS demandeur_nom,
              u.matricule AS demandeur_matricule, u.zone AS demandeur_zone,
              CONVERT_TZ(d.created_at,              '+00:00', '+01:00') AS created_at,
              CONVERT_TZ(d.updated_at,              '+00:00', '+01:00') AS updated_at,
              CONVERT_TZ(d.date_validation,         '+00:00', '+01:00') AS date_validation,
              CONVERT_TZ(d.date_validation_charge,  '+00:00', '+01:00') AS date_validation_charge,
              CONVERT_TZ(d.date_validation_process, '+00:00', '+01:00') AS date_validation_process
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l ON d.lot_id = l.id
       JOIN users u ON d.agent_id = u.id
       WHERE d.id = ?`,
      [id]
    );
    if (!rows.length) return error(res, 'Demande introuvable', 404);
    const demande = rows[0];

    let typesIntervenants = [];
    try {
      typesIntervenants = typeof demande.types_intervenants === 'string'
        ? JSON.parse(demande.types_intervenants)
        : (demande.types_intervenants || []);
    } catch { typesIntervenants = []; }

    const metiersDemande = typesIntervenants.filter(t => METIERS_EQUIPE.includes(t));

    // ── A. Déconsignation par métier (table deconsignation_metier) ──
    const deconsignation_par_metier = {};

    if (metiersDemande.length > 0) {
      // Données depuis la nouvelle table deconsignation_metier
      const [deconRows] = await db.query(
        `SELECT dm.type_metier, dm.statut, dm.heure_validation,
                CONCAT(u.prenom,' ',u.nom) AS chef_nom
         FROM deconsignation_metier dm
         LEFT JOIN users u ON dm.chef_equipe_id = u.id
         WHERE dm.demande_id = ?`,
        [id]
      );
      const deconParMetier = {};
      for (const row of deconRows) deconParMetier[row.type_metier] = row;

      // Aussi les stats d'équipe (sortis / total) pour l'affichage en temps réel
      const placeholders = metiersDemande.map(() => '?').join(', ');
      const [equipRows] = await db.query(
        `SELECT u.type_metier,
                COUNT(*) AS total,
                SUM(CASE WHEN ei.statut = 'sortie' THEN 1 ELSE 0 END) AS sortis,
                CONVERT_TZ(MAX(ei.heure_sortie), '+00:00', '+01:00') AS derniere_sortie
         FROM equipe_intervention ei
         JOIN users u ON ei.chef_equipe_id = u.id
         WHERE ei.demande_id = ? AND u.type_metier IN (${placeholders})
         GROUP BY u.type_metier`,
        [id, ...metiersDemande]
      );
      const statsParMetier = {};
      for (const row of equipRows) statsParMetier[row.type_metier] = row;

      for (const metier of metiersDemande) {
        const decon = deconParMetier[metier];
        const stats = statsParMetier[metier];

        if (decon && decon.statut === 'valide') {
          // Ce métier a validé sa déconsignation
          deconsignation_par_metier[metier] = {
            fait:   true,
            heure:  decon.heure_validation || null,
            total:  stats ? Number(stats.total) : 0,
            sortis: stats ? Number(stats.sortis) : 0,
            chef:   decon.chef_nom || null,
          };
        } else if (!stats || stats.total === 0) {
          deconsignation_par_metier[metier] = { fait: false, heure: null, total: 0, sortis: 0 };
        } else {
          deconsignation_par_metier[metier] = {
            fait:   false,
            heure:  null,
            total:  Number(stats.total),
            sortis: Number(stats.sortis),
          };
        }
      }
    }

    // ── B. Tous les métiers ont-ils validé ? ──────────────────────
    const tousMetiersValides = metiersDemande.length > 0
      && metiersDemande.every(m => deconsignation_par_metier[m]?.fait === true);

    return success(res, {
      ...demande,
      types_intervenants:  typesIntervenants,
      deconsignation_par_metier,
      tous_metiers_deconsignes: tousMetiersValides,
    }, 'Demande récupérée');

  } catch (err) {
    console.error('getDemandeById error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
// ✅ POST /demandes/:id/demander-deconsignation
//
// REFONTE : Notifie selon les plans du LOT de la demande :
//   - Si le LOT a des points 'electricien' → notifie le CHARGÉ
//   - Si le LOT a des points 'process'     → notifie le CHEF PROCESS
//   - Les deux valident INDÉPENDAMMENT (même principe que la consignation)
//
// Condition d'accès : tous les métiers équipe ont validé leur déconsignation
//   (tous les enregistrements dans deconsignation_metier sont à 'valide')
// ════════════════════════════════════════════════════════════════════════════
const demanderDeconsignation = async (req, res) => {
  try {
    const { id }   = req.params;
    const agent_id = req.user.id;

    const [rows] = await db.query(
      `SELECT d.*, e.nom AS equipement_nom, e.code_equipement AS tag,
              e.id AS equip_id,
              l.code AS lot_code, CONCAT(u.prenom,' ',u.nom) AS agent_nom
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l ON d.lot_id = l.id
       JOIN users u ON d.agent_id = u.id
       WHERE d.id = ? AND d.agent_id = ?`, [id, agent_id]
    );
    if (!rows.length) return error(res, 'Demande introuvable ou accès refusé', 404);
    const demande = rows[0];

    // ── Vérifier le statut ─────────────────────────────────────────
    // Statuts autorisés : deconsigne_gc / _mec / _elec (ou consigne si pas de métiers équipe)
    const STATUTS_OK = [
      'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
      'deconsigne_intervent', // rétrocompat
      'consigne',             // cas sans métiers équipe
    ];
    if (!STATUTS_OK.includes(demande.statut)) {
      return error(res, `Impossible de demander la déconsignation avec le statut actuel : ${demande.statut}`, 400);
    }

    // ── Vérifier que TOUS les métiers équipe ont validé ────────────
    let typesIntervenants = [];
    try {
      typesIntervenants = typeof demande.types_intervenants === 'string'
        ? JSON.parse(demande.types_intervenants) : (demande.types_intervenants || []);
    } catch { typesIntervenants = []; }

    const metiersDemande = typesIntervenants.filter(t => METIERS_EQUIPE.includes(t));

    if (metiersDemande.length > 0) {
      const [deconRows] = await db.query(
        `SELECT type_metier FROM deconsignation_metier WHERE demande_id=? AND statut='valide'`,
        [id]
      );
      const metierValides = deconRows.map(r => r.type_metier);
      const metiersRestants = metiersDemande.filter(m => !metierValides.includes(m));

      if (metiersRestants.length > 0) {
        return error(res,
          `Les métiers suivants n'ont pas encore validé leur déconsignation : ` +
          `${metiersRestants.map(m => METIER_LABELS[m] || m).join(', ')}`,
          400
        );
      }
    }

    // ── Marquer la demande comme "déconsignation demandée" ─────────
    await db.query(
      `UPDATE demandes_consignation SET deconsignation_demandee = 1, updated_at = NOW() WHERE id = ?`,
      [id]
    );

    // ── Déterminer qui notifier selon les points du LOT ────────────
    // On regarde les plans_predefinis de l'équipement pour savoir
    // si ce LOT a des points électriques (charge) et/ou process
    const [pointsLot] = await db.query(
      `SELECT DISTINCT charge_type FROM plans_predefinis WHERE equipement_id = ?`,
      [demande.equipement_id]
    );
    const chargesTypes  = pointsLot.map(p => p.charge_type);
    const hasElectrique = chargesTypes.includes('electricien');
    const hasProcess    = chargesTypes.includes('process') || typesIntervenants.includes('process');

    // Fallback : si aucun point défini mais process dans types_intervenants → notifier process
    // Si ni electricien ni process trouvé → notifier le chargé par défaut
    const doitNotifierCharge  = hasElectrique || (!hasElectrique && !hasProcess);
    const doitNotifierProcess = hasProcess;

    let notifiedIds = [];

    // ── Notifier le CHARGÉ ─────────────────────────────────────────
    if (doitNotifierCharge) {
      const [charges] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
         WHERE r.nom = 'charge_consignation' AND u.actif = 1`
      );
      if (charges.length > 0) {
        const chargeIds = charges.map(c => c.id);
        notifiedIds.push(...chargeIds);
        await envoyerNotificationMultiple(
          chargeIds,
          '🔓 Demande de déconsignation — Action requise',
          `L'agent ${demande.agent_nom} demande la déconsignation du départ ${demande.tag} ` +
          `(${demande.numero_ordre} — LOT : ${demande.lot_code}).\n` +
          `Toutes les équipes ont quitté le chantier. Veuillez déconsigner les points électriques.`,
          'deconsignation', `demande/${id}`
        );
        await envoyerPushNotification(
          chargeIds,
          '🔓 Déconsignation électrique à effectuer',
          `${demande.tag} — ${demande.numero_ordre} — Toutes équipes sorties`,
          { demande_id: parseInt(id), statut: demande.statut, action: 'demande_deconsignation_charge' }
        );
      }
    }

    // ── Notifier le CHEF PROCESS ───────────────────────────────────
    if (doitNotifierProcess) {
      const [chefsProcess] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
         WHERE r.nom = 'chef_process' AND u.actif = 1`
      );
      if (chefsProcess.length > 0) {
        const chefProcessIds = chefsProcess.map(u => u.id);
        notifiedIds.push(...chefProcessIds);
        await envoyerNotificationMultiple(
          chefProcessIds,
          '🔓 Demande de déconsignation process — Action requise',
          `L'agent ${demande.agent_nom} demande la déconsignation du départ ${demande.tag} ` +
          `(${demande.numero_ordre}).\nVeuillez déconsigner vos vannes process.`,
          'deconsignation', `demande/${id}`
        );
        await envoyerPushNotification(
          chefProcessIds,
          '🔓 Déconsignation process à effectuer',
          `${demande.tag} — ${demande.numero_ordre}`,
          { demande_id: parseInt(id), statut: demande.statut, action: 'demande_deconsignation_process' }
        );
      }
    }

    return success(res, {
      demande_id:              parseInt(id),
      deconsignation_demandee: true,
      notifie_charge:          doitNotifierCharge,
      notifie_process:         doitNotifierProcess,
    }, `Demande de déconsignation envoyée${doitNotifierCharge ? ' au chargé' : ''}${doitNotifierProcess ? ' et au process' : ''}`);

  } catch (err) {
    console.error('demanderDeconsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = { creerDemande, getMesDemandes, getDemandeById, demanderDeconsignation };