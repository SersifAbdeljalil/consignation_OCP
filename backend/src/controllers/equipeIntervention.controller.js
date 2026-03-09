// src/controllers/equipeIntervention.controller.js
// ✅ FIX HEURE MAROC (Ramadan-safe, SANS dépendance timezone tables MySQL) :
//    PROBLÈME RACINE : CONVERT_TZ(col, '+00:00', 'Africa/Casablanca') retourne NULL
//    si les timezone tables MySQL ne sont pas chargées → toutes les heures NULL
//    → pas de durée, pas de chronologie, timeline vide dans le PDF.
//
//    SOLUTION : On récupère les dates en UTC BRUT depuis MySQL (sans CONVERT_TZ),
//    puis on convertit en heure Maroc côté Node.js via Intl.DateTimeFormat
//    (disponible nativement, aucun package requis).
//    → Ramadan-safe : UTC+0 pendant Ramadan, UTC+1 le reste de l'année.
//
// ✅ FIX STATUT DÉCONSIGNATION :
//    consigne → deconsigne_intervent | consigne_charge → deconsigne_charge | etc.
//
// ✅ [NOUVEAU] validerDeconsignation envoie une notification détaillée à l'agent :
//    - Notif in-app : "🔓 Déconsignation Génie Civil effectuée" avec heure de fin
//    - Push : label métier + TAG + numéro ordre
//    - Le message mentionne explicitement le métier (GC / Mécanique / Électrique)
'use strict';

const path = require('path');
const fs   = require('fs');
const db   = require('../config/db');
const { success, error }          = require('../utils/response');
const { envoyerNotification }     = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');
const { genererRapportEquipePDF } = require('../services/rapportEquipe.pdf.service');

const STATUTS_AUTORISES = ['consigne', 'consigne_charge', 'consigne_process'];

const STATUTS_LECTURE_EQUIPE = [
  'consigne', 'consigne_charge', 'consigne_process',
  'deconsigne_intervent', 'deconsigne_charge', 'deconsigne_process',
  'deconsignee',
];

const STATUT_DECONSIGNE_MAP = {
  'consigne':         'deconsigne_intervent',
  'consigne_charge':  'deconsigne_charge',
  'consigne_process': 'deconsigne_process',
};

const METIER_LABELS = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

// ═══════════════════════════════════════════════════════════════════
// ✅ CONVERSION TIMEZONE — Node.js natif, sans package, Ramadan-safe
// ═══════════════════════════════════════════════════════════════════

const toMarocString = (d) => {
  if (!d) return null;
  try {
    let dt;
    if (d instanceof Date) {
      dt = d;
    } else {
      const s = String(d).trim();
      const hastz = s.includes('+') || s.includes('Z') || s.endsWith('00:00');
      dt = hastz ? new Date(s) : new Date(s + 'Z');
    }
    if (isNaN(dt.getTime())) return null;

    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Casablanca',
      year:     'numeric',
      month:    '2-digit',
      day:      '2-digit',
      hour:     '2-digit',
      minute:   '2-digit',
      second:   '2-digit',
      hour12:   false,
    }).formatToParts(dt);

    const get = (type) => parts.find(p => p.type === type)?.value || '00';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch (e) {
    console.error('[TZ] toMarocString error:', e, 'pour:', d);
    return null;
  }
};

const convertMembreTZ = (m) => ({
  ...m,
  heure_entree:       toMarocString(m.heure_entree),
  heure_sortie:       toMarocString(m.heure_sortie),
  heure_scan_cadenas: toMarocString(m.heure_scan_cadenas),
  heure_scan_sortie:  toMarocString(m.heure_scan_sortie),
  created_at:         toMarocString(m.created_at),
});

const MEMBRE_UTC_COLS = `
  ei.heure_entree,
  ei.heure_sortie,
  ei.heure_scan_cadenas,
  ei.heure_scan_sortie,
  ei.created_at
`;

const dureeMin = (debut, fin) => {
  if (!debut || !fin) return null;
  return Math.round((new Date(fin) - new Date(debut)) / 60000);
};

