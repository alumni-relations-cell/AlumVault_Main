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

// NormalizeBranch normalizes branch names to standard display formats. When
// the input maps to a known bucket but isn't already the canonical form
// (e.g. "CAD/CAM" → ME bucket but the alumnus is really a CAD/CAM
// specialization), the input is preserved as a parenthetical:
// "Mechanical Engineering (CAD/CAM)". Inputs that already match the canonical
// display or short code are returned plain.
func NormalizeBranch(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	canonical := CanonicalBranch(raw)
	if canonical == "" {
		return NormalizeName(raw)
	}
	display := branchCanonicalDisplay[canonical]
	if display == "" {
		display = canonical
	}
	// Drop-set: store just the canonical display, no input parenthetical.
	// Use for buckets whose synonyms are pure spelling variants (e.g. VLSI).
	if branchDropSpec[canonical] {
		return display
	}
	rawLower := strings.ToLower(raw)
	displayLower := strings.ToLower(display)
	if rawLower == displayLower || rawLower == strings.ToLower(canonical) {
		return display
	}
	if strings.HasPrefix(rawLower, displayLower+" (") {
		return raw
	}
	return display + " (" + raw + ")"
}

// Mirrors BRANCH_DROP_SPEC in backend/src/services/review.service.js — keep
// in sync when adding new buckets that should drop the input parenthetical.
var branchDropSpec = map[string]bool{
	"VLSI": true,
}

// CanonicalBranch returns a short stable key for a branch ("CSE", "ECE", ...)
// regardless of the input form. Used by both the importer (to write a
// consistent value into alumni.branch) and the matcher (to join across
// different spellings when doing identity lookups).
//
// Returns "" if the input doesn't match any known branch — callers should
// fall back to the raw normalized string in that case.
func CanonicalBranch(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	key := strings.ToLower(raw)
	// Collapse separators and "engineering" suffix so "Computer Sci. & Engg.",
	// "Computer Science and Engineering", "computer-science" all converge.
	// Parens are stripped too so already-normalized "Mechanical Engineering
	// (CAD/CAM)" still resolves to the ME bucket.
	key = strings.NewReplacer(
		"&", " and ", ".", " ", ",", " ", "-", " ", "/", " ", "_", " ",
		"(", " ", ")", " ", "[", " ", "]", " ",
	).Replace(key)
	key = strings.Join(strings.Fields(key), " ")
	key = strings.TrimSuffix(key, " engineering")
	key = strings.TrimSuffix(key, " engg")
	key = strings.TrimSuffix(key, " engr")
	key = strings.TrimSpace(key)

	if c, ok := branchSynonyms[key]; ok {
		return c
	}
	// Prefix fallback for the long tail of 3-letter codes the registrar
	// sheets are riddled with (Mee, Phy, Eice, Sde, …). Each rule must be
	// specific enough that false-positives are vanishingly unlikely.
	for _, rule := range branchPrefixRules {
		for _, prefix := range rule.prefixes {
			if strings.HasPrefix(key, prefix) {
				return rule.canonical
			}
		}
	}
	return ""
}

type branchPrefixRule struct {
	prefixes  []string
	canonical string
}

// Kept in lockstep with backend/src/services/review.service.js's
// BRANCH_PREFIX_RULES — update both when adding entries.
var branchPrefixRules = []branchPrefixRule{
	{[]string{"comp", "cs", "coe", "softw", "sde", "csa", "cose", "coem", "csed", "ecem"}, "CSE"},
	{[]string{"ec", "enc", "eice"}, "ECE"},
	{[]string{"eic", "eied", "ine", "icp"}, "EIC"},
	{[]string{"ele", "ee ", "eed"}, "EE"},
	{[]string{"mech", "mec", "mee", "mpe"}, "ME"},
	{[]string{"chem", "cml", "chh"}, "CHE"},
	{[]string{"civ", "ce(", "cce", "cine", "ciem", "geo"}, "CIVIL"},
	{[]string{"bio", "bt", "btd", "bcem"}, "BIO"},
	{[]string{"biom", "bm"}, "BIOMED"},
	{[]string{"info", "itn", "mfg"}, "IT"},
	{[]string{"mat", "metal", "meem", "mse"}, "MATSC"},
	{[]string{"phy"}, "PHY"},
	{[]string{"math", "maths"}, "MATH"},
	{[]string{"chemistry", "cbh", "biochem"}, "CHEM_SCI"},
	{[]string{"mba", "mgm", "mgmt", "mbabr", "lmtsm", "som", "shss"}, "MBA"},
	{[]string{"mca", "imca", "mcacc"}, "MCA"},
	{[]string{"psy", "clp"}, "PSY"},
	{[]string{"vlsi", "vd", "vdc"}, "VLSI"},
}

