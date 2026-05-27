package importer

import (
	"context"
	"encoding/json"
	"sync"

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
}

// NewWorker creates a new importer Worker.
func NewWorker(db *database.Pool, ch *queue.Channel, cfg *config.Config) *Worker {
	return &Worker{
		db:         db,
		ch:         ch,
		cfg:        cfg,
		importRepo: database.NewImportRepo(db),
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
			Degree:      mappedFields["degree"],
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

		// Publish to import.pending for the matcher to consume
		// (We reuse the same queue — matcher listens on import.pending)
		if err := queue.Publish(w.ch, "import.pending", record, w.cfg.HMACSecret); err != nil {
			log.Error().Err(err).Int("row", row.Index).Msg("Failed to publish record")
		}
	}

	log.Info().
		Str("jobId", msg.JobID).
		Int("rows", len(rows)).
		Msg("Import file processing complete")

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
