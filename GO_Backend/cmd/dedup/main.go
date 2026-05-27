package main

import (
	"os"
	"os/signal"
	"syscall"

	"github.com/your-org/alumni-go/internal/config"
	"github.com/your-org/alumni-go/internal/database"
	"github.com/your-org/alumni-go/internal/dedup"
	"github.com/your-org/alumni-go/pkg/logger"
)

func main() {
	log := logger.Default()
	log.Info().Msg("Starting deduplication worker (cron-based)...")

	cfg := config.Load()

	db, err := database.NewPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	scheduler := dedup.NewScheduler(db)

	log.Info().Msg("Dedup scheduler started, will run daily at 4:00 AM IST")
	scheduler.Start()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	scheduler.Stop()
	log.Info().Msg("Shutting down dedup scheduler...")
}
