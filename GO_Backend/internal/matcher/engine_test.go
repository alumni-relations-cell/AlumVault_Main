package matcher

import (
	"testing"
)

func TestLevenshteinDistance(t *testing.T) {
	tests := []struct {
		a, b     string
		expected int
	}{
		{"kitten", "sitting", 3},
		{"", "", 0},
		{"abc", "abc", 0},
		{"abc", "def", 3},
		{"priya sharma", "priya sharma", 0},
		{"priya sharma", "priya s.", 5},
	}

	for _, tt := range tests {
		result := LevenshteinDistance(tt.a, tt.b)
		if result != tt.expected {
			t.Errorf("LevenshteinDistance(%q, %q) = %d, want %d", tt.a, tt.b, result, tt.expected)
		}
	}
}

func TestJaroWinkler(t *testing.T) {
	tests := []struct {
		a, b    string
		minSim  float64
	}{
		{"martha", "marhta", 0.96},
		{"jones", "johnson", 0.80},
		{"abcdef", "abcdef", 1.0},
		{"", "test", 0.0},
		{"priya sharma", "priya sharma", 1.0},
		{"priya sharma", "priya s.", 0.80},
	}

	for _, tt := range tests {
		result := JaroWinkler(tt.a, tt.b)
		if result < tt.minSim {
			t.Errorf("JaroWinkler(%q, %q) = %f, want >= %f", tt.a, tt.b, result, tt.minSim)
		}
	}
}

func TestNormalizedSimilarity(t *testing.T) {
	tests := []struct {
		a, b   string
		minSim float64
	}{
		{"priya sharma", "priya sharma", 1.0},
		{"priya sharma", "priya s.", 0.5},
		{"", "", 1.0},
	}

	for _, tt := range tests {
		result := NormalizedSimilarity(tt.a, tt.b)
		if result < tt.minSim {
			t.Errorf("NormalizedSimilarity(%q, %q) = %f, want >= %f", tt.a, tt.b, result, tt.minSim)
		}
	}
}

func TestScoreName(t *testing.T) {
	exact, fuzzy := ScoreName("Priya Sharma", "priya sharma")
	if exact != 25 || fuzzy != 0 {
		t.Errorf("Exact name match: got exact=%d, fuzzy=%d, want 25, 0", exact, fuzzy)
	}

	exact, fuzzy = ScoreName("Priya Sharma", "Prya Sharma")
	if exact != 0 || fuzzy != 15 {
		t.Errorf("Fuzzy name match: got exact=%d, fuzzy=%d, want 0, 15", exact, fuzzy)
	}

	exact, fuzzy = ScoreName("Priya Sharma", "Totally Different")
	if exact != 0 || fuzzy != 0 {
		t.Errorf("No match: got exact=%d, fuzzy=%d, want 0, 0", exact, fuzzy)
	}
}

func TestScoreBatch(t *testing.T) {
	if ScoreBatch(2018, 2018) != 25 {
		t.Error("Matching batch should score 25")
	}
	if ScoreBatch(2018, 2019) != 0 {
		t.Error("Non-matching batch should score 0")
	}
	if ScoreBatch(0, 2018) != 0 {
		t.Error("Zero batch should score 0")
	}
}

func TestScoreBranch(t *testing.T) {
	if ScoreBranch("Computer Science", "computer science") != 15 {
		t.Error("Matching branch should score 15")
	}
	if ScoreBranch("Computer Science", "Mechanical") != 0 {
		t.Error("Non-matching branch should score 0")
	}
}

func TestCompositeScore(t *testing.T) {
	breakdown := ComputeBreakdown(
		"Priya Sharma", "Priya Sharma",
		2018, 2018,
		"Computer Science", "Computer Science",
		"https://linkedin.com/in/priya-thapar",
		"priya@thapar.edu",
		"Bengaluru",
	)

	total := breakdown.TotalScore()
	// Expected: 25 (name exact) + 30 (linkedin) + 25 (batch) + 15 (branch) + 20 (email) + 5 (location) + 5 (age) = 125
	if total < AutoMergeThreshold {
		t.Errorf("Perfect match should auto-merge, got score %d (threshold %d)", total, AutoMergeThreshold)
	}
}

func TestReviewScore(t *testing.T) {
	breakdown := ComputeBreakdown(
		"Priya S.", "Priya Sharma",
		2018, 2018,
		"", "",
		"", "", "",
	)

	total := breakdown.TotalScore()
	if total < ReviewThreshold || total >= AutoMergeThreshold {
		t.Errorf("Partial match should go to review, got score %d", total)
	}
}
