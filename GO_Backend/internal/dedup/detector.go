package dedup

import (
	"context"
	"encoding/json"

	"github.com/rs/zerolog/log"
	"github.com/your-org/alumni-go/internal/database"
	"github.com/your-org/alumni-go/internal/matcher"
)

// Detector implements duplicate detection strategies.
type Detector struct {
	pool       *database.Pool
	alumniRepo *database.AlumniRepo
	reviewRepo *database.ReviewRepo
}

// NewDetector creates a new Detector.
func NewDetector(pool *database.Pool) *Detector {
	return &Detector{
		pool:       pool,
		alumniRepo: database.NewAlumniRepo(pool),
		reviewRepo: database.NewReviewRepo(pool),
	}
}

// ScanByEmail finds alumni with the same email across records.
func (d *Detector) ScanByEmail(ctx context.Context, batchSize int) (int, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT a1.id, a1.full_name, a1.emails, a2.id, a2.full_name, a2.emails
		FROM alumni a1
		JOIN alumni a2 ON a1.id < a2.id
		WHERE EXISTS (
			SELECT 1
			FROM jsonb_array_elements(a1.emails) e1,
			     jsonb_array_elements(a2.emails) e2
			WHERE e1->>'value' = e2->>'value'
		)
		LIMIT $1`, batchSize)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id1, name1, id2, name2 string
		var emails1, emails2 json.RawMessage
		rows.Scan(&id1, &name1, &emails1, &id2, &name2, &emails2)

		log.Info().
			Str("id1", id1).Str("name1", name1).
			Str("id2", id2).Str("name2", name2).
			Msg("Duplicate detected by email")

		incomingJSON, _ := json.Marshal(map[string]interface{}{
			"full_name": name2, "source": "dedup_email_scan",
		})
		d.reviewRepo.InsertReviewItem(ctx, &database.ReviewItem{
			ExistingAlumniID: id1,
			IncomingData:     incomingJSON,
			MatchScore:       90,
			ScoreBreakdown:   json.RawMessage(`{"email_match": 90}`),
		})
		count++
	}
	return count, nil
}

// ScanByPhone finds alumni with the same phone across records.
func (d *Detector) ScanByPhone(ctx context.Context, batchSize int) (int, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT a1.id, a1.full_name, a2.id, a2.full_name
		FROM alumni a1
		JOIN alumni a2 ON a1.id < a2.id
		WHERE EXISTS (
			SELECT 1
			FROM jsonb_array_elements(a1.phones) p1,
			     jsonb_array_elements(a2.phones) p2
			WHERE p1->>'value' = p2->>'value'
		)
		LIMIT $1`, batchSize)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id1, name1, id2, name2 string
		rows.Scan(&id1, &name1, &id2, &name2)

		log.Info().
			Str("id1", id1).Str("name1", name1).
			Str("id2", id2).Str("name2", name2).
			Msg("Duplicate detected by phone")

		incomingJSON, _ := json.Marshal(map[string]interface{}{
			"full_name": name2, "source": "dedup_phone_scan",
		})
		d.reviewRepo.InsertReviewItem(ctx, &database.ReviewItem{
			ExistingAlumniID: id1,
			IncomingData:     incomingJSON,
			MatchScore:       85,
			ScoreBreakdown:   json.RawMessage(`{"phone_match": 85}`),
		})
		count++
	}
	return count, nil
}

// ScanByNameBatch finds alumni with fuzzy name + same batch/branch.
func (d *Detector) ScanByNameBatch(ctx context.Context, batchSize int) (int, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT a1.id, a1.full_name, a1.batch_year, a1.branch,
		       a2.id, a2.full_name, a2.batch_year, a2.branch,
		       COALESCE(a2.enrollment_no, '')
		FROM alumni a1
		JOIN alumni a2 ON a1.id < a2.id
			AND a1.batch_year = a2.batch_year
			AND a1.branch = a2.branch
		WHERE similarity(a1.full_name, a2.full_name) > 0.7
		LIMIT $1`, batchSize)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id1, name1, id2, name2, enroll2 string
		var batch1, batch2 int
		var branch1, branch2 string
		rows.Scan(&id1, &name1, &batch1, &branch1, &id2, &name2, &batch2, &branch2, &enroll2)

		sim := matcher.JaroWinkler(name1, name2)
		if sim < 0.85 {
			continue
		}

		log.Info().
			Str("id1", id1).Str("name1", name1).
			Str("id2", id2).Str("name2", name2).
			Float64("similarity", sim).
			Msg("Duplicate detected by name+batch")

		incomingJSON, _ := json.Marshal(map[string]interface{}{
			"full_name": name2, "batch_year": batch2, "branch": branch2,
			"enrollment_no": enroll2,
			"source":        "dedup_name_batch_scan",
		})
		breakdownJSON, _ := json.Marshal(map[string]interface{}{
			"name_similarity": sim, "batch_match": true, "branch_match": true,
		})
		d.reviewRepo.InsertReviewItem(ctx, &database.ReviewItem{
			ExistingAlumniID: id1,
			IncomingData:     incomingJSON,
			MatchScore:       sim * 100,
			ScoreBreakdown:   breakdownJSON,
		})
		count++
	}
	return count, nil
}

// RunFullScan executes all dedup strategies.
func (d *Detector) RunFullScan(ctx context.Context, batchSize int) (int, error) {
	total := 0

	emailDups, err := d.ScanByEmail(ctx, batchSize)
	if err != nil {
		log.Error().Err(err).Msg("Email dedup scan failed")
	}
	total += emailDups

	phoneDups, err := d.ScanByPhone(ctx, batchSize)
	if err != nil {
		log.Error().Err(err).Msg("Phone dedup scan failed")
	}
	total += phoneDups

	nameDups, err := d.ScanByNameBatch(ctx, batchSize)
	if err != nil {
		log.Error().Err(err).Msg("Name+batch dedup scan failed")
	}
	total += nameDups

	log.Info().Int("total_duplicates", total).Msg("Dedup full scan complete")
	return total, nil
}
