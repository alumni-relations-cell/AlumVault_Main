/**
 * Data masking rules per role strictly mapped.
 * super_admin: Everything unmasked and decrypted.
 * admin: Full email. Phones +91-XXXXXX-{last4}.
 * team_lead: Emails masked. Phones fully hidden.
 * team_member: Generic data only. No emails, no phones, no linkedins.
 */

function maskEmailPartial(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 3) return `***@${domain}`;
  return `${localPart.slice(0, 3)}***@${domain}`;
}

function maskPhonePartial(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const digitsOnly = phone.replace(/[^\d+]/g, '');
  if (digitsOnly.length <= 4) return '+91-XXXXXX-XXXX';
  return `+91-XXXXXX-${digitsOnly.slice(-4)}`;
}

function maskFull(value) {
  return '●●●●●●●●';
}

function dropUrl(value) {
  return null;
}

const MASKING_RULES = {
  super_admin: {},

  admin: {
    // Has full email, masks phone partially
    phone: maskPhonePartial,
  },

  team_lead: {
    email: maskEmailPartial,
    phone: maskFull,
  },

  team_member: {
    email: maskFull,
    phone: maskFull,
    linkedin_url: dropUrl,
    dob: maskFull,
  },
};

module.exports = { MASKING_RULES, maskEmailPartial, maskPhonePartial };