// CanonicalDegree collapses every spelling of a degree to its short code so
// "BTech", "B.Tech", "BE", "be", "b.e.", "Bachelor of Engineering",
// "Bachelor of Technology" all land on "BE". Used by both import paths so the
// alumni.degree column has a stable value the UI/exports can group on.
// Unknown inputs are returned unchanged.
func CanonicalDegree(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// Strip everything that isn't a letter, then upper-case. Handles dots,
	// hyphens, spaces, and case all in one pass.
	key := make([]byte, 0, len(raw))
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if c >= 'a' && c <= 'z' {
			key = append(key, c-32)
		} else if c >= 'A' && c <= 'Z' {
			key = append(key, c)
		}
	}
	k := string(key)
	switch {
	case k == "BE" || k == "BTECH" || k == "BENGG" ||
		strings.HasPrefix(k, "BACHELOROFENGINEERING") ||
		strings.HasPrefix(k, "BACHELOROFTECHNOLOGY"):
		return "BE"
	case k == "ME" || k == "MTECH" || k == "MENGG" ||
		strings.HasPrefix(k, "MASTEROFENGINEERING") ||
		strings.HasPrefix(k, "MASTEROFTECHNOLOGY"):
		return "ME"
	case k == "BPHARM" || strings.HasPrefix(k, "BACHELOROFPHARMACY"):
		return "BPharm"
	case k == "MPHARM" || strings.HasPrefix(k, "MASTEROFPHARMACY"):
		return "MPharm"
	case k == "MBA" || strings.HasPrefix(k, "MASTEROFBUSINESS"):
		return "MBA"
	case k == "MCA" || strings.HasPrefix(k, "MASTEROFCOMPUTER"):
		return "MCA"
	case k == "BBA" || strings.HasPrefix(k, "BACHELOROFBUSINESS"):
		return "BBA"
	case k == "BCA" || strings.HasPrefix(k, "BACHELOROFCOMPUTERAPPLICATIONS"):
		return "BCA"
	case k == "BSC" || strings.HasPrefix(k, "BACHELOROFSCIENCE"):
		return "BSc"
	case k == "MSC" || strings.HasPrefix(k, "MASTEROFSCIENCE"):
		return "MSc"
	case k == "BCOM" || strings.HasPrefix(k, "BACHELOROFCOMMERCE"):
		return "BCom"
	case k == "BA" || strings.HasPrefix(k, "BACHELOROFARTS"):
		return "BA"
	case k == "MA" || strings.HasPrefix(k, "MASTEROFARTS"):
		return "MA"
	case k == "LLB" || strings.HasPrefix(k, "BACHELOROFLAW"):
		return "LLB"
	case k == "LLM" || strings.HasPrefix(k, "MASTEROFLAW"):
		return "LLM"
	case strings.Contains(k, "PHD") || strings.Contains(k, "DOCTOR"):
		return "PhD"
	}
	return raw
}

