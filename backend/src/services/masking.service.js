const { MASKING_RULES } = require('../constants/maskingRules');
const { decrypt } = require('./encryption.service');

class MaskingService {
  maskRecord(record, role) {
    if (!record || typeof record !== 'object') return record;

    const masked = { ...record };
    const rules = MASKING_RULES[role] || MASKING_RULES.team_member;

    if (masked.emails) {
      masked.emails = this._processContacts(masked.emails, rules.email, role);
    }
    if (masked.phones) {
      masked.phones = this._processContacts(masked.phones, rules.phone, role);
    }

    for (const [field, fn] of Object.entries(rules)) {
      if (field === 'email' || field === 'phone') continue; 
      if (masked[field] !== undefined && typeof fn === 'function') {
        masked[field] = fn(masked[field]);
      }
    }

    if (role === 'team_member') {
      delete masked.linkedin_url;
    }

    return masked;
  }

  maskRecords(records, role) {
    return records.map(r => this.maskRecord(r, role));
  }

  _processContacts(contacts, maskFn, role) {
    if (!contacts) return contacts;
    let parsed = typeof contacts === 'string' ? JSON.parse(contacts) : contacts;
    if (!Array.isArray(parsed)) return contacts;

    // Fast path: skip decryption completely for team_member and return dots natively
    if (role === 'team_member' || !maskFn) {
       return parsed.map(entry => ({ value: '●●●●●●●●', type: entry.type }));
    }

    return parsed.map(entry => {
      const processed = { ...entry };
      if (processed.value && processed.value.includes(':')) {
        try { processed.value = decrypt(processed.value); } catch {}
      }
      if (maskFn && processed.value) {
        processed.value = maskFn(processed.value);
      }
      return processed;
    });
  }
}

module.exports = new MaskingService();
