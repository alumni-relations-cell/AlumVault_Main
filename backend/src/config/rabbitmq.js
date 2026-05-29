const amqp = require('amqplib');
const { signMessage } = require('../utils/hmac');
const logger = require('../utils/logger');

let connection = null;
let channel = null;
let connecting = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672';

/**
 * Connect to RabbitMQ and declare the alumni exchange.
 */
async function connect() {
  if (connecting) return connecting;
  connecting = (async () => {
    while (!channel) {
      try {
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertExchange('alumni.exchange', 'topic', { durable: true });

        connection.on('error', (err) => {
          logger.error({ error: err.message }, 'RabbitMQ connection error');
        });

        connection.on('close', () => {
          logger.warn('RabbitMQ connection closed, will reconnect on next publish');
          connection = null;
          channel = null;
        });

        logger.info('Connected to RabbitMQ');
      } catch (err) {
        logger.error({ error: err.message }, 'Failed to connect to RabbitMQ, retrying in 5s...');
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
  try {
    await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Publish a message to the alumni exchange with HMAC signing.
 */
async function publishToQueue(routingKey, message) {
  if (!channel) {
    await connect();
  }

  const body = JSON.stringify(message);
  const signature = signMessage(body);

  const ok = channel.publish('alumni.exchange', routingKey, Buffer.from(body), {
    persistent: true,
    contentType: 'application/json',
    headers: {
      'x-signature': signature,
      'x-timestamp': Math.floor(Date.now() / 1000),
    },
  });

  if (!ok) {
    await new Promise((resolve) => channel.once('drain', resolve));
  }

  logger.debug({ routingKey }, 'Message published to RabbitMQ');
}

/**
 * Get the channel for direct use.
 */
function getChannel() {
  return channel;
}

/**
 * Close the connection gracefully.
 */
async function close() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (err) {
    logger.error({ error: err.message }, 'Error closing RabbitMQ connection');
  }
}

// Auto-connect on module load
connect();

module.exports = { connect, publishToQueue, getChannel, close };
