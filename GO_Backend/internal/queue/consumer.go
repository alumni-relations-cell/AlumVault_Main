package queue

import (
	"github.com/rs/zerolog/log"
	amqp "github.com/rabbitmq/amqp091-go"
)

// MessageHandler is a function that processes a raw message body.
// Return nil to ACK, return error to NACK (with requeue).
type MessageHandler func(body []byte) error

// Consume starts consuming messages from the named queue.
// Messages are dispatched to the handler. Failed messages are NACKed with requeue.
// This function is non-blocking — it starts a goroutine for message processing.
func Consume(c *Channel, queueName string, handler MessageHandler) {
	ch := c.GetChannel()

	q, err := ch.QueueDeclare(
		queueName,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		amqp.Table{
			"x-dead-letter-exchange":    "alumni.dlx",
			"x-dead-letter-routing-key": "dlq." + queueName,
		},
	)
	if err != nil {
		log.Fatal().Err(err).Str("queue", queueName).Msg("Failed to declare queue")
	}

	// Bind queue to exchange
	if err := ch.QueueBind(q.Name, queueName, "alumni.exchange", false, nil); err != nil {
		log.Fatal().Err(err).Str("queue", queueName).Msg("Failed to bind queue")
	}

	msgs, err := ch.Consume(
		q.Name,
		"",    // consumer tag (auto-generated)
		false, // auto-ack
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatal().Err(err).Str("queue", queueName).Msg("Failed to register consumer")
	}

	go func() {
		for d := range msgs {
			logger := log.With().
				Str("queue", queueName).
				Str("messageId", d.MessageId).
				Logger()

			if err := handler(d.Body); err != nil {
				attempts := getAttemptCount(d.Headers) + 1
				if attempts >= 3 {
					logger.Error().Err(err).Int("attempts", attempts).Msg("Max attempts reached, sending to DLQ")
					d.Reject(false)
					continue
				}
				logger.Warn().Err(err).Int("attempts", attempts).Msg("Error processing message, republishing for retry")
				headers := d.Headers
				if headers == nil {
					headers = amqp.Table{}
				}
				headers["x-attempts"] = int32(attempts)
				_ = ch.Publish("alumni.exchange", queueName, false, false, amqp.Publishing{
					ContentType:  d.ContentType,
					Body:         d.Body,
					DeliveryMode: amqp.Persistent,
					Headers:      headers,
				})
				d.Ack(false)
			} else {
				d.Ack(false)
			}
		}
	}()

	log.Info().Str("queue", queueName).Msg("Consumer started")
}

// getAttemptCount reads the x-attempts header set on prior republishes.
func getAttemptCount(headers amqp.Table) int {
	if headers == nil {
		return 0
	}
	v, ok := headers["x-attempts"]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case int32:
		return int(n)
	case int64:
		return int(n)
	case int:
		return n
	}
	return 0
}
