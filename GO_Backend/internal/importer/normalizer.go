package importer

import (
	"regexp"
	"strings"
	"unicode"
)

var phoneRegex = regexp.MustCompile(`[^\d+]`)

// NormalizePhone normalizes a phone number to +91XXXXXXXXXX format.
func NormalizePhone(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	// Strip all non-digit characters except +
	cleaned := phoneRegex.ReplaceAllString(raw, "")

	// Handle various formats
	switch {
	case strings.HasPrefix(cleaned, "+91") && len(cleaned) == 13:
		return cleaned // Already in correct format
	case strings.HasPrefix(cleaned, "91") && len(cleaned) == 12:
		return "+" + cleaned
	case strings.HasPrefix(cleaned, "0") && len(cleaned) == 11:
		return "+91" + cleaned[1:]
	case len(cleaned) == 10:
		return "+91" + cleaned
	default:
		// Return as-is if we can't normalize
		if len(cleaned) >= 10 {
			return "+" + cleaned
		}
		return cleaned
	}
}

// NormalizeEmail normalizes an email address: lowercase, trimmed, validated.
func NormalizeEmail(raw string) string {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" {
		return ""
	}

	// Basic validation: must contain @
	if !strings.Contains(email, "@") {
		return ""
	}

	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return ""
	}

	// Ensure domain has at least one dot
	if !strings.Contains(parts[1], ".") {
		return ""
	}

	return email
}

// NormalizeName normalizes a name to proper case (title case), trimmed.
func NormalizeName(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	// Remove extra whitespace
	words := strings.Fields(raw)
	for i, word := range words {
		words[i] = properCase(word)
	}

	return strings.Join(words, " ")
}

// NormalizeBranch normalizes branch names to standard formats.
func NormalizeBranch(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	lower := strings.ToLower(raw)

	// Common abbreviation mappings
	mappings := map[string]string{
		"cse":  "Computer Science",
		"cs":   "Computer Science",
		"ece":  "Electronics and Communication",
		"eee":  "Electrical Engineering",
		"ee":   "Electrical Engineering",
		"me":   "Mechanical Engineering",
		"mech": "Mechanical Engineering",
		"ce":   "Civil Engineering",
		"civil": "Civil Engineering",
		"chem": "Chemical Engineering",
		"bio":  "Biotechnology",
		"it":   "Information Technology",
	}

	if mapped, ok := mappings[lower]; ok {
		return mapped
	}

	return NormalizeName(raw)
}

func properCase(word string) string {
	if word == "" {
		return ""
	}
	runes := []rune(strings.ToLower(word))
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}
