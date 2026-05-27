package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ImportJob represents a row in the import_jobs table.
type ImportJob struct {
	ID            string          `json:"id"`
	SourceType    string          `json:"source_type"`
	SourceTier    int             `json:"source_tier"`
	SourceName    string          `json:"source_name"`
	FilePath      string          `json:"file_path"`
	ColumnMapping json.RawMessage `json:"column_mapping"`
	Status        string          `json:"status"`
	TotalRows     int             `json:"total_rows"`
	ProcessedRows int             `json:"processed_rows"`
	MergedCount   int             `json:"merged_count"`
	NewCount      int             `json:"new_count"`
	ReviewCount   int             `json:"review_count"`
	ErrorCount    int             `json:"error_count"`
	ErrorLog      json.RawMessage `json:"error_log"`
	StartedAt     *time.Time      `json:"started_at"`
	CompletedAt   *time.Time      `json:"completed_at"`
	CreatedBy     *string         `json:"created_by"`
	CreatedAt     time.Time       `json:"created_at"`
}

// ImportRepo provides import_jobs database operations.
type ImportRepo struct {
	pool *Pool
}

// NewImportRepo creates a new ImportRepo.
func NewImportRepo(p *Pool) *ImportRepo {
	return &ImportRepo{pool: p}
}

// GetJobByID retrieves an import job by its ID.
func (r *ImportRepo) GetJobByID(ctx context.Context, id string) (*ImportJob, error) {
	query := `
		SELECT id, source_type, source_tier, source_name, file_path, column_mapping,
		       status, total_rows, processed_rows, merged_count, new_count,
		       review_count, error_count, error_log, started_at, completed_at,
		       created_by, created_at
		FROM import_jobs WHERE id = $1`

	job := &ImportJob{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&job.ID, &job.SourceType, &job.SourceTier, &job.SourceName,
		&job.FilePath, &job.ColumnMapping, &job.Status,
		&job.TotalRows, &job.ProcessedRows, &job.MergedCount,
		&job.NewCount, &job.ReviewCount, &job.ErrorCount, &job.ErrorLog,
		&job.StartedAt, &job.CompletedAt, &job.CreatedBy, &job.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("GetJobByID: %w", err)
	}
	return job, nil
}

// UpdateJobProgress atomically increments the per-row counters for an import job.
// Each call represents one processed row; the bucket counters (merged/new/review/errors)
// should each be 0 or 1 — exactly one bucket increments per row.
// Auto-flips status to 'completed' when processed_rows reaches total_rows.
func (r *ImportRepo) UpdateJobProgress(ctx context.Context, id string, processedDelta, mergedDelta, newDelta, reviewDelta, errorDelta int) error {
	query := `
		UPDATE import_jobs
		SET processed_rows = processed_rows + $2,
		    merged_count   = merged_count   + $3,
		    new_count      = new_count      + $4,
		    review_count   = review_count   + $5,
		    error_count    = error_count    + $6,
		    status         = CASE WHEN total_rows > 0 AND processed_rows + $2 >= total_rows
		                          THEN 'completed' ELSE status END,
		    completed_at   = CASE WHEN total_rows > 0 AND processed_rows + $2 >= total_rows
		                          THEN NOW() ELSE completed_at END
		WHERE id = $1`

	_, err := r.pool.Exec(ctx, query, id, processedDelta, mergedDelta, newDelta, reviewDelta, errorDelta)
	if err != nil {
		return fmt.Errorf("UpdateJobProgress: %w", err)
	}
	return nil
}

// MarkJobComplete marks an import job as completed.
func (r *ImportRepo) MarkJobComplete(ctx context.Context, id string) error {
	query := `UPDATE import_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("MarkJobComplete: %w", err)
	}
	return nil
}

// MarkJobFailed marks an import job as failed with an error log entry.
func (r *ImportRepo) MarkJobFailed(ctx context.Context, id string, errorMsg string) error {
	query := `UPDATE import_jobs SET status = 'failed', completed_at = NOW(),
		error_log = error_log || $2::jsonb WHERE id = $1`

	errJSON, _ := json.Marshal(map[string]string{"error": errorMsg, "at": time.Now().Format(time.RFC3339)})
	_, err := r.pool.Exec(ctx, query, id, string(errJSON))
	if err != nil {
		return fmt.Errorf("MarkJobFailed: %w", err)
	}
	return nil
}

// SetJobStarted marks a job as started and sets the total row count.
func (r *ImportRepo) SetJobStarted(ctx context.Context, id string, totalRows int) error {
	query := `UPDATE import_jobs SET status = 'processing', started_at = NOW(), total_rows = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, totalRows)
	if err != nil {
		return fmt.Errorf("SetJobStarted: %w", err)
	}
	return nil
}
