package importer

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/your-org/alumni-go/internal/config"
	"github.com/your-org/alumni-go/internal/database"
	"github.com/your-org/alumni-go/internal/queue"
)

// Worker consumes import.pending messages, parses files, normalizes data,
// and feeds records to the matcher via the queue.
type Worker struct {
	db         *database.Pool
	ch         *queue.Channel
	cfg        *config.Config
	importRepo *database.ImportRepo
	alumniRepo *database.AlumniRepo
}

// NewWorker creates a new importer Worker.
func NewWorker(db *database.Pool, ch *queue.Channel, cfg *config.Config) *Worker {
	return &Worker{
		db:         db,
		ch:         ch,
		cfg:        cfg,
		importRepo: database.NewImportRepo(db),
		alumniRepo: database.NewAlumniRepo(db),
	}
}

// Start begins consuming import.pending messages with 5 concurrent goroutines.
func (w *Worker) Start() {
	log.Info().Msg("Importer worker starting — consuming import.pending")

	sem := make(chan struct{}, 5)

	queue.Consume(w.ch, "import.pending", func(body []byte) error {
		sem <- struct{}{}
		defer func() { <-sem }()
		return w.handleImport(body)
	})

	var wg sync.WaitGroup
	wg.Add(1)
	wg.Wait()
}

func (w *Worker) handleImport(body []byte) error {
	var msg queue.ImportMessage
	if err := json.Unmarshal(body, &msg); err != nil {
		log.Error().Err(err).Msg("Failed to unmarshal import message")
		return err
	}

	log.Info().
		Str("jobId", msg.JobID).
		Str("file", msg.FilePath).
		Int("tier", msg.SourceTier).
		Msg("Processing import job")

	ctx := context.Background()

	// Parse file based on format
	var rows []RawRow
	var err error

	format := DetectFormat(msg.FilePath)
	switch format {
	case "csv":
		rows, err = ParseCSV(msg.FilePath)
	case "tsv":
		rows, err = ParseTSV(msg.FilePath)
	case "xlsx":
		rows, err = ParseXLSX(msg.FilePath)
	default:
		log.Error().Str("format", format).Msg("Unsupported file format")
		w.importRepo.MarkJobFailed(ctx, msg.JobID, "unsupported file format: "+format)
		return nil
	}

	if err != nil {
		log.Error().Err(err).Msg("Failed to parse file")
		w.importRepo.MarkJobFailed(ctx, msg.JobID, err.Error())
		return nil
	}

	// Update job with total rows
	w.importRepo.SetJobStarted(ctx, msg.JobID, len(rows))

	// Tier-0 admission roster: skip matcher entirely. Enrollment_no is the
	// dedup key; identity fields overwrite, contact entries get appended,
	// nothing hits the review queue. See roster.go for the parser.
	if msg.SourceType == "admission_roster" || msg.SourceTier == 0 {
		return w.handleRosterImport(ctx, msg, rows)
	}

	// Apply column mapping if provided
	columnMap := msg.ColumnMapping
	if columnMap == nil {
		columnMap = make(map[string]string)
	}

	// Process each row: normalize → publish to matcher
	for _, row := range rows {
		mappedFields := applyColumnMapping(row.Fields, columnMap)

		// Normalize fields
		record := queue.MatchRecord{
			JobID:       msg.JobID,
			RowIndex:    row.Index + 1,
			FullName:    NormalizeName(mappedFields["full_name"]),
			Email:       NormalizeEmail(mappedFields["email"]),
			Phone:       NormalizePhone(mappedFields["phone"]),
			Company:     mappedFields["current_company"],
			Title:       mappedFields["current_title"],
			LinkedinURL: mappedFields["linkedin_url"],
			City:        mappedFields["current_city"],
			Branch:      NormalizeBranch(mappedFields["branch"]),
			Degree:      CanonicalDegree(mappedFields["degree"]),
			SourceTier:  msg.SourceTier,
			SourceName:  msg.FilePath,
			RawFields:   mappedFields,
		}

		// Parse batch year
		if byStr, ok := mappedFields["batch_year"]; ok && byStr != "" {
			var by int
			json.Unmarshal([]byte(byStr), &by)
			record.BatchYear = by
		}

		if record.FullName == "" {
			log.Warn().Int("row", row.Index).Msg("Skipping row with no name")
			continue
		}

		if err := queue.Publish(w.ch, "match.pending", record, w.cfg.HMACSecret); err != nil {
			log.Error().Err(err).Int("row", row.Index).Msg("Failed to publish record")
		}
	}

	log.Info().
		Str("jobId", msg.JobID).
		Int("rows", len(rows)).
		Msg("Import file processing complete")

	return nil
}

