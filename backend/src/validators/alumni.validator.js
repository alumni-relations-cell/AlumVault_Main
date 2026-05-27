const Joi = require('joi');

const searchSchema = Joi.object({
  q: Joi.string().allow('').optional(),
  batch_year: Joi.number().integer().min(1960).max(2030).optional(),
  branch: Joi.string().max(100).optional(),
  company: Joi.string().max(255).optional(),
  tag: Joi.string().max(50).optional(),
  is_verified: Joi.boolean().optional(),
  min_completeness: Joi.number().min(0).max(100).optional(),
  limit: Joi.number().integer().min(1).max(100).default(25),
  cursor: Joi.string().uuid().optional(),
  direction: Joi.string().valid('next', 'prev').default('next'),
});

const updateAlumniSchema = Joi.object({
  full_name: Joi.string().max(255).optional(),
  enrollment_no: Joi.string().max(50).optional(),
  batch_year: Joi.number().integer().min(1960).max(2030).optional(),
  branch: Joi.string().max(100).optional(),
  degree: Joi.string().max(50).optional(),
  current_company: Joi.string().max(255).optional(),
  current_title: Joi.string().max(255).optional(),
  industry: Joi.string().max(100).optional(),
  linkedin_url: Joi.string().uri().max(500).optional(),
  current_city: Joi.string().max(100).optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
  emails: Joi.array().items(Joi.object({
    value: Joi.string().email().required(),
    type: Joi.string().valid('personal', 'work', 'edu').default('work'),
  })).optional(),
  phones: Joi.array().items(Joi.object({
    value: Joi.string().pattern(/^\+?[\d\s\-]{6,15}$/).required(),
    type: Joi.string().valid('mobile', 'work', 'home').default('mobile'),
  })).optional(),
}).min(1);

const alumniIdParam = Joi.object({
  id: Joi.string().uuid().required(),
});

module.exports = { searchSchema, updateAlumniSchema, alumniIdParam };
