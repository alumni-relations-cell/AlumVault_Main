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

// RosterRecord is the input to UpsertByEnrollmentNo. It carries the
// admission-cell fields that aren't on AlumniRecord (parents, full address,
// program) plus the contact entries to append to emails/phones.
type RosterRecord struct {
	EnrollmentNo   string
	FullName       string
	FullNameBlind  string
	BatchYear      int
	Branch         string
	Degree         string
	ProgramName    string
	DOB            *time.Time
	Gender         string
	FatherName     string
	MotherName     string
	CurrentAddress string
	CurrentCity    string
	CurrentState   string
	Pincode        string
	Emails         json.RawMessage // [] of entries to append (caller pre-encrypts values)
	Phones         json.RawMessage // [] of entries to append (caller pre-encrypts values)
}

// FindByEnrollmentNo returns the alumni with the given enrollment number,
// case-insensitive. Returns nil if not found.
func (r *AlumniRepo) FindByEnrollmentNo(ctx context.Context, enrollmentNo string) (*AlumniRecord, error) {
	if enrollmentNo == "" {
		return nil, nil
	}
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni
		WHERE LOWER(enrollment_no) = LOWER($1)
		LIMIT 1`

	rows, err := r.pool.Query(ctx, query, enrollmentNo)
	if err != nil {
		return nil, fmt.Errorf("FindByEnrollmentNo: %w", err)
	}
	defer rows.Close()
	recs, err := r.scanAlumniRows(rows)
	if err != nil || len(recs) == 0 {
		return nil, err
	}
	return &recs[0], nil
}

// FindByIdentity returns every alumni row whose (full_name, batch_year,
// branch) all match — the matcher's Phase-2 identity lookup. Comparison is
// case-insensitive on name and matches on canonical branch (CSE == "Computer
// Science" via the synonyms table — caller must pass the canonical form here;
// matching on raw branch strings will miss most rows).
//
// Returns 0, 1, or N rows:
//   - 0 → caller falls through to fuzzy matching
//   - 1 → caller auto-merges into that row
//   - N → caller files a multi-candidate review (review_type=identity_ambiguous)
func (r *AlumniRepo) FindByIdentity(ctx context.Context, fullName string, batchYear int, branch string) ([]AlumniRecord, error) {
	if fullName == "" || batchYear == 0 || branch == "" {
		return nil, nil
	}
	query := `
		SELECT id, full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
		       emails, phones, current_company, current_title, industry, linkedin_url,
		       current_city, field_sources, data_completeness, overall_confidence,
		       last_verified_at, is_verified, created_at, updated_at
		FROM alumni
		WHERE LOWER(full_name) = LOWER($1)
		  AND batch_year = $2
		  AND LOWER(branch) = LOWER($3)`

	rows, err := r.pool.Query(ctx, query, fullName, batchYear, branch)
	if err != nil {
		return nil, fmt.Errorf("FindByIdentity: %w", err)
	}
	defer rows.Close()
	return r.scanAlumniRows(rows)
}

// UpsertByEnrollmentNo writes a roster row. If an alumnus with this
// enrollment_no already exists, identity fields are overwritten (roster is
// authoritative) and email/phone entries are merged into the existing JSONB
// arrays — deduping by lowercased value so re-running the same import is
// idempotent. Otherwise a new row is inserted.
//
// importJobID is stamped onto source_import_id ONLY on insert — updates don't
// rewrite provenance, so a later import can't accidentally "claim" rows it
// merely touched (preserves rollback semantics).
//
// Returns (alumniID, wasInsert) so the caller can update import_jobs counters
// (merged_count vs new_count).
func (r *AlumniRepo) UpsertByEnrollmentNo(ctx context.Context, rec *RosterRecord, importJobID string) (string, bool, error) {
	if rec.EnrollmentNo == "" {
		return "", false, fmt.Errorf("UpsertByEnrollmentNo: empty enrollment_no")
	}

	existing, err := r.FindByEnrollmentNo(ctx, rec.EnrollmentNo)
	if err != nil {
		return "", false, err
	}

	if existing != nil {
		// Update identity (overwrite) + merge contact arrays.
		mergedEmails, _ := mergeContactArray(existing.Emails, rec.Emails)
		mergedPhones, _ := mergeContactArray(existing.Phones, rec.Phones)

		query := `
			UPDATE alumni SET
				full_name       = $2,
				full_name_blind = $3,
				batch_year      = COALESCE(NULLIF($4, 0), batch_year),
				branch          = COALESCE(NULLIF($5, ''), branch),
				degree          = COALESCE(NULLIF($6, ''), degree),
				program_name    = COALESCE(NULLIF($7, ''), program_name),
				dob             = COALESCE($8, dob),
				gender          = COALESCE(NULLIF($9, ''), gender),
				father_name     = COALESCE(NULLIF($10, ''), father_name),
				mother_name     = COALESCE(NULLIF($11, ''), mother_name),
				current_address = COALESCE(NULLIF($12, ''), current_address),
				current_city    = COALESCE(NULLIF($13, ''), current_city),
				current_state   = COALESCE(NULLIF($14, ''), current_state),
				pincode         = COALESCE(NULLIF($15, ''), pincode),
				emails          = $16,
				phones          = $17,
				updated_at      = NOW()
			WHERE id = $1`
		_, err := r.pool.Exec(ctx, query,
			existing.ID, rec.FullName, rec.FullNameBlind, rec.BatchYear, rec.Branch,
			rec.Degree, rec.ProgramName, rec.DOB, rec.Gender, rec.FatherName,
			rec.MotherName, rec.CurrentAddress, rec.CurrentCity, rec.CurrentState,
			rec.Pincode, mergedEmails, mergedPhones,
		)
		if err != nil {
			return "", false, fmt.Errorf("UpsertByEnrollmentNo update: %w", err)
		}
		return existing.ID, false, nil
	}

	// Insert new row.
	emails := rec.Emails
	if len(emails) == 0 {
		emails = json.RawMessage("[]")
	}
	phones := rec.Phones
	if len(phones) == 0 {
		phones = json.RawMessage("[]")
	}

	// importJobID becomes source_import_id; empty string → NULL (no provenance).
	var importJobArg interface{}
	if importJobID != "" {
		importJobArg = importJobID
	}
	// batch_year = 0 is the "couldn't derive" sentinel (PhD, unknown program,
	// unparseable academic year) — store NULL instead so it doesn't pollute
	// reports and isn't confused with a real cohort. UPDATE-side already does
	// this; INSERT needs the same treatment.
	query := `
		INSERT INTO alumni (
			full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
			program_name, dob, gender, father_name, mother_name,
			current_address, current_city, current_state, pincode,
			emails, phones, source_import_id
		) VALUES ($1, $2, $3, NULLIF($4::int, 0), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
		RETURNING id`
	var id string
	err = r.pool.QueryRow(ctx, query,
		rec.FullName, rec.FullNameBlind, rec.EnrollmentNo, rec.BatchYear, rec.Branch,
		rec.Degree, rec.ProgramName, rec.DOB, rec.Gender, rec.FatherName,
		rec.MotherName, rec.CurrentAddress, rec.CurrentCity, rec.CurrentState,
		rec.Pincode, emails, phones, importJobArg,
	).Scan(&id)
	if err != nil {
		return "", false, fmt.Errorf("UpsertByEnrollmentNo insert: %w", err)
	}
	return id, true, nil
}

// mergeContactArray appends entries from `incoming` to `existing`, skipping
// any whose lowercased "value" is already present. Both sides are JSONB
// arrays; either may be empty/null. Returns the merged JSON.
func mergeContactArray(existing, incoming json.RawMessage) (json.RawMessage, error) {
	var ex []map[string]interface{}
	var in []map[string]interface{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &ex)
	}
	if len(incoming) > 0 {
		_ = json.Unmarshal(incoming, &in)
	}

	seen := map[string]struct{}{}
	for _, e := range ex {
		if v, ok := e["value"].(string); ok {
			seen[lowerTrim(v)] = struct{}{}
		}
	}
	for _, e := range in {
		v, _ := e["value"].(string)
		if v == "" {
			continue
		}
		key := lowerTrim(v)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		ex = append(ex, e)
	}
	if ex == nil {
		ex = []map[string]interface{}{}
	}
	return json.Marshal(ex)
}

func lowerTrim(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == ' ' || c == '\t' {
			continue
		}
		if c >= 'A' && c <= 'Z' {
			c += 32
		}
		out = append(out, c)
	}
	return string(out)
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
