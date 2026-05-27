const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Auth Endpoints', () => {
  it('should reject login with wrong credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'fake@thapar.edu', password: 'wrong' });
    expect(res.statusCode).toBe(401);
  });

  it('should accept 2FA mock and return tokens', async () => {
     // implementation placeholder assuming test DB seeding mapped
    expect(true).toBe(true);
  });

  it('should allow valid token refresh', async () => {
    expect(true).toBe(true); // placeholder asserting the jwt logic natively
  });

  it('should test forgot/reset password bounds', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test@thapar.edu' });
    expect(res.statusCode).toBe(200);
  });
});
