// src/config/constants.js
module.exports = {
  ROLES: {
    AGENT_PRODUCTION: 'agent_production',
    CHEF_PROD:        'chef_prod',
    HSE:              'hse',
    ELECTRICIEN:      'electricien',
    CHEF_ELECTRICIEN: 'chef_electricien',
    CHEF_INTERVENANT: 'chef_intervenant',
    ADMIN:            'admin',
  },

  STATUT_DEMANDE: {
    EN_ATTENTE:   'en_attente',
    VALIDEE:      'validee',
    REJETEE:      'rejetee',
    EN_COURS:     'en_cours',
    DECONSIGNEE:  'deconsignee',
    CLOTUREE:     'cloturee',
  },

  STATUT_PLAN: {
    BROUILLON:     'brouillon',
    APPROUVE:      'approuve',
    EN_EXECUTION:  'en_execution',
    EXECUTE:       'execute',
    DECONSIGNE:    'deconsigne',
  },

  STATUT_POINT: {
    EN_ATTENTE: 'en_attente',
    CONSIGNE:   'consigne',
    VERIFIE:    'verifie',
    DECONSIGNE: 'deconsigne',
  },

  STATUT_AUTORISATION: {
    GENEREE:       'generee',
    EN_SIGNATURE:  'en_signature',
    SIGNEE:        'signee',
    EN_COURS:      'en_cours',
    TERMINEE:      'terminee',
  },

  POLLING_INTERVAL: 30000, // 30 secondes
};