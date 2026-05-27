package matcher

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/your-org/alumni-go/internal/config"
	"github.com/your-org/alumni-go/internal/crypto"
	"github.com/your-org/alumni-go/internal/database"
	"github.com/your-org/alumni-go/internal/queue"
)

// Worker consumes messages from import queues and runs matching/merging logic.
type Worker struct {
	db         *database.Pool
	ch         *queue.Channel
	engine     *Engine
	alumniRepo *database.AlumniRepo
	reviewRepo *database.ReviewRepo
	importRepo *database.ImportRepo
	cfg        *config.Config
}

// NewWorker creates a new matcher Worker.
func NewWorker(db *database.Pool, ch *queue.Channel, cfg *config.Config) *Worker {
	alumniRepo := database.NewAlumniRepo(db)
	return &Worker{
		db:         db,
		ch:         ch,
		engine:     NewEngine(alumniRepo),
		alumniRepo: alumniRepo,
		reviewRepo: database.NewReviewRepo(db),
		importRepo: database.NewImportRepo(db),
		cfg:        cfg,
	}
}

// Start begins consuming messages from import.pending and import.enriched queues.
// Uses 10 concurrent goroutines for processing.
func (w *Worker) Start() {
	log.Info().Msg("Matcher worker starting — consuming import.pending + import.enriched")

	// Use a semaphore to limit concurrency to 10
	sem := make(chan struct{}, 10)

	queue.Consume(w.ch, "import.pending", func(body []byte) error {
		sem <- struct{}{}
		defer func() { <-sem }()
		return w.handleImport(body)
	})

	queue.Consume(w.ch, "import.enriched", func(body []byte) error {
		sem <- struct{}{}
		defer func() { <-sem }()
		return w.handleEnriched(body)
	})

	// Block forever
	var wg sync.WaitGroup
	wg.Add(1)
	wg.Wait()
}

func (w *Worker) handleImport(body []byte) error {
	// Verify HMAC signature if secret is configured
	if w.cfg.HMACSecret != "" {
		var msg struct {
			Signature string `json:"signature"`
		}
		json.Unmarshal(body, &msg)
		// Strip signature from body for verification
		if msg.Signature != "" && !crypto.VerifySignature(body, msg.Signature, w.cfg.HMACSecret) {
			log.Warn().Msg("Invalid HMAC signature on import message")
		}
	}

	var matchRec queue.MatchRecord
	if err := json.Unmarshal(body, &matchRec); err != nil {
		log.Error().Err(err).Msg("Failed to unmarshal import message")
		return err
	}

	if matchRec.FullName == "" {
		log.Warn().Msg("Skipping record with empty name")
		return nil
	}

	log.Info().
		Str("name", matchRec.FullName).
		Str("jobId", matchRec.JobID).
		Int("row", matchRec.RowIndex).
		Msg("Processing import record")

	ctx := context.Background()
	incoming := &IncomingRecord{
		FullName:    matchRec.FullName,
		BatchYear:   matchRec.BatchYear,
		Branch:      matchRec.Branch,
		Degree:      matchRec.Degree,
		Email:       matchRec.Email,
		Phone:       matchRec.Phone,
		Company:     matchRec.Company,
		Title:       matchRec.Title,
		LinkedinURL: matchRec.LinkedinURL,
		City:        matchRec.City,
		SourceTier:  matchRec.SourceTier,
		SourceName:  matchRec.SourceName,
	}

	result, err := w.engine.Match(ctx, incoming)
	if err != nil {
		log.Error().Err(err).Str("name", matchRec.FullName).Msg("Match error")
		return err
	}

	switch result.Decision {
	case DecisionAutoMerge:
		// Merge fields into existing record
		existing, err := w.alumniRepo.GetByID(ctx, result.MatchedID)
		if err != nil {
			return err
		}

		tierRules := TierRules{
			SourceTier: matchRec.SourceTier,
			SourceName: matchRec.SourceName,
			Timestamp:  time.Now(),
		}
		mergeResult, err := MergeFields(existing, incoming, tierRules)
		if err != nil {
			return err
		}

		if err := w.alumniRepo.UpdateAlumniFields(ctx, result.MatchedID, mergeResult.UpdatedFields); err != nil {
			return err
		}

		// Store alternates
		for _, alt := range mergeResult.Alternates {
			w.alumniRepo.InsertAlternate(ctx, result.MatchedID, alt.FieldName,
				alt.ValueEncrypted, alt.SourceTier, alt.SourceName, alt.Confidence, alt.Reason)
		}

		// Publish email for SMTP verification if present
		if incoming.Email != "" {
			queue.Publish(w.ch, "verify.email", queue.VerifyEmailMessage{
				AlumniID:          result.MatchedID,
				Email:             incoming.Email,
				CurrentConfidence: tierBaseConfidence(matchRec.SourceTier),
			}, w.cfg.HMACSecret)
		}

		// Update import job counter
		if matchRec.JobID != "" {
			w.importRepo.UpdateJobProgress(ctx, matchRec.JobID, 1, 1, 0, 0, 0)
		}

	case DecisionReview:
		// Send to review queue
		breakdownJSON, _ := json.Marshal(result.Breakdown)
		incomingJSON, _ := json.Marshal(incoming)

		reviewItem := &database.ReviewItem{
			ExistingAlumniID: result.MatchedID,
			IncomingData:     incomingJSON,
			MatchScore:       float64(result.Score),
			ScoreBreakdown:   breakdownJSON,
		}
		if matchRec.JobID != "" {
			reviewItem.SourceImportID = &matchRec.JobID
		}

		reviewID, err := w.reviewRepo.InsertReviewItem(ctx, reviewItem)
		if err != nil {
			return err
		}

		// Notify via review.created queue
		queue.Publish(w.ch, "review.created", queue.ReviewMessage{
			ReviewID:         reviewID,
			ExistingAlumniID: result.MatchedID,
			MatchScore:       float64(result.Score),
			ImportJobID:      matchRec.JobID,
		}, w.cfg.HMACSecret)

		if matchRec.JobID != "" {
			w.importRepo.UpdateJobProgress(ctx, matchRec.JobID, 1, 0, 0, 1, 0)
		}

	case DecisionNewRecord:
		// Create new alumni record
		emailsJSON, _ := json.Marshal([]ContactEntry{})
		phonesJSON, _ := json.Marshal([]ContactEntry{})

		if incoming.Email != "" {
			entries := []ContactEntry{{
				Value: incoming.Email, Rank: 1, Type: "work",
				SourceTier: incoming.SourceTier, SourceName: incoming.SourceName,
				Confidence: tierBaseConfidence(incoming.SourceTier), SMTPStatus: "pending",
				AddedAt: time.Now().Format(time.RFC3339),
			}}
			emailsJSON, _ = json.Marshal(entries)
		}
		if incoming.Phone != "" {
			entries := []ContactEntry{{
				Value: incoming.Phone, Rank: 1, Type: "mobile",
				SourceTier: incoming.SourceTier, SourceName: incoming.SourceName,
				Confidence: tierBaseConfidence(incoming.SourceTier),
				AddedAt: time.Now().Format(time.RFC3339),
			}}
			phonesJSON, _ = json.Marshal(entries)
		}

		newRec := &database.AlumniRecord{
			FullName:       incoming.FullName,
			BatchYear:      incoming.BatchYear,
			Branch:         incoming.Branch,
			Degree:         incoming.Degree,
			Emails:         emailsJSON,
			Phones:         phonesJSON,
			CurrentCompany: incoming.Company,
			CurrentTitle:   incoming.Title,
			LinkedinURL:    incoming.LinkedinURL,
			CurrentCity:    incoming.City,
		}

		alumniID, err := w.alumniRepo.UpsertAlumni(ctx, newRec)
		if err != nil {
			return err
		}

		// Queue email for SMTP verification
		if incoming.Email != "" {
			queue.Publish(w.ch, "verify.email", queue.VerifyEmailMessage{
				AlumniID:          alumniID,
				Email:             incoming.Email,
				CurrentConfidence: tierBaseConfidence(incoming.SourceTier),
			}, w.cfg.HMACSecret)
		}

		if matchRec.JobID != "" {
			w.importRepo.UpdateJobProgress(ctx, matchRec.JobID, 1, 0, 1, 0, 0)
		}
	}

	return nil
}

