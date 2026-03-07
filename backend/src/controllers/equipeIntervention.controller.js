// src/controllers/equipeIntervention.controller.js
'use strict';

const path = require('path');
const fs   = require('fs');
const db   = require('../config/db');
const { success, error }         = require('../utils/response');
const { envoyerNotification }    = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');
const { genererRapportEquipePDF } = require('../services/rapportEquipe.pdf.service');

const STATUTS_AUTORISES = ['consigne', 'consigne_charge', 'consigne_process'];

const METIER_LABELS = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

// ── Helpers ──────────────────────────────────────────────────────
const dureeMin = (debut, fin) => {
  if (!debut || !fin) return null;
  return Math.round((new Date(fin) - new Date(debut)) / 60000);
};

// ── GET /equipe-intervention/mes-membres ─────────────────────────
const getMesMembres = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ei.*,
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
    return success(res, rows, 'Membres récupérés');
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

    if (!STATUTS_AUTORISES.includes(demande.statut)) {
      return error(res, `Statut invalide pour consulter l'équipe (statut: ${demande.statut})`, 400);
    }

    const [membres] = await db.query(
      `SELECT * FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?
       ORDER BY created_at ASC`,
      [demande_id, chef_id]
    );

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
      'SELECT statut FROM demandes_consignation WHERE id = ?',
      [demande_id]
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
// Supporte : cad_id (scan cadenas personnel) + photo_path (photo du membre)
// Option A (membre sorti existant) : vérification cad_id contre equipe_intervention.cad_id
// Option B (nouveau membre) : INSERT avec cad_id + badge_ocp_id + photo_path
const enregistrerMembre = async (req, res) => {
  try {
    const {
      demande_id,
      nom,
      matricule,
      badge_ocp_id,
      numero_cadenas,
      cad_id,         // ← ID unique scanné du cadenas personnel
      photo_path,     // ← Photo prise lors de l'ajout
    } = req.body;

    const chef_id = req.user.id;

    if (!demande_id || !nom || !nom.trim()) {
      return error(res, 'demande_id et nom sont obligatoires', 400);
    }

    const [demandes] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?',
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) {
      return error(res, `Statut invalide pour enregistrer un membre (statut: ${demandes[0].statut})`, 400);
    }

    // ── OPTION A : membre sorti existant → vérification cad_id + réactivation
    let membreExistant = null;

    if (badge_ocp_id) {
      const [rows] = await db.query(
        `SELECT * FROM equipe_intervention
         WHERE chef_equipe_id = ? AND badge_ocp_id = ? AND statut = 'sortie'
         ORDER BY created_at DESC LIMIT 1`,
        [chef_id, badge_ocp_id.trim()]
      );
      if (rows.length) membreExistant = rows[0];
    }

    if (!membreExistant && matricule) {
      const [rows] = await db.query(
        `SELECT * FROM equipe_intervention
         WHERE chef_equipe_id = ? AND matricule = ? AND statut = 'sortie'
         ORDER BY created_at DESC LIMIT 1`,
        [chef_id, matricule.trim()]
      );
      if (rows.length) membreExistant = rows[0];
    }

    if (membreExistant) {
      // Si cad_id fourni, vérifier qu'il correspond au cadenas enregistré du membre
      if (cad_id && membreExistant.cad_id) {
        const cadOk = membreExistant.cad_id.trim().toLowerCase() === cad_id.trim().toLowerCase();
        if (!cadOk) {
          return error(res, `Le cadenas scanné ne correspond pas à celui de ${membreExistant.nom}. Attendu: ${membreExistant.cad_id}`, 400);
        }
      }

      await db.query(
        `UPDATE equipe_intervention
         SET nom              = ?,
             matricule        = ?,
             badge_ocp_id     = ?,
             numero_cadenas   = ?,
             cad_id           = ?,
             photo_path       = ?,
             statut           = 'en_attente',
             equipe_validee   = 0,
             heure_entree     = NULL,
             heure_sortie     = NULL,
             heure_scan_cadenas = NULL,
             heure_scan_sortie  = NULL,
             scan_cadenas_sortie = NULL
         WHERE id = ?`,
        [
          nom.trim(),
          matricule?.trim()      || membreExistant.matricule      || null,
          badge_ocp_id?.trim()   || membreExistant.badge_ocp_id   || null,
          numero_cadenas?.trim() || membreExistant.numero_cadenas || null,
          cad_id?.trim()         || membreExistant.cad_id         || null,
          photo_path             || membreExistant.photo_path     || null,
          membreExistant.id,
        ]
      );

      const [maj] = await db.query(
        'SELECT * FROM equipe_intervention WHERE id = ?',
        [membreExistant.id]
      );
      return success(res, maj[0], 'Membre réactivé avec succès', 200);
    }

    // ── OPTION B : nouveau membre → vérification anti-doublon actif
    if (badge_ocp_id) {
      const [existing] = await db.query(
        `SELECT id FROM equipe_intervention
         WHERE demande_id = ? AND badge_ocp_id = ? AND statut != 'sortie'`,
        [demande_id, badge_ocp_id.trim()]
      );
      if (existing.length > 0) {
        return error(res, 'Ce badge est déjà enregistré et actif pour cette demande', 400);
      }
    }

    // Vérification unicité cad_id pour cette demande
    if (cad_id) {
      const [existingCad] = await db.query(
        `SELECT id FROM equipe_intervention
         WHERE demande_id = ? AND cad_id = ? AND statut != 'sortie'`,
        [demande_id, cad_id.trim()]
      );
      if (existingCad.length > 0) {
        return error(res, 'Ce cadenas (cad_id) est déjà utilisé par un autre membre actif', 400);
      }
    }

    const [result] = await db.query(
      `INSERT INTO equipe_intervention
         (demande_id, chef_equipe_id, nom, matricule, badge_ocp_id, numero_cadenas, cad_id, photo_path, equipe_validee, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'en_attente')`,
      [
        demande_id,
        chef_id,
        nom.trim(),
        matricule?.trim()      || null,
        badge_ocp_id?.trim()   || null,
        numero_cadenas?.trim() || null,
        cad_id?.trim()         || null,
        photo_path             || null,
      ]
    );

    const [nouveau] = await db.query(
      'SELECT * FROM equipe_intervention WHERE id = ?',
      [result.insertId]
    );

    return success(res, nouveau[0], 'Membre enregistré avec succès', 201);
  } catch (err) {
    console.error('enregistrerMembre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/membre/verifier-cadenas ────────────
// Vérifie si un cad_id scanné correspond à un membre existant (sorti)
// Utilisé à l'étape 2 Option A avant de réactiver un membre
const verifierCadenas = async (req, res) => {
  try {
    const { cad_id, badge_ocp_id } = req.body;
    const chef_id = req.user.id;

    if (!cad_id && !badge_ocp_id) {
      return error(res, 'cad_id ou badge_ocp_id est requis', 400);
    }

    // Chercher dans les membres sortis de ce chef
    let query, params;
    if (cad_id) {
      query  = `SELECT * FROM equipe_intervention WHERE chef_equipe_id = ? AND cad_id = ? ORDER BY created_at DESC LIMIT 1`;
      params = [chef_id, cad_id.trim()];
    } else {
      query  = `SELECT * FROM equipe_intervention WHERE chef_equipe_id = ? AND badge_ocp_id = ? ORDER BY created_at DESC LIMIT 1`;
      params = [chef_id, badge_ocp_id.trim()];
    }

    const [rows] = await db.query(query, params);

    if (!rows.length) {
      return success(res, { found: false, membre: null }, 'Aucun membre trouvé avec ce cadenas/badge');
    }

    return success(res, { found: true, membre: rows[0] }, 'Membre trouvé');
  } catch (err) {
    console.error('verifierCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/cadenas ──────────────────
const mettreAJourCadenas = async (req, res) => {
  try {
    const { id }  = req.params;
    const { numero_cadenas, cad_id } = req.body;

    if (!numero_cadenas && !cad_id) {
      return error(res, 'numero_cadenas ou cad_id est requis', 400);
    }

    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].equipe_validee === 1) return error(res, "Impossible — l'équipe est déjà validée", 400);

    if (numero_cadenas) {
      const [doublon] = await db.query(
        `SELECT id FROM equipe_intervention
         WHERE demande_id = ? AND numero_cadenas = ? AND id != ?`,
        [rows[0].demande_id, numero_cadenas.trim(), id]
      );
      if (doublon.length > 0) {
        return error(res, 'Ce numéro de cadenas est déjà utilisé par un autre membre', 400);
      }
    }

    await db.query(
      `UPDATE equipe_intervention
       SET numero_cadenas = COALESCE(?, numero_cadenas),
           cad_id         = COALESCE(?, cad_id)
       WHERE id = ?`,
      [numero_cadenas?.trim() || null, cad_id?.trim() || null, id]
    );

    const [maj] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    return success(res, maj[0], 'Cadenas mis à jour avec succès');
  } catch (err) {
    console.error('mettreAJourCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/valider ────────────────
// equipe_validee=1 SANS forcer sur_site — membres restent en_attente
const validerEquipe = async (req, res) => {
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

    if (!STATUTS_AUTORISES.includes(demande.statut)) {
      return error(res, 'La demande doit être consignée pour valider une équipe', 400);
    }

    const [membres] = await db.query(
      'SELECT id FROM equipe_intervention WHERE demande_id = ? AND chef_equipe_id = ?',
      [demande_id, chef_id]
    );
    if (!membres.length) {
      return error(res, 'Enregistrez au moins un membre avant de valider', 400);
    }

    const [sansCadenas] = await db.query(
      `SELECT nom FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?
         AND (numero_cadenas IS NULL OR numero_cadenas = '')`,
      [demande_id, chef_id]
    );
    if (sansCadenas.length > 0) {
      return error(res,
        `${sansCadenas.length} membre(s) sans cadenas. Tous les membres doivent avoir un cadenas avant la validation.`,
        400
      );
    }

    await db.query(
      `UPDATE equipe_intervention
       SET equipe_validee = 1
       WHERE demande_id = ? AND chef_equipe_id = ?`,
      [demande_id, chef_id]
    );

    const [chefInfo] = await db.query(
      'SELECT prenom, nom, type_metier FROM users WHERE id = ?',
      [chef_id]
    );
    const chef = chefInfo[0];
    const metierLabel = METIER_LABELS[chef.type_metier] || chef.type_metier;

    await envoyerNotification(
      demande.agent_id,
      "👷 Équipe validée — en attente d'entrée",
      `L'équipe ${metierLabel} de ${chef.prenom} ${chef.nom} (${membres.length} membre${membres.length > 1 ? 's' : ''}) est validée pour la demande ${demande.numero_ordre} — TAG ${demande.tag}.`,
      'intervention',
      `demande/${demande_id}`
    );

    await envoyerPushNotification(
      [demande.agent_id],
      '👷 Équipe validée',
      `Équipe ${metierLabel} (${membres.length} membre${membres.length > 1 ? 's' : ''}) — ${demande.tag}`,
      { demande_id: parseInt(demande_id), statut: demande.statut, action: 'equipe_validee' }
    );

    return success(res, {
      demande_id:     parseInt(demande_id),
      nb_membres:     membres.length,
      equipe_validee: 1,
    }, "Équipe validée — membres en attente d'entrée sur site");
  } catch (err) {
    console.error('validerEquipe error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/entree-site ────────────
// Marquer un ou plusieurs membres sur_site (avec scan cadenas à l'entrée)
// Body: { tous: true } ou { membres_ids: [1,2,3] }
// Body optionnel: { scan_cadenas_entree: 'cad_id_scanné' } pour vérification si tous=false avec 1 membre
const marquerEntreeMembres = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const { membres_ids, tous, scan_cadenas_entree } = req.body;
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

    if (!STATUTS_AUTORISES.includes(demande.statut)) {
      return error(res, 'Statut invalide', 400);
    }

    const [equipeValidee] = await db.query(
      `SELECT id FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ? AND equipe_validee = 1 LIMIT 1`,
      [demande_id, chef_id]
    );
    if (!equipeValidee.length) {
      return error(res, "L'équipe doit être validée avant de marquer l'entrée sur site", 400);
    }

    let idsAMettreSurSite = [];

    if (tous) {
      const [enAttente] = await db.query(
        `SELECT id FROM equipe_intervention
         WHERE demande_id = ? AND chef_equipe_id = ? AND statut = 'en_attente'`,
        [demande_id, chef_id]
      );
      idsAMettreSurSite = enAttente.map(m => m.id);
    } else if (membres_ids && Array.isArray(membres_ids) && membres_ids.length > 0) {
      // Si un seul membre et scan_cadenas_entree fourni → vérification cad_id
      if (membres_ids.length === 1 && scan_cadenas_entree) {
        const [membreRows] = await db.query(
          `SELECT * FROM equipe_intervention
           WHERE id = ? AND chef_equipe_id = ? AND statut = 'en_attente'`,
          [membres_ids[0], chef_id]
        );
        if (!membreRows.length) {
          return error(res, 'Membre introuvable ou déjà sur site', 400);
        }
        const membre = membreRows[0];
        // Vérification cadenas si cad_id est renseigné
        if (membre.cad_id) {
          const cadOk = membre.cad_id.trim().toLowerCase() === scan_cadenas_entree.trim().toLowerCase();
          if (!cadOk) {
            return error(res, `Le cadenas scanné ne correspond pas à celui de ${membre.nom}`, 400);
          }
        }
      }

      const [valides] = await db.query(
        `SELECT id FROM equipe_intervention
         WHERE demande_id = ? AND chef_equipe_id = ?
           AND id IN (?) AND statut = 'en_attente'`,
        [demande_id, chef_id, membres_ids]
      );
      idsAMettreSurSite = valides.map(m => m.id);
    } else {
      return error(res, 'Fournissez membres_ids (tableau) ou tous: true', 400);
    }

    if (!idsAMettreSurSite.length) {
      return error(res, 'Aucun membre en attente à mettre sur site', 400);
    }

    await db.query(
      `UPDATE equipe_intervention
       SET statut = 'sur_site', heure_entree = NOW(), heure_scan_cadenas = NOW()
       WHERE id IN (?)`,
      [idsAMettreSurSite]
    );

    const [membresMaj] = await db.query(
      'SELECT * FROM equipe_intervention WHERE id IN (?)',
      [idsAMettreSurSite]
    );

    const [chefInfo] = await db.query(
      'SELECT prenom, nom, type_metier FROM users WHERE id = ?',
      [chef_id]
    );
    const chef = chefInfo[0];
    const metierLabel = METIER_LABELS[chef.type_metier] || chef.type_metier;

    await envoyerNotification(
      demande.agent_id,
      '👷 Membres entrés sur chantier',
      `${idsAMettreSurSite.length} membre(s) de l'équipe ${metierLabel} de ${chef.prenom} ${chef.nom} sont entrés sur le chantier — ${demande.tag}.`,
      'intervention',
      `demande/${demande_id}`
    );

    await envoyerPushNotification(
      [demande.agent_id],
      '👷 Entrée sur chantier',
      `${idsAMettreSurSite.length} membre(s) — ${demande.tag}`,
      { demande_id: parseInt(demande_id), action: 'entree_site' }
    );

    return success(res, {
      demande_id:  parseInt(demande_id),
      membres_maj: membresMaj,
      nb_sur_site: idsAMettreSurSite.length,
    }, `${idsAMettreSurSite.length} membre(s) marqués sur site`);
  } catch (err) {
    console.error('marquerEntreeMembres error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/entree ───────────────────
const marquerEntree = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].heure_entree) return error(res, 'Entrée déjà enregistrée', 400);

    await db.query(
      "UPDATE equipe_intervention SET heure_entree = NOW(), heure_scan_cadenas = NOW(), statut = 'sur_site' WHERE id = ?",
      [id]
    );
    return success(res, null, "Heure d'entrée enregistrée");
  } catch (err) {
    console.error('marquerEntree error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/sortie ───────────────────
const marquerSortie = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (!rows[0].heure_entree) return error(res, "L'entrée n'a pas encore été enregistrée", 400);
    if (rows[0].heure_sortie) return error(res, 'Sortie déjà enregistrée', 400);

    await db.query(
      "UPDATE equipe_intervention SET heure_sortie = NOW(), statut = 'sortie' WHERE id = ?",
      [id]
    );
    return success(res, null, 'Heure de sortie enregistrée');
  } catch (err) {
    console.error('marquerSortie error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/membre/verifier-badge ─────────────
const verifierBadge = async (req, res) => {
  try {
    const { badge_ocp_id, matricule } = req.body;

    if (!badge_ocp_id && !matricule) {
      return error(res, 'badge_ocp_id ou matricule est requis', 400);
    }

    let query, params;
    if (badge_ocp_id) {
      query  = 'SELECT id, nom, prenom, matricule, badge_ocp_id, type_metier FROM users WHERE badge_ocp_id = ? AND actif = 1';
      params = [badge_ocp_id.trim()];
    } else {
      query  = 'SELECT id, nom, prenom, matricule, badge_ocp_id, type_metier FROM users WHERE matricule = ? AND actif = 1';
      params = [matricule.trim()];
    }

    const [users] = await db.query(query, params);

    if (!users.length) {
      return success(res, { found: false, user: null }, 'Badge/matricule non trouvé dans le système');
    }

    return success(res, { found: true, user: users[0] }, 'Utilisateur trouvé');
  } catch (err) {
    console.error('verifierBadge error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/deconsigner ─────────────
// Vérification : statut = sur_site + scan cadenas (cad_id OU numero_cadenas) + scan badge OCP
// Enregistre heure_scan_sortie + scan_cadenas_sortie
const deconsignerMembre = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_cadenas, cad_id, badge_ocp_id } = req.body;

    if (!numero_cadenas && !cad_id) {
      return error(res, 'numero_cadenas ou cad_id est requis pour la sortie', 400);
    }

    const [membres] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!membres.length) return error(res, 'Membre introuvable', 404);

    const membre = membres[0];

    if (membre.chef_equipe_id !== req.user.id) {
      return error(res, 'Non autorisé — ce membre ne fait pas partie de votre équipe', 403);
    }

    if (membre.statut !== 'sur_site') {
      return error(res, "Ce membre n'est pas sur site — impossible d'enregistrer sa sortie", 400);
    }

    if (membre.heure_sortie) {
      return error(res, 'Ce membre a déjà quitté le site', 400);
    }

    // ── Vérification cadenas ────────────────────────────────────
    // Priorité : cad_id (scan QR) > numero_cadenas (numéro physique)
    const scanFourni = cad_id?.trim() || numero_cadenas?.trim();

    if (cad_id && membre.cad_id) {
      const cadOk = membre.cad_id.trim().toLowerCase() === cad_id.trim().toLowerCase();
      if (!cadOk) {
        return error(res, `Le cadenas personnel scanné ne correspond pas à celui de ${membre.nom}`, 400);
      }
    } else if (numero_cadenas && membre.numero_cadenas) {
      const cadOk = membre.numero_cadenas.trim().toLowerCase() === numero_cadenas.trim().toLowerCase();
      if (!cadOk) {
        return error(res, `Le numéro de cadenas ne correspond pas à celui de ${membre.nom}`, 400);
      }
    } else if (!membre.numero_cadenas && !membre.cad_id) {
      return error(res, 'Aucun cadenas enregistré pour ce membre', 400);
    }

    // ── Vérification badge OCP si fourni ────────────────────────
    // Les intervenants sont séparés des users → on compare badge_ocp_id de equipe_intervention
    if (badge_ocp_id && membre.badge_ocp_id) {
      const badgeOk = membre.badge_ocp_id.trim().toLowerCase() === badge_ocp_id.trim().toLowerCase();
      if (!badgeOk) {
        return error(res, `Le badge OCP scanné ne correspond pas à celui de ${membre.nom}`, 400);
      }
    }

    const heureNow = new Date();
    await db.query(
      `UPDATE equipe_intervention
       SET heure_sortie        = ?,
           heure_scan_sortie   = ?,
           scan_cadenas_sortie = ?,
           statut              = 'sortie'
       WHERE id = ?`,
      [heureNow, heureNow, scanFourni, id]
    );

    const membreMaj = { ...membre, heure_sortie: heureNow.toISOString(), statut: 'sortie' };

    // Vérifier si tous les membres sont sortis
    const [tousLesMembres] = await db.query(
      `SELECT id, statut FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?`,
      [membre.demande_id, membre.chef_equipe_id]
    );

    const total       = tousLesMembres.length;
    const sortisAvant = tousLesMembres.filter(m => m.statut === 'sortie').length;
    const sortisTotal = sortisAvant + 1;
    const tousSortis  = sortisTotal >= total;

    if (tousSortis) {
      const [demandes] = await db.query(
        `SELECT d.agent_id, d.numero_ordre, e.code_equipement AS tag
         FROM demandes_consignation d
         JOIN equipements e ON d.equipement_id = e.id
         WHERE d.id = ?`,
        [membre.demande_id]
      );

      if (demandes.length) {
        const demande = demandes[0];
        const [chefInfo] = await db.query(
          'SELECT prenom, nom FROM users WHERE id = ?',
          [req.user.id]
        );
        const chef = chefInfo[0];

        await envoyerNotification(
          demande.agent_id,
          '🔓 Équipe sortie — déconsignation possible',
          `Toute l'équipe de ${chef.prenom} ${chef.nom} a quitté le chantier pour la demande ${demande.numero_ordre} — TAG ${demande.tag}. Vous pouvez procéder à la déconsignation.`,
          'deconsignation',
          `demande/${membre.demande_id}`
        );

        await envoyerPushNotification(
          [demande.agent_id],
          '🔓 Déconsignation possible',
          `Tous les membres ont quitté — ${demande.tag}`,
          { demande_id: membre.demande_id, action: 'tous_sortis' }
        );
      }
    }

    return success(res, {
      membre:      membreMaj,
      tous_sortis: tousSortis,
      total,
      sortis:      sortisTotal,
    }, tousSortis
      ? 'Sortie enregistrée — tous les membres ont quitté le site. Déconsignation possible.'
      : `Sortie enregistrée — ${sortisTotal}/${total} membres sortis`
    );
  } catch (err) {
    console.error('deconsignerMembre error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/valider-deconsignation ─
// Déclenché par le chef APRÈS que tous les membres sont sortis
// Génère le PDF rapport final et enregistre dans rapport_consignation
const validerDeconsignation = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    // 1. Récupérer la demande complète
    const [demandes] = await db.query(
      `SELECT d.*,
              e.code_equipement AS tag,
              e.nom             AS equipement_nom,
              l.code            AS lot_code
       FROM demandes_consignation d
       JOIN equipements e ON d.equipement_id = e.id
       LEFT JOIN lots l ON d.lot_id = l.id
       WHERE d.id = ?`,
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);
    const demande = demandes[0];

    if (!STATUTS_AUTORISES.includes(demande.statut)) {
      return error(res, 'La demande doit être consignée pour valider la déconsignation', 400);
    }

    // 2. Récupérer tous les membres de ce chef pour cette demande
    const [membres] = await db.query(
      `SELECT * FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?
       ORDER BY created_at ASC`,
      [demande_id, chef_id]
    );

    if (!membres.length) {
      return error(res, 'Aucun membre enregistré pour cette équipe', 400);
    }

    // 3. Vérifier que tous les membres sont sortis
    const nonSortis = membres.filter(m => m.statut !== 'sortie');
    if (nonSortis.length > 0) {
      return error(res,
        `${nonSortis.length} membre(s) pas encore sortis : ${nonSortis.map(m => m.nom).join(', ')}`,
        400
      );
    }

    // 4. Récupérer infos chef
    const [chefRows] = await db.query(
      'SELECT id, nom, prenom, type_metier FROM users WHERE id = ?',
      [chef_id]
    );
    if (!chefRows.length) return error(res, 'Chef introuvable', 404);
    const chef = chefRows[0];

    // 5. Calculer les statistiques
    const durees = membres
      .filter(m => m.heure_entree && m.heure_sortie)
      .map(m => ({
        nom   : m.nom,
        duree : Math.round((new Date(m.heure_sortie) - new Date(m.heure_entree)) / 60000),
      }));

    const dureesMins   = durees.map(d => d.duree);
    const dureeTotale  = dureesMins.length ? Math.max(...dureesMins) : 0;
    const dureeMoy     = dureesMins.length
      ? Math.round(dureesMins.reduce((a, b) => a + b, 0) / dureesMins.length)
      : 0;

    const heureDebut = membres.reduce((min, m) => {
      if (!m.heure_entree) return min;
      return !min || new Date(m.heure_entree) < new Date(min) ? m.heure_entree : min;
    }, null);

    const heureFin = membres.reduce((max, m) => {
      if (!m.heure_sortie) return max;
      return !max || new Date(m.heure_sortie) > new Date(max) ? m.heure_sortie : max;
    }, null);

    // 6. Construire le JSON chronologie
    const actions = [];
    membres.forEach(m => {
      if (m.heure_entree) {
        actions.push({
          type       : 'entree',
          membre     : m.nom,
          badge      : m.badge_ocp_id || null,
          cadenas    : m.numero_cadenas || null,
          cad_id     : m.cad_id || null,
          horodatage : m.heure_entree,
        });
      }
      if (m.heure_sortie) {
        actions.push({
          type              : 'sortie',
          membre            : m.nom,
          badge             : m.badge_ocp_id || null,
          cadenas_sortie    : m.scan_cadenas_sortie || m.numero_cadenas || null,
          horodatage        : m.heure_sortie,
          duree_min         : m.heure_entree ? Math.round((new Date(m.heure_sortie) - new Date(m.heure_entree)) / 60000) : null,
        });
      }
    });
    actions.sort((a, b) => new Date(a.horodatage) - new Date(b.horodatage));

    const statsJson = {
      total_membres     : membres.length,
      membres_sortis    : membres.filter(m => m.statut === 'sortie').length,
      duree_totale_min  : dureeTotale,
      duree_moyenne_min : dureeMoy,
      heure_debut       : heureDebut,
      heure_fin         : heureFin,
      chef              : `${chef.prenom} ${chef.nom}`,
      metier            : METIER_LABELS[chef.type_metier] || chef.type_metier,
      par_membre        : durees,
    };

    // 7. Générer le PDF
    const uploadsDir = path.join(__dirname, '../../uploads/rapports_equipe');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const fileName  = `rapport_equipe_${demande.numero_ordre}_${chef_id}_${timestamp}.pdf`;
    const pdfPath   = path.join(uploadsDir, fileName);
    const pdfRelPath = `uploads/rapports_equipe/${fileName}`;

    await genererRapportEquipePDF({
      demande,
      membres,
      chef,
      stats   : statsJson,
      pdfPath,
    });

    // 8. Enregistrer dans rapport_consignation
    // Vérifier si un rapport existe déjà pour cette demande + chef
    const [existingRapport] = await db.query(
      'SELECT id FROM rapport_consignation WHERE demande_id = ? AND chef_equipe_id = ?',
      [demande_id, chef_id]
    );

    if (existingRapport.length) {
      await db.query(
        `UPDATE rapport_consignation
         SET pdf_path         = ?,
             statut_final     = 'deconsignee',
             nb_membres_total = ?,
             nb_membres_sortis= ?,
             duree_totale_min = ?,
             heure_debut      = ?,
             heure_fin        = ?,
             actions_json     = ?,
             stats_json       = ?
         WHERE demande_id = ? AND chef_equipe_id = ?`,
        [
          pdfRelPath,
          membres.length,
          membres.filter(m => m.statut === 'sortie').length,
          dureeTotale,
          heureDebut,
          heureFin,
          JSON.stringify(actions),
          JSON.stringify(statsJson),
          demande_id,
          chef_id,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO rapport_consignation
           (demande_id, chef_equipe_id, pdf_path, statut_final, nb_membres_total,
            nb_membres_sortis, duree_totale_min, heure_debut, heure_fin, actions_json, stats_json)
         VALUES (?, ?, ?, 'deconsignee', ?, ?, ?, ?, ?, ?, ?)`,
        [
          demande_id,
          chef_id,
          pdfRelPath,
          membres.length,
          membres.filter(m => m.statut === 'sortie').length,
          dureeTotale,
          heureDebut,
          heureFin,
          JSON.stringify(actions),
          JSON.stringify(statsJson),
        ]
      );
    }

    // 9. Notification à l'agent
    await envoyerNotification(
      demande.agent_id,
      '✅ Déconsignation validée — Rapport disponible',
      `L'équipe ${METIER_LABELS[chef.type_metier] || ''} de ${chef.prenom} ${chef.nom} a validé la fin d'intervention pour ${demande.numero_ordre} — TAG ${demande.tag}. Le rapport PDF est disponible.`,
      'deconsignation',
      `demande/${demande_id}`
    );

    await envoyerPushNotification(
      [demande.agent_id],
      '✅ Rapport d\'intervention disponible',
      `Fin d'intervention — ${demande.tag}`,
      { demande_id: parseInt(demande_id), action: 'rapport_genere', pdf_path: pdfRelPath }
    );

    return success(res, {
      demande_id   : parseInt(demande_id),
      pdf_path     : pdfRelPath,
      stats        : statsJson,
      nb_membres   : membres.length,
      heure_debut  : heureDebut,
      heure_fin    : heureFin,
      duree_totale : dureeTotale,
    }, 'Déconsignation validée — Rapport PDF généré avec succès');
  } catch (err) {
    console.error('validerDeconsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── GET /equipe-intervention/:demande_id/rapport ─────────────────
// Récupérer le rapport final (pdf_path + stats) pour affichage frontend
const getRapport = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const chef_id = req.user.id;

    const [rapports] = await db.query(
      `SELECT rc.*,
              CONCAT(u.prenom, ' ', u.nom) AS chef_nom,
              u.type_metier
       FROM rapport_consignation rc
       JOIN users u ON rc.chef_equipe_id = u.id
       WHERE rc.demande_id = ? AND rc.chef_equipe_id = ?
       ORDER BY rc.created_at DESC LIMIT 1`,
      [demande_id, chef_id]
    );

    if (!rapports.length) {
      return error(res, 'Aucun rapport trouvé pour cette demande', 404);
    }

    const rapport = rapports[0];

    // Parser les JSON
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
      'SELECT statut FROM demandes_consignation WHERE id = ?',
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    const [membres] = await db.query(
      `SELECT id, nom, heure_entree, heure_sortie, equipe_validee,
              badge_ocp_id, numero_cadenas, cad_id, scan_cadenas_sortie,
              heure_scan_cadenas, heure_scan_sortie, statut
       FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?`,
      [demande_id, chef_id]
    );

    const total         = membres.length;
    const sortis        = membres.filter(m => m.statut === 'sortie').length;
    const surSite       = membres.filter(m => m.statut === 'sur_site').length;
    const enAttente     = membres.filter(m => m.statut === 'en_attente').length;
    const equipeValidee = membres.some(m => m.equipe_validee === 1);

    const peutDeconsigner = equipeValidee
      && total > 0
      && sortis === total
      && surSite === 0
      && enAttente === 0;

    // Vérifier si rapport déjà généré
    const [rapportExist] = await db.query(
      'SELECT id, pdf_path FROM rapport_consignation WHERE demande_id = ? AND chef_equipe_id = ? LIMIT 1',
      [demande_id, chef_id]
    );

    return success(res, {
      total,
      sortis,
      sur_site           : surSite,
      en_attente         : enAttente,
      equipe_validee     : equipeValidee,
      peut_deconsigner   : peutDeconsigner,
      rapport_genere     : rapportExist.length > 0,
      rapport_pdf_path   : rapportExist.length > 0 ? rapportExist[0].pdf_path : null,
      membres,
    }, 'Statut récupéré');
  } catch (err) {
    console.error('getStatutDeconsignation error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

module.exports = {
  getMesMembres,
  getEquipe,
  getIntervenantsDispos,
  enregistrerMembre,
  verifierCadenas,
  mettreAJourCadenas,
  validerEquipe,
  marquerEntreeMembres,
  marquerEntree,
  marquerSortie,
  verifierBadge,
  deconsignerMembre,
  validerDeconsignation,
  getRapport,
  getStatutDeconsignation,
};