// ── GET /equipe-intervention/mes-membres ─────────────────────────
const getMesMembres = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
              ${MEMBRE_UTC_COLS},
              d.numero_ordre,
              e.code_equipement AS tag,
              e.nom             AS equipement_nom
       FROM equipe_intervention ei
       JOIN demandes_consignation d ON ei.demande_id = d.id
       JOIN equipements e           ON d.equipement_id = e.id
       WHERE ei.chef_equipe_id = ?
       ORDER BY ei.created_at DESC`,
      [req.user.id]
    );
    return success(res, rows.map(convertMembreTZ), 'Membres récupérés');
  } catch (err) {
    console.error('getMesMembres error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /equipe-intervention/:demande_id ─────────────────────────
const getEquipe = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.id, d.statut, d.numero_ordre, d.agent_id,
              e.code_equipement AS tag
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       WHERE d.id = ?`,
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];

    if (!STATUTS_LECTURE_EQUIPE.includes(demande.statut)) {
      return error(res, `Statut invalide pour consulter l'équipe (statut: ${demande.statut})`, 400);
    }

    const [membresRaw] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
              ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei
       WHERE ei.demande_id = ? AND ei.chef_equipe_id = ?
       ORDER BY ei.created_at ASC`,
      [demande_id, chef_id]
    );

    const membres       = membresRaw.map(convertMembreTZ);
    const equipeValidee = membres.some(m => m.equipe_validee === 1) ? 1 : 0;

    return success(res, {
      demande_id:     parseInt(demande_id),
      membres,
      equipe_validee: equipeValidee,
      tag:            demande.tag,
      numero_ordre:   demande.numero_ordre,
    }, 'Équipe récupérée');
  } catch (err) {
    console.error('getEquipe error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /equipe-intervention/:demande_id/intervenants-dispos ─────
const getIntervenantsDispos = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?', [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) {
      return error(res, 'Statut invalide', 400);
    }

    const [membresSortis] = await db.query(
      `SELECT id, nom, matricule, badge_ocp_id, numero_cadenas, cad_id
       FROM equipe_intervention
       WHERE chef_equipe_id = ? AND statut = 'sortie'
       ORDER BY nom ASC`,
      [chef_id]
    );

    const [dejaActifs] = await db.query(
      `SELECT badge_ocp_id, matricule
       FROM equipe_intervention
       WHERE demande_id = ? AND statut != 'sortie'`,
      [demande_id]
    );

    const badgesActifs     = new Set(dejaActifs.map(m => (m.badge_ocp_id || '').toLowerCase()).filter(Boolean));
    const matriculesActifs = new Set(dejaActifs.map(m => (m.matricule    || '').toLowerCase()).filter(Boolean));

    const dispos = membresSortis.filter(m => {
      if (m.badge_ocp_id && badgesActifs.has(m.badge_ocp_id.toLowerCase()))  return false;
      if (m.matricule    && matriculesActifs.has(m.matricule.toLowerCase()))  return false;
      return true;
    });

    const vus = new Set();
    const dedoublonnes = dispos.filter(m => {
      const cle = m.badge_ocp_id?.toLowerCase() || m.matricule?.toLowerCase() || String(m.id);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });

    return success(res, dedoublonnes, 'Intervenants disponibles');
  } catch (err) {
    console.error('getIntervenantsDispos error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/membre ─────────────────────────────
const enregistrerMembre = async (req, res) => {
  try {
    const { demande_id, nom, matricule, badge_ocp_id, numero_cadenas, cad_id, membre_id } = req.body;
    const chef_id    = req.user.id;
    const photo_path = req.file ? `uploads/membres/${req.file.filename}` : null;

    if (!demande_id || !nom || !nom.trim()) {
      return error(res, 'demande_id et nom sont obligatoires', 400);
    }

    const [demandes] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?', [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) {
      return error(res, `Statut invalide (statut: ${demandes[0].statut})`, 400);
    }

    const fetchMembre = async (id) => {
      const [rows] = await db.query(
        `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
                ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
                ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
                ${MEMBRE_UTC_COLS}
         FROM equipe_intervention ei WHERE ei.id=?`, [id]
      );
      return rows.length ? convertMembreTZ(rows[0]) : null;
    };

    if (membre_id) {
      const [rows] = await db.query(
        'SELECT * FROM equipe_intervention WHERE id = ? AND chef_equipe_id = ?',
        [membre_id, chef_id]
      );
      if (!rows.length) return error(res, 'Membre introuvable ou non autorisé', 404);
      if (rows[0].equipe_validee === 1) return error(res, "Impossible — l'équipe est déjà validée", 400);

      const ancien = rows[0];
      if (photo_path && ancien.photo_path) {
        const f = path.join(__dirname, '../../', ancien.photo_path);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }

      await db.query(
        `UPDATE equipe_intervention
         SET nom=?, matricule=?, badge_ocp_id=?, numero_cadenas=?, cad_id=?,
             photo_path=COALESCE(?, photo_path), statut='en_attente', equipe_validee=0,
             heure_entree=NULL, heure_sortie=NULL,
             heure_scan_cadenas=NULL, heure_scan_sortie=NULL, scan_cadenas_sortie=NULL
         WHERE id=?`,
        [nom.trim(), matricule?.trim()||ancien.matricule||null, badge_ocp_id?.trim()||ancien.badge_ocp_id||null,
         numero_cadenas?.trim()||ancien.numero_cadenas||null, cad_id?.trim()||ancien.cad_id||null, photo_path, membre_id]
      );
      return success(res, await fetchMembre(membre_id), 'Membre mis à jour avec succès', 200);
    }

    let membreExistant = null;
    if (badge_ocp_id) {
      const [r] = await db.query(
        `SELECT * FROM equipe_intervention WHERE badge_ocp_id=? AND statut='sortie' ORDER BY created_at DESC LIMIT 1`,
        [badge_ocp_id.trim()]
      );
      if (r.length) membreExistant = r[0];
    }
    if (!membreExistant && matricule) {
      const [r] = await db.query(
        `SELECT * FROM equipe_intervention WHERE matricule=? AND statut='sortie' ORDER BY created_at DESC LIMIT 1`,
        [matricule.trim()]
      );
      if (r.length) membreExistant = r[0];
    }

    if (membreExistant) {
      if (photo_path && membreExistant.photo_path) {
        const f = path.join(__dirname, '../../', membreExistant.photo_path);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      await db.query(
        `UPDATE equipe_intervention
         SET demande_id=?, chef_equipe_id=?, nom=?, matricule=?, badge_ocp_id=?,
             numero_cadenas=?, cad_id=?, photo_path=COALESCE(?, photo_path),
             statut='en_attente', equipe_validee=0,
             heure_entree=NULL, heure_sortie=NULL,
             heure_scan_cadenas=NULL, heure_scan_sortie=NULL, scan_cadenas_sortie=NULL
         WHERE id=?`,
        [demande_id, chef_id, nom.trim(), matricule?.trim()||membreExistant.matricule||null,
         badge_ocp_id?.trim()||membreExistant.badge_ocp_id||null,
         numero_cadenas?.trim()||membreExistant.numero_cadenas||null,
         cad_id?.trim()||membreExistant.cad_id||null, photo_path, membreExistant.id]
      );
      return success(res, await fetchMembre(membreExistant.id), 'Membre réactivé avec succès', 200);
    }

    if (badge_ocp_id) {
      const [ex] = await db.query(
        `SELECT id FROM equipe_intervention WHERE demande_id=? AND badge_ocp_id=? AND statut!='sortie'`,
        [demande_id, badge_ocp_id.trim()]
      );
      if (ex.length) return error(res, 'Ce badge est déjà actif pour cette demande', 400);
    }
    if (cad_id) {
      const [ex] = await db.query(
        `SELECT id FROM equipe_intervention WHERE demande_id=? AND cad_id=? AND statut!='sortie'`,
        [demande_id, cad_id.trim()]
      );
      if (ex.length) return error(res, 'Ce cadenas est déjà utilisé par un autre membre actif', 400);
    }

    const [result] = await db.query(
      `INSERT INTO equipe_intervention
         (demande_id, chef_equipe_id, nom, matricule, badge_ocp_id, numero_cadenas, cad_id, photo_path, equipe_validee, statut)
       VALUES (?,?,?,?,?,?,?,?,0,'en_attente')`,
      [demande_id, chef_id, nom.trim(), matricule?.trim()||null, badge_ocp_id?.trim()||null,
       numero_cadenas?.trim()||null, cad_id?.trim()||null, photo_path]
    );
    return success(res, await fetchMembre(result.insertId), 'Membre enregistré avec succès', 201);
  } catch (err) {
    console.error('enregistrerMembre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── DELETE /equipe-intervention/membre/:id ────────────────────────
const supprimerMembre = async (req, res) => {
  try {
    const { id } = req.params;
    const chef_id = req.user.id;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    const membre = rows[0];
    if (membre.chef_equipe_id !== chef_id) return error(res, 'Non autorisé', 403);
    if (membre.equipe_validee === 1) return error(res, "Impossible — équipe déjà validée", 400);
    if (membre.photo_path) {
      const f = path.join(__dirname, '../../', membre.photo_path);
      if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
    }
    await db.query('DELETE FROM equipe_intervention WHERE id=?', [id]);
    return success(res, { id: parseInt(id) }, 'Membre supprimé');
  } catch (err) {
    console.error('supprimerMembre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/membre/verifier-cadenas ────────────
const verifierCadenas = async (req, res) => {
  try {
    const { cad_id, badge_ocp_id } = req.body;
    const chef_id = req.user.id;
    if (!cad_id && !badge_ocp_id) return error(res, 'cad_id ou badge_ocp_id requis', 400);

    const col   = cad_id ? 'ei.cad_id' : 'ei.badge_ocp_id';
    const val   = (cad_id || badge_ocp_id).trim();
    const [rows] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
              ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei
       WHERE ei.chef_equipe_id=? AND ${col}=? ORDER BY ei.created_at DESC LIMIT 1`,
      [chef_id, val]
    );
    if (!rows.length) return success(res, { found: false, membre: null }, 'Aucun membre trouvé');
    return success(res, { found: true, membre: convertMembreTZ(rows[0]) }, 'Membre trouvé');
  } catch (err) {
    console.error('verifierCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/cadenas ──────────────────
const mettreAJourCadenas = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_cadenas, cad_id } = req.body;
    if (!numero_cadenas && !cad_id) return error(res, 'numero_cadenas ou cad_id requis', 400);

    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].equipe_validee === 1) return error(res, "Impossible — équipe déjà validée", 400);

    if (numero_cadenas) {
      const [d] = await db.query(
        `SELECT id FROM equipe_intervention WHERE demande_id=? AND numero_cadenas=? AND id!=?`,
        [rows[0].demande_id, numero_cadenas.trim(), id]
      );
      if (d.length) return error(res, 'Numéro de cadenas déjà utilisé', 400);
    }

    await db.query(
      `UPDATE equipe_intervention SET numero_cadenas=COALESCE(?,numero_cadenas), cad_id=COALESCE(?,cad_id) WHERE id=?`,
      [numero_cadenas?.trim()||null, cad_id?.trim()||null, id]
    );

    const [maj] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
              ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei WHERE ei.id=?`, [id]
    );
    return success(res, convertMembreTZ(maj[0]), 'Cadenas mis à jour');
  } catch (err) {
    console.error('mettreAJourCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/valider ────────────────
const validerEquipe = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.id, d.statut, d.numero_ordre, d.agent_id, e.code_equipement AS tag
       FROM demandes_consignation d JOIN equipements e ON d.equipement_id=e.id WHERE d.id=?`,
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    if (!STATUTS_AUTORISES.includes(demande.statut)) return error(res, 'Statut invalide', 400);

    const [membres] = await db.query(
      'SELECT id FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=?',
      [demande_id, chef_id]
    );
    if (!membres.length) return error(res, 'Enregistrez au moins un membre avant de valider', 400);

    const checks = [
      [`SELECT nom FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=? AND (cad_id IS NULL OR cad_id='') AND (numero_cadenas IS NULL OR numero_cadenas='')`, 'sans cadenas'],
      [`SELECT nom FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=? AND (badge_ocp_id IS NULL OR badge_ocp_id='')`, 'sans badge OCP'],
      [`SELECT nom FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=? AND (photo_path IS NULL OR photo_path='')`, 'sans photo'],
    ];
    for (const [q, label] of checks) {
      const [r] = await db.query(q, [demande_id, chef_id]);
      if (r.length) return error(res, `${r.length} membre(s) ${label} : ${r.map(m=>m.nom).join(', ')}`, 400);
    }

    await db.query(
      `UPDATE equipe_intervention SET equipe_validee=1 WHERE demande_id=? AND chef_equipe_id=?`,
      [demande_id, chef_id]
    );

    const [chefInfo] = await db.query('SELECT prenom, nom, type_metier FROM users WHERE id=?', [chef_id]);
    const chef = chefInfo[0];
    const metierLabel = METIER_LABELS[chef.type_metier] || chef.type_metier;

    await envoyerNotification(demande.agent_id, "👷 Équipe validée — en attente d'entrée",
      `L'équipe ${metierLabel} de ${chef.prenom} ${chef.nom} (${membres.length} membre(s)) est validée — ${demande.numero_ordre} / TAG ${demande.tag}.`,
      'intervention', `demande/${demande_id}`);
    await envoyerPushNotification([demande.agent_id], '👷 Équipe validée',
      `Équipe ${metierLabel} (${membres.length} membre(s)) — ${demande.tag}`,
      { demande_id: parseInt(demande_id), statut: demande.statut, action: 'equipe_validee' });

    return success(res, { demande_id: parseInt(demande_id), nb_membres: membres.length, equipe_validee: 1 },
      "Équipe validée");
  } catch (err) {
    console.error('validerEquipe error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/entree-site ────────────
const marquerEntreeMembres = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const { membres_ids, tous, scan_cadenas_entree } = req.body;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.id, d.statut, d.numero_ordre, d.agent_id, e.code_equipement AS tag
       FROM demandes_consignation d JOIN equipements e ON d.equipement_id=e.id WHERE d.id=?`,
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    if (!STATUTS_AUTORISES.includes(demande.statut)) return error(res, 'Statut invalide', 400);

    const [equipeValidee] = await db.query(
      `SELECT id FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=? AND equipe_validee=1 LIMIT 1`,
      [demande_id, chef_id]
    );
    if (!equipeValidee.length) return error(res, "L'équipe doit être validée avant l'entrée sur site", 400);

    let ids = [];
    if (tous) {
      const [r] = await db.query(
        `SELECT id FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=? AND statut='en_attente'`,
        [demande_id, chef_id]
      );
      ids = r.map(m => m.id);
    } else if (membres_ids?.length) {
      if (membres_ids.length === 1 && scan_cadenas_entree) {
        const [r] = await db.query(
          `SELECT * FROM equipe_intervention WHERE id=? AND chef_equipe_id=? AND statut='en_attente'`,
          [membres_ids[0], chef_id]
        );
        if (!r.length) return error(res, 'Membre introuvable ou déjà sur site', 400);
        if (r[0].cad_id && r[0].cad_id.trim().toLowerCase() !== scan_cadenas_entree.trim().toLowerCase())
          return error(res, `Cadenas scanné incorrect pour ${r[0].nom}`, 400);
      }
      const [r] = await db.query(
        `SELECT id FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=? AND id IN (?) AND statut='en_attente'`,
        [demande_id, chef_id, membres_ids]
      );
      ids = r.map(m => m.id);
    } else {
      return error(res, 'Fournissez membres_ids ou tous: true', 400);
    }

    if (!ids.length) return error(res, 'Aucun membre en attente', 400);

    await db.query(
      `UPDATE equipe_intervention SET statut='sur_site', heure_entree=NOW(), heure_scan_cadenas=NOW() WHERE id IN (?)`,
      [ids]
    );

    const [membresMaj] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie, ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei WHERE ei.id IN (?)`, [ids]
    );

    const [chefInfo] = await db.query('SELECT prenom, nom, type_metier FROM users WHERE id=?', [chef_id]);
    const chef = chefInfo[0];
    const metierLabel = METIER_LABELS[chef.type_metier] || chef.type_metier;
    await envoyerNotification(demande.agent_id, '👷 Membres entrés sur chantier',
      `${ids.length} membre(s) équipe ${metierLabel} de ${chef.prenom} ${chef.nom} — ${demande.tag}.`,
      'intervention', `demande/${demande_id}`);
    await envoyerPushNotification([demande.agent_id], '👷 Entrée sur chantier',
      `${ids.length} membre(s) — ${demande.tag}`,
      { demande_id: parseInt(demande_id), action: 'entree_site' });

    return success(res, {
      demande_id: parseInt(demande_id),
      membres_maj: membresMaj.map(convertMembreTZ),
      nb_sur_site: ids.length,
    }, `${ids.length} membre(s) sur site`);
  } catch (err) {
    console.error('marquerEntreeMembres error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/entree ───────────────────
const marquerEntree = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].heure_entree) return error(res, 'Entrée déjà enregistrée', 400);
    await db.query(
      "UPDATE equipe_intervention SET heure_entree=NOW(), heure_scan_cadenas=NOW(), statut='sur_site' WHERE id=?",
      [id]
    );
    return success(res, null, "Heure d'entrée enregistrée");
  } catch (err) { return error(res, 'Erreur serveur', 500); }
};

