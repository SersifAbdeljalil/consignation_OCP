// src/services/sms.service.js
const twilio = require('twilio');

// ── Initialiser client Twilio ─────────────────
const getClient = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Clés Twilio manquantes dans .env');
  }
  return twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
};

/**
 * Générer un code OTP à 6 chiffres
 */
const genererCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Formater numéro marocain au format international
 * 06XXXXXXXX  → +212 6XXXXXXXX
 * 07XXXXXXXX  → +212 7XXXXXXXX
 * +212XXXXXXX → +212XXXXXXX (déjà bon)
 */
const formaterNumero = (numero) => {
  // Retirer tous les espaces
  let n = numero.replace(/\s/g, '');

  // Si commence par 0 → remplacer par +212
  if (n.startsWith('0')) {
    n = '+212' + n.substring(1);
  }

  // Si commence par 212 sans + → ajouter +
  if (n.startsWith('212') && !n.startsWith('+')) {
    n = '+' + n;
  }

  return n;
};

/**
 * Envoyer un SMS de vérification via Twilio
 * @param {string} numero - numéro destinataire (06/07 ou +212...)
 * @param {string} code   - OTP 6 chiffres
 */
const envoyerSMS = async (numero, code) => {
  try {
    const client          = getClient();
    const numeroFormate   = formaterNumero(numero);

    console.log(`📱 Envoi SMS OTP → ${numeroFormate}`);

    const message = await client.messages.create({
      body: `[OCP Consignation]\nVotre code de vérification : ${code}\nValable 10 minutes.\nNe partagez jamais ce code.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   numeroFormate,
    });

    console.log(`✅ SMS envoyé — SID: ${message.sid}`);
    return { success: true, sid: message.sid, numeroFormate };

  } catch (err) {
    console.error('❌ Erreur SMS Twilio:', err.message);

    // Messages d'erreur lisibles
    let messageErreur = 'Impossible d\'envoyer le SMS';
    if (err.code === 21211) messageErreur = 'Numéro de téléphone invalide';
    if (err.code === 21608) messageErreur = 'Ce numéro n\'est pas vérifié (compte Trial Twilio)';
    if (err.code === 20003) messageErreur = 'Clés Twilio incorrectes';
    if (err.code === 21614) messageErreur = 'Numéro non compatible SMS';

    return { success: false, erreur: messageErreur, code: err.code };
  }
};

module.exports = { genererCode, envoyerSMS, formaterNumero };