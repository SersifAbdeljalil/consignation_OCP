// src/services/rapportEquipe.pdf.service.js
// Appelle le script Python pour générer le PDF avec matplotlib
'use strict';

const path     = require('path');
const fs       = require('fs');
const { execFile } = require('child_process');
const os       = require('os');

const PYTHON_SCRIPT = path.join(__dirname, 'rapportEquipe_pdf_service.py');
const LOGO_PATH     = path.join(__dirname, '../utils/OCPLOGO.png');

const METIER_LABELS = {
  genie_civil: 'Genie Civil',
  mecanique:   'Mecanique',
  electrique:  'Electrique',
  process:     'Process',
};

/**
 * Génère le rapport PDF via le script Python.
 * @param {{ demande, membres, chef, stats, pdfPath }} opts
 */
const genererRapportEquipePDF = ({ demande, membres, chef, stats, pdfPath }) => {
  return new Promise((resolve, reject) => {
    // Construire le JSON d'entrée pour le script Python
    const inputData = {
      demande : {
        ...demande,
        tag            : demande.tag            || demande.code_equipement || '',
        equipement_nom : demande.equipement_nom || '',
        lot_code       : demande.lot_code       || '',
        raison         : demande.raison         || '',
        numero_ordre   : demande.numero_ordre   || '',
        statut         : demande.statut         || '',
        date_validation: demande.date_validation || demande.created_at || null,
      },
      membres : membres.map(m => ({
        id             : m.id,
        nom            : m.nom            || '',
        badge_ocp_id   : m.badge_ocp_id   || '',
        matricule      : m.matricule       || '',
        numero_cadenas : m.numero_cadenas  || '',
        cad_id         : m.cad_id          || '',
        heure_entree   : m.heure_entree    || null,
        heure_sortie   : m.heure_sortie    || null,
        heure_scan_sortie: m.heure_scan_sortie || null,
        scan_cadenas_sortie: m.scan_cadenas_sortie || null,
        statut         : m.statut          || 'en_attente',
      })),
      chef : {
        id         : chef.id,
        nom        : chef.nom        || '',
        prenom     : chef.prenom     || '',
        type_metier: chef.type_metier || '',
        metier_label: METIER_LABELS[chef.type_metier] || chef.type_metier || '',
      },
      stats     : stats || {},
      logo_path : fs.existsSync(LOGO_PATH) ? LOGO_PATH : '',
    };

    // Écrire le JSON dans un fichier temporaire
    const tmpDir      = os.tmpdir();
    const tmpJsonPath = path.join(tmpDir, `rapport_input_${Date.now()}.json`);

    try {
      fs.writeFileSync(tmpJsonPath, JSON.stringify(inputData, null, 2), 'utf8');
    } catch (err) {
      return reject(new Error(`Impossible d'écrire le fichier JSON temporaire : ${err.message}`));
    }

    // Détecter python3 ou python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    execFile(
      pythonCmd,
      [PYTHON_SCRIPT, tmpJsonPath, pdfPath],
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // Nettoyage du fichier temporaire
        try { fs.unlinkSync(tmpJsonPath); } catch (_) {}

        if (err) {
          console.error('[rapportEquipePDF] Erreur Python stdout:', stdout);
          console.error('[rapportEquipePDF] Erreur Python stderr:', stderr);
          return reject(new Error(`Génération PDF échouée : ${err.message}\n${stderr}`));
        }

        if (!fs.existsSync(pdfPath)) {
          return reject(new Error(`Le PDF n'a pas été créé : ${pdfPath}`));
        }

        console.log('[rapportEquipePDF] PDF généré avec succès :', pdfPath);
        resolve(pdfPath);
      }
    );
  });
};

module.exports = { genererRapportEquipePDF };