const Joi = require('joi');

const createCampaignSchema = Joi.object({
  name: Joi.string().max(255).required(),
  type: Joi.string().valid('email', 'sms', 'whatsapp').required(),
  audience_filter: Joi.object({
    batch_year: Joi.array().items(Joi.number().integer()).optional(),
    branch: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    min_completeness: Joi.number().min(0).max(100).optional(),
    is_verified: Joi.boolean().optional(),
  }).required(),
  template_body: Joi.string().required(),
  template_subject: Joi.string().max(255).optional(),
  scheduled_at: Joi.date().iso().optional(),
});

const updateCampaignSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  template_body: Joi.string().optional(),
  template_subject: Joi.string().max(255).optional(),
  scheduled_at: Joi.date().iso().optional(),
  status: Joi.string().valid('draft', 'scheduled', 'cancelled').optional(),
}).min(1);

module.exports = { createCampaignSchema, updateCampaignSchema };
