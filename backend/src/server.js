const app = require('./app');
const { initWebSocket } = require('./websocket/server');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, '🚀 Server started');
});

// Initialize WebSocket server
const wss = initWebSocket(server);

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info({ signal }, 'Received shutdown signal');

  // Close WebSocket connections
  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
