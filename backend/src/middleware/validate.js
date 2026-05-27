const logger = require('../utils/logger');

/**
 * Joi validation middleware.
 * @param {Object} schema - Joi schema to validate against.
 * @param {string} source - 'body' or 'query' (default: 'body').
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      logger.warn({ path: req.path, errors }, 'Validation failed');

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    // Replace with validated + sanitized data
    if (source === 'query') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

module.exports = validate;
