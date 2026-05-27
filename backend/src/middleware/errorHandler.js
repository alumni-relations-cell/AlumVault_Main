const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error({ error: err.message, stack: err.stack, path: req.path, method: req.method }, 'Unhandled error');
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

module.exports = errorHandler;
