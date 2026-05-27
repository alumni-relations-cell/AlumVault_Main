package config

import (
	"os"

	"github.com/joho/godotenv"
)

// Config holds all configuration values loaded from environment variables.
type Config struct {
	DatabaseURL    string
	RabbitMQURL    string
	RedisURL       string
	HMACSecret     string
	EncryptionKey  string
	BlindIndexKey  string
	LogLevel       string
	ServiceName    string
}

// Load reads environment variables (with .env fallback) and returns a Config.
func Load() *Config {
	// Attempt to load .env file; ignore error if not found
	_ = godotenv.Load()

	return &Config{
		DatabaseURL:   getEnv("DATABASE_URL", "postgresql://api_user:password@localhost:5432/alumni_portal"),
		RabbitMQURL:   getEnv("RABBITMQ_URL", "amqp://user:password@localhost:5672/"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		HMACSecret:    getEnv("INTERNAL_HMAC_SECRET", ""),
		EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
		BlindIndexKey: getEnv("BLIND_INDEX_KEY", ""),
		LogLevel:      getEnv("LOG_LEVEL", "info"),
		ServiceName:   getEnv("SERVICE_NAME", "alumni-go"),
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
