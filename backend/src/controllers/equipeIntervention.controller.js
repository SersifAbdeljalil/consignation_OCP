// src/controllers/equipeIntervention.controller.js
const db = require('../config/db');
const { success, error } = require('../utils/response');
const { envoyerNotification } = require('../services/notification.service');
const { envoyerPushNotification } = require('./pushNotification.controller');

const STATUTS_AUTORISES = ['consigne', 'consigne_charge', 'consigne_process'];

const METIER_LABELS = {
  genie_civil: 'Génie Civil',
  mecanique:   'Mécanique',
  electrique:  'Électrique',
  process:     'Process',
};

// ── GET /equipe-intervention/mes-membres ──────────────────────
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

// ── GET /equipe-intervention/:demande_id ──────────────────────
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

// ── GET /equipe-intervention/:demande_id/intervenants-dispos ──
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

    // Membres SORTIS de ce chef (disponibles pour être réajoutés)
    const [membresSortis] = await db.query(
      `SELECT id, nom, matricule, badge_ocp_id, numero_cadenas
       FROM equipe_intervention
       WHERE chef_equipe_id = ?
         AND statut = 'sortie'
       ORDER BY nom ASC`,
      [chef_id]
    );

    // Exclure ceux déjà actifs dans cette demande
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

    // Dédoublonner par badge_ocp_id ou matricule
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

