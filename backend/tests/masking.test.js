const maskingService = require('../src/services/masking.service');

describe('Masking Rules Integrity', () => {
  const dummyProfile = {
    emails: [{ value: 'john.doe@gmail.com', type: 'personal' }],
    phones: [{ value: '+919988776655', type: 'mobile' }],
    linkedin_url: 'https://linkedin.com/in/johndoe',
    batch_year: 2020
  };

  it('team_member should receive fully masked/deleted fields', () => {
    const result = maskingService.maskRecord(dummyProfile, 'team_member');
    expect(result.linkedin_url).toBeUndefined();
    expect(result.emails[0].value).toBe('●●●●●●●●');
    expect(result.phones[0].value).toBe('●●●●●●●●');
  });

  it('team_lead should receive partially masked emails, fully masked phones', () => {
    const result = maskingService.maskRecord(dummyProfile, 'team_lead');
    expect(result.linkedin_url).toBeDefined();
    expect(result.emails[0].value).toBe('joh***@gmail.com');
    expect(result.phones[0].value).toBe('●●●●●●●●');
  });

  it('admin should receive full emails, patterned phones', () => {
    const result = maskingService.maskRecord(dummyProfile, 'admin');
    expect(result.emails[0].value).toBe('john.doe@gmail.com');
    expect(result.phones[0].value).toBe('+91-XXXXXX-6655');
  });

  it('super_admin should receive exact inputs securely decrypted', () => {
    const result = maskingService.maskRecord(dummyProfile, 'super_admin');
    expect(result.emails[0].value).toBe('john.doe@gmail.com');
    expect(result.phones[0].value).toBe('+919988776655');
  });
});
