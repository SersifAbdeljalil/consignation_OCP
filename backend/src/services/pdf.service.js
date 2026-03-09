// src/services/pdf.service.js
// ✅ genererPDFUnifie — inchangé
// ✅ NOUVEAU : genererPDFDeconsignation — même fiche F-HSE-SEC-22-01
//    mais avec la colonne "Déconsigné par" remplie
const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '../utils/OCPLOGO.png');

const getTagImagePath = (codeEquipement) => {
  if (!codeEquipement) return null;
  const tagImageDir = path.join(__dirname, '../../TAG_Image');
  const filePath    = path.join(tagImageDir, `${codeEquipement}.png`);
  return fs.existsSync(filePath) ? filePath : null;
};

const toMarocParts = (dt) => {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Casablanca',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(dt);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  return { day: get('day'), month: get('month'), year: get('year'), hours: get('hour'), minutes: get('minute'), seconds: get('second') };
};

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
};

const fmtHeure = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`;
};

const fmtDateNow = () => { const p = toMarocParts(new Date()); return `${p.day}/${p.month}/${p.year}`; };
const fmtHeureNow = () => { const p = toMarocParts(new Date()); return `${p.hours}:${p.minutes}:${p.seconds}`; };

// ═══════════════════════════════════════════════════════════════════
// genererPDFUnifie (INCHANGÉ)
// ═══════════════════════════════════════════════════════════════════
const genererPDFUnifie = ({
  demande, plan, points,
  chargeInfo, processInfo,
  pdfPath, photoAbsPath,
}) => {
  return new Promise((resolve, reject) => {
    const tagImagePath = getTagImagePath(demande.tag);
    const doc    = new PDFDocument({ margin: 30, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const ML = 30, PW = 595 - ML - 30;
    const BLEU_HEADER = '#003087', BLEU_PLAN = '#5B9BD5', BLEU_PLAN_CLR = '#D6E4F3';
    const BLANC = '#FFFFFF', VERT_VALIDE = '#E8F5E9';

    const hdrH = 65;
    doc.rect(ML, 30, 80, hdrH).stroke('#000');
    if (fs.existsSync(LOGO_PATH)) {
      try { doc.image(LOGO_PATH, ML + 5, 33, { width: 70, height: 58, fit: [70, 58], align: 'center', valign: 'center' }); }
      catch (e) { doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' }); }
    }

    const titleX = ML + 82, titleW = PW - 82 - 102;
    doc.rect(titleX, 30, titleW, hdrH).stroke('#000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Formulaire', titleX, 40, { width: titleW, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').text('Fiche Consignation/Déconsignation des', titleX, 54, { width: titleW, align: 'center' });
    doc.text('Energies et Produits Dangereux', titleX, 64, { width: titleW, align: 'center' });

    const refX = ML + 82 + titleW + 2, refW = PW - 82 - titleW - 2;
    let ry = 30;
    ['F-HSE-SEC-22-01', 'Edition : 2.0', "Date d'émission\n01/09/2015", 'Page : 1/1'].forEach(txt => {
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
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000').text('Date : ', ML + 270, y + 9, { continued: true }).font('Helvetica').text(fmtDateNow());
    y += 22;
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text("Equipements ou Installation de l'", ML, y, { continued: true }).font('Helvetica-Oblique').text('entité', { continued: true }).font('Helvetica').text(' concernée : ', { continued: true }).font('Helvetica-Bold').text(`${demande.equipement_nom || ''} (${demande.tag || ''})`);
    doc.moveTo(ML + 210, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text('Raison du ', ML, y, { continued: true }).font('Helvetica-Oblique').text('cadenassage', { continued: true }).font('Helvetica').text(' (intervention prévue) : ', { continued: true }).font('Helvetica-Bold').text(demande.raison || '');
    doc.moveTo(ML + 195, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;
    doc.rect(ML, y, PW, 14).stroke('#000');
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text(`Références des plans et schémas : ${plan?.schema_ref || demande.tag || ''}`, ML + 3, y + 3, { width: PW - 6 });
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
    const consigneW = C.cad + C.cNom + C.cDate + C.cHeure;
    const verifieW  = C.vNom + C.vDate;
    const dConsW    = C.dNom + C.dDate;

    let gx = ML + planW;
    doc.rect(gx, y, consigneW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Consigné par', gx, y + 2, { width: consigneW, align: 'center' });
    gx += consigneW;
    doc.rect(gx, y, verifieW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Vérifié par', gx, y + 2, { width: verifieW, align: 'center' });
    gx += verifieW;
    doc.rect(gx, y, dConsW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Déconsigné par', gx, y + 2, { width: dConsW, align: 'center' });

    const sy = y + ROW_H2 / 2 + 1;
    const subP = (txt, wx, wy, ww) => { doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLEU_PLAN, BLEU_PLAN); doc.fontSize(5.5).font('Helvetica-Bold').fillColor(BLANC).text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' }); };
    const subE = (txt, wx, wy, ww) => { doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLANC, '#000'); doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000').text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' }); };

    let sx = ML;
    subP('N°', sx, sy, C.num); sx += C.num;
    subP('Repère du\npoint', sx, sy, C.repere); sx += C.repere;
    subP('Localisation\n(MCC)', sx, sy, C.local); sx += C.local;
    subP('Dispositif (1)\n(Cadenas)', sx, sy, C.disp); sx += C.disp;
    subP('Etat (2)\nouvert/fermé', sx, sy, C.etat); sx += C.etat;
    subP('Chargé (3)', sx, sy, C.charge); sx += C.charge;
    subE('N° du\ncadenas', sx, sy, C.cad); sx += C.cad;
    subE('Nom', sx, sy, C.cNom); sx += C.cNom;
    subE('date', sx, sy, C.cDate); sx += C.cDate;
    subE('heure', sx, sy, C.cHeure); sx += C.cHeure;
    subE('Nom', sx, sy, C.vNom); sx += C.vNom;
    subE('Date', sx, sy, C.vDate); sx += C.vDate;
    subE('Nom', sx, sy, C.dNom); sx += C.dNom;
    subE('date', sx, sy, C.dDate);
    y += ROW_H2;

    const chargeNom  = chargeInfo  ? `${chargeInfo.prenom} ${chargeInfo.nom}`   : '';
    const processNom = processInfo ? `${processInfo.prenom} ${processInfo.nom}` : '';
    const dateValid  = fmtDateNow();

    const ORDERED = Array.from({ length: 9 }, (_, i) => points[i] || null);
    ORDERED.forEach((pt, i) => {
      const isProcess = pt && pt.charge_type === 'process';
      const isElec    = pt && (pt.charge_type === 'electricien' || !pt.charge_type);
      let bgPlan, bgExec;
      if (pt) {
        if (isProcess && processInfo) { bgPlan = i % 2 === 0 ? '#E3F0E3' : '#C8E6C9'; bgExec = i % 2 === 0 ? VERT_VALIDE : '#F1F8F1'; }
        else { bgPlan = i % 2 === 0 ? BLEU_PLAN : BLEU_PLAN_CLR; bgExec = i % 2 === 0 ? BLANC : '#F5F9FF'; }
      } else { bgPlan = i % 2 === 0 ? BLEU_PLAN : BLEU_PLAN_CLR; bgExec = i % 2 === 0 ? BLANC : '#F5F9FF'; }

      doc.rect(ML, y, planW, ROW_DATA).fillAndStroke(bgPlan, '#000');
      doc.rect(ML + planW, y, execW, ROW_DATA).fillAndStroke(bgExec, '#000');
      const cellP = (txt, cx, cw) => { doc.rect(cx, y, cw, ROW_DATA).stroke('#000'); doc.fontSize(5.5).font('Helvetica').fillColor('#000').text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false }); };
      const cellE = (txt, cx, cw) => { doc.rect(cx, y, cw, ROW_DATA).stroke('#000'); doc.fontSize(5.5).font('Helvetica').fillColor('#000').text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false }); };

      let dx = ML;
      if (pt) {
        const chargeLabel  = pt.charge_type || 'electricien';
        const aEteConsigne = !!pt.numero_cadenas;
        let executantNom   = '';
        if (isProcess) executantNom = pt.consigne_par_nom || processNom;
        if (isElec)    executantNom = pt.consigne_par_nom || chargeNom;
        const verificateurNom = isProcess ? processNom : chargeNom;

        cellP(pt.numero_ligne, dx, C.num); dx += C.num;
        cellP(pt.repere_point || demande.tag, dx, C.repere); dx += C.repere;
        cellP(pt.mcc_ref || pt.localisation, dx, C.local); dx += C.local;
        cellP(pt.dispositif_condamnation, dx, C.disp); dx += C.disp;
        cellP(pt.etat_requis, dx, C.etat); dx += C.etat;
        cellP(chargeLabel, dx, C.charge); dx += C.charge;
        cellE(aEteConsigne ? (pt.numero_cadenas || '') : '', dx, C.cad); dx += C.cad;
        cellE(aEteConsigne ? executantNom : '', dx, C.cNom); dx += C.cNom;
        cellE(aEteConsigne ? fmtDate(pt.date_consigne) : '', dx, C.cDate); dx += C.cDate;
        cellE(aEteConsigne ? fmtHeure(pt.date_consigne) : '', dx, C.cHeure); dx += C.cHeure;
        cellE(aEteConsigne ? verificateurNom : '', dx, C.vNom); dx += C.vNom;
        cellE(aEteConsigne ? dateValid : '', dx, C.vDate); dx += C.vDate;
        cellE('', dx, C.dNom); dx += C.dNom;
        cellE('', dx, C.dDate);
      } else {
        [C.num, C.repere, C.local, C.disp, C.etat, C.charge].forEach(cw => { cellP('', dx, cw); dx += cw; });
        [C.cad, C.cNom, C.cDate, C.cHeure, C.vNom, C.vDate, C.dNom, C.dDate].forEach(cw => { cellE('', dx, cw); dx += cw; });
      }
      y += ROW_DATA;
    });

    const basH = 44, basW = PW / 2;
    doc.rect(ML, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan établi par :', ML + 4, y + 4);
    doc.font('Helvetica-Bold').text('Date : ', ML + 4, y + 24, { continued: true }).font('Helvetica').text(chargeInfo ? dateValid : '');
    doc.font('Helvetica-Bold').text('Signature :', ML + 4, y + 34);
    doc.rect(ML + basW, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Plan approuvé par :', ML + basW + 4, y + 4);
    doc.font('Helvetica-Bold').text('Date : ', ML + basW + 4, y + 24, { continued: true }).font('Helvetica').text(processInfo ? dateValid : '');
    doc.font('Helvetica-Bold').text('Signature :', ML + basW + 4, y + 34);
    y += basH + 6;

    doc.fontSize(7).font('Helvetica').fillColor('#000').text('Remarques : ', ML, y, { continued: true });
    doc.moveTo(ML + 60, y + 8).lineTo(ML + PW, y + 8).dash(2, { space: 2 }).stroke('#000'); doc.undash();
    y += 10;
    ["(1) : Indiquer le dispositif adéquat pour la condamnation (cadenas, chaîne, accessoires de vanne à volant...etc)",
     "(2) : Indiquer la position de séparation (ouvert ou fermer)",
     "(3) : Indiquer la personne ou la fonction habilitée à réaliser la consignation (électricien, chef d'équipe production)."]
    .forEach(n => { doc.fontSize(5.8).font('Helvetica').fillColor('#000').text(n, ML, y); y += 8; });

    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text("Schéma / Plan de l'équipement", ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const schemaH = 160;
    doc.rect(ML, y, PW, schemaH).stroke('#000');
    if (tagImagePath) {
      try { doc.image(tagImagePath, ML + 2, y + 2, { width: PW - 4, height: schemaH - 4, fit: [PW - 4, schemaH - 4], align: 'center', valign: 'center' }); } catch (e) {}
    }
    y += schemaH + 4;

    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text('Photo du départ consigné', ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const photoH = 160;
    doc.rect(ML, y, PW, photoH).stroke('#000');
    if (photoAbsPath && fs.existsSync(photoAbsPath)) {
      try { doc.image(photoAbsPath, ML + 2, y + 2, { width: PW - 4, height: photoH - 4, fit: [PW - 4, photoH - 4], align: 'center', valign: 'center' }); } catch (e) {}
      y += photoH + 4;
      doc.fontSize(7).font('Helvetica').fillColor('#555').text(`Photo prise le ${fmtDateNow()} à ${fmtHeureNow()}`, ML, y, { width: PW, align: 'center' });
    } else {
      doc.fontSize(9).font('Helvetica').fillColor('#BDBDBD').text('Photo à prendre lors de la consignation sur terrain', ML, y + photoH / 2 - 6, { width: PW, align: 'center' });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};

// ═══════════════════════════════════════════════════════════════════
// ✅ NOUVEAU — genererPDFDeconsignation
// Même fiche F-HSE-SEC-22-01 mais colonne "Déconsigné par" remplie
// typeDeconsignation: 'charge' | 'process'
// ═══════════════════════════════════════════════════════════════════
const genererPDFDeconsignation = ({
  demande, plan, points,
  chargeInfo, processInfo,
  pdfPath, photoAbsPath,
  typeDeconsignation = 'charge',
}) => {
  return new Promise((resolve, reject) => {
    const tagImagePath = getTagImagePath(demande.tag);
    const doc    = new PDFDocument({ margin: 30, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const ML = 30, PW = 595 - ML - 30;
    const BLEU_HEADER = '#003087', BLEU_PLAN = '#5B9BD5', BLEU_PLAN_CLR = '#D6E4F3';
    const BLANC = '#FFFFFF';
    const VIOLET_DECONS = '#F3E5F5'; // couleur de fond pour les cellules déconsignées

    const hdrH = 65;
    doc.rect(ML, 30, 80, hdrH).stroke('#000');
    if (fs.existsSync(LOGO_PATH)) {
      try { doc.image(LOGO_PATH, ML + 5, 33, { width: 70, height: 58, fit: [70, 58], align: 'center', valign: 'center' }); }
      catch (e) { doc.fontSize(7).font('Helvetica-Bold').fillColor(BLEU_HEADER).text('OCP', ML, 55, { width: 80, align: 'center' }); }
    }

    const titleX = ML + 82, titleW = PW - 82 - 102;
    doc.rect(titleX, 30, titleW, hdrH).stroke('#000');
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text('Formulaire', titleX, 40, { width: titleW, align: 'center' });
    doc.fontSize(8).font('Helvetica-Bold').text('Fiche Consignation/Déconsignation des', titleX, 54, { width: titleW, align: 'center' });
    doc.text('Energies et Produits Dangereux', titleX, 64, { width: titleW, align: 'center' });

    const refX = ML + 82 + titleW + 2, refW = PW - 82 - titleW - 2;
    let ry = 30;
    ['F-HSE-SEC-22-01', 'Edition : 2.0', "Date d'émission\n01/09/2015", 'Page : 1/1'].forEach(txt => {
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
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000').text('Date : ', ML + 270, y + 9, { continued: true }).font('Helvetica').text(fmtDateNow());
    y += 22;
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text("Equipements ou Installation de l'", ML, y, { continued: true }).font('Helvetica-Oblique').text('entité', { continued: true }).font('Helvetica').text(' concernée : ', { continued: true }).font('Helvetica-Bold').text(`${demande.equipement_nom || ''} (${demande.tag || ''})`);
    doc.moveTo(ML + 210, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text('Raison du ', ML, y, { continued: true }).font('Helvetica-Oblique').text('cadenassage', { continued: true }).font('Helvetica').text(' (intervention prévue) : ', { continued: true }).font('Helvetica-Bold').text(demande.raison || '');
    doc.moveTo(ML + 195, y + 10).lineTo(ML + PW, y + 10).stroke('#aaa');
    y += 15;
    doc.rect(ML, y, PW, 14).stroke('#000');
    doc.fontSize(7.5).font('Helvetica').fillColor('#000').text(`Références des plans et schémas : ${demande.tag || ''}`, ML + 3, y + 3, { width: PW - 6 });
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
    const consigneW = C.cad + C.cNom + C.cDate + C.cHeure;
    const verifieW  = C.vNom + C.vDate;
    const dConsW    = C.dNom + C.dDate;

    let gx = ML + planW;
    doc.rect(gx, y, consigneW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Consigné par', gx, y + 2, { width: consigneW, align: 'center' });
    gx += consigneW;
    doc.rect(gx, y, verifieW, ROW_H2).fillAndStroke(BLANC, '#000');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#000').text('Vérifié par', gx, y + 2, { width: verifieW, align: 'center' });
    gx += verifieW;
    // ✅ Colonne "Déconsigné par" en violet pour la distinguer
    doc.rect(gx, y, dConsW, ROW_H2).fillAndStroke('#7C3AED', '#7C3AED');
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor(BLANC).text('Déconsigné par ✓', gx, y + 2, { width: dConsW, align: 'center' });

    const sy = y + ROW_H2 / 2 + 1;
    const subP = (txt, wx, wy, ww) => { doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLEU_PLAN, BLEU_PLAN); doc.fontSize(5.5).font('Helvetica-Bold').fillColor(BLANC).text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' }); };
    const subE = (txt, wx, wy, ww) => { doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(BLANC, '#000'); doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000').text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' }); };
    const subD = (txt, wx, wy, ww) => { doc.rect(wx, wy, ww, ROW_H2 / 2).fillAndStroke(VIOLET_DECONS, '#7C3AED'); doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#7C3AED').text(txt, wx + 1, wy + 2, { width: ww - 2, align: 'center' }); };

    let sx = ML;
    subP('N°', sx, sy, C.num); sx += C.num;
    subP('Repère du\npoint', sx, sy, C.repere); sx += C.repere;
    subP('Localisation\n(MCC)', sx, sy, C.local); sx += C.local;
    subP('Dispositif (1)\n(Cadenas)', sx, sy, C.disp); sx += C.disp;
    subP('Etat (2)\nouvert/fermé', sx, sy, C.etat); sx += C.etat;
    subP('Chargé (3)', sx, sy, C.charge); sx += C.charge;
    subE('N° du\ncadenas', sx, sy, C.cad); sx += C.cad;
    subE('Nom', sx, sy, C.cNom); sx += C.cNom;
    subE('date', sx, sy, C.cDate); sx += C.cDate;
    subE('heure', sx, sy, C.cHeure); sx += C.cHeure;
    subE('Nom', sx, sy, C.vNom); sx += C.vNom;
    subE('Date', sx, sy, C.vDate); sx += C.vDate;
    // Colonnes déconsignation en violet
    subD('Nom', sx, sy, C.dNom); sx += C.dNom;
    subD('date', sx, sy, C.dDate);
    y += ROW_H2;

    const chargeNom   = chargeInfo  ? `${chargeInfo.prenom} ${chargeInfo.nom}`   : '';
    const processNom  = processInfo ? `${processInfo.prenom} ${processInfo.nom}` : '';
    const dateValid   = fmtDateNow();

    // Nom de la personne qui déconsigne
    const deconsigneurNom = typeDeconsignation === 'process' ? processNom : chargeNom;

    const ORDERED = Array.from({ length: 9 }, (_, i) => points[i] || null);
    ORDERED.forEach((pt, i) => {
      const isProcess = pt && pt.charge_type === 'process';
      const isElec    = pt && (pt.charge_type === 'electricien' || !pt.charge_type);
      // Déconsigner ce point selon le type
      const doitDeconsigner = (typeDeconsignation === 'charge' && isElec) ||
                              (typeDeconsignation === 'process' && isProcess);

      const bgPlan = i % 2 === 0 ? BLEU_PLAN : BLEU_PLAN_CLR;
      const bgExec = i % 2 === 0 ? BLANC : '#F5F9FF';
      const bgDecons = doitDeconsigner ? VIOLET_DECONS : bgExec;

      doc.rect(ML, y, planW, ROW_DATA).fillAndStroke(bgPlan, '#000');
      doc.rect(ML + planW, y, execW, ROW_DATA).fillAndStroke(bgExec, '#000');

      const cellP = (txt, cx, cw, bg) => {
        if (bg) { doc.rect(cx, y, cw, ROW_DATA).fillAndStroke(bg, '#7C3AED'); }
        else { doc.rect(cx, y, cw, ROW_DATA).stroke('#000'); }
        doc.fontSize(5.5).font('Helvetica').fillColor(bg ? '#5B21B6' : '#000').text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false });
      };
      const cellE = (txt, cx, cw) => { doc.rect(cx, y, cw, ROW_DATA).stroke('#000'); doc.fontSize(5.5).font('Helvetica').fillColor('#000').text(String(txt || ''), cx + 1, y + 3, { width: cw - 2, align: 'center', ellipsis: true, lineBreak: false }); };

      let dx = ML;
      if (pt) {
        const chargeLabel  = pt.charge_type || 'electricien';
        const aEteConsigne = !!pt.numero_cadenas;
        let executantNom   = '';
        if (isProcess) executantNom = pt.consigne_par_nom || processNom;
        if (isElec)    executantNom = pt.consigne_par_nom || chargeNom;
        const verificateurNom = isProcess ? processNom : chargeNom;

        cellE(pt.numero_ligne, dx, C.num); dx += C.num;
        cellE(pt.repere_point || demande.tag, dx, C.repere); dx += C.repere;
        cellE(pt.mcc_ref || pt.localisation, dx, C.local); dx += C.local;
        cellE(pt.dispositif_condamnation, dx, C.disp); dx += C.disp;
        cellE(pt.etat_requis, dx, C.etat); dx += C.etat;
        cellE(chargeLabel, dx, C.charge); dx += C.charge;
        cellE(aEteConsigne ? (pt.numero_cadenas || '') : '', dx, C.cad); dx += C.cad;
        cellE(aEteConsigne ? executantNom : '', dx, C.cNom); dx += C.cNom;
        cellE(aEteConsigne ? fmtDate(pt.date_consigne) : '', dx, C.cDate); dx += C.cDate;
        cellE(aEteConsigne ? fmtHeure(pt.date_consigne) : '', dx, C.cHeure); dx += C.cHeure;
        cellE(aEteConsigne ? verificateurNom : '', dx, C.vNom); dx += C.vNom;
        cellE(aEteConsigne ? fmtDate(pt.date_consigne) : '', dx, C.vDate); dx += C.vDate;
        // ✅ Colonne "Déconsigné par" — remplie si c'est ce type
        if (doitDeconsigner) {
          cellP(deconsigneurNom, dx, C.dNom, VIOLET_DECONS); dx += C.dNom;
          cellP(dateValid,       dx, C.dDate, VIOLET_DECONS);
        } else {
          cellE('', dx, C.dNom); dx += C.dNom;
          cellE('', dx, C.dDate);
        }
      } else {
        [C.num, C.repere, C.local, C.disp, C.etat, C.charge].forEach(cw => { cellE('', dx, cw); dx += cw; });
        [C.cad, C.cNom, C.cDate, C.cHeure, C.vNom, C.vDate, C.dNom, C.dDate].forEach(cw => { cellE('', dx, cw); dx += cw; });
      }
      y += ROW_DATA;
    });

    const basH = 44, basW = PW / 2;
    doc.rect(ML, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Déconsigné par :', ML + 4, y + 4);
    doc.font('Helvetica-Bold').text('Nom : ', ML + 4, y + 16, { continued: true }).font('Helvetica').text(chargeNom || '');
    doc.font('Helvetica-Bold').text('Date : ', ML + 4, y + 26, { continued: true }).font('Helvetica').text(dateValid);
    doc.font('Helvetica-Bold').text('Signature :', ML + 4, y + 36);
    doc.rect(ML + basW, y, basW, basH).stroke('#000');
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#000').text('Déconsigné par (process) :', ML + basW + 4, y + 4);
    doc.font('Helvetica-Bold').text('Nom : ', ML + basW + 4, y + 16, { continued: true }).font('Helvetica').text(processNom || '');
    doc.font('Helvetica-Bold').text('Date : ', ML + basW + 4, y + 26, { continued: true }).font('Helvetica').text(processInfo ? dateValid : '');
    doc.font('Helvetica-Bold').text('Signature :', ML + basW + 4, y + 36);
    y += basH + 6;

    doc.fontSize(7).font('Helvetica').fillColor('#000').text('Remarques : ', ML, y, { continued: true });
    doc.moveTo(ML + 60, y + 8).lineTo(ML + PW, y + 8).dash(2, { space: 2 }).stroke('#000'); doc.undash();
    y += 10;
    ["(1) : Indiquer le dispositif adéquat pour la condamnation",
     "(2) : Indiquer la position de séparation (ouvert ou fermer)",
     "(3) : Indiquer la personne habilitée à réaliser la consignation."]
    .forEach(n => { doc.fontSize(5.8).font('Helvetica').fillColor('#000').text(n, ML, y); y += 8; });

    y += 8;
    doc.rect(ML, y, PW, 14).fillAndStroke(BLEU_PLAN, BLEU_PLAN);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(BLANC).text("Schéma / Plan de l'équipement", ML, y + 3, { width: PW, align: 'center' });
    y += 16;
    const schemaH = 120;
    doc.rect(ML, y, PW, schemaH).stroke('#000');
    if (tagImagePath) {
      try { doc.image(tagImagePath, ML + 2, y + 2, { width: PW - 4, height: schemaH - 4, fit: [PW - 4, schemaH - 4], align: 'center', valign: 'center' }); } catch (e) {}
    }
    y += schemaH + 4;

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};

module.exports = { genererPDFUnifie, genererPDFDeconsignation, getTagImagePath };