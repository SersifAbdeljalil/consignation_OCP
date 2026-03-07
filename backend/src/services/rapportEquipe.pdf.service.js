// src/services/rapportEquipe.pdf.service.js
// ═══════════════════════════════════════════════════════════════════
// SERVICE PDF RAPPORT ÉQUIPE
// Génère le rapport complet de fin d'intervention :
//   - Récapitulatif de la demande
//   - Chronologie de toutes les actions (entrées / sorties)
//   - Statistiques : durée totale, durée moyenne, nb membres
//   - Graphiques : timeline, barres durée par membre, camembert statuts
// ═══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '../utils/OCPLOGO.png');

// ── Helpers date ─────────────────────────────────────────────────
const toMaroc = (d) => {
  if (!d) return null;
  return new Date(new Date(d).getTime() + 3600000);
};
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = toMaroc(d);
  return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`;
};
const fmtHeure = (d) => {
  if (!d) return '—';
  const dt = toMaroc(d);
  return `${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')}`;
};
const fmtDateHeure = (d) => {
  if (!d) return '—';
  return `${fmtDate(d)} ${fmtHeure(d)}`;
};
const dureeMin = (debut, fin) => {
  if (!debut || !fin) return null;
  return Math.round((new Date(fin) - new Date(debut)) / 60000);
};
const fmtDuree = (min) => {
  if (min === null || min === undefined) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h00`;
};

// ── Palette couleurs ──────────────────────────────────────────────
const C = {
  BLEU_HEADER  : '#003087',
  BLEU_LIGHT   : '#D6E4F3',
  BLEU_MID     : '#5B9BD5',
  VERT         : '#2E7D32',
  VERT_LIGHT   : '#E8F5E9',
  VERT_MID     : '#4CAF50',
  ORANGE       : '#F57C00',
  ORANGE_LIGHT : '#FFF3E0',
  ROUGE        : '#C62828',
  ROUGE_LIGHT  : '#FFEBEE',
  GRIS         : '#757575',
  GRIS_LIGHT   : '#F5F5F5',
  GRIS_BORDER  : '#BDBDBD',
  BLANC        : '#FFFFFF',
  NOIR         : '#212121',
  VIOLET       : '#6A1B9A',
  VIOLET_LIGHT : '#F3E5F5',
  JAUNE        : '#F9A825',
  JAUNE_LIGHT  : '#FFFDE7',
};

// ── Utilitaires dessin ────────────────────────────────────────────
const drawRect = (doc, x, y, w, h, fill, stroke) => {
  doc.rect(x, y, w, h);
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill)   doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
};

const drawText = (doc, txt, x, y, opts = {}) => {
  doc.fontSize(opts.size || 8)
     .font(opts.bold ? 'Helvetica-Bold' : opts.italic ? 'Helvetica-Oblique' : 'Helvetica')
     .fillColor(opts.color || C.NOIR)
     .text(String(txt ?? ''), x, y, {
       width     : opts.width,
       align     : opts.align || 'left',
       lineBreak : opts.lineBreak !== undefined ? opts.lineBreak : false,
       ellipsis  : opts.ellipsis !== undefined ? opts.ellipsis : true,
       continued : opts.continued || false,
     });
};

// ── Entête page ───────────────────────────────────────────────────
const drawHeader = (doc, demande, chef, ML, PW) => {
  const hdrH = 60;

  // Logo
  doc.rect(ML, 30, 75, hdrH).stroke(C.NOIR);
  if (fs.existsSync(LOGO_PATH)) {
    try { doc.image(LOGO_PATH, ML + 4, 33, { width: 67, height: 54, fit: [67, 54], align: 'center', valign: 'center' }); }
    catch (_) {}
  }

  // Titre central
  const titleX = ML + 77;
  const titleW = PW - 77 - 115;
  drawRect(doc, titleX, 30, titleW, hdrH, C.BLEU_HEADER, C.BLEU_HEADER);
  drawText(doc, 'RAPPORT DE FIN D\'INTERVENTION', titleX, 46, { size: 10, bold: true, color: C.BLANC, width: titleW, align: 'center' });
  drawText(doc, 'Consignation / Déconsignation — Équipe de travail', titleX, 60, { size: 7, color: C.BLEU_LIGHT, width: titleW, align: 'center' });

  // Bloc infos droite
  const infoX = titleX + titleW + 2;
  const infoW = PW - 77 - titleW - 2;
  const infos = [
    ['Réf.',   demande.numero_ordre || '—'],
    ['TAG',    demande.tag          || '—'],
    ['LOT',    demande.lot_code     || '—'],
    ['Date',   fmtDate(new Date())       ],
    ['Chef',   chef ? `${chef.prenom} ${chef.nom}` : '—'],
  ];
  const rowH = hdrH / infos.length;
  infos.forEach(([label, val], i) => {
    const ry = 30 + i * rowH;
    drawRect(doc, infoX, ry, infoW, rowH, i % 2 === 0 ? C.BLEU_LIGHT : C.BLANC, C.GRIS_BORDER);
    drawText(doc, label + ' :', infoX + 2, ry + rowH / 2 - 3, { size: 6, bold: true, color: C.BLEU_HEADER, width: 22 });
    drawText(doc, val, infoX + 26, ry + rowH / 2 - 3, { size: 6, color: C.NOIR, width: infoW - 28, ellipsis: true });
  });

  return 30 + hdrH + 8;
};

// ── Section titre ─────────────────────────────────────────────────
const drawSectionTitle = (doc, title, icon, y, ML, PW, color = C.BLEU_HEADER) => {
  drawRect(doc, ML, y, PW, 16, color, color);
  drawText(doc, `${icon}  ${title}`, ML + 6, y + 4, { size: 8, bold: true, color: C.BLANC, width: PW - 10 });
  return y + 20;
};

// ── Récapitulatif demande ─────────────────────────────────────────
const drawRecapDemande = (doc, demande, y, ML, PW) => {
  y = drawSectionTitle(doc, 'RÉCAPITULATIF DE LA DEMANDE', '📋', y, ML, PW);

  const fields = [
    ['N° Ordre',          demande.numero_ordre  || '—'],
    ['Équipement (TAG)',   `${demande.equipement_nom || '—'} (${demande.tag || '—'})`],
    ['Lot',               demande.lot_code      || '—'],
    ['Raison intervention', demande.raison      || '—'],
    ['Statut final',      demande.statut        || '—'],
    ['Date consignation', fmtDateHeure(demande.date_validation || demande.created_at)],
    ['Date déconsignation', fmtDateHeure(new Date())],
  ];

  const colW = PW / 2;
  fields.forEach(([label, val], i) => {
    const col  = i % 2;
    const row  = Math.floor(i / 2);
    const fx   = ML + col * colW;
    const fy   = y + row * 14;
    drawRect(doc, fx, fy, colW, 14, i % 4 < 2 ? C.GRIS_LIGHT : C.BLANC, C.GRIS_BORDER);
    drawText(doc, label + ' :', fx + 4, fy + 4, { size: 6.5, bold: true, color: C.BLEU_HEADER, width: 80 });
    drawText(doc, val, fx + 86, fy + 4, { size: 6.5, color: C.NOIR, width: colW - 90, ellipsis: true });
  });

  const rowsUsed = Math.ceil(fields.length / 2);
  return y + rowsUsed * 14 + 8;
};

// ── Statistiques globales ─────────────────────────────────────────
const drawStats = (doc, membres, stats, y, ML, PW) => {
  y = drawSectionTitle(doc, 'STATISTIQUES GLOBALES', '📊', y, ML, PW, C.VERT);

  const total       = membres.length;
  const sortis      = membres.filter(m => m.statut === 'sortie').length;
  const surSite     = membres.filter(m => m.statut === 'sur_site').length;
  const enAttente   = membres.filter(m => m.statut === 'en_attente').length;
  const durees      = membres
    .filter(m => m.heure_entree && m.heure_sortie)
    .map(m => dureeMin(m.heure_entree, m.heure_sortie));
  const dureeMoy    = durees.length
    ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length)
    : null;
  const dureeMax    = durees.length ? Math.max(...durees) : null;
  const dureeMin_v  = durees.length ? Math.min(...durees) : null;
  const dureeTotal  = stats.duree_totale_min || (durees.length ? Math.max(...durees) : null);

  const cards = [
    { label: 'Total membres',  val: total,              color: C.BLEU_HEADER, bg: C.BLEU_LIGHT  },
    { label: 'Sortis',         val: sortis,             color: C.VERT,        bg: C.VERT_LIGHT  },
    { label: 'Sur site',       val: surSite,            color: C.ORANGE,      bg: C.ORANGE_LIGHT},
    { label: 'En attente',     val: enAttente,          color: C.GRIS,        bg: C.GRIS_LIGHT  },
    { label: 'Durée totale',   val: fmtDuree(dureeTotal), color: C.VIOLET,   bg: C.VIOLET_LIGHT},
    { label: 'Durée moyenne',  val: fmtDuree(dureeMoy),   color: C.ROUGE,    bg: C.ROUGE_LIGHT },
    { label: 'Durée max',      val: fmtDuree(dureeMax),   color: C.ORANGE,   bg: C.ORANGE_LIGHT},
    { label: 'Durée min',      val: fmtDuree(dureeMin_v), color: C.VERT,     bg: C.VERT_LIGHT  },
  ];

  const cardW = PW / 4;
  const cardH = 32;
  cards.forEach((card, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx  = ML + col * cardW;
    const cy  = y + row * (cardH + 4);
    drawRect(doc, cx + 2, cy, cardW - 4, cardH, card.bg, card.color);
    drawText(doc, card.label, cx + 6, cy + 5, { size: 6, bold: true, color: card.color, width: cardW - 10 });
    drawText(doc, String(card.val), cx + 6, cy + 16, { size: 13, bold: true, color: card.color, width: cardW - 10, align: 'center' });
  });

  return y + 2 * (cardH + 4) + 10;
};

// ── GRAPHIQUE 1 : Barres durée par membre ─────────────────────────
const drawBarChart = (doc, membres, y, ML, PW) => {
  y = drawSectionTitle(doc, 'DURÉE D\'INTERVENTION PAR MEMBRE', '⏱', y, ML, PW, C.ORANGE);

  const membresAvecDuree = membres
    .filter(m => m.heure_entree && m.heure_sortie)
    .map(m => ({
      ...m,
      duree: dureeMin(m.heure_entree, m.heure_sortie),
    }))
    .sort((a, b) => b.duree - a.duree);

  if (!membresAvecDuree.length) {
    drawText(doc, 'Aucune donnée de durée disponible', ML + 4, y + 6, { size: 8, italic: true, color: C.GRIS, width: PW });
    return y + 24;
  }

  const maxDuree  = Math.max(...membresAvecDuree.map(m => m.duree));
  const chartH    = Math.min(membresAvecDuree.length * 18 + 10, 160);
  const barAreaW  = PW - 120;
  const labelW    = 90;
  const valW      = 30;

  // Fond
  drawRect(doc, ML, y, PW, chartH, C.GRIS_LIGHT, C.GRIS_BORDER);

  // Lignes de grille verticales (4 divisions)
  for (let i = 1; i <= 4; i++) {
    const gx = ML + labelW + (barAreaW * i / 4);
    doc.moveTo(gx, y).lineTo(gx, y + chartH).dash(2, { space: 3 }).stroke(C.GRIS_BORDER).undash();
    const labelGrille = Math.round(maxDuree * i / 4);
    drawText(doc, fmtDuree(labelGrille), gx - 10, y + chartH - 8, { size: 5, color: C.GRIS, width: 22, align: 'center' });
  }

  membresAvecDuree.forEach((m, i) => {
    const barY   = y + 6 + i * 18;
    const barW   = maxDuree > 0 ? Math.max(4, (m.duree / maxDuree) * barAreaW) : 4;

    // Couleur selon durée relative
    let barColor = C.VERT_MID;
    if (m.duree / maxDuree > 0.75) barColor = C.ROUGE;
    else if (m.duree / maxDuree > 0.5) barColor = C.ORANGE;

    // Label nom
    drawText(doc, m.nom.substring(0, 14), ML + 2, barY + 3, { size: 6, color: C.NOIR, width: labelW - 4 });

    // Barre
    drawRect(doc, ML + labelW, barY, barW, 12, barColor, barColor);

    // Valeur durée
    drawText(doc, fmtDuree(m.duree), ML + labelW + barW + 3, barY + 3, { size: 6, bold: true, color: barColor, width: valW });
  });

  return y + chartH + 10;
};

// ── GRAPHIQUE 2 : Camembert statuts (dessiné avec arcs) ───────────
const drawPieChart = (doc, membres, y, ML, PW) => {
  y = drawSectionTitle(doc, 'RÉPARTITION PAR STATUT', '🥧', y, ML, PW, C.VIOLET);

  const total     = membres.length;
  const sortis    = membres.filter(m => m.statut === 'sortie').length;
  const surSite   = membres.filter(m => m.statut === 'sur_site').length;
  const enAttente = membres.filter(m => m.statut === 'en_attente').length;

  const slices = [
    { label: 'Sortis',    count: sortis,    color: C.VERT_MID, pct: total ? (sortis    / total) : 0 },
    { label: 'Sur site',  count: surSite,   color: C.ORANGE,   pct: total ? (surSite   / total) : 0 },
    { label: 'En attente',count: enAttente, color: C.ROUGE,    pct: total ? (enAttente / total) : 0 },
  ].filter(s => s.count > 0);

  const cx   = ML + 60;
  const cy   = y + 44;
  const r    = 38;

  if (total === 0) {
    drawText(doc, 'Aucun membre', ML + 4, y + 6, { size: 8, italic: true, color: C.GRIS, width: PW });
    return y + 24;
  }

  // Dessin arc par arc
  let startAngle = -Math.PI / 2;
  slices.forEach(slice => {
    const endAngle = startAngle + slice.pct * 2 * Math.PI;
    const midAngle = (startAngle + endAngle) / 2;

    // Dessin du secteur avec chemin SVG-like
    doc.save();
    doc.moveTo(cx, cy);
    doc.arc(cx, cy, r, startAngle, endAngle, false);
    doc.lineTo(cx, cy);
    doc.fillColor(slice.color).fill();

    // Trait de séparation
    doc.moveTo(cx, cy);
    doc.arc(cx, cy, r, startAngle, endAngle, false);
    doc.lineTo(cx, cy);
    doc.strokeColor(C.BLANC).lineWidth(1.5).stroke();
    doc.restore();

    startAngle = endAngle;
  });

  // Cercle blanc au centre (effet donut)
  doc.circle(cx, cy, r * 0.45).fillColor(C.BLANC).fill();
  drawText(doc, String(total), cx - 10, cy - 6, { size: 11, bold: true, color: C.BLEU_HEADER, width: 20, align: 'center' });
  drawText(doc, 'total', cx - 10, cy + 4, { size: 5, color: C.GRIS, width: 20, align: 'center' });

  // Légende
  const legendX = ML + 120;
  slices.forEach((slice, i) => {
    const ly = y + 10 + i * 20;
    drawRect(doc, legendX, ly, 12, 12, slice.color, slice.color);
    drawText(doc, `${slice.label}`, legendX + 16, ly + 2, { size: 7, bold: true, color: slice.color, width: 60 });
    drawText(doc, `${slice.count} membre${slice.count > 1 ? 's' : ''} (${Math.round(slice.pct * 100)}%)`, legendX + 16, ly + 11, { size: 6, color: C.NOIR, width: 80 });
  });

  return y + r * 2 + 20;
};

// ── GRAPHIQUE 3 : Timeline entrées/sorties ────────────────────────
const drawTimeline = (doc, membres, y, ML, PW) => {
  y = drawSectionTitle(doc, 'TIMELINE — PRÉSENCE SUR SITE', '📅', y, ML, PW, C.BLEU_MID);

  const membresAvecEntree = membres.filter(m => m.heure_entree);
  if (!membresAvecEntree.length) {
    drawText(doc, 'Aucune donnée de présence disponible', ML + 4, y + 6, { size: 8, italic: true, color: C.GRIS, width: PW });
    return y + 24;
  }

  const toMs  = d => new Date(d).getTime();
  const tMin  = Math.min(...membresAvecEntree.map(m => toMs(m.heure_entree)));
  const tMax  = Math.max(...membresAvecEntree.map(m => m.heure_sortie ? toMs(m.heure_sortie) : Date.now()));
  const range = tMax - tMin || 1;

  const labelW   = 90;
  const timelineW = PW - labelW - 10;
  const rowH     = 16;
  const chartH   = membresAvecEntree.length * rowH + 20;

  drawRect(doc, ML, y, PW, chartH, C.GRIS_LIGHT, C.GRIS_BORDER);

  // En-tête timeline (heures)
  const nbTicks = 4;
  for (let i = 0; i <= nbTicks; i++) {
    const tx  = ML + labelW + (timelineW * i / nbTicks);
    const tms = tMin + range * i / nbTicks;
    doc.moveTo(tx, y).lineTo(tx, y + chartH).dash(2, { space: 3 }).stroke(C.GRIS_BORDER).undash();
    drawText(doc, fmtHeure(new Date(tms)), tx - 12, y + chartH - 8, { size: 4.5, color: C.GRIS, width: 26, align: 'center' });
  }

  membresAvecEntree.forEach((m, i) => {
    const rowY   = y + 5 + i * rowH;
    const entMs  = toMs(m.heure_entree);
    const sortMs = m.heure_sortie ? toMs(m.heure_sortie) : Date.now();
    const xStart = ML + labelW + ((entMs  - tMin) / range) * timelineW;
    const xEnd   = ML + labelW + ((sortMs - tMin) / range) * timelineW;
    const barW   = Math.max(4, xEnd - xStart);

    const barColor = m.statut === 'sortie' ? C.VERT_MID
                   : m.statut === 'sur_site' ? C.ORANGE
                   : C.ROUGE;

    drawText(doc, m.nom.substring(0, 14), ML + 2, rowY + 3, { size: 5.5, color: C.NOIR, width: labelW - 4 });
    drawRect(doc, xStart, rowY, barW, rowH - 4, barColor, barColor);

    // Étiquettes heure
    drawText(doc, fmtHeure(m.heure_entree), xStart, rowY - 4, { size: 4, color: C.VERT, width: 24 });
    if (m.heure_sortie) {
      drawText(doc, fmtHeure(m.heure_sortie), Math.min(xEnd - 20, ML + labelW + timelineW - 24), rowY - 4, { size: 4, color: C.ROUGE, width: 24 });
    }
  });

  return y + chartH + 10;
};

// ── Tableau chronologie ───────────────────────────────────────────
const drawChronologie = (doc, membres, y, ML, PW) => {
  y = drawSectionTitle(doc, 'CHRONOLOGIE DES ACTIONS', '📝', y, ML, PW, C.NOIR);

  // Construire la liste d'actions triée par heure
  const actions = [];
  membres.forEach(m => {
    if (m.heure_entree) {
      actions.push({
        heure    : m.heure_entree,
        type     : 'ENTRÉE',
        membre   : m.nom,
        badge    : m.badge_ocp_id || '—',
        cadenas  : m.numero_cadenas || '—',
        color    : C.VERT,
        bg       : C.VERT_LIGHT,
      });
    }
    if (m.heure_sortie) {
      actions.push({
        heure    : m.heure_sortie,
        type     : 'SORTIE',
        membre   : m.nom,
        badge    : m.badge_ocp_id || '—',
        cadenas  : m.scan_cadenas_sortie || m.numero_cadenas || '—',
        color    : C.ROUGE,
        bg       : C.ROUGE_LIGHT,
      });
    }
  });
  actions.sort((a, b) => new Date(a.heure) - new Date(b.heure));

  if (!actions.length) {
    drawText(doc, 'Aucune action enregistrée', ML + 4, y + 6, { size: 8, italic: true, color: C.GRIS, width: PW });
    return y + 24;
  }

  // En-tête tableau
  const cols = { num: 18, heure: 52, type: 34, membre: 90, badge: 80, cadenas: PW - 18 - 52 - 34 - 90 - 80 };
  const headerY = y;
  const headerH = 14;
  drawRect(doc, ML, headerY, PW, headerH, C.BLEU_HEADER, C.BLEU_HEADER);

  let hx = ML;
  [['#', cols.num], ['Heure', cols.heure], ['Action', cols.type], ['Membre', cols.membre], ['Badge OCP', cols.badge], ['Cadenas', cols.cadenas]].forEach(([label, w]) => {
    drawText(doc, label, hx + 2, headerY + 4, { size: 6, bold: true, color: C.BLANC, width: w - 4, align: 'center' });
    hx += w;
  });
  y += headerH;

  // Lignes
  actions.forEach((action, i) => {
    const rowY = y;
    const rowH = 13;
    drawRect(doc, ML, rowY, PW, rowH, action.bg, C.GRIS_BORDER);

    let rx = ML;
    const cell = (txt, w) => {
      drawText(doc, String(txt), rx + 2, rowY + 3, { size: 6, color: C.NOIR, width: w - 4, align: 'center', ellipsis: true });
      rx += w;
    };
    cell(i + 1,          cols.num);
    cell(fmtHeure(action.heure), cols.heure);
    drawText(doc, action.type, ML + cols.num + cols.heure + 2, rowY + 3, { size: 6, bold: true, color: action.color, width: cols.type - 4, align: 'center' });
    rx = ML + cols.num + cols.heure + cols.type;
    cell(action.membre,  cols.membre);
    cell(action.badge,   cols.badge);
    cell(action.cadenas, cols.cadenas);

    y += rowH;
  });

  return y + 10;
};

// ── Tableau membres détaillé ──────────────────────────────────────
const drawTableauMembres = (doc, membres, y, ML, PW) => {
  y = drawSectionTitle(doc, 'DÉTAIL PAR MEMBRE', '👷', y, ML, PW, C.BLEU_MID);

  const cols2 = {
    nom    : 80,
    badge  : 70,
    cadenas: 70,
    entree : 55,
    sortie : 55,
    duree  : 40,
    statut : PW - 80 - 70 - 70 - 55 - 55 - 40,
  };

  // Header
  const hH = 14;
  drawRect(doc, ML, y, PW, hH, C.BLEU_MID, C.BLEU_MID);
  let hx = ML;
  [['Nom', cols2.nom], ['Badge OCP', cols2.badge], ['Cadenas', cols2.cadenas],
   ['Entrée', cols2.entree], ['Sortie', cols2.sortie], ['Durée', cols2.duree], ['Statut', cols2.statut]
  ].forEach(([label, w]) => {
    drawText(doc, label, hx + 2, y + 4, { size: 6, bold: true, color: C.BLANC, width: w - 4, align: 'center' });
    hx += w;
  });
  y += hH;

  membres.forEach((m, i) => {
    const rowH  = 13;
    const bg    = i % 2 === 0 ? C.BLANC : C.GRIS_LIGHT;
    const duree = dureeMin(m.heure_entree, m.heure_sortie);
    const statutColor = m.statut === 'sortie' ? C.VERT
                      : m.statut === 'sur_site' ? C.ORANGE
                      : C.GRIS;

    drawRect(doc, ML, y, PW, rowH, bg, C.GRIS_BORDER);

    let rx = ML;
    const cell = (txt, w, opts = {}) => {
      drawText(doc, String(txt ?? '—'), rx + 2, y + 3, { size: 6, color: opts.color || C.NOIR, width: w - 4, align: opts.align || 'center', ellipsis: true, bold: opts.bold || false });
      rx += w;
    };

    cell(m.nom,                            cols2.nom,    { align: 'left' });
    cell(m.badge_ocp_id || '—',            cols2.badge);
    cell(m.numero_cadenas || '—',          cols2.cadenas);
    cell(fmtHeure(m.heure_entree),         cols2.entree, { color: C.VERT   });
    cell(fmtHeure(m.heure_sortie),         cols2.sortie, { color: C.ROUGE  });
    cell(fmtDuree(duree),                  cols2.duree,  { color: C.VIOLET, bold: true });
    cell(m.statut?.replace('_', ' ') || '—', cols2.statut, { color: statutColor, bold: true });

    y += rowH;
  });

  return y + 10;
};

// ── Pied de page ──────────────────────────────────────────────────
const drawFooter = (doc, chef, demande, y, ML, PW) => {
  const footH = 50;
  drawRect(doc, ML, y, PW, footH, C.GRIS_LIGHT, C.GRIS_BORDER);

  const halfW = PW / 2;

  // Signature chef
  drawText(doc, 'Signature du Chef d\'Équipe :', ML + 6, y + 6, { size: 7, bold: true, color: C.BLEU_HEADER, width: halfW - 10 });
  drawText(doc, chef ? `${chef.prenom} ${chef.nom}` : '—', ML + 6, y + 18, { size: 8, color: C.NOIR, width: halfW - 10 });
  doc.moveTo(ML + 6, y + 42).lineTo(ML + halfW - 10, y + 42).stroke(C.GRIS_BORDER);

  // Date/heure génération
  drawText(doc, 'Rapport généré le :', ML + halfW + 6, y + 6, { size: 7, bold: true, color: C.BLEU_HEADER, width: halfW - 10 });
  drawText(doc, fmtDateHeure(new Date()), ML + halfW + 6, y + 18, { size: 8, color: C.NOIR, width: halfW - 10 });

  // Note bas
  const noteY = y + footH + 4;
  drawText(doc, '⚠️  Ce rapport est généré automatiquement par le système de consignation OCP. Il constitue un document officiel de traçabilité.', ML, noteY, { size: 5.5, italic: true, color: C.GRIS, width: PW, lineBreak: true });
};

// ═══════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE
// ═══════════════════════════════════════════════════════════════════
const genererRapportEquipePDF = ({ demande, membres, chef, stats, pdfPath }) => {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 30, size: 'A4', autoFirstPage: true });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const ML = 30;
    const PW = 595 - ML - 30;

    // ── PAGE 1 ──────────────────────────────────────────────────────
    let y = drawHeader(doc, demande, chef, ML, PW);
    y = drawRecapDemande(doc, demande, y, ML, PW);
    y = drawStats(doc, membres, stats, y, ML, PW);

    // Vérifier espace page
    const checkPage = (neededH) => {
      if (y + neededH > 790) {
        doc.addPage();
        y = 30;
      }
    };

    // ── Graphique barres durée ────────────────────────────────────
    checkPage(180);
    y = drawBarChart(doc, membres, y, ML, PW);

    // ── Camembert ────────────────────────────────────────────────
    checkPage(130);
    y = drawPieChart(doc, membres, y, ML, PW);

    // ── Timeline ─────────────────────────────────────────────────
    checkPage(membres.filter(m => m.heure_entree).length * 16 + 40);
    if (y + membres.filter(m => m.heure_entree).length * 16 + 40 > 790) {
      doc.addPage();
      y = 30;
    }
    y = drawTimeline(doc, membres, y, ML, PW);

    // ── PAGE SUIVANTE : Chronologie + tableau membres ──────────────
    doc.addPage();
    y = 30;

    y = drawChronologie(doc, membres, y, ML, PW);

    checkPage(membres.length * 13 + 40);
    if (y + membres.length * 13 + 40 > 790) {
      doc.addPage();
      y = 30;
    }
    y = drawTableauMembres(doc, membres, y, ML, PW);

    // ── Pied de page ─────────────────────────────────────────────
    checkPage(80);
    drawFooter(doc, chef, demande, y, ML, PW);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};

module.exports = { genererRapportEquipePDF };