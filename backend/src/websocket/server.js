const { Server: WebSocketServer } = require('ws');
const authenticateWS = require('./auth');
const { handleConnection } = require('./handlers');
const logger = require('../utils/logger');

/**
 * Initialize the WebSocket server attached to the HTTP server.
 */
function initWebSocket(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: (info, callback) => {
      authenticateWS(info.req, callback);
    },
  });

  wss.on('connection', (ws, request) => {
    handleConnection(ws, request);
  });

  wss.on('error', (err) => {
    logger.error({ error: err.message }, 'WebSocket server error');
  });

  logger.info('WebSocket server initialized on /ws');

  return wss;
}

module.exports = { initWebSocket };