// handleRosterImport processes tier-0 admission roster rows directly: each
// row is upserted into alumni keyed on enrollment_no, contact entries get
// queued for SMTP verification, and nothing goes through the matcher.
func (w *Worker) handleRosterImport(ctx context.Context, msg queue.ImportMessage, rows []RawRow) error {
	baseConf := AssignConfidence(msg.SourceTier)
	// Contact entries from the roster are *unverified* by default — admission
	// emails go stale fast, so we drop their starting confidence well below
	// the identity confidence (which is 100). SMTP verifier raises it later.
	contactConf := 50.0
	now := time.Now().Format(time.RFC3339)

	var inserted, updated, errored int
	// Flush counters every N rows so the UI progress bar moves smoothly
	// instead of sitting at 0 for the entire batch.
	const flushEvery = 50
	var pendingProcessed, pendingInserted, pendingUpdated, pendingErrored int

	for _, row := range rows {
		rr, perr := ParseRosterRow(row.Fields)
		if perr != nil {
			log.Warn().Err(perr).Int("row", row.Index).Msg("Skipping unparseable roster row")
			errored++
			pendingProcessed++
			pendingErrored++
			if msg.JobID != "" && pendingProcessed >= flushEvery {
				w.importRepo.UpdateJobProgress(ctx, msg.JobID, pendingProcessed, pendingUpdated, pendingInserted, 0, pendingErrored)
				pendingProcessed, pendingInserted, pendingUpdated, pendingErrored = 0, 0, 0, 0
			}
			continue
		}

		emailEntries := []map[string]any{}
		if rr.StudentEmail != "" {
			emailEntries = append(emailEntries, map[string]any{
				"value":        rr.StudentEmail,
				"rank":         1,
				"type":         "personal",
				"source":       "admission_roster",
				"source_tier":  msg.SourceTier,
				"source_name":  msg.FilePath,
				"confidence":   contactConf,
				"smtp_status":  "unknown",
				"added_at":     now,
			})
		}
		if rr.ParentEmail != "" {
			emailEntries = append(emailEntries, map[string]any{
				"value":        rr.ParentEmail,
				"rank":         2,
				"type":         "parent",
				"source":       "admission_roster",
				"source_tier":  msg.SourceTier,
				"source_name":  msg.FilePath,
				"confidence":   contactConf,
				"smtp_status":  "unknown",
				"added_at":     now,
			})
		}
		phoneEntries := []map[string]any{}
		if rr.StudentPhone != "" {
			phoneEntries = append(phoneEntries, map[string]any{
				"value":       rr.StudentPhone,
				"rank":        1,
				"type":        "mobile",
				"source":      "admission_roster",
				"source_tier": msg.SourceTier,
				"source_name": msg.FilePath,
				"confidence":  contactConf,
				"added_at":    now,
			})
		}
		if rr.ParentPhone != "" {
			phoneEntries = append(phoneEntries, map[string]any{
				"value":       rr.ParentPhone,
				"rank":        2,
				"type":        "parent",
				"source":      "admission_roster",
				"source_tier": msg.SourceTier,
				"source_name": msg.FilePath,
				"confidence":  contactConf,
				"added_at":    now,
			})
		}
		emailsJSON, _ := json.Marshal(emailEntries)
		phonesJSON, _ := json.Marshal(phoneEntries)

		rec := &database.RosterRecord{
			EnrollmentNo:   rr.EnrollmentNo,
			FullName:       rr.FullName,
			BatchYear:      rr.BatchYear,
			Branch:         rr.BranchCanonical,
			Degree:         rr.Degree,
			ProgramName:    rr.ProgramName,
			DOB:            rr.DOB,
			Gender:         rr.Gender,
			FatherName:     rr.FatherName,
			MotherName:     rr.MotherName,
			CurrentAddress: rr.CurrentAddress,
			CurrentCity:    rr.CurrentCity,
			CurrentState:   rr.CurrentState,
			Pincode:        rr.Pincode,
			Emails:         emailsJSON,
			Phones:         phonesJSON,
		}
		// Fall back to raw branch string if we couldn't canonicalize, so we
		// don't blank out a previously-set branch on update.
		if rec.Branch == "" {
			rec.Branch = rr.BranchDesc
		}

		alumniID, wasInsert, uerr := w.alumniRepo.UpsertByEnrollmentNo(ctx, rec, msg.JobID)
		if uerr != nil {
			log.Error().Err(uerr).
				Str("enrollment_no", rr.EnrollmentNo).
				Int("row", row.Index).
				Msg("Roster upsert failed")
			errored++
			pendingProcessed++
			pendingErrored++
			if msg.JobID != "" && pendingProcessed >= flushEvery {
				w.importRepo.UpdateJobProgress(ctx, msg.JobID, pendingProcessed, pendingUpdated, pendingInserted, 0, pendingErrored)
				pendingProcessed, pendingInserted, pendingUpdated, pendingErrored = 0, 0, 0, 0
			}
			continue
		}

		if wasInsert {
			inserted++
			pendingInserted++
		} else {
			updated++
			pendingUpdated++
		}
		pendingProcessed++
		if msg.JobID != "" && pendingProcessed >= flushEvery {
			w.importRepo.UpdateJobProgress(ctx, msg.JobID, pendingProcessed, pendingUpdated, pendingInserted, 0, pendingErrored)
			pendingProcessed, pendingInserted, pendingUpdated, pendingErrored = 0, 0, 0, 0
		}

		// Queue both emails for SMTP verification — roster emails are exactly
		// the ones we don't trust until SMTP confirms them.
		for _, e := range []string{rr.StudentEmail, rr.ParentEmail} {
			if e == "" {
				continue
			}
			queue.Publish(w.ch, "verify.email", queue.VerifyEmailMessage{
				AlumniID:          alumniID,
				Email:             e,
				CurrentConfidence: contactConf,
			}, w.cfg.HMACSecret)
		}
	}

	// Final flush — any rows since the last batched UpdateJobProgress.
	if msg.JobID != "" && pendingProcessed > 0 {
		w.importRepo.UpdateJobProgress(ctx, msg.JobID, pendingProcessed, pendingUpdated, pendingInserted, 0, pendingErrored)
	}

	log.Info().
		Str("jobId", msg.JobID).
		Int("inserted", inserted).
		Int("updated", updated).
		Int("errored", errored).
		Float64("baseConfidence", baseConf).
		Msg("Roster import complete")
	return nil
}

// applyColumnMapping maps raw column names to system field names.
func applyColumnMapping(fields map[string]string, mapping map[string]string) map[string]string {
	if len(mapping) == 0 {
		return fields
	}

	mapped := make(map[string]string)
	for rawCol, systemField := range mapping {
		if val, ok := fields[rawCol]; ok {
			mapped[systemField] = val
		}
	}

	// Keep unmapped fields too
	for key, val := range fields {
		if _, isMapped := mapped[key]; !isMapped {
			mapped[key] = val
		}
	}

	return mapped
}
