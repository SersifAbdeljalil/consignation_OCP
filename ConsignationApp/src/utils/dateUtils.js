// src/utils/dateUtils.js
// ══════════════════════════════════════════════════════
// Utilitaire de formatage des dates en heure du MAROC
// Fuseau : Africa/Casablanca (UTC+1 hiver, UTC+1 été)
// ══════════════════════════════════════════════════════

const LOCALE  = 'fr-MA';
const TIMEZONE = 'Africa/Casablanca';

/**
 * Formate une date en HH:MM selon l'heure du Maroc.
 * Remplace tous les `fmtHeure()` dans les composants.
 */
export const fmtHeureMaroc = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleTimeString(LOCALE, {
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: TIMEZONE,
  });
};

/**
 * Formate une date en DD/MM/YYYY selon l'heure du Maroc.
 * Remplace tous les `fmtDate()` dans les composants.
 */
export const fmtDateMaroc = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(LOCALE, {
    day:      '2-digit',
    month:    '2-digit',
    year:     'numeric',
    timeZone: TIMEZONE,
  });
};

/**
 * Retourne la date+heure locale Maroc complète pour les photos, logs, etc.
 * Remplace `new Date().toLocaleString('fr-MA')` dans PrendrePhotoEquipe.
 */
export const fmtDateTimeMaroc = (d) => {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleString(LOCALE, { timeZone: TIMEZONE });
};

/**
 * Calcule une durée lisible entre deux dates (en Maroc).
 * Retourne "Xh YY" ou "X min".
 */
export const fmtDuree = (debut, fin) => {
  if (!debut || !fin) return null;
  const diff = Math.round((new Date(fin) - new Date(debut)) / 60000);
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
};