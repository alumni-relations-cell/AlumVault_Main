const logger = require('../utils/logger');

// Track connected clients by user ID
const clients = new Map();

/**
 * Handle a new WebSocket connection.
 */
function handleConnection(ws, request) {
  const user = request.user;
  if (!user) {
    ws.close(4001, 'Unauthenticated');
    return;
  }

  // Store client
  if (!clients.has(user.id)) {
    clients.set(user.id, new Set());
  }
  clients.get(user.id).add(ws);

  logger.info({ userId: user.id, email: user.email }, 'WebSocket client connected');

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, user, message);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    const userClients = clients.get(user.id);
    if (userClients) {
      userClients.delete(ws);
      if (userClients.size === 0) {
        clients.delete(user.id);
      }
    }
    logger.info({ userId: user.id }, 'WebSocket client disconnected');
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: `Welcome, ${user.name}`,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Handle incoming WebSocket messages.
 */
function handleMessage(ws, user, message) {
  switch (message.type) {
    case 'subscribe':
      // Subscribe to specific import job updates
      ws.subscribedJob = message.jobId;
      ws.send(JSON.stringify({ type: 'subscribed', jobId: message.jobId }));
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }));
  }
}

/**
 * Broadcast an event to a specific user's connected clients.
 */
function broadcastToUser(userId, event) {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const data = JSON.stringify(event);
  for (const ws of userClients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  }
}

/**
 * Broadcast an event to all connected clients.
 */
function broadcastAll(event) {
  const data = JSON.stringify(event);
  for (const [, userClients] of clients) {
    for (const ws of userClients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
}

/**
 * Notify import progress updates.
 */
function notifyImportProgress(userId, jobId, progress) {
  broadcastToUser(userId, {
    type: 'import.progress',
    jobId,
    ...progress,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Notify new review items.
 */
function notifyNewReview(reviewData) {
  broadcastAll({
    type: 'review.created',
    ...reviewData,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  handleConnection,
  broadcastToUser,
  broadcastAll,
  notifyImportProgress,
  notifyNewReview,
};
