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
				logger.Error().Err(err).Msg("Error processing message, NACKing with requeue")

				// Check retry count from headers
				retryCount := getRetryCount(d.Headers)
				if retryCount >= 3 {
					// Max retries exceeded — reject without requeue (goes to DLQ)
					logger.Warn().Int("retries", retryCount).Msg("Max retries exceeded, sending to DLQ")
					d.Reject(false)
				} else {
					d.Nack(false, true) // requeue
				}
			} else {
				d.Ack(false)
			}
		}
	}()

	log.Info().Str("queue", queueName).Msg("Consumer started")
}

// getRetryCount extracts the x-death retry count from message headers.
func getRetryCount(headers amqp.Table) int {
	if headers == nil {
		return 0
	}
	deaths, ok := headers["x-death"]
	if !ok {
		return 0
	}
	deathList, ok := deaths.([]interface{})
	if !ok || len(deathList) == 0 {
		return 0
	}
	firstDeath, ok := deathList[0].(amqp.Table)
	if !ok {
		return 0
	}
	count, ok := firstDeath["count"]
	if !ok {
		return 0
	}
	if c, ok := count.(int64); ok {
		return int(c)
	}
	return 0
}
