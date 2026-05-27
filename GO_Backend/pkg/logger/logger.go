// Package logger provides structured logging using zerolog for all Go services.
package logger

import (
	"os"
	"strings"
	"time"
	"github.com/rs/zerolog"
)

// NewLogger creates a new zerolog.Logger with the specified level.
// Valid levels: "debug", "info", "warn", "error", "fatal"
func NewLogger(level string) zerolog.Logger {
	var l zerolog.Level
	switch strings.ToLower(level) {
	case "debug":
		l = zerolog.DebugLevel
	case "warn":
		l = zerolog.WarnLevel
	case "error":
		l = zerolog.ErrorLevel
	case "fatal":
		l = zerolog.FatalLevel
	default:
		l = zerolog.InfoLevel
	}

	return zerolog.New(zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
	}).Level(l).With().Timestamp().Caller().Logger()
}

// Default returns a default info-level logger.
func Default() zerolog.Logger {
	level := os.Getenv("LOG_LEVEL")
	if level == "" {
		level = "info"
	}
	return NewLogger(level)
}
