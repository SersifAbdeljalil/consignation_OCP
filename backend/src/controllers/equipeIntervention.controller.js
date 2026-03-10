// src/controllers/equipeIntervention.controller.js
// ✅ REFONTE DÉCONSIGNATION PAR MÉTIER INDÉPENDANT
//
// FIXES APPLIQUÉS :
//
// ✅ FIX BUG 3 & 4 — STATUTS_AUTORISES étendu
//    Avant : ['consigne', 'consigne_charge', 'consigne_process']
//    Après : + ['deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec']
//    → Si GC valide en premier (statut = deconsigne_gc), Méca peut quand même
//      faire entrer/sortir ses membres (marquerEntreeMembres, getIntervenantsDispos,
//      enregistrerMembre, validerEquipe, marquerEntree, marquerSortie ne bloquent plus)
//
// ✅ FIX BUG 1 — getStatutDeconsignation retourne maintenant :
//    - metiers_valides    : liste des métiers ayant déjà validé
//    - metiers_restants   : liste des métiers n'ayant pas encore validé
//    - tous_metiers_valides : boolean
//    → Les bannières multi-métier (GestionEquipe, detailConsignation) restent
//      affichées même après rechargement/navigation

'use strict';

const path = require('path');
const fs   = require('fs');
const db   = require('../config/db');
const { success, error }          = require('../utils/response');
const { envoyerNotification }     = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');
const { genererRapportEquipePDF } = require('../services/rapportEquipe.pdf.service');

// ✅ FIX BUG 3 & 4 — STATUTS_AUTORISES étendu aux déconsignations partielles
// Un autre métier peut avoir déjà validé → son statut est deconsigne_XX
// Ce n'est PAS un blocage pour les opérations des autres métiers
const STATUTS_AUTORISES = [
  'consigne',
  'consigne_charge',
  'consigne_process',
  'deconsigne_gc',   // ← NOUVEAU : GC a validé, Méca/Élec peuvent encore opérer
  'deconsigne_mec',  // ← NOUVEAU : Méca a validé, GC/Élec peuvent encore opérer
  'deconsigne_elec', // ← NOUVEAU : Élec a validé, GC/Méca peuvent encore opérer
];

const STATUTS_LECTURE_EQUIPE = [
  'consigne', 'consigne_charge', 'consigne_process',
  'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
  'deconsigne_intervent',
  'deconsigne_charge', 'deconsigne_process',
  'deconsignee',
];

// ── Mapping métier → statut déconsignation ────────────────────────
const STATUT_DECONSIGNE_MAP = {
  genie_civil: 'deconsigne_gc',
  mecanique:   'deconsigne_mec',
  electrique:  'deconsigne_elec',
};

const METIERS_EQUIPE = ['genie_civil', 'mecanique', 'electrique'];

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
    if (d instanceof Date) { dt = d; }
    else {
      const s = String(d).trim();
      const hastz = s.includes('+') || s.includes('Z') || s.endsWith('00:00');
      dt = hastz ? new Date(s) : new Date(s + 'Z');
    }
    if (isNaN(dt.getTime())) return null;
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
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
  ei.heure_entree, ei.heure_sortie,
  ei.heure_scan_cadenas, ei.heure_scan_sortie, ei.created_at
