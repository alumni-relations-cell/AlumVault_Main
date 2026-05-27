const { MASKING_RULES } = require('../constants/maskingRules');
const { decrypt } = require('../services/encryption.service');
const logger = require('../utils/logger');

/**
 * Data masking middleware — decrypts AES-256-GCM encrypted contact fields
 * then applies role-based masking before sending the response.
 */
const maskData = (req, res, next) => {
  const originalJson = res.json;
  const userRole = req.user ? req.user.role : 'team_member';
  const rules = MASKING_RULES[userRole];

  res.json = function (data) {
    if (data) {
      try {
        if (Array.isArray(data)) {
          data = data.map(item => processItem(item, rules, userRole));
        } else if (typeof data === 'object') {
          if (data.data && Array.isArray(data.data)) {
            data.data = data.data.map(item => processItem(item, rules, userRole));
          } else {
            data = processItem(data, rules, userRole);
          }
        }
      } catch (err) {
        logger.error({ error: err.message }, 'Data masking error');
      }
    }
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Process a single item: decrypt encrypted fields, then apply masking rules.
 */
function processItem(item, rules, role) {
  if (!item || typeof item !== 'object') return item;

  const processed = { ...item };

  // Decrypt and mask JSONB contact arrays (emails, phones)
  if (processed.emails) {
    processed.emails = processContactArray(processed.emails, 'email', rules, role);
  }
  if (processed.phones) {
    processed.phones = processContactArray(processed.phones, 'phone', rules, role);
  }

  // Apply simple field masking rules
  if (rules && Object.keys(rules).length > 0) {
    for (const [field, maskFn] of Object.entries(rules)) {
      if (processed[field] !== undefined && processed[field] !== null) {
        processed[field] = maskFn(processed[field]);
      }
    }
  }

  return processed;
}

/**
 * Process a JSONB contact array — decrypt values and apply masking.
 */
function processContactArray(contacts, type, rules, role) {
  if (!contacts) return contacts;

  let parsed = contacts;
  if (typeof contacts === 'string') {
    try { parsed = JSON.parse(contacts); } catch { return contacts; }
  }

  if (!Array.isArray(parsed)) return contacts;

  return parsed.map(entry => {
    const processed = { ...entry };

    // Attempt decryption of the value field
    if (processed.value && processed.value.includes(':')) {
      try {
        processed.value = decrypt(processed.value);
      } catch {
        // Value may not be encrypted (development mode)
      }
    }

    // Apply masking based on role
    const maskFn = rules?.[type];
    if (maskFn && processed.value) {
      processed.value = maskFn(processed.value);
    }

    return processed;
  });
}

module.exports = maskData;
