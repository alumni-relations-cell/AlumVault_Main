// Source tier definitions with base confidence values and decay rules.
module.exports = {
  TIERS: {
    COLLEGE_OFFICIAL: { id: 1, name: 'College Official Records', baseConfidence: 95, decayRate: 0 },
    ALUMNI_PORTAL:    { id: 2, name: 'Alumni Portal Self-Reported', baseConfidence: 82, decayRate: 3 },
    MANUALLY_MINED:   { id: 3, name: 'Manually Mined (Apollo)', baseConfidence: 70, decayRate: 0 },
    AUTO_MINED:       { id: 4, name: 'Auto-mined Pipeline', baseConfidence: 58, decayRate: 0 },
    CROWDSOURCED:     { id: 5, name: 'Crowdsourced / Unverified', baseConfidence: 40, decayRate: 0 },
  },

  /**
   * Get the base confidence for a given tier.
   */
  getBaseConfidence(tierId) {
    const tier = Object.values(this.TIERS).find(t => t.id === tierId);
    return tier ? tier.baseConfidence : 50;
  },

  /**
   * List of all tier IDs (for validation).
   */
  TIER_IDS: [1, 2, 3, 4, 5],

  /**
   * SMTP status confidence adjustments.
   */
  SMTP_ADJUSTMENTS: {
    valid: 40,      // +40 pts (capped at 95)
    catch_all: 15,  // +15 pts
    invalid: -20,   // flag for GMass re-mine
    timeout: 0,     // no change
  },
};