`;

// ── GET /equipe-intervention/mes-membres ─────────────────────────
const getMesMembres = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie,
              ${MEMBRE_UTC_COLS},
              d.numero_ordre, e.code_equipement AS tag, e.nom AS equipement_nom
       FROM equipe_intervention ei
       JOIN demandes_consignation d ON ei.demande_id = d.id
       JOIN equipements e ON d.equipement_id = e.id
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
      `SELECT d.id, d.statut, d.numero_ordre, d.agent_id, e.code_equipement AS tag
       FROM demandes_consignation d JOIN equipements e ON d.equipement_id = e.id WHERE d.id = ?`,
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
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie, ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei
       WHERE ei.demande_id = ? AND ei.chef_equipe_id = ?
       ORDER BY ei.created_at ASC`,
      [demande_id, chef_id]
    );
    const membres = membresRaw.map(convertMembreTZ);
    return success(res, {
      demande_id: parseInt(demande_id),
      membres,
      equipe_validee: membres.some(m => m.equipe_validee === 1) ? 1 : 0,
      tag: demande.tag,
      numero_ordre: demande.numero_ordre,
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
    // ✅ FIX BUG 4 — utilise STATUTS_AUTORISES étendu
    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) return error(res, 'Statut invalide', 400);

    const [membresSortis] = await db.query(
      `SELECT id, nom, matricule, badge_ocp_id, numero_cadenas, cad_id
       FROM equipe_intervention WHERE chef_equipe_id = ? AND statut = 'sortie' ORDER BY nom ASC`,
      [chef_id]
    );
    const [dejaActifs] = await db.query(
      `SELECT badge_ocp_id, matricule FROM equipe_intervention WHERE demande_id = ? AND statut != 'sortie'`,
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
    return success(res, dispos.filter(m => {
      const cle = m.badge_ocp_id?.toLowerCase() || m.matricule?.toLowerCase() || String(m.id);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    }), 'Intervenants disponibles');
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

    if (!demande_id || !nom || !nom.trim()) return error(res, 'demande_id et nom sont obligatoires', 400);
    const [demandes] = await db.query('SELECT statut FROM demandes_consignation WHERE id = ?', [demande_id]);
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    // ✅ FIX BUG 3 — utilise STATUTS_AUTORISES étendu
    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) return error(res, `Statut invalide (statut: ${demandes[0].statut})`, 400);

    const fetchMembre = async (id) => {
      const [rows] = await db.query(
        `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
                ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
                ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie, ${MEMBRE_UTC_COLS}
         FROM equipe_intervention ei WHERE ei.id=?`, [id]
      );
      return rows.length ? convertMembreTZ(rows[0]) : null;
    };

    if (membre_id) {
      const [rows] = await db.query(
        'SELECT * FROM equipe_intervention WHERE id = ? AND chef_equipe_id = ?', [membre_id, chef_id]
      );
      if (!rows.length) return error(res, 'Membre introuvable ou non autorisé', 404);
      if (rows[0].equipe_validee === 1) return error(res, "Impossible — l'équipe est déjà validée", 400);
      const ancien = rows[0];
      if (photo_path && ancien.photo_path) {
        const f = path.join(__dirname, '../../', ancien.photo_path);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      await db.query(
        `UPDATE equipe_intervention SET nom=?, matricule=?, badge_ocp_id=?, numero_cadenas=?, cad_id=?,
         photo_path=COALESCE(?, photo_path), statut='en_attente', equipe_validee=0,
         heure_entree=NULL, heure_sortie=NULL, heure_scan_cadenas=NULL, heure_scan_sortie=NULL, scan_cadenas_sortie=NULL
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
        `UPDATE equipe_intervention SET demande_id=?, chef_equipe_id=?, nom=?, matricule=?, badge_ocp_id=?,
         numero_cadenas=?, cad_id=?, photo_path=COALESCE(?, photo_path), statut='en_attente', equipe_validee=0,
         heure_entree=NULL, heure_sortie=NULL, heure_scan_cadenas=NULL, heure_scan_sortie=NULL, scan_cadenas_sortie=NULL
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
    const col  = cad_id ? 'ei.cad_id' : 'ei.badge_ocp_id';
    const val  = (cad_id || badge_ocp_id).trim();
    const [rows] = await db.query(
      `SELECT ei.id, ei.demande_id, ei.chef_equipe_id, ei.nom, ei.matricule,
              ei.badge_ocp_id, ei.numero_cadenas, ei.cad_id, ei.photo_path,
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie, ${MEMBRE_UTC_COLS}
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
              ei.statut, ei.equipe_validee, ei.scan_cadenas_sortie, ${MEMBRE_UTC_COLS}
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
    // ✅ FIX BUG 3 — validerEquipe accepte aussi les statuts partiels
    if (!STATUTS_AUTORISES.includes(demande.statut)) return error(res, 'Statut invalide', 400);

    const [membres] = await db.query(
      'SELECT id FROM equipe_intervention WHERE demande_id=? AND chef_equipe_id=?', [demande_id, chef_id]
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

    return success(res, { demande_id: parseInt(demande_id), nb_membres: membres.length, equipe_validee: 1 }, "Équipe validée");
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
    // ✅ FIX BUG 3 — marquerEntreeMembres accepte aussi les statuts partiels
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
    const total      = tous.length;
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

// ════════════════════════════════════════════════════════════════════════════
// ✅ POST /equipe-intervention/:demande_id/valider-deconsignation
// ════════════════════════════════════════════════════════════════════════════
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

    const STATUTS_VALIDES_DECONSIGN = [
      'consigne', 'consigne_charge', 'consigne_process',
      'deconsigne_gc', 'deconsigne_mec', 'deconsigne_elec',
      'deconsigne_intervent',
    ];
    if (!STATUTS_VALIDES_DECONSIGN.includes(demande.statut)) {
      return error(res, `Statut invalide pour déconsigner (statut: ${demande.statut})`, 400);
    }

    const [chefRows] = await db.query(
      'SELECT id, nom, prenom, type_metier FROM users WHERE id=?', [chef_id]
    );
    if (!chefRows.length) return error(res, 'Chef introuvable', 404);
    const chef = chefRows[0];
    const metierLabel = METIER_LABELS[chef.type_metier] || chef.type_metier;

    let typesIntervenants = [];
    try {
      typesIntervenants = typeof demande.types_intervenants === 'string'
        ? JSON.parse(demande.types_intervenants) : (demande.types_intervenants || []);
    } catch { typesIntervenants = []; }

    const metiersDemande = typesIntervenants.filter(t => METIERS_EQUIPE.includes(t));
    if (!metiersDemande.includes(chef.type_metier)) {
      return error(res, `Votre métier (${metierLabel}) ne fait pas partie de cette demande`, 400);
    }

    const [dejaValide] = await db.query(
      `SELECT id FROM deconsignation_metier WHERE demande_id=? AND type_metier=? AND statut='valide'`,
      [demande_id, chef.type_metier]
    );
    if (dejaValide.length) {
      return error(res, `La déconsignation ${metierLabel} a déjà été validée`, 400);
    }

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
    const membres = membresRaw.map(convertMembreTZ);

    const nonSortis = membres.filter(m => m.statut !== 'sortie');
    if (nonSortis.length) {
      return error(res,
        `${nonSortis.length} membre(s) pas encore sortis : ${nonSortis.map(m=>m.nom).join(', ')}`, 400);
    }

    const durees = membres
      .filter(m => m.heure_entree && m.heure_sortie)
      .map(m => ({ nom: m.nom, duree: Math.round((new Date(m.heure_sortie) - new Date(m.heure_entree)) / 60000) }));
    const dureesMins  = durees.map(d => d.duree);
    const dureeTotale = dureesMins.length ? Math.max(...dureesMins) : 0;
    const dureeMoy    = dureesMins.length ? Math.round(dureesMins.reduce((a,b)=>a+b,0) / dureesMins.length) : 0;

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
      chef: `${chef.prenom} ${chef.nom}`, metier: metierLabel, par_membre: durees,
    };

    const uploadsDir = path.join(__dirname, '../../uploads/rapports_equipe');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName   = `rapport_equipe_${demande.numero_ordre}_${chef.type_metier}_${chef_id}_${Date.now()}.pdf`;
    const pdfPath    = path.join(uploadsDir, fileName);
    const pdfRelPath = `uploads/rapports_equipe/${fileName}`;
    await genererRapportEquipePDF({ demande, membres, chef, stats: statsJson, pdfPath });

    const [ex] = await db.query(
      'SELECT id FROM rapport_consignation WHERE demande_id=? AND chef_equipe_id=?', [demande_id, chef_id]
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

    const heureValidation = new Date();
    const [existeDecons] = await db.query(
      'SELECT id FROM deconsignation_metier WHERE demande_id=? AND type_metier=?',
      [demande_id, chef.type_metier]
    );
    if (existeDecons.length) {
      await db.query(
        `UPDATE deconsignation_metier SET chef_equipe_id=?, statut='valide', heure_validation=?, pdf_path=?
         WHERE demande_id=? AND type_metier=?`,
        [chef_id, heureValidation, pdfRelPath, demande_id, chef.type_metier]
      );
    } else {
      await db.query(
        `INSERT INTO deconsignation_metier (demande_id, type_metier, chef_equipe_id, statut, heure_validation, pdf_path)
         VALUES (?, ?, ?, 'valide', ?, ?)`,
        [demande_id, chef.type_metier, chef_id, heureValidation, pdfRelPath]
      );
    }

    const [tousValidesRows] = await db.query(
      `SELECT type_metier FROM deconsignation_metier WHERE demande_id=? AND statut='valide'`,
      [demande_id]
    );
    const metierValides      = tousValidesRows.map(r => r.type_metier);
    const tousMetiersValides = metiersDemande.every(m => metierValides.includes(m));
    const metiersRestants    = metiersDemande.filter(m => !metierValides.includes(m));

    let nouveauStatut;
    if (tousMetiersValides) {
      nouveauStatut = 'deconsigne_intervent';
    } else {
      nouveauStatut = STATUT_DECONSIGNE_MAP[chef.type_metier] || 'deconsigne_intervent';
    }

    await db.query(`UPDATE demandes_consignation SET statut=? WHERE id=?`, [nouveauStatut, demande_id]);

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
      `L'équipe ${metierLabel} (${membres.length} membre${membres.length > 1 ? 's' : ''}) a terminé ` +
      `sur TAG ${demande.tag} — ${demande.numero_ordre}. Sortie à ${heureFinDisplay}.`,
      'deconsignation', `demande/${demande_id}`
    );

    if (tousMetiersValides) {
      await envoyerNotification(
        demande.agent_id,
        '✅ Toutes les équipes ont terminé — Demandez la déconsignation',
        `Toutes les équipes (${metiersDemande.map(m => METIER_LABELS[m]).join(', ')}) ont quitté ` +
        `le chantier pour ${demande.numero_ordre} / TAG ${demande.tag}.\n` +
        `Vous pouvez maintenant demander la déconsignation finale.`,
        'deconsignation', `demande/${demande_id}`
      );
      await envoyerPushNotification(
        [demande.agent_id],
        '✅ Déconsignation possible — Toutes équipes sorties',
        `${demande.tag} — ${demande.numero_ordre} — Demandez la déconsignation`,
        { demande_id: parseInt(demande_id), action: 'tous_metiers_deconsignes', statut: nouveauStatut }
      );
    } else {
      await envoyerPushNotification(
        [demande.agent_id],
        `🔓 Déconsignation ${metierLabel} — ${demande.tag}`,
        `${membres.length} membre${membres.length > 1 ? 's' : ''} sorti${membres.length > 1 ? 's' : ''} — ${demande.numero_ordre}`,
        { demande_id: parseInt(demande_id), action: 'deconsignation_metier', type_metier: chef.type_metier,
          metier_label: metierLabel, pdf_path: pdfRelPath, statut: nouveauStatut }
      );
    }

    return success(res, {
      demande_id:           parseInt(demande_id),
      pdf_path:             pdfRelPath,
      stats:                statsJson,
      nb_membres:           membres.length,
      heure_debut:          heureDebut,
      heure_fin:            heureFin,
      duree_totale:         dureeTotale,
      statut:               nouveauStatut,
      metier:               chef.type_metier,
      metier_label:         metierLabel,
      tous_metiers_valides: tousMetiersValides,
      metiers_valides:      metierValides,
      metiers_restants:     metiersRestants,
    }, `Déconsignation ${metierLabel} validée — Rapport PDF généré`);

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
       FROM rapport_consignation rc JOIN users u ON rc.chef_equipe_id=u.id
       WHERE rc.demande_id=? AND rc.chef_equipe_id=? ORDER BY rc.created_at DESC LIMIT 1`,
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

// ════════════════════════════════════════════════════════════════════════════
// ✅ GET /equipe-intervention/:demande_id/statut-deconsignation
//
// FIX BUG 1 — Retourne maintenant :
//   - metiers_valides    : ['genie_civil', 'mecanique', ...]
//   - metiers_restants   : ['electrique', ...]
//   - tous_metiers_valides : boolean
//
// Ces infos permettent aux composants (GestionEquipe, detailConsignation)
// d'afficher les bonnes bannières même après rechargement/navigation.
// ════════════════════════════════════════════════════════════════════════════
const getStatutDeconsignation = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    // ── Statut de la demande ─────────────────────────────────────
    const [demandes] = await db.query(
      'SELECT statut, types_intervenants FROM demandes_consignation WHERE id=?', [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    // ── Membres de CE chef ───────────────────────────────────────
    const [membresRaw] = await db.query(
      `SELECT ei.id, ei.nom, ei.equipe_validee, ei.badge_ocp_id,
              ei.numero_cadenas, ei.cad_id, ei.scan_cadenas_sortie, ei.statut, ${MEMBRE_UTC_COLS}
       FROM equipe_intervention ei WHERE ei.demande_id=? AND ei.chef_equipe_id=?`,
      [demande_id, chef_id]
    );
    const membres   = membresRaw.map(convertMembreTZ);
    const total     = membres.length;
    const sortis    = membres.filter(m => m.statut === 'sortie').length;
    const surSite   = membres.filter(m => m.statut === 'sur_site').length;
    const enAttente = membres.filter(m => m.statut === 'en_attente').length;
    const equipeValidee   = membres.some(m => m.equipe_validee === 1);
    const peutDeconsigner = equipeValidee && total > 0 && sortis === total && surSite === 0 && enAttente === 0;

    // ── Rapport de CE chef ───────────────────────────────────────
    const [rapportExist] = await db.query(
      'SELECT id, pdf_path FROM rapport_consignation WHERE demande_id=? AND chef_equipe_id=? LIMIT 1',
      [demande_id, chef_id]
    );

    // ── Validation déconsignation de CE métier ───────────────────
    const [chefInfo] = await db.query('SELECT type_metier FROM users WHERE id=?', [chef_id]);
    const typeMetier = chefInfo[0]?.type_metier;
    const [dejaValide] = await db.query(
      `SELECT id, heure_validation FROM deconsignation_metier WHERE demande_id=? AND type_metier=? AND statut='valide'`,
      [demande_id, typeMetier]
    );

    const statutDemande = demandes[0].statut;
    const estDeconsigne = STATUTS_LECTURE_EQUIPE.includes(statutDemande)
      && !['consigne', 'consigne_charge', 'consigne_process'].includes(statutDemande);

    // ✅ FIX BUG 1 — Calculer metiers_valides / metiers_restants
    // Chargé directement depuis deconsignation_metier → toujours à jour après rechargement
    let metiersDemande = [];
    try {
      const raw = demandes[0].types_intervenants;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
      metiersDemande = parsed.filter(t => METIERS_EQUIPE.includes(t));
    } catch { metiersDemande = []; }

    const [tousValidesRows] = await db.query(
      `SELECT type_metier FROM deconsignation_metier WHERE demande_id=? AND statut='valide'`,
      [demande_id]
    );
    const metiersValides      = tousValidesRows.map(r => r.type_metier);
    const metiersRestants     = metiersDemande.filter(m => !metiersValides.includes(m));
    const tousMetiersValides  = metiersDemande.length > 0 && metiersRestants.length === 0;

    return success(res, {
      // Infos membres
      total, sortis, sur_site: surSite, en_attente: enAttente,
      equipe_validee: equipeValidee,
      // Déconsignation CE métier
      peut_deconsigner:                  peutDeconsigner && !dejaValide.length,
      a_deja_valide_deconsignation:      dejaValide.length > 0,
      heure_validation_deconsignation:   dejaValide.length ? toMarocString(dejaValide[0].heure_validation) : null,
      // Rapport CE métier
      rapport_genere:   rapportExist.length > 0 || estDeconsigne,
      rapport_pdf_path: rapportExist.length > 0 ? rapportExist[0].pdf_path : null,
      // Statut demande
      statut_demande: statutDemande,
      // ✅ NOUVEAUX — multi-métier (Fix Bug 1)
      metiers_valides:       metiersValides,
      metiers_restants:      metiersRestants,
      tous_metiers_valides:  tousMetiersValides,
      metiers_demande:       metiersDemande,
      // Membres
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