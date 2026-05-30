package importer

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// RosterRow is a parsed admission cell row, ready for upsert into alumni.
// Only fields the admission roster actually carries are populated.
type RosterRow struct {
	EnrollmentNo    string
	FullName        string
	FatherName      string
	MotherName      string
	DOB             *time.Time
	Gender          string
	ProgramName     string
	BranchCode      string
	BranchDesc      string
	BranchCanonical string // mapped via NormalizeBranch
	Degree          string // canonical code (BE / ME / MBA / ...) derived from ProgramName
	AcademicYear    string // raw value like "1213" / "908"
	JoinYear        int    // derived from AcademicYear
	BatchYear       int    // JoinYear + program duration; 0 if unknown
	CurrentAddress  string
	CurrentCity     string
	CurrentState    string
	Pincode         string
	StudentEmail    string
	StudentPhone    string
	ParentEmail     string
	ParentPhone     string
}

// programDurationYears returns the standard graduation duration for a program
// name. Returns 0 if the program is unknown (caller should leave batch_year
// null rather than guess).
func programDurationYears(programName string) int {
	if programName == "" {
		return 0
	}
	p := strings.ToUpper(strings.Join(strings.Fields(programName), " "))

	// Lateral-entry B.Tech (2nd year entry) — 3 years to graduate.
	if strings.Contains(p, "LATERAL") {
		return 3
	}
	// Integrated / Dual Degree — 5 years.
	if strings.Contains(p, "INTEGRATED") || strings.Contains(p, "DUAL") {
		return 5
	}
	// PhD is variable (3-6 years typically) — refuse to guess.
	if strings.Contains(p, "PHD") || strings.Contains(p, "PH.D") || strings.Contains(p, "DOCTOR") {
		return 0
	}
	// 2-year masters — spelled-out and abbreviated forms.
	switch {
	case strings.Contains(p, "MASTER OF TECHNOLOGY"),
		strings.Contains(p, "MASTER OF SCIENCE"),
		strings.Contains(p, "MASTER OF BUSINESS"),
		strings.Contains(p, "MASTER OF COMPUTER"),
		strings.Contains(p, "MASTER OF PHARMACY"),
		strings.Contains(p, "MASTER OF ARTS"),
		strings.Contains(p, "MASTER OF LAW"),
		strings.Contains(p, "MASTER OF ENGINEERING"),
		strings.HasPrefix(p, "M.TECH"), strings.HasPrefix(p, "MTECH"),
		strings.HasPrefix(p, "M.SC"), strings.HasPrefix(p, "MSC"),
		strings.HasPrefix(p, "M.A"), strings.HasPrefix(p, "MA "),
		strings.HasPrefix(p, "MBA"), strings.HasPrefix(p, "MCA"),
		strings.HasPrefix(p, "M.E"), strings.HasPrefix(p, "ME "),
		strings.HasPrefix(p, "M.PHARM"), strings.HasPrefix(p, "LLM"):
		return 2
	}
	// 3-year bachelors — spelled-out and abbreviated forms.
	switch {
	case strings.Contains(p, "BACHELOR OF BUSINESS"),
		strings.Contains(p, "BACHELOR OF COMPUTER APPLICATIONS"),
		strings.Contains(p, "BACHELOR OF SCIENCE"),
		strings.Contains(p, "BACHELOR OF COMMERCE"),
		strings.Contains(p, "BACHELOR OF ARTS"),
		strings.HasPrefix(p, "BBA"), strings.HasPrefix(p, "BCA"),
		strings.HasPrefix(p, "B.SC"), strings.HasPrefix(p, "BSC"),
		strings.HasPrefix(p, "B.COM"), strings.HasPrefix(p, "BCOM"),
		strings.HasPrefix(p, "B.A"), strings.HasPrefix(p, "BA "):
		return 3
	}
	// 4-year bachelors — spelled-out and abbreviated forms. Thapar's admission
	// roster spells "Bachelor of Engineering" out in full; the abbreviated
	// forms cover other sheets that may be merged later.
	switch {
	case strings.Contains(p, "BACHELOR OF ENGINEERING"),
		strings.Contains(p, "BACHELOR OF TECHNOLOGY"),
		strings.Contains(p, "BACHELOR OF PHARMACY"),
		strings.HasPrefix(p, "B.TECH"), strings.HasPrefix(p, "BTECH"),
		strings.HasPrefix(p, "B.E"), strings.HasPrefix(p, "BE "),
		strings.HasPrefix(p, "B.PHARM"), strings.HasPrefix(p, "BPHARM"):
		return 4
	}
	return 0
}

