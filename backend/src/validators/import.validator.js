const Joi = require('joi');

const uploadSchema = Joi.object({
  source_type: Joi.string().valid('csv', 'xlsx', 'tsv').required(),
  source_tier: Joi.number().integer().min(1).max(5).required(),
  source_name: Joi.string().max(255).required(),
  column_mapping: Joi.object().pattern(
    Joi.string(),
    Joi.string().valid(
      'full_name', 'enrollment_no', 'batch_year', 'branch', 'degree',
      'email', 'phone', 'current_company', 'current_title',
      'industry', 'linkedin_url', 'current_city', 'dob'
    )
  ).optional(),
});

const columnMappingSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  mapping: Joi.object().pattern(Joi.string(), Joi.string()).required(),
});

module.exports = { uploadSchema, columnMappingSchema };
