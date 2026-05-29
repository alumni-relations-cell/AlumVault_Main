package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// AlumniRecord represents a row in the alumni table.
type AlumniRecord struct {
	ID               string          `json:"id"`
	FullName         string          `json:"full_name"`
	FullNameBlind    string          `json:"full_name_blind"`
	EnrollmentNo     string          `json:"enrollment_no"`
	BatchYear        int             `json:"batch_year"`
	Branch           string          `json:"branch"`
	Degree           string          `json:"degree"`
	Emails           json.RawMessage `json:"emails"`
	Phones           json.RawMessage `json:"phones"`
	CurrentCompany   string          `json:"current_company"`
	CurrentTitle     string          `json:"current_title"`
	Industry         string          `json:"industry"`
	LinkedinURL      string          `json:"linkedin_url"`
	CurrentCity      string          `json:"current_city"`
	FieldSources     json.RawMessage `json:"field_sources"`
	DataCompleteness float64         `json:"data_completeness"`
	OverallConfidence float64        `json:"overall_confidence"`
	LastVerifiedAt   *time.Time      `json:"last_verified_at"`
	IsVerified       bool            `json:"is_verified"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

// AlumniRepo provides alumni-related database operations.
type AlumniRepo struct {
	pool *Pool
}

// NewAlumniRepo creates a new AlumniRepo.
func NewAlumniRepo(p *Pool) *AlumniRepo {
	return &AlumniRepo{pool: p}
}

// FindByNameFuzzy searches for alumni using pg_trgm fuzzy matching on full_name.
func (r *AlumniRepo) FindByNameFuzzy(ctx context.Context, name string, limit int) ([]AlumniRecord, error) {
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni
		WHERE full_name % $1 OR full_name ILIKE '%' || $1 || '%'
		ORDER BY similarity(full_name, $1) DESC
		LIMIT $2`

	rows, err := r.pool.Query(ctx, query, name, limit)
	if err != nil {
		return nil, fmt.Errorf("FindByNameFuzzy: %w", err)
	}
	defer rows.Close()

	return r.scanAlumniRows(rows)
}

// FindByLinkedinURL returns the alumni with the given LinkedIn URL, or nil if none.
func (r *AlumniRepo) FindByLinkedinURL(ctx context.Context, url string) (*AlumniRecord, error) {
	if url == "" {
		return nil, nil
	}
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni
		WHERE linkedin_url = $1
		LIMIT 1`

	rows, err := r.pool.Query(ctx, query, url)
	if err != nil {
		return nil, fmt.Errorf("FindByLinkedinURL: %w", err)
	}
	defer rows.Close()

	recs, err := r.scanAlumniRows(rows)
	if err != nil || len(recs) == 0 {
		return nil, err
	}
	return &recs[0], nil
}

// FindByBatchAndBranch returns alumni matching the given batch year and branch.
func (r *AlumniRepo) FindByBatchAndBranch(ctx context.Context, batchYear int, branch string) ([]AlumniRecord, error) {
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni
		WHERE batch_year = $1 AND branch ILIKE $2`

	rows, err := r.pool.Query(ctx, query, batchYear, branch)
	if err != nil {
		return nil, fmt.Errorf("FindByBatchAndBranch: %w", err)
	}
	defer rows.Close()

	return r.scanAlumniRows(rows)
}

