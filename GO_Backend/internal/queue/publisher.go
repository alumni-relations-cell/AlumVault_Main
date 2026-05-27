package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/your-org/alumni-go/internal/crypto"
)

// Publish sends a message to the alumni.exchange with the given routing key.
// The message body is JSON-encoded and HMAC-signed if a secret is provided.
func Publish(c *Channel, routingKey string, payload interface{}, hmacSecret string) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	headers := amqp.Table{
		"timestamp": time.Now().Unix(),
	}

	// Sign the message with HMAC if secret is configured
	if hmacSecret != "" {
		signature := crypto.SignMessage(body, hmacSecret)
		headers["x-signature"] = signature
	}

	ch := c.GetChannel()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = ch.PublishWithContext(ctx,
		"alumni.exchange", // exchange
		routingKey,        // routing key
		false,             // mandatory
		false,             // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now(),
			Headers:      headers,
			Body:         body,
		})
	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	log.Debug().Str("routingKey", routingKey).Int("bodyLen", len(body)).Msg("Message published")
	return nil
}

// PublishRaw sends raw bytes to the exchange with optional HMAC signing.
func PublishRaw(c *Channel, routingKey string, body []byte, hmacSecret string) error {
	headers := amqp.Table{
		"timestamp": time.Now().Unix(),
	}

	if hmacSecret != "" {
		headers["x-signature"] = crypto.SignMessage(body, hmacSecret)
	}

	ch := c.GetChannel()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return ch.PublishWithContext(ctx,
		"alumni.exchange",
		routingKey,
		false,
		false,
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent,
			Timestamp:    time.Now(),
			Headers:      headers,
			Body:         body,
		})
}
