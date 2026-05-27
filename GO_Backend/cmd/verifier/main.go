package main

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/your-org/alumni-go/internal/config"
	"github.com/your-org/alumni-go/internal/database"
	"github.com/your-org/alumni-go/internal/queue"
	"github.com/your-org/alumni-go/internal/verifier"
	"github.com/your-org/alumni-go/pkg/logger"
)

func main() {
	log := logger.Default()
	log.Info().Msg("Starting SMTP verification worker...")

	cfg := config.Load()

	db, err := database.NewPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	ch, err := queue.Connect(cfg.RabbitMQURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to RabbitMQ")
	}
	defer ch.Close()

	worker := verifier.NewWorker(db, ch, cfg)

	log.Info().Msg("Verifier started, waiting for jobs...")
	go worker.Start()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info().Msg("Shutting down verifier...")
}