// ── PUT /equipe-intervention/membre/:id/sortie ───────────────────
const marquerSortie = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id=?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (!rows[0].heure_entree) return error(res, "Entrée pas encore enregistrée", 400);
    if (rows[0].heure_sortie) return error(res, 'Sortie déjà enregistrée', 400);
    await db.query("UPDATE equipe_intervention SET heure_sortie=NOW(), statut='sortie' WHERE id=?", [id]);
    return success(res, null, 'Heure de sortie enregistrée');
  } catch (err) { return error(res, 'Erreur serveur', 500); }
};

// ── POST /equipe-intervention/membre/verifier-badge ─────────────
const verifierBadge = async (req, res) => {
  try {
    const { badge_ocp_id, matricule } = req.body;
    if (!badge_ocp_id && !matricule) return error(res, 'badge_ocp_id ou matricule requis', 400);
    const col = badge_ocp_id ? 'badge_ocp_id' : 'matricule';
    const val = (badge_ocp_id || matricule).trim();
    const [users] = await db.query(
      `SELECT id, nom, prenom, matricule, badge_ocp_id, type_metier FROM users WHERE ${col}=? AND actif=1`,
      [val]
    );
    if (!users.length) return success(res, { found: false, user: null }, 'Non trouvé');
    return success(res, { found: true, user: users[0] }, 'Utilisateur trouvé');
  } catch (err) { return error(res, 'Erreur serveur', 500); }
};

