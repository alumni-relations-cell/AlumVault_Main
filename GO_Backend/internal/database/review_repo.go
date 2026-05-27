package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ReviewItem represents a row in the review_queue table.
type ReviewItem struct {
	ID               string          `json:"id"`
	ExistingAlumniID string          `json:"existing_alumni_id"`
	IncomingData     json.RawMessage `json:"incoming_data"`
	MatchScore       float64         `json:"match_score"`
	ScoreBreakdown   json.RawMessage `json:"score_breakdown"`
	SourceImportID   *string         `json:"source_import_id"`
	Status           string          `json:"status"`
	ResolvedBy       *string         `json:"resolved_by"`
	ResolvedAt       *time.Time      `json:"resolved_at"`
	ResolutionNote   *string         `json:"resolution_note"`
	CreatedAt        time.Time       `json:"created_at"`
}

// ReviewRepo provides review_queue database operations.
type ReviewRepo struct {
	pool *Pool
}

// NewReviewRepo creates a new ReviewRepo.
func NewReviewRepo(p *Pool) *ReviewRepo {
	return &ReviewRepo{pool: p}
}

// InsertReviewItem adds a new item to the review queue.
func (r *ReviewRepo) InsertReviewItem(ctx context.Context, item *ReviewItem) (string, error) {
	query := `
		INSERT INTO review_queue (existing_alumni_id, incoming_data, match_score, score_breakdown, source_import_id, status)
		VALUES ($1, $2, $3, $4, $5, 'pending')
		RETURNING id`

	var id string
	err := r.pool.QueryRow(ctx, query,
		item.ExistingAlumniID, item.IncomingData, item.MatchScore,
		item.ScoreBreakdown, item.SourceImportID,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("InsertReviewItem: %w", err)
	}
	return id, nil
}

// GetPendingReviews returns pending review items with pagination.
func (r *ReviewRepo) GetPendingReviews(ctx context.Context, limit, offset int) ([]ReviewItem, error) {
	query := `
		SELECT id, existing_alumni_id, incoming_data, match_score, score_breakdown,
		       source_import_id, status, resolved_by, resolved_at, resolution_note, created_at
		FROM review_queue
		WHERE status = 'pending'
		ORDER BY match_score DESC
		LIMIT $1 OFFSET $2`

	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("GetPendingReviews: %w", err)
	}
	defer rows.Close()

	var items []ReviewItem
	for rows.Next() {
		var item ReviewItem
		err := rows.Scan(
			&item.ID, &item.ExistingAlumniID, &item.IncomingData,
			&item.MatchScore, &item.ScoreBreakdown, &item.SourceImportID,
			&item.Status, &item.ResolvedBy, &item.ResolvedAt,
			&item.ResolutionNote, &item.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("GetPendingReviews scan: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ResolveReview marks a review item as resolved.
func (r *ReviewRepo) ResolveReview(ctx context.Context, id, resolvedBy, resolution, note string) error {
	query := `
		UPDATE review_queue
		SET status = $2, resolved_by = $3, resolved_at = NOW(), resolution_note = $4
		WHERE id = $1 AND status = 'pending'`

	tag, err := r.pool.Exec(ctx, query, id, resolution, resolvedBy, note)
	if err != nil {
		return fmt.Errorf("ResolveReview: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("ResolveReview: item not found or already resolved")
	}
	return nil
}
