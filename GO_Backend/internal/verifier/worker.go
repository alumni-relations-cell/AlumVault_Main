package verifier

import (
	"context"
	"encoding/json"
	"sync"

	"github.com/rs/zerolog/log"
	"github.com/your-org/alumni-go/internal/config"
	"github.com/your-org/alumni-go/internal/database"
	"github.com/your-org/alumni-go/internal/queue"
)

// Worker consumes verify.email messages and performs SMTP verification.
type Worker struct {
	db       *database.Pool
	ch       *queue.Channel
	cfg      *config.Config
	repo     *database.AlumniRepo
	mxCache  *MXCache
	connPool *ConnectionPool
}

// NewWorker creates a new verifier Worker.
func NewWorker(db *database.Pool, ch *queue.Channel, cfg *config.Config) *Worker {
	return &Worker{
		db:       db,
		ch:       ch,
		cfg:      cfg,
		repo:     database.NewAlumniRepo(db),
		mxCache:  NewMXCache(),
		connPool: NewConnectionPool(),
	}
}

// Start begins consuming verify.email messages with 50 concurrent goroutines.
func (w *Worker) Start() {
	log.Info().Msg("Verifier worker starting — consuming verify.email (50 goroutines)")

	sem := make(chan struct{}, 50)

	queue.Consume(w.ch, "verify.email", func(body []byte) error {
		sem <- struct{}{}
		defer func() { <-sem }()
		return w.handleVerify(body)
	})

	// Block forever
	var wg sync.WaitGroup
	wg.Add(1)
	wg.Wait()
}

func (w *Worker) handleVerify(body []byte) error {
	var msg queue.VerifyEmailMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		log.Error().Err(err).Msg("Failed to unmarshal verify message")
		return err
	}

	if msg.Email == "" || msg.AlumniID == "" {
		log.Warn().Msg("Skipping verify with empty email or alumni ID")
		return nil
	}

	log.Info().
		Str("email", msg.Email).
		Str("alumniID", msg.AlumniID).
		Msg("Verifying email")

	// Perform SMTP verification
	result := VerifyEmail(msg.Email, w.mxCache, w.connPool)

	log.Info().
		Str("email", msg.Email).
		Str("status", string(result.Status)).
		Msg("Verification complete")

	// Calculate confidence adjustment
	var confidenceDelta float64
	switch result.Status {
	case StatusValid:
		confidenceDelta = 40   // +40 pts (capped at 95)
	case StatusCatchAll:
		confidenceDelta = 15   // +15 pts
	case StatusInvalid:
		confidenceDelta = -20  // flag for GMass re-mine
	case StatusTimeout:
		confidenceDelta = 0    // no change
	case StatusError:
		confidenceDelta = 0
	}

	// Update the alumni record's email confidence in DB
	ctx := context.Background()
	err := w.repo.UpdateFieldConfidence(ctx, msg.AlumniID, "emails", msg.Email,
		string(result.Status), confidenceDelta)
	if err != nil {
		log.Error().Err(err).Str("alumniID", msg.AlumniID).Msg("Failed to update confidence")
		return err
	}

	return nil
}