// ── PUT /equipe-intervention/membre/:id/deconsigner ─────────────
const deconsignerMembre = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_cadenas, cad_id, badge_ocp_id } = req.body;
    if (!numero_cadenas && !cad_id) return error(res, 'numero_cadenas ou cad_id requis', 400);

    const [membres] = await db.query('SELECT * FROM equipe_intervention WHERE id=?', [id]);
    if (!membres.length) return error(res, 'Membre introuvable', 404);
    const membre = membres[0];

    if (membre.chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (membre.statut !== 'sur_site') return error(res, "Membre pas sur site", 400);
    if (membre.heure_sortie) return error(res, 'Sortie déjà enregistrée', 400);

    const scanFourni = cad_id?.trim() || numero_cadenas?.trim();

    if (cad_id && membre.cad_id) {
      if (membre.cad_id.trim().toLowerCase() !== cad_id.trim().toLowerCase())
        return error(res, `Cadenas incorrect pour ${membre.nom}`, 400);
    } else if (numero_cadenas && membre.numero_cadenas) {
      if (membre.numero_cadenas.trim().toLowerCase() !== numero_cadenas.trim().toLowerCase())
        return error(res, `Numéro cadenas incorrect pour ${membre.nom}`, 400);
    } else if (!membre.numero_cadenas && !membre.cad_id) {
      return error(res, 'Aucun cadenas enregistré pour ce membre', 400);
    }

    if (badge_ocp_id && membre.badge_ocp_id) {
      if (membre.badge_ocp_id.trim().toLowerCase() !== badge_ocp_id.trim().toLowerCase())
        return error(res, `Badge incorrect pour ${membre.nom}`, 400);
    }

    const heureNow = new Date();
    await db.query(
      `UPDATE equipe_intervention SET heure_sortie=?, heure_scan_sortie=?, scan_cadenas_sortie=?, statut='sortie' WHERE id=?`,
      [heureNow, heureNow, scanFourni, id]
    );

    const [membresMaj] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie, ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei WHERE ei.id=?`, [id]
    );
    const membreMaj = convertMembreTZ(membresMaj[0]);

    const [tous] = await db.query(
      `SELECT id, statut FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=?`,
      [membre.demande_id, membre.chef_equipe_id]
    );
    const total       = tous.length;
    const sortisTotal = tous.filter(m => m.statut === 'sortie').length + 1;
    const tousSortis  = sortisTotal >= total;

    if (tousSortis) {
      const [d] = await db.query(
        `SELECT d.agent_id, d.numero_ordre, e.code_equipement AS tag
         FROM demandes_consignation d JOIN equipements e ON d.equipement_id=e.id WHERE d.id=?`,
        [membre.demande_id]
      );
      if (d.length) {
        const [ci] = await db.query('SELECT prenom, nom FROM users WHERE id=?', [req.user.id]);
        await envoyerNotification(d[0].agent_id, '🔓 Équipe sortie — déconsignation possible',
          `Toute l'équipe de ${ci[0].prenom} ${ci[0].nom} a quitté — ${d[0].numero_ordre} / TAG ${d[0].tag}.`,
          'deconsignation', `demande/${membre.demande_id}`);
        await envoyerPushNotification([d[0].agent_id], '🔓 Déconsignation possible',
          `Tous sortis — ${d[0].tag}`, { demande_id: membre.demande_id, action: 'tous_sortis' });
      }
    }

    return success(res, { membre: membreMaj, tous_sortis: tousSortis, total, sortis: sortisTotal },
      tousSortis ? 'Tous sortis — déconsignation possible.' : `${sortisTotal}/${total} sortis`);
  } catch (err) {
    console.error('deconsignerMembre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// POST /equipe-intervention/:demande_id/valider-deconsignation
//
// ✅ [MODIFIÉ] Envoie deux notifications à l'agent :
//   1. Notif générique "Déconsignation validée — Rapport disponible" (existante)
//   2. Notif spécifique par métier : "🔓 Déconsignation Génie Civil effectuée"
//      → titre clair avec le nom du métier
//      → message : heure de fin + nombre de membres + TAG
//      → permet à detailDemande.js d'afficher le bon step dans la timeline
// ════════════════════════════════════════════════════════════════
const validerDeconsignation = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      `SELECT d.*, e.code_equipement AS tag, e.nom AS equipement_nom, l.code AS lot_code
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id=e.id
       LEFT JOIN lots l ON d.lot_id=l.id
       WHERE d.id=?`, [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];
    if (!STATUTS_AUTORISES.includes(demande.statut)) return error(res, 'Statut invalide', 400);

    // ✅ UTC brut depuis MySQL
    const [membresRaw] = await db.query(
      `SELECT ei.id, ei.nom, ei.matricule, ei.badge_ocp_id, ei.numero_cadenas,
              ei.cad_id, ei.photo_path, ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
              ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei
       WHERE ei.demande_id=? AND ei.chef_equipe_id=?
       ORDER BY ei.created_at ASC`,
      [demande_id, chef_id]
    );
    if (!membresRaw.length) return error(res, 'Aucun membre pour cette équipe', 400);

    // ✅ Conversion UTC → heure Maroc (Ramadan-safe, via Intl Node.js)
    const membres = membresRaw.map(convertMembreTZ);

    const nonSortis = membres.filter(m => m.statut !== 'sortie');
    if (nonSortis.length) return error(res, `${nonSortis.length} membre(s) pas encore sortis : ${nonSortis.map(m=>m.nom).join(', ')}`, 400);

    const [chefRows] = await db.query('SELECT id, nom, prenom, type_metier FROM users WHERE id=?', [chef_id]);
    if (!chefRows.length) return error(res, 'Chef introuvable', 404);
    const chef = chefRows[0];
    const metierLabel = METIER_LABELS[chef.type_metier] || chef.type_metier;

    // ✅ Calcul durées correct : les deux dates sont en heure Maroc (même référentiel)
    const durees = membres
      .filter(m => m.heure_entree && m.heure_sortie)
      .map(m => ({
        nom:   m.nom,
        duree: Math.round((new Date(m.heure_sortie) - new Date(m.heure_entree)) / 60000),
      }));

    const dureesMins  = durees.map(d => d.duree);
    const dureeTotale = dureesMins.length ? Math.max(...dureesMins) : 0;
    const dureeMoy    = dureesMins.length ? Math.round(dureesMins.reduce((a,b)=>a+b,0)/dureesMins.length) : 0;

    const heureDebut = membres.reduce((min, m) => {
      if (!m.heure_entree) return min;
      return !min || new Date(m.heure_entree) < new Date(min) ? m.heure_entree : min;
    }, null);

    const heureFin = membres.reduce((max, m) => {
      if (!m.heure_sortie) return max;
      return !max || new Date(m.heure_sortie) > new Date(max) ? m.heure_sortie : max;
    }, null);

    const actions = [];
    membres.forEach(m => {
      if (m.heure_entree) actions.push({ type: 'entree', membre: m.nom, badge: m.badge_ocp_id||null, cadenas: m.numero_cadenas||null, cad_id: m.cad_id||null, horodatage: m.heure_entree });
      if (m.heure_sortie) actions.push({ type: 'sortie', membre: m.nom, badge: m.badge_ocp_id||null, cadenas_sortie: m.scan_cadenas_sortie||m.numero_cadenas||null, horodatage: m.heure_sortie,
        duree_min: m.heure_entree ? Math.round((new Date(m.heure_sortie)-new Date(m.heure_entree))/60000) : null });
    });
    actions.sort((a, b) => new Date(a.horodatage) - new Date(b.horodatage));

    const statsJson = {
      total_membres: membres.length, membres_sortis: membres.filter(m=>m.statut==='sortie').length,
      duree_totale_min: dureeTotale, duree_moyenne_min: dureeMoy,
      heure_debut: heureDebut, heure_fin: heureFin,
      chef: `${chef.prenom} ${chef.nom}`, metier: metierLabel,
      par_membre: durees,
    };

    const uploadsDir = path.join(__dirname, '../../uploads/rapports_equipe');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName   = `rapport_equipe_${demande.numero_ordre}_${chef_id}_${Date.now()}.pdf`;
    const pdfPath    = path.join(uploadsDir, fileName);
    const pdfRelPath = `uploads/rapports_equipe/${fileName}`;

    // ✅ membres passés au PDF : heure_entree/sortie déjà en heure Maroc string
    await genererRapportEquipePDF({ demande, membres, chef, stats: statsJson, pdfPath });

    const [ex] = await db.query(
      'SELECT id FROM rapport_consignation WHERE demande_id=? AND chef_equipe_id=?',
      [demande_id, chef_id]
    );
    if (ex.length) {
      await db.query(
        `UPDATE rapport_consignation SET pdf_path=?, statut_final='deconsignee', nb_membres_total=?,
         nb_membres_sortis=?, duree_totale_min=?, heure_debut=?, heure_fin=?, actions_json=?, stats_json=?
         WHERE demande_id=? AND chef_equipe_id=?`,
        [pdfRelPath, membres.length, membres.filter(m=>m.statut==='sortie').length, dureeTotale,
         heureDebut, heureFin, JSON.stringify(actions), JSON.stringify(statsJson), demande_id, chef_id]
      );
    } else {
      await db.query(
        `INSERT INTO rapport_consignation (demande_id, chef_equipe_id, pdf_path, statut_final,
         nb_membres_total, nb_membres_sortis, duree_totale_min, heure_debut, heure_fin, actions_json, stats_json)
         VALUES (?,?,?,'deconsignee',?,?,?,?,?,?,?)`,
        [demande_id, chef_id, pdfRelPath, membres.length, membres.filter(m=>m.statut==='sortie').length,
         dureeTotale, heureDebut, heureFin, JSON.stringify(actions), JSON.stringify(statsJson)]
      );
    }

    const nouveauStatut = STATUT_DECONSIGNE_MAP[demande.statut] || 'deconsigne_intervent';
    await db.query(`UPDATE demandes_consignation SET statut=? WHERE id=?`, [nouveauStatut, demande_id]);

    // ── [MODIFIÉ] Notifications à l'agent ────────────────────────────────────
    //
    // Notif 1 (existante) : générique — rapport disponible
    await envoyerNotification(
      demande.agent_id,
      '✅ Déconsignation validée — Rapport disponible',
      `Équipe ${metierLabel} de ${chef.prenom} ${chef.nom} — fin d'intervention ${demande.numero_ordre} / TAG ${demande.tag}.`,
      'deconsignation',
      `demande/${demande_id}`
    );

    // Notif 2 [NOUVEAU] : spécifique par métier — pour mettre à jour la timeline agent
    // titre = "🔓 Déconsignation Génie Civil effectuée"
    // message = heure de fin + nombre de membres + TAG
    // type = 'deconsignation' → le refresh 1s de detailDemande.js le capte via getDemandeById
    const heureFinDisplay = heureFin
      ? (() => {
          const d = new Date(heureFin);
          const p = (n) => String(n).padStart(2, '0');
          return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} à ${p(d.getHours())}:${p(d.getMinutes())}`;
        })()
      : 'maintenant';

    await envoyerNotification(
      demande.agent_id,
      `🔓 Déconsignation ${metierLabel} effectuée`,
      `L'équipe ${metierLabel} (${membres.length} membre${membres.length > 1 ? 's' : ''}) a terminé l'intervention sur TAG ${demande.tag} — ${demande.numero_ordre}.\nSortie à ${heureFinDisplay}.`,
      'deconsignation',
      `demande/${demande_id}`
    );

    // Push unique avec label métier
    await envoyerPushNotification(
      [demande.agent_id],
      `🔓 Déconsignation ${metierLabel} — ${demande.tag}`,
      `${membres.length} membre${membres.length > 1 ? 's' : ''} sorti${membres.length > 1 ? 's' : ''} — ${demande.numero_ordre}`,
      {
        demande_id:    parseInt(demande_id),
        action:        'deconsignation_metier',
        type_metier:   chef.type_metier,
        metier_label:  metierLabel,
        pdf_path:      pdfRelPath,
        statut:        nouveauStatut,
      }
    );
    // ── fin notifications ─────────────────────────────────────────────────────

    return success(res, {
      demande_id: parseInt(demande_id), pdf_path: pdfRelPath, stats: statsJson,
      nb_membres: membres.length, heure_debut: heureDebut, heure_fin: heureFin,
      duree_totale: dureeTotale, statut: nouveauStatut,
    }, 'Déconsignation validée — Rapport PDF généré');
  } catch (err) {
    console.error('validerDeconsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /equipe-intervention/:demande_id/rapport ─────────────────
const getRapport = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [rapports] = await db.query(
      `SELECT rc.*, CONCAT(u.prenom,' ',u.nom) AS chef_nom, u.type_metier,
              rc.heure_debut, rc.heure_fin, rc.created_at
       FROM rapport_consignation rc
       JOIN users u ON rc.chef_equipe_id=u.id
       WHERE rc.demande_id=? AND rc.chef_equipe_id=?
       ORDER BY rc.created_at DESC LIMIT 1`,
      [demande_id, chef_id]
    );
    if (!rapports.length) return error(res, 'Aucun rapport trouvé', 404);

    const rapport = rapports[0];
    rapport.heure_debut = toMarocString(rapport.heure_debut);
    rapport.heure_fin   = toMarocString(rapport.heure_fin);
    rapport.created_at  = toMarocString(rapport.created_at);

    try {
      rapport.actions_json = rapport.actions_json ? JSON.parse(rapport.actions_json) : [];
      rapport.stats_json   = rapport.stats_json   ? JSON.parse(rapport.stats_json)   : {};
    } catch (_) {}

    return success(res, rapport, 'Rapport récupéré');
  } catch (err) {
    console.error('getRapport error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /equipe-intervention/:demande_id/statut-deconsignation ───
const getStatutDeconsignation = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [demandes] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id=?', [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    const [membresRaw] = await db.query(
      `SELECT ei.id, ei.nom, ei.equipe_validee, ei.badge_ocp_id,
              ei.numero_cadenas, ei.cad_id, ei.scan_cadenas_sortie, ei.statut,
              ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei WHERE ei.demande_id=? AND ei.chef_equipe_id=?`,
      [demande_id, chef_id]
    );
    const membres = membresRaw.map(convertMembreTZ);

    const total     = membres.length;
    const sortis    = membres.filter(m => m.statut === 'sortie').length;
    const surSite   = membres.filter(m => m.statut === 'sur_site').length;
    const enAttente = membres.filter(m => m.statut === 'en_attente').length;
    const equipeValidee   = membres.some(m => m.equipe_validee === 1);
    const peutDeconsigner = equipeValidee && total > 0 && sortis === total && surSite === 0 && enAttente === 0;

    const [rapportExist] = await db.query(
      'SELECT id, pdf_path FROM rapport_consignation WHERE demande_id=? AND chef_equipe_id=? LIMIT 1',
      [demande_id, chef_id]
    );

    const statutDemande = demandes[0].statut;
    const estDeconsigne = STATUTS_LECTURE_EQUIPE.includes(statutDemande) && !STATUTS_AUTORISES.includes(statutDemande);

    return success(res, {
      total, sortis, sur_site: surSite, en_attente: enAttente,
      equipe_validee: equipeValidee,
      peut_deconsigner: peutDeconsigner && !estDeconsigne,
      rapport_genere:   rapportExist.length > 0 || estDeconsigne,
      rapport_pdf_path: rapportExist.length > 0 ? rapportExist[0].pdf_path : null,
      statut_demande:   statutDemande,
      membres,
    }, 'Statut récupéré');
  } catch (err) {
    console.error('getStatutDeconsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getMesMembres, getEquipe, getIntervenantsDispos, enregistrerMembre,
  supprimerMembre, verifierCadenas, mettreAJourCadenas, validerEquipe,
  marquerEntreeMembres, marquerEntree, marquerSortie, verifierBadge,
  deconsignerMembre, validerDeconsignation, getRapport, getStatutDeconsignation,
};