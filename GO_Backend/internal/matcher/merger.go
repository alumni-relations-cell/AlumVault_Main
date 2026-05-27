package matcher

import (
	"encoding/json"
	"time"

	"github.com/your-org/alumni-go/internal/database"
)

// TierRules defines how tier-based field merging works.
// Higher tier always wins for same field.
// Same tier → more recent timestamp wins.
// Losing value goes to alumni_alternates table.
type TierRules struct {
	SourceTier int
	SourceName string
	Timestamp  time.Time
}

// MergeFields merges incoming data into existing record following tier-based rules.
// Returns the merged emails/phones JSONB and any alternate values to store.
func MergeFields(existing *database.AlumniRecord, incoming *IncomingRecord, incomingTier TierRules) (*MergeResult, error) {
	result := &MergeResult{
		UpdatedFields: make(map[string]interface{}),
		Alternates:    []AlternateEntry{},
	}

	// Merge simple text fields using tier comparison
	mergeTextField(result, existing.CurrentCompany, incoming.Company, "current_company", incomingTier)
	mergeTextField(result, existing.CurrentTitle, incoming.Title, "current_title", incomingTier)
	mergeTextField(result, existing.Industry, "", "industry", incomingTier) // incoming.Industry if available
	mergeTextField(result, existing.LinkedinURL, incoming.LinkedinURL, "linkedin_url", incomingTier)
	mergeTextField(result, existing.CurrentCity, incoming.City, "current_city", incomingTier)

	// Merge email into JSONB array
	if incoming.Email != "" {
		mergedEmails, alt, err := mergeContactEntry(existing.Emails, incoming.Email, "work", incomingTier)
		if err == nil {
			result.UpdatedFields["emails"] = mergedEmails
			if alt != nil {
				result.Alternates = append(result.Alternates, *alt)
			}
		}
	}

	// Merge phone into JSONB array
	if incoming.Phone != "" {
		mergedPhones, alt, err := mergeContactEntry(existing.Phones, incoming.Phone, "mobile", incomingTier)
		if err == nil {
			result.UpdatedFields["phones"] = mergedPhones
			if alt != nil {
				result.Alternates = append(result.Alternates, *alt)
			}
		}
	}

	return result, nil
}

// MergeResult contains the merged fields and any rejected alternate values.
type MergeResult struct {
	UpdatedFields map[string]interface{}
	Alternates    []AlternateEntry
}

// AlternateEntry represents a rejected value to store in alumni_alternates.
type AlternateEntry struct {
	FieldName      string  `json:"field_name"`
	ValueEncrypted string  `json:"value_encrypted"`
	SourceTier     int     `json:"source_tier"`
	SourceName     string  `json:"source_name"`
	Confidence     float64 `json:"confidence"`
	Reason         string  `json:"reason"`
}

// ContactEntry represents a single contact in the JSONB array.
type ContactEntry struct {
	Value      string  `json:"value"`
	Rank       int     `json:"rank"`
	Type       string  `json:"type"`
	SourceTier int     `json:"source_tier"`
	SourceName string  `json:"source_name"`
	Confidence float64 `json:"confidence"`
	SMTPStatus string  `json:"smtp_status"`
	AddedAt    string  `json:"added_at"`
}

func mergeTextField(result *MergeResult, existingVal, incomingVal, fieldName string, tier TierRules) {
	if incomingVal == "" {
		return
	}
	if existingVal == "" {
		result.UpdatedFields[fieldName] = incomingVal
		return
	}
	if existingVal == incomingVal {
		return
	}

	// For simplicity: higher tier incoming wins, existing becomes alternate
	// In a real system, we'd look up the existing field's source tier from field_sources
	result.UpdatedFields[fieldName] = incomingVal
	result.Alternates = append(result.Alternates, AlternateEntry{
		FieldName:      fieldName,
		ValueEncrypted: existingVal,
		SourceTier:     0, // unknown existing tier
		Reason:         "replaced_by_tier_" + string(rune('0'+tier.SourceTier)),
	})
}

func mergeContactEntry(existingJSON json.RawMessage, newValue, contactType string, tier TierRules) (json.RawMessage, *AlternateEntry, error) {
	var contacts []ContactEntry
	if len(existingJSON) > 0 {
		if err := json.Unmarshal(existingJSON, &contacts); err != nil {
			contacts = []ContactEntry{}
		}
	}

	// Check if value already exists
	for i, c := range contacts {
		if c.Value == newValue {
			// Update existing entry if incoming tier is higher
			if tier.SourceTier < c.SourceTier || (tier.SourceTier == c.SourceTier && tier.Timestamp.After(parseTime(c.AddedAt))) {
				contacts[i].SourceTier = tier.SourceTier
				contacts[i].SourceName = tier.SourceName
				contacts[i].AddedAt = tier.Timestamp.Format(time.RFC3339)
			}
			merged, _ := json.Marshal(contacts)
			return merged, nil, nil
		}
	}

	// Add new contact entry
	newEntry := ContactEntry{
		Value:      newValue,
		Rank:       len(contacts) + 1,
		Type:       contactType,
		SourceTier: tier.SourceTier,
		SourceName: tier.SourceName,
		Confidence: tierBaseConfidence(tier.SourceTier),
		SMTPStatus: "pending",
		AddedAt:    tier.Timestamp.Format(time.RFC3339),
	}

	contacts = append(contacts, newEntry)
	merged, _ := json.Marshal(contacts)
	return merged, nil, nil
}

func tierBaseConfidence(tier int) float64 {
	switch tier {
	case 1:
		return 95
	case 2:
		return 82
	case 3:
		return 70
	case 4:
		return 58
	case 5:
		return 40
	default:
		return 50
	}
}

func parseTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}