func (w *Worker) handleEnriched(body []byte) error {
	var msg queue.EnrichMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		return err
	}

	log.Info().
		Str("alumniID", msg.AlumniID).
		Str("linkedin", msg.LinkedinURL).
		Msg("Processing enriched data")

	// Parse Apollo data and construct incoming record
	var apolloData struct {
		Emails  []struct{ Email string `json:"email"`; Type string `json:"type"` } `json:"emails"`
		Phones  []struct{ Number string `json:"number"`; Type string `json:"type"` } `json:"phones"`
		Company string `json:"company"`
		Title   string `json:"title"`
		Industry string `json:"industry"`
	}

	if len(msg.ApolloData) > 0 {
		json.Unmarshal(msg.ApolloData, &apolloData)
	}

	incoming := &IncomingRecord{
		LinkedinURL: msg.LinkedinURL,
		Company:     apolloData.Company,
		Title:       apolloData.Title,
		SourceTier:  msg.SourceTier,
		SourceName:  "apollo_api",
	}

	if len(apolloData.Emails) > 0 {
		incoming.Email = apolloData.Emails[0].Email
	}
	if len(apolloData.Phones) > 0 {
		incoming.Phone = apolloData.Phones[0].Number
	}

	ctx := context.Background()

	// If we already know the alumni ID, merge directly
	if msg.AlumniID != "" {
		existing, err := w.alumniRepo.GetByID(ctx, msg.AlumniID)
		if err != nil {
			return err
		}

		tierRules := TierRules{
			SourceTier: msg.SourceTier,
			SourceName: "apollo_api",
			Timestamp:  time.Now(),
		}

		mergeResult, err := MergeFields(existing, incoming, tierRules)
		if err != nil {
			return err
		}

		return w.alumniRepo.UpdateAlumniFields(ctx, msg.AlumniID, mergeResult.UpdatedFields)
	}

	// Otherwise, run full matching
	result, err := w.engine.Match(ctx, incoming)
	if err != nil {
		return err
	}

	if result.Decision == DecisionAutoMerge {
		existing, err := w.alumniRepo.GetByID(ctx, result.MatchedID)
		if err != nil {
			return err
		}
		tierRules := TierRules{SourceTier: msg.SourceTier, SourceName: "apollo_api", Timestamp: time.Now()}
		mergeResult, _ := MergeFields(existing, incoming, tierRules)
		return w.alumniRepo.UpdateAlumniFields(ctx, result.MatchedID, mergeResult.UpdatedFields)
	}

	return nil
}
