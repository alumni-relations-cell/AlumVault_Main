package importer

import (
	"math"
	"time"
)

// Source tier definitions with base confidence values.
// Tier 1: College official records (95%)
// Tier 2: Alumni portal self-reported (82%, decay -3%/yr)
// Tier 3: Manually mined Apollo by team (70%)
// Tier 4: Auto-mined Python pipeline (58%)
// Tier 5: Crowdsourced/unverified sheets (40%)

// TierConfig holds the configuration for a source tier.
type TierConfig struct {
	Tier           int
	Name           string
	BaseConfidence float64
	DecayRate      float64 // percentage per year
	DecayEnabled   bool
}

// TierConfigs maps tier numbers to their configurations.
var TierConfigs = map[int]TierConfig{
	1: {Tier: 1, Name: "college_official", BaseConfidence: 95, DecayRate: 0, DecayEnabled: false},
	2: {Tier: 2, Name: "alumni_portal", BaseConfidence: 82, DecayRate: 3, DecayEnabled: true},
	3: {Tier: 3, Name: "manually_mined", BaseConfidence: 70, DecayRate: 0, DecayEnabled: false},
	4: {Tier: 4, Name: "auto_mined", BaseConfidence: 58, DecayRate: 0, DecayEnabled: false},
	5: {Tier: 5, Name: "crowdsourced", BaseConfidence: 40, DecayRate: 0, DecayEnabled: false},
}

// AssignConfidence returns the base confidence for a given source tier.
func AssignConfidence(tier int) float64 {
	config, ok := TierConfigs[tier]
	if !ok {
		return 50 // default for unknown tiers
	}
	return config.BaseConfidence
}

// ApplyDecay reduces confidence based on time elapsed since last update.
// Only applies to tiers with decay enabled (e.g., tier 2: -3% per year).
func ApplyDecay(confidence float64, tier int, lastUpdated time.Time) float64 {
	config, ok := TierConfigs[tier]
	if !ok || !config.DecayEnabled || config.DecayRate == 0 {
		return confidence
	}

	yearsSinceUpdate := time.Since(lastUpdated).Hours() / (24 * 365.25)
	decay := config.DecayRate * yearsSinceUpdate

	result := confidence - decay
	return math.Max(0, math.Min(95, result))
}

// SMTPConfidenceAdjustment returns the confidence adjustment based on SMTP status.
// Valid: +40 (capped at 95), Catch-all: +15, Invalid: flag for re-mine.
func SMTPConfidenceAdjustment(smtpStatus string) float64 {
	switch smtpStatus {
	case "valid":
		return 40
	case "catch_all":
		return 15
	case "invalid":
		return -20 // flag for GMass re-mine
	default:
		return 0
	}
}

// ComputeDataCompleteness calculates what percentage of fields are filled.
func ComputeDataCompleteness(fields map[string]string) float64 {
	expectedFields := []string{
		"full_name", "enrollment_no", "batch_year", "branch", "degree",
		"email", "phone", "current_company", "current_title",
		"linkedin_url", "current_city",
	}

	filled := 0
	for _, field := range expectedFields {
		if val, ok := fields[field]; ok && val != "" {
			filled++
		}
	}

	if len(expectedFields) == 0 {
		return 0
	}
	return float64(filled) / float64(len(expectedFields)) * 100
}
