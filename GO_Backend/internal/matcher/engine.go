package matcher

import (
	"context"
	"encoding/json"

	"github.com/rs/zerolog/log"
	"github.com/your-org/alumni-go/internal/database"
)

// Decision constants for match outcomes.
const (
	DecisionAutoMerge = "auto_merge"
	DecisionReview    = "review"
	DecisionNewRecord = "new_record"
)

// Thresholds for match scoring.
const (
	AutoMergeThreshold = 80
	ReviewThreshold    = 40
)

// Review type constants distinguish how the review item was created so the
// UI can render the right view (single 1-vs-1 diff vs N-candidate picker).
const (
	ReviewTypeFuzzy              = "fuzzy"
	ReviewTypeIdentityAmbiguous  = "identity_ambiguous"
)

// MatchResult contains the outcome of a matching operation.
// CandidateIDs is set (instead of MatchedID alone) when the identity step
// found 2+ alumni rows with identical (name, batch, branch). The worker uses
// that to file a multi-candidate review.
type MatchResult struct {
	Decision     string         `json:"decision"`
	MatchedID    string         `json:"matched_id"`
	CandidateIDs []string       `json:"candidate_ids,omitempty"`
	Score        int            `json:"score"`
	Breakdown    ScoreBreakdown `json:"breakdown"`
	ReviewType   string         `json:"review_type,omitempty"`
}

// Engine orchestrates the matching logic: searching candidates,
// scoring them, and deciding whether to auto-merge, review, or create new.
type Engine struct {
	alumniRepo *database.AlumniRepo
}

// NewEngine creates a new matching engine with the given alumni repository.
func NewEngine(repo *database.AlumniRepo) *Engine {
	return &Engine{alumniRepo: repo}
}

// Match takes an incoming record and finds the best matching candidate in the database.
// It returns the match result with the decision, score, and breakdown.
func (e *Engine) Match(ctx context.Context, incoming *IncomingRecord) (*MatchResult, error) {
	// Hard dedup: LinkedIn URL is unique. If we already have this URL, auto-merge.
	if incoming.LinkedinURL != "" {
		existing, err := e.alumniRepo.FindByLinkedinURL(ctx, incoming.LinkedinURL)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			log.Info().
				Str("alumniID", existing.ID).
				Str("linkedinURL", incoming.LinkedinURL).
				Msg("Auto-merge decision (LinkedIn URL match)")
			return &MatchResult{
				Decision:  DecisionAutoMerge,
				MatchedID: existing.ID,
				Score:     100,
			}, nil
		}
	}

	// Identity lookup (Phase 2): if we have name + batch + branch, look for
	// an exact-identity match before falling through to fuzzy. The admission
	// roster (loaded first) populates these fields so this step short-
	// circuits most Apollo-vs-roster matches.
	//   1 hit  → high-confidence auto-merge (the roster guarantees this is the right person)
	//   N hits → genuinely ambiguous (two Mohit Kumars in the same batch/branch);
	//            file a multi-candidate review so a human picks the enrollment_no
	//   0 hits → fall through to fuzzy
	if incoming.FullName != "" && incoming.BatchYear > 0 && incoming.Branch != "" {
		idMatches, err := e.alumniRepo.FindByIdentity(ctx, incoming.FullName, incoming.BatchYear, incoming.Branch)
		if err != nil {
			return nil, err
		}
		switch len(idMatches) {
		case 1:
			log.Info().
				Str("alumniID", idMatches[0].ID).
				Str("name", incoming.FullName).
				Int("batch", incoming.BatchYear).
				Msg("Auto-merge decision (identity exact)")
			return &MatchResult{
				Decision:   DecisionAutoMerge,
				MatchedID:  idMatches[0].ID,
				Score:      95,
				ReviewType: ReviewTypeFuzzy, // resolved without review
			}, nil
		default:
			if len(idMatches) > 1 {
				ids := make([]string, len(idMatches))
				for i, m := range idMatches {
					ids[i] = m.ID
				}
				log.Info().
					Strs("candidateIDs", ids).
					Str("name", incoming.FullName).
					Int("batch", incoming.BatchYear).
					Msg("Multi-candidate review (identity ambiguous)")
				return &MatchResult{
					Decision:     DecisionReview,
					MatchedID:    ids[0], // first one for legacy single-FK consumers
					CandidateIDs: ids,
					Score:        70,
					ReviewType:   ReviewTypeIdentityAmbiguous,
				}, nil
			}
			// 0 matches: fall through to fuzzy.
		}
	}

	// Search for candidates using fuzzy name matching
	candidates, err := e.alumniRepo.FindByNameFuzzy(ctx, incoming.FullName, 20)
	if err != nil {
		return nil, err
	}

	if len(candidates) == 0 {
		return &MatchResult{Decision: DecisionNewRecord, Score: 0}, nil
	}

	// Score each candidate
	var bestResult *MatchResult
	for _, candidate := range candidates {
		breakdown := ComputeBreakdown(
			incoming.FullName, candidate.FullName,
			incoming.BatchYear, candidate.BatchYear,
			incoming.Branch, candidate.Branch,
			incoming.LinkedinURL, incoming.Email, incoming.City,
		)
		total := breakdown.TotalScore()

		if bestResult == nil || total > bestResult.Score {
			bestResult = &MatchResult{
				MatchedID: candidate.ID,
				Score:     total,
				Breakdown: breakdown,
			}
		}
	}

	// Apply thresholds
	if bestResult.Score >= AutoMergeThreshold {
		bestResult.Decision = DecisionAutoMerge
		log.Info().
			Str("alumniID", bestResult.MatchedID).
			Int("score", bestResult.Score).
			Msg("Auto-merge decision")
	} else if bestResult.Score >= ReviewThreshold {
		bestResult.Decision = DecisionReview
		bestResult.ReviewType = ReviewTypeFuzzy
		log.Info().
			Str("alumniID", bestResult.MatchedID).
			Int("score", bestResult.Score).
			Msg("Review decision")
	} else {
		bestResult.Decision = DecisionNewRecord
		bestResult.MatchedID = ""
		log.Info().
			Int("score", bestResult.Score).
			Msg("New record decision")
	}

	return bestResult, nil
}

// IncomingRecord represents a normalized incoming record to match against the DB.
type IncomingRecord struct {
	FullName    string `json:"full_name"`
	BatchYear   int    `json:"batch_year"`
	Branch      string `json:"branch"`
	Degree      string `json:"degree"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Company     string `json:"company"`
	Title       string `json:"title"`
	LinkedinURL string `json:"linkedin_url"`
	City        string `json:"city"`
	SourceTier  int    `json:"source_tier"`
	SourceName  string `json:"source_name"`
}

// IncomingFromJSON deserializes an IncomingRecord from JSON.
func IncomingFromJSON(data []byte) (*IncomingRecord, error) {
	var rec IncomingRecord
	if err := json.Unmarshal(data, &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}
