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

// MatchResult contains the outcome of a matching operation.
type MatchResult struct {
	Decision       string         `json:"decision"`
	MatchedID      string         `json:"matched_id"`
	Score          int            `json:"score"`
	Breakdown      ScoreBreakdown `json:"breakdown"`
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