// parseAcademicYear decodes the admission cell's ACADEMICYEAR encoding into
// the calendar year the student joined. The admission sheet uses a packed
// two-pair form: first two digits = joining year (yy), last two = the
// following calendar year. Excel sometimes strips the leading zero on the
// joining-year side and sometimes the operator types it with separators.
//
//	"1415"      -> 2014   (joined 2014-15)
//	"1213"      -> 2012
//	"908"       -> 2009   (Excel stripped leading zero from "0908")
//	"0809"      -> 2008
//	"14-15"     -> 2014   (separator-tolerant)
//	"14/15"     -> 2014
//	"2014-15"   -> 2014   (full-form first half wins)
//	"2014-2015" -> 2014
//	"2014"      -> 2014   (single full year)
//
// Returns 0 if the value can't be parsed.
func parseAcademicYear(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	// Strip everything that isn't a digit — handles "14-15", "2014/15",
	// "AY 2014-2015", and any other separator the admission cell typist uses.
	digits := make([]byte, 0, len(raw))
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if c >= '0' && c <= '9' {
			digits = append(digits, c)
		}
	}
	if len(digits) == 0 {
		return 0
	}

	// Full-year forms have **6+ digits after non-digit stripping** — they look
	// like "2014-15" → "201415", "2014/2015" → "20142015", or "AY 2014-2015"
	// → "20142015". Plain 4-digit values are *always* packed yy-pair in the
	// admission roster (Thapar's encoding), even when they happen to look like
	// a real year ("1920" means joined 2019, not the year 1920). Limiting the
	// full-year path to 6+ digits avoids the 1920→1924 mis-read.
	if len(digits) >= 6 && (digits[0] == '1' || digits[0] == '2') {
		fullYear, err := strconv.Atoi(string(digits[:4]))
		if err == nil && fullYear >= 1900 && fullYear <= 2099 {
			return fullYear
		}
	}

	// Otherwise it's the packed yy-pair form. Pad shorter values so Excel-
	// stripped leading zeros ("908" -> "0908") align before we take the first
	// pair as the joining-year yy.
	padded := string(digits)
	for len(padded) < 4 {
		padded = "0" + padded
	}
	yy, err := strconv.Atoi(padded[:2])
	if err != nil {
		return 0
	}
	// Y2K cutoff: anything >= 70 is 19yy (oldest alumni), else 20yy.
	if yy >= 70 {
		return 1900 + yy
	}
	return 2000 + yy
}

// parseRosterDate accepts the common admission-sheet date encodings:
// DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, or Excel serial numbers (e.g. "33970").
func parseRosterDate(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	layouts := []string{"02/01/2006", "2/1/2006", "02-01-2006", "2006-01-02", "01/02/2006"}
	for _, l := range layouts {
		if t, err := time.Parse(l, raw); err == nil {
			return &t
		}
	}
	// Excel serial: days since 1899-12-30 (Excel's quirk: 1900 treated as leap).
	if n, err := strconv.Atoi(raw); err == nil && n > 10000 && n < 80000 {
		base := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC)
		t := base.AddDate(0, 0, n)
		return &t
	}
	return nil
}

// ParseRosterRow maps an upper-cased admission cell row into a RosterRow.
// Returns an error only when the row is unusable (missing enrollment_no or
// name). Anything else just leaves fields blank.
func ParseRosterRow(fields map[string]string) (*RosterRow, error) {
	// Admission cell column names are upper-case; the file parsers preserve
	// the header casing as-is. Look up via a helper that ignores case.
	get := func(keys ...string) string {
		for _, k := range keys {
			for fk, fv := range fields {
				if strings.EqualFold(strings.TrimSpace(fk), k) {
					return strings.TrimSpace(fv)
				}
			}
		}
		return ""
	}

	enrollment := get("ENROLLMENTNO", "ENROLLMENT_NO", "ENROLLMENT NO")
	name := get("STUDENTNAME", "STUDENT_NAME", "STUDENT NAME", "FULL_NAME")
	if enrollment == "" {
		return nil, fmt.Errorf("missing ENROLLMENTNO")
	}
	if name == "" {
		return nil, fmt.Errorf("missing STUDENTNAME")
	}

	rr := &RosterRow{
		EnrollmentNo:   enrollment,
		FullName:       NormalizeName(name),
		FatherName:     NormalizeName(get("FATHERNAME", "FATHER_NAME")),
		MotherName:     NormalizeName(get("MOTHERNAME", "MOTHER_NAME")),
		Gender:         strings.ToUpper(get("SEX", "GENDER")),
		ProgramName:    get("PROGRAMNAME", "PROGRAM_NAME"),
		BranchCode:     get("BRANCHCODE", "BRANCH_CODE"),
		BranchDesc:     get("BRANCHDESC", "BRANCH_DESC", "BRANCH"),
		AcademicYear:   get("ACADEMICYEAR", "ACADEMIC_YEAR"),
		CurrentAddress: get("CADDRESS", "CURRENT_ADDRESS", "ADDRESS"),
		CurrentCity:    get("CCITY", "CURRENT_CITY", "CITY"),
		CurrentState:   get("CSTATE", "CURRENT_STATE", "STATE"),
		Pincode:        get("CPIN", "PINCODE", "PIN"),
		StudentEmail:   NormalizeEmail(get("STEMAILID", "ST_EMAIL_ID", "STUDENT_EMAIL")),
		StudentPhone:   NormalizePhone(get("STCELLNO", "ST_CELL_NO", "STUDENT_PHONE")),
		ParentEmail:    NormalizeEmail(get("PAEMAILID", "PA_EMAIL_ID", "PARENT_EMAIL")),
		ParentPhone:    NormalizePhone(get("PACELLNO", "PA_CELL_NO", "PARENT_PHONE")),
	}

	// Branch canonical form for matcher identity lookups. Prefer BRANCHDESC
	// (e.g. "Computer Science and Engineering"), fall back to BRANCHCODE.
	rr.BranchCanonical = CanonicalBranch(rr.BranchDesc)
	if rr.BranchCanonical == "" {
		rr.BranchCanonical = CanonicalBranch(rr.BranchCode)
	}
	// Degree from PROGRAMNAME — "Bachelor of Engineering" → "BE", etc.
	rr.Degree = CanonicalDegree(rr.ProgramName)

	rr.DOB = parseRosterDate(get("DOB", "DATE_OF_BIRTH", "BIRTH_DATE"))
	rr.JoinYear = parseAcademicYear(rr.AcademicYear)
	if rr.JoinYear > 0 {
		if dur := programDurationYears(rr.ProgramName); dur > 0 {
			rr.BatchYear = rr.JoinYear + dur
		}
	}

	return rr, nil
}
