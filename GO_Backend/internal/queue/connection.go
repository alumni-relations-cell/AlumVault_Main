package queue

import (
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	amqp "github.com/rabbitmq/amqp091-go"
)

// Channel wraps an AMQP connection and channel with auto-reconnect support.
type Channel struct {
	conn    *amqp.Connection
	ch      *amqp.Channel
	url     string
	mu      sync.RWMutex
	closed  bool
}

// Connect establishes a connection to RabbitMQ and opens a channel.
// It also declares the alumni.exchange topic exchange.
func Connect(url string) (*Channel, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open a channel: %v", err)
	}

	// Set prefetch count for fair dispatch
	if err := ch.Qos(10, 0, false); err != nil {
		return nil, fmt.Errorf("failed to set QoS: %v", err)
	}

	// Declare the main exchange
	if err := ch.ExchangeDeclare("alumni.exchange", "topic", true, false, false, false, nil); err != nil {
		return nil, fmt.Errorf("failed to declare exchange: %v", err)
	}

	c := &Channel{conn: conn, ch: ch, url: url}

	// Start reconnect monitor
	go c.reconnectMonitor()

	return c, nil
}

// Close closes the channel and connection.
func (c *Channel) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.closed = true
	if c.ch != nil {
		c.ch.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

// GetChannel returns the underlying AMQP channel (thread-safe).
func (c *Channel) GetChannel() *amqp.Channel {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.ch
}

// reconnectMonitor watches for connection closures and attempts to reconnect.
func (c *Channel) reconnectMonitor() {
	for {
		c.mu.RLock()
		if c.closed {
			c.mu.RUnlock()
			return
		}
		notifyClose := c.conn.NotifyClose(make(chan *amqp.Error, 1))
		c.mu.RUnlock()

		err := <-notifyClose
		if err == nil {
			return // graceful close
		}

		log.Warn().Err(err).Msg("RabbitMQ connection lost, attempting reconnect...")

		for i := 0; i < 30; i++ {
			time.Sleep(time.Duration(i+1) * time.Second)

			c.mu.Lock()
			if c.closed {
				c.mu.Unlock()
				return
			}

			conn, connErr := amqp.Dial(c.url)
			if connErr != nil {
				c.mu.Unlock()
				log.Warn().Int("attempt", i+1).Err(connErr).Msg("Reconnect attempt failed")
				continue
			}

			ch, chErr := conn.Channel()
			if chErr != nil {
				conn.Close()
				c.mu.Unlock()
				continue
			}

			ch.Qos(10, 0, false)
			ch.ExchangeDeclare("alumni.exchange", "topic", true, false, false, false, nil)

			c.conn = conn
			c.ch = ch
			c.mu.Unlock()

			log.Info().Msg("RabbitMQ reconnected successfully")
			break
		}
	}
}