// GetByID returns a single alumni record by UUID.
func (r *AlumniRepo) GetByID(ctx context.Context, id string) (*AlumniRecord, error) {
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni WHERE id = $1`

	row := r.pool.QueryRow(ctx, query, id)
	rec := &AlumniRecord{}
	err := row.Scan(
		&rec.ID, &rec.FullName, &rec.FullNameBlind, &rec.EnrollmentNo,
		&rec.BatchYear, &rec.Branch, &rec.Degree,
		&rec.Emails, &rec.Phones, &rec.CurrentCompany, &rec.CurrentTitle,
		&rec.Industry, &rec.LinkedinURL, &rec.CurrentCity, &rec.FieldSources,
		&rec.DataCompleteness, &rec.OverallConfidence,
		&rec.LastVerifiedAt, &rec.IsVerified, &rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("GetByID: %w", err)
	}
	return rec, nil
}

// UpsertAlumni inserts a new alumni record or updates an existing one.
// Returns the alumni ID.
func (r *AlumniRepo) UpsertAlumni(ctx context.Context, rec *AlumniRecord) (string, error) {
	query := `
		INSERT INTO alumni (full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		                    emails, phones, current_company, current_title, industry, linkedin_url,
		                    current_city, field_sources, data_completeness, overall_confidence, is_verified)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		ON CONFLICT (id) DO UPDATE SET
			full_name = EXCLUDED.full_name,
			emails = EXCLUDED.emails,
			phones = EXCLUDED.phones,
			current_company = EXCLUDED.current_company,
			current_title = EXCLUDED.current_title,
			industry = EXCLUDED.industry,
			linkedin_url = EXCLUDED.linkedin_url,
			current_city = EXCLUDED.current_city,
			field_sources = EXCLUDED.field_sources,
			data_completeness = EXCLUDED.data_completeness,
			overall_confidence = EXCLUDED.overall_confidence,
			updated_at = NOW()
		RETURNING id`

	var id string
	err := r.pool.QueryRow(ctx, query,
		rec.FullName, rec.FullNameBlind, rec.EnrollmentNo, rec.BatchYear,
		rec.Branch, rec.Degree, rec.Emails, rec.Phones,
		rec.CurrentCompany, rec.CurrentTitle, rec.Industry, rec.LinkedinURL,
		rec.CurrentCity, rec.FieldSources, rec.DataCompleteness,
		rec.OverallConfidence, rec.IsVerified,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("UpsertAlumni: %w", err)
	}
	return id, nil
}

// UpdateFieldConfidence updates the confidence score for a specific contact entry.
func (r *AlumniRepo) UpdateFieldConfidence(ctx context.Context, alumniID string, field string, emailValue string, smtpStatus string, confidenceDelta float64) error {
	// Update the JSONB emails/phones array element matching the value
	query := fmt.Sprintf(`
		UPDATE alumni SET %s = (
			SELECT jsonb_agg(
				CASE WHEN elem->>'value' = $2
				THEN jsonb_set(
					jsonb_set(elem, '{smtp_status}', to_jsonb($3::text)),
					'{confidence}', to_jsonb(LEAST(95, GREATEST(0, (elem->>'confidence')::float + $4)))
				)
				ELSE elem END
			)
			FROM jsonb_array_elements(%s) elem
		)
		WHERE id = $1`, field, field)

	_, err := r.pool.Exec(ctx, query, alumniID, emailValue, smtpStatus, confidenceDelta)
	if err != nil {
		return fmt.Errorf("UpdateFieldConfidence: %w", err)
	}
	return nil
}

// UpdateAlumniFields updates specified fields of an alumni record.
func (r *AlumniRepo) UpdateAlumniFields(ctx context.Context, id string, fields map[string]interface{}) error {
	query := `UPDATE alumni SET current_company = COALESCE($2, current_company),
		current_title = COALESCE($3, current_title),
		industry = COALESCE($4, industry),
		linkedin_url = COALESCE($5, linkedin_url),
		current_city = COALESCE($6, current_city),
		updated_at = NOW()
		WHERE id = $1`

	_, err := r.pool.Exec(ctx, query, id,
		fields["current_company"], fields["current_title"],
		fields["industry"], fields["linkedin_url"], fields["current_city"])
	if err != nil {
		return fmt.Errorf("UpdateAlumniFields: %w", err)
	}
	return nil
}

// InsertAlternate stores a rejected/alternate field value.
func (r *AlumniRepo) InsertAlternate(ctx context.Context, alumniID, fieldName, encryptedValue string, tier int, sourceName string, confidence float64, reason string) error {
	query := `INSERT INTO alumni_alternates (alumni_id, field_name, value_encrypted, source_tier, source_name, confidence, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := r.pool.Exec(ctx, query, alumniID, fieldName, encryptedValue, tier, sourceName, confidence, reason)
	if err != nil {
		return fmt.Errorf("InsertAlternate: %w", err)
	}
	return nil
}

// ScanByEmail finds alumni with a matching email in the JSONB emails array.
func (r *AlumniRepo) ScanByEmail(ctx context.Context, email string, limit int) ([]AlumniRecord, error) {
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni
		WHERE emails @> $1::jsonb
		LIMIT $2`

	emailJSON := fmt.Sprintf(`[{"value": "%s"}]`, email)
	rows, err := r.pool.Query(ctx, query, emailJSON, limit)
	if err != nil {
		return nil, fmt.Errorf("ScanByEmail: %w", err)
	}
	defer rows.Close()

	return r.scanAlumniRows(rows)
}

func (r *AlumniRepo) scanAlumniRows(rows pgx.Rows) ([]AlumniRecord, error) {
	var records []AlumniRecord
	for rows.Next() {
		var rec AlumniRecord
		err := rows.Scan(
			&rec.ID, &rec.FullName, &rec.FullNameBlind, &rec.EnrollmentNo,
			&rec.BatchYear, &rec.Branch, &rec.Degree,
			&rec.Emails, &rec.Phones, &rec.CurrentCompany, &rec.CurrentTitle,
			&rec.Industry, &rec.LinkedinURL, &rec.CurrentCity, &rec.FieldSources,
			&rec.DataCompleteness, &rec.OverallConfidence,
			&rec.LastVerifiedAt, &rec.IsVerified, &rec.CreatedAt, &rec.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanAlumniRows: %w", err)
		}
		records = append(records, rec)
	}
	return records, rows.Err()
}
