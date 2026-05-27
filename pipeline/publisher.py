"""
Shared RabbitMQ publisher for the Python pipeline.
All pipeline scripts use this module to publish events with HMAC signing.
"""

import os
import json
import hmac
import hashlib
import time
import pika
import logging

logger = logging.getLogger(__name__)

RABBITMQ_URL = os.environ.get('RABBITMQ_URL', 'amqp://user:password@localhost:5672/')
HMAC_SECRET = os.environ.get('INTERNAL_HMAC_SECRET', '')


def _get_connection():
    """Create a new blocking connection to RabbitMQ."""
    parameters = pika.URLParameters(RABBITMQ_URL)
    parameters.heartbeat = 600
    parameters.blocked_connection_timeout = 300
    return pika.BlockingConnection(parameters)


def sign_message(body: bytes) -> str:
    """Create HMAC-SHA256 signature for a message body."""
    if not HMAC_SECRET:
        return ''
    return hmac.new(
        HMAC_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()


def publish_event(routing_key: str, payload: dict):
    """
    Publish a JSON message to alumni.exchange with HMAC signing.

    Args:
        routing_key: RabbitMQ routing key (e.g., 'import.enriched')
        payload: Dictionary to JSON-encode and publish.
    """
    body = json.dumps(payload).encode('utf-8')
    signature = sign_message(body)

    headers = {
        'x-signature': signature,
        'x-timestamp': int(time.time()),
        'x-source': 'python-pipeline',
    }

    try:
        connection = _get_connection()
        channel = connection.channel()
        channel.exchange_declare(
            exchange='alumni.exchange',
            exchange_type='topic',
            durable=True
        )
        channel.basic_publish(
            exchange='alumni.exchange',
            routing_key=routing_key,
            body=body,
            properties=pika.BasicProperties(
                delivery_mode=2,  # persistent
                content_type='application/json',
                headers=headers,
            )
        )
        connection.close()
        logger.info(f"Published to {routing_key}: {json.dumps(payload)[:100]}...")
    except Exception as e:
        logger.error(f"Failed to publish to {routing_key}: {e}")
        raise


def publish_batch(routing_key: str, payloads: list, batch_size: int = 50):
    """
    Publish multiple messages in a single connection.

    Args:
        routing_key: RabbitMQ routing key.
        payloads: List of dictionaries to publish.
        batch_size: Number of messages per connection.
    """
    try:
        connection = _get_connection()
        channel = connection.channel()
        channel.exchange_declare(
            exchange='alumni.exchange',
            exchange_type='topic',
            durable=True
        )

        for i, payload in enumerate(payloads):
            body = json.dumps(payload).encode('utf-8')
            signature = sign_message(body)

            channel.basic_publish(
                exchange='alumni.exchange',
                routing_key=routing_key,
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type='application/json',
                    headers={
                        'x-signature': signature,
                        'x-timestamp': int(time.time()),
                        'x-source': 'python-pipeline',
                    },
                )
            )

            # Reconnect every batch_size messages to avoid timeouts
            if (i + 1) % batch_size == 0:
                connection.close()
                connection = _get_connection()
                channel = connection.channel()

        connection.close()
        logger.info(f"Published {len(payloads)} messages to {routing_key}")
    except Exception as e:
        logger.error(f"Batch publish failed: {e}")
        raise