// ── POST /equipe-intervention/membre ─────────────────────────
// CORRECTION P1 : UPDATE si membre sorti existe → réactivation, sinon INSERT
const enregistrerMembre = async (req, res) => {
  try {
    const { demande_id, nom, matricule, badge_ocp_id, numero_cadenas } = req.body;
    const chef_id = req.user.id;

    if (!demande_id || !nom || !nom.trim()) {
      return error(res, 'demande_id et nom sont obligatoires', 400);
    }
    if (!badge_ocp_id && !numero_cadenas) {
      return error(res, 'Badge OCP ou numéro de cadenas est requis', 400);
    }

    const [demandes] = await db.query(
      'SELECT statut FROM demandes_consignation WHERE id = ?',
      [demande_id]
    );
    if (!demandes.length) return error(res, 'Demande introuvable', 404);

    if (!STATUTS_AUTORISES.includes(demandes[0].statut)) {
      return error(res, `Statut invalide pour enregistrer un membre (statut: ${demandes[0].statut})`, 400);
    }

    // Chercher un membre SORTI existant avec le même badge ou matricule pour cette demande
    let membreExistant = null;

    if (badge_ocp_id) {
      const [rows] = await db.query(
        `SELECT * FROM equipe_intervention
         WHERE demande_id = ? AND chef_equipe_id = ?
           AND badge_ocp_id = ? AND statut = 'sortie'
         ORDER BY created_at DESC LIMIT 1`,
        [demande_id, chef_id, badge_ocp_id.trim()]
      );
      if (rows.length) membreExistant = rows[0];
    }

    if (!membreExistant && matricule) {
      const [rows] = await db.query(
        `SELECT * FROM equipe_intervention
         WHERE demande_id = ? AND chef_equipe_id = ?
           AND matricule = ? AND statut = 'sortie'
         ORDER BY created_at DESC LIMIT 1`,
        [demande_id, chef_id, matricule.trim()]
      );
      if (rows.length) membreExistant = rows[0];
    }

    // Membre sorti existant → UPDATE (réactivation, pas de doublon)
    if (membreExistant) {
      await db.query(
        `UPDATE equipe_intervention
         SET nom            = ?,
             matricule      = ?,
             badge_ocp_id   = ?,
             numero_cadenas = ?,
             statut         = 'en_attente',
             equipe_validee = 0,
             heure_entree   = NULL,
             heure_sortie   = NULL
         WHERE id = ?`,
        [
          nom.trim(),
          matricule?.trim()      || membreExistant.matricule      || null,
          badge_ocp_id?.trim()   || membreExistant.badge_ocp_id   || null,
          numero_cadenas?.trim() || null,
          membreExistant.id,
        ]
      );

      const [maj] = await db.query(
        'SELECT * FROM equipe_intervention WHERE id = ?',
        [membreExistant.id]
      );
      return success(res, maj[0], 'Membre réactivé avec succès', 200);
    }

    // Vérifier doublon actif dans cette demande
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

    // INSERT nouveau membre
    const [result] = await db.query(
      `INSERT INTO equipe_intervention
         (demande_id, chef_equipe_id, nom, matricule, badge_ocp_id, numero_cadenas, equipe_validee, statut)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'en_attente')`,
      [
        demande_id,
        chef_id,
        nom.trim(),
        matricule?.trim()      || null,
        badge_ocp_id?.trim()   || null,
        numero_cadenas?.trim() || null,
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

// ── PUT /equipe-intervention/membre/:id/cadenas ───────────────
const mettreAJourCadenas = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_cadenas } = req.body;

    if (!numero_cadenas || !numero_cadenas.trim()) {
      return error(res, 'numero_cadenas est requis', 400);
    }

    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].equipe_validee === 1) return error(res, "Impossible — l'équipe est déjà validée", 400);

    const [doublon] = await db.query(
      `SELECT id FROM equipe_intervention
       WHERE demande_id = ? AND numero_cadenas = ? AND id != ?`,
      [rows[0].demande_id, numero_cadenas.trim(), id]
    );
    if (doublon.length > 0) {
      return error(res, 'Ce cadenas est déjà utilisé par un autre membre', 400);
    }

    await db.query(
      'UPDATE equipe_intervention SET numero_cadenas = ? WHERE id = ?',
      [numero_cadenas.trim(), id]
    );

    const [maj] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    return success(res, maj[0], 'Cadenas mis à jour avec succès');
  } catch (err) {
    console.error('mettreAJourCadenas error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── POST /equipe-intervention/:demande_id/valider ─────────────
// CORRECTION P2 : equipe_validee=1 SANS forcer sur_site
// Les membres restent en_attente jusqu'à marquerEntreeMembres
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

    // CORRECTION : equipe_validee=1 SANS toucher au statut ni à heure_entree
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

// ── POST /equipe-intervention/:demande_id/entree-site ─────────
// NOUVEAU P2 : mettre un ou plusieurs membres sur_site
// Body: { tous: true } → toute l'équipe en_attente
// Body: { membres_ids: [1,2,3] } → membres spécifiques
const marquerEntreeMembres = async (req, res) => {
  try {
    const { demande_id } = req.params;
    const { membres_ids, tous } = req.body;
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

    // L'équipe doit être validée avant l'entrée sur site
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
       SET statut = 'sur_site', heure_entree = NOW()
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

// ── PUT /equipe-intervention/membre/:id/entree ────────────────
const marquerEntree = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Membre introuvable', 404);
    if (rows[0].chef_equipe_id !== req.user.id) return error(res, 'Non autorisé', 403);
    if (rows[0].heure_entree) return error(res, 'Entrée déjà enregistrée', 400);

    await db.query(
      "UPDATE equipe_intervention SET heure_entree = NOW(), statut = 'sur_site' WHERE id = ?",
      [id]
    );
    return success(res, null, "Heure d'entrée enregistrée");
  } catch (err) {
    console.error('marquerEntree error:', err);
    return error(res, 'Erreur serveur', 500);
  }
};

// ── PUT /equipe-intervention/membre/:id/sortie ────────────────
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

// ── POST /equipe-intervention/membre/verifier-badge ───────────
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

// ── PUT /equipe-intervention/membre/:id/deconsigner ───────────
// CORRECTION P3 : vérifie statut = 'sur_site' avant d'autoriser la sortie
const deconsignerMembre = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero_cadenas } = req.body;

    if (!numero_cadenas) {
      return error(res, 'numero_cadenas est requis', 400);
    }

    const [membres] = await db.query('SELECT * FROM equipe_intervention WHERE id = ?', [id]);
    if (!membres.length) return error(res, 'Membre introuvable', 404);

    const membre = membres[0];

    if (membre.chef_equipe_id !== req.user.id) {
      return error(res, 'Non autorisé — ce membre ne fait pas partie de votre équipe', 403);
    }

    // CORRECTION P3 : doit être sur_site (pas juste equipe_validee)
    if (membre.statut !== 'sur_site') {
      return error(res, "Ce membre n'est pas sur site — impossible d'enregistrer sa sortie", 400);
    }

    if (membre.heure_sortie) {
      return error(res, 'Ce membre a déjà quitté le site', 400);
    }

    if (!membre.numero_cadenas) {
      return error(res, 'Aucun cadenas enregistré pour ce membre', 400);
    }

    const cadenasOk = membre.numero_cadenas.trim().toLowerCase() === numero_cadenas.trim().toLowerCase();
    if (!cadenasOk) {
      return error(res, `Ce cadenas ne correspond pas à celui de ${membre.nom}`, 400);
    }

    await db.query(
      "UPDATE equipe_intervention SET heure_sortie = NOW(), statut = 'sortie' WHERE id = ?",
      [id]
    );

    const membreMaj = { ...membre, heure_sortie: new Date().toISOString(), statut: 'sortie' };

    // Vérifier si tous les membres sont maintenant sortis
    const [tousLesMembres] = await db.query(
      `SELECT id, statut FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?`,
      [membre.demande_id, membre.chef_equipe_id]
    );

    const total      = tousLesMembres.length;
    const sortisAvant = tousLesMembres.filter(m => m.statut === 'sortie').length;
    const sortisTotal = sortisAvant + 1; // +1 pour le membre courant qu'on vient de mettre sorti
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

// ── GET /equipe-intervention/:demande_id/statut-deconsignation ─
// CORRECTION P4 : peut_deconsigner = tous sortis + aucun sur_site + aucun en_attente
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
              badge_ocp_id, numero_cadenas, statut
       FROM equipe_intervention
       WHERE demande_id = ? AND chef_equipe_id = ?`,
      [demande_id, chef_id]
    );

    const total         = membres.length;
    const sortis        = membres.filter(m => m.statut === 'sortie').length;
    const surSite       = membres.filter(m => m.statut === 'sur_site').length;
    const enAttente     = membres.filter(m => m.statut === 'en_attente').length;
    const equipeValidee = membres.some(m => m.equipe_validee === 1);

    // CORRECTION P4 : tous doivent être sortis, 0 sur_site, 0 en_attente
    const peutDeconsigner = equipeValidee
      && total > 0
      && sortis === total
      && surSite === 0
      && enAttente === 0;

    return success(res, {
      total,
      sortis,
      sur_site:         surSite,
      en_attente:       enAttente,
      equipe_validee:   equipeValidee,
      peut_deconsigner: peutDeconsigner,
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
  mettreAJourCadenas,
  validerEquipe,
  marquerEntreeMembres,
  marquerEntree,
  marquerSortie,
  verifierBadge,
  deconsignerMembre,
  getStatutDeconsignation,
};