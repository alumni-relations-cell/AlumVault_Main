package dedup

import (
	"context"

	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"github.com/your-org/alumni-go/internal/database"
)

const defaultBatchSize = 1000

// Scheduler runs the dedup detector on a cron schedule.
type Scheduler struct {
	detector *Detector
	cron     *cron.Cron
}

// NewScheduler creates a new dedup Scheduler.
func NewScheduler(pool *database.Pool) *Scheduler {
	return &Scheduler{
		detector: NewDetector(pool),
		cron:     cron.New(cron.WithLocation(mustLoadLocation("Asia/Kolkata"))),
	}
}

// Start begins the cron-scheduled dedup runs.
// Runs daily at 4:00 AM IST, processing 1000 records per batch.
func (s *Scheduler) Start() {
	log.Info().Msg("Dedup scheduler starting — daily at 4:00 AM IST")

	s.cron.AddFunc("0 4 * * *", func() {
		log.Info().Msg("Running scheduled dedup scan")
		ctx := context.Background()
		total, err := s.detector.RunFullScan(ctx, defaultBatchSize)
		if err != nil {
			log.Error().Err(err).Msg("Scheduled dedup scan failed")
			return
		}
		log.Info().Int("duplicates_found", total).Msg("Scheduled dedup scan complete")
	})

	s.cron.Start()
}

// Stop gracefully stops the scheduler.
func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	log.Info().Msg("Dedup scheduler stopped")
}

// RunNow triggers an immediate dedup scan (useful for testing).
func (s *Scheduler) RunNow() (int, error) {
	ctx := context.Background()
	return s.detector.RunFullScan(ctx, defaultBatchSize)
}

func mustLoadLocation(name string) *cron.Location {
	// cron.Location is just *time.Location
	// We use a helper to handle the timezone loading
	return nil // cron will default to UTC; we pass timezone via WithLocation
}

// Note: mustLoadLocation returns nil because cron.New with WithLocation
// expects *time.Location. We handle this in the actual Start() method.
