const amqp = require('amqplib');
const { signMessage } = require('../utils/hmac');
const logger = require('../utils/logger');

let connection = null;
let channel = null;
let retryCount = 0;
const MAX_RETRIES = process.env.NODE_ENV === 'development' ? 3 : Infinity;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672';

/**
 * Connect to RabbitMQ and declare the alumni exchange.
 */
async function connect() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    retryCount = 0;

    await channel.assertExchange('alumni.exchange', 'topic', { durable: true });

    connection.on('error', (err) => {
      logger.error({ error: err.message }, 'RabbitMQ connection error');
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed, attempting reconnect...');
      setTimeout(connect, 5000);
    });

    logger.info('Connected to RabbitMQ');
  } catch (err) {
    retryCount++;
    if (retryCount >= MAX_RETRIES) {
      logger.warn('RabbitMQ unavailable — messages will be logged to console in dev mode');
      return;
    }
    logger.error({ error: err.message }, 'Failed to connect to RabbitMQ, retrying in 5s...');
    setTimeout(connect, 5000);
  }
}

/**
 * Publish a message to the alumni exchange with HMAC signing.
 */
async function publishToQueue(routingKey, message) {
  if (!channel) {
    if (process.env.NODE_ENV === 'development') {
      logger.info({ routingKey, message }, '[DEV] RabbitMQ not connected — message logged');
    } else {
      logger.warn('RabbitMQ channel not available, message dropped');
    }
    return;
  }

  const body = JSON.stringify(message);
  const signature = signMessage(body);

  channel.publish('alumni.exchange', routingKey, Buffer.from(body), {
    persistent: true,
    contentType: 'application/json',
    headers: {
      'x-signature': signature,
      'x-timestamp': Math.floor(Date.now() / 1000),
    },
  });

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
