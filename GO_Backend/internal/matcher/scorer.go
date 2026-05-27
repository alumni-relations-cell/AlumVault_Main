package matcher

import "strings"

// ScoreBreakdown contains the individual score components for a match.
type ScoreBreakdown struct {
	NameExact     int `json:"name_exact"`
	NameFuzzy     int `json:"name_fuzzy"`
	LinkedIn      int `json:"linkedin"`
	BatchYear     int `json:"batch_year"`
	Branch        int `json:"branch"`
	EmailDomain   int `json:"email_domain"`
	Location      int `json:"location"`
	AgePlausible  int `json:"age_plausible"`
}

// TotalScore returns the sum of all score components.
func (s *ScoreBreakdown) TotalScore() int {
	return s.NameExact + s.NameFuzzy + s.LinkedIn + s.BatchYear +
		s.Branch + s.EmailDomain + s.Location + s.AgePlausible
}

// ScoreName scores name similarity between two names.
// Exact match: +25, Fuzzy match (>85% JaroWinkler): +15
func ScoreName(incoming, existing string) (exact, fuzzy int) {
	if strings.EqualFold(strings.TrimSpace(incoming), strings.TrimSpace(existing)) {
		return 25, 0
	}
	jw := JaroWinkler(incoming, existing)
	if jw > 0.85 {
		return 0, 15
	}
	return 0, 0
}

// ScoreBatch scores batch year match. +25 if exact match (and non-zero).
func ScoreBatch(incoming, existing int) int {
	if incoming > 0 && incoming == existing {
		return 25
	}
	return 0
}

// ScoreBranch scores branch/field of study match. +15 if match.
func ScoreBranch(incoming, existing string) int {
	if incoming == "" || existing == "" {
		return 0
	}
	if strings.EqualFold(strings.TrimSpace(incoming), strings.TrimSpace(existing)) {
		return 15
	}
	return 0
}

// ScoreLinkedIn scores LinkedIn education presence. +30 if "Thapar" appears.
func ScoreLinkedIn(linkedinURL string) int {
	if strings.Contains(strings.ToLower(linkedinURL), "thapar") {
		return 30
	}
	return 0
}

// ScoreEmailDomain checks if the email has a college domain. +20 if match.
func ScoreEmailDomain(email string) int {
	collegeDomains := []string{"@thapar.edu", "@tiet.edu"}
	lower := strings.ToLower(email)
	for _, domain := range collegeDomains {
		if strings.HasSuffix(lower, domain) {
			return 20
		}
	}
	return 0
}

// ScoreLocation checks if location is plausible (Indian city). +5 if match.
func ScoreLocation(city string) int {
	indianCities := []string{
		"delhi", "mumbai", "bengaluru", "bangalore", "hyderabad", "chennai",
		"kolkata", "pune", "ahmedabad", "jaipur", "chandigarh", "patiala",
		"noida", "gurgaon", "gurugram", "lucknow", "bhopal", "indore",
		"nagpur", "visakhapatnam", "coimbatore", "kochi", "mysore",
		"thiruvananthapuram", "surat", "vadodara", "kanpur",
	}
	lower := strings.ToLower(strings.TrimSpace(city))
	for _, c := range indianCities {
		if strings.Contains(lower, c) {
			return 5
		}
	}
	return 0
}

// ScoreAgePlausible checks if graduation year is plausible. +5 if within range.
func ScoreAgePlausible(batchYear int) int {
	if batchYear >= 1960 && batchYear <= 2030 {
		return 5
	}
	return 0
}

// ComputeBreakdown calculates the full score breakdown for a candidate match.
func ComputeBreakdown(incomingName, existingName string,
	incomingBatch, existingBatch int,
	incomingBranch, existingBranch string,
	linkedinURL, email, city string) ScoreBreakdown {

	nameExact, nameFuzzy := ScoreName(incomingName, existingName)

	return ScoreBreakdown{
		NameExact:    nameExact,
		NameFuzzy:    nameFuzzy,
		LinkedIn:     ScoreLinkedIn(linkedinURL),
		BatchYear:    ScoreBatch(incomingBatch, existingBatch),
		Branch:       ScoreBranch(incomingBranch, existingBranch),
		EmailDomain:  ScoreEmailDomain(email),
		Location:     ScoreLocation(city),
		AgePlausible: ScoreAgePlausible(incomingBatch),
	}
}
