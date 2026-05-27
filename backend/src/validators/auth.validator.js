const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(255).required(),
  role: Joi.string().valid('admin', 'team_lead', 'team_member').required(),
  team_lead_id: Joi.string().uuid().optional(),
});

const verify2FASchema = Joi.object({
  temp_token: Joi.string().required(),
  totp_code: Joi.string().length(6).pattern(/^[0-9]+$/).required(),
});

const resetPasswordSchema = Joi.object({
  current_password: Joi.string().required(),
  new_password: Joi.string().min(8).required(),
});

const refreshSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

module.exports = { loginSchema, registerSchema, verify2FASchema, resetPasswordSchema, refreshSchema };