// branchSynonyms maps every lower-cased input form to a canonical short code.
// When extending, always lower-case the key and strip the "engineering" suffix
// (CanonicalBranch does the same to the input before lookup).
var branchSynonyms = map[string]string{
	// Computer Science / Engineering — Thapar treats Software Engineering as
	// a CSE specialization, so all software-eng spellings fold into CSE.
	// "Computer Applications" stays separate (mapped to MCA below).
	"cse": "CSE", "cs": "CSE", "computer science": "CSE",
	"computer science and": "CSE", "comp sci": "CSE", "comp science": "CSE",
	"computer": "CSE", "coe": "CSE",
	"software": "CSE", "se": "CSE",
	"software engg": "CSE", "computer software": "CSE",
	// Electronics & Communication — kept distinct from EIC.
	"ece": "ECE", "ec": "ECE", "enc": "ECE",
	"electronics and communication": "ECE",
	"electronics and communications": "ECE",
	"electronics communication": "ECE", "electronics": "ECE",
	// Electrical
	"ee": "EE", "eee": "EE", "electrical": "EE",
	// Electronics & Instrumentation / Control — kept distinct from ECE.
	// Stored as "Electronics and Instrumentation" via branchCanonicalDisplay.
	"eic": "EIC", "electronics instrumentation": "EIC",
	"electronics and instrumentation": "EIC",
	"instrumentation and control": "EIC",
	"electronics instrumentation and control": "EIC",
	// Mechanical — CAD/CAM is a mechanical specialization at Thapar, so its
	// variants fold into this bucket. After CanonicalBranch's separator pass,
	// "CAD/CAM" becomes "cad cam"; "CAD/CAM Engineering" becomes "cad cam"
	// (suffix stripped); "CAD/CAM & Robotics" becomes "cad cam and robotics".
	"me": "ME", "mech": "ME", "mechanical": "ME",
	"cad cam": "ME", "cad cam and robotics": "ME", "cad cam robotics": "ME",
	// Chemical
	"che": "CHE", "chem": "CHE", "chemical": "CHE",
	// Civil
	"ce": "CIVIL", "civil": "CIVIL",
	// Biotech
	"bt": "BIO", "bio": "BIO", "biotech": "BIO", "biotechnology": "BIO",
	// IT
	"it": "IT", "information technology": "IT",
	// Management / others
	"mba": "MBA", "mca": "MCA", "bba": "BBA", "bca": "BCA",
	"master of computer applications": "MCA", "computer applications": "MCA",
	"computer application": "MCA",
	"master of business administration": "MBA",
	// Thermal (M.Tech specialization). Stored as "Thermal Engineering".
	"thermal": "THERMAL", "thr": "THERMAL",
	// VLSI — spelling variants only. Stored as "VLSI".
	"vlsi": "VLSI", "vlsi design": "VLSI", "vlsi design and cad": "VLSI",
	"vlsi and cad": "VLSI",
	// Pure-science specialisations distinct from BIO (biotech) and CHE (chemical eng).
	"microbiology": "MICRO", "mbio": "MICRO",
	"biochemistry": "BIOCHEM", "bio chemistry": "BIOCHEM",
}

// branchCanonicalDisplay maps a canonical key back to a human-readable label
// — what gets stored in alumni.branch when NormalizeBranch picks a match.
var branchCanonicalDisplay = map[string]string{
	"CSE":      "Computer Science and Engineering",
	"ECE":      "Electronics and Communication Engineering",
	"EE":       "Electrical Engineering",
	"EIC":      "Electronics and Instrumentation",
	"ME":       "Mechanical Engineering",
	"CHE":      "Chemical Engineering",
	"CIVIL":    "Civil Engineering",
	"BIO":      "Biotechnology",
	"BIOMED":   "Biomedical Engineering",
	"IT":       "Information Technology",
	"MATSC":    "Materials Science and Engineering",
	"PHY":      "Physics",
	"MATH":     "Mathematics and Computing",
	"CHEM_SCI": "Chemistry",
	"PSY":      "Psychology",
	"VLSI":     "VLSI",
	"MBA":      "MBA",
	"MCA":      "MCA",
	"BBA":      "BBA",
	"BCA":      "BCA",
	"THERMAL":  "Thermal Engineering",
	"MICRO":    "Microbiology",
	"BIOCHEM":  "Biochemistry",
}

func properCase(word string) string {
	if word == "" {
		return ""
	}
	runes := []rune(strings.ToLower(word))
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}
