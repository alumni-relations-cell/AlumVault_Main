const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss' } }
    : undefined,
  base: { service: 'alumni-portal-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
