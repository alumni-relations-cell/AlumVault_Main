package importer

import (
	"testing"
)

func TestNormalizePhone(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"+919876543210", "+919876543210"},
		{"919876543210", "+919876543210"},
		{"09876543210", "+919876543210"},
		{"9876543210", "+919876543210"},
		{"+91 98765 43210", "+919876543210"},
		{"", ""},
	}

	for _, tt := range tests {
		result := NormalizePhone(tt.input)
		if result != tt.expected {
			t.Errorf("NormalizePhone(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Test@Example.COM", "test@example.com"},
		{"  user@domain.co.in  ", "user@domain.co.in"},
		{"not-an-email", ""},
		{"", ""},
		{"user@", ""},
		{"@domain.com", ""},
	}

	for _, tt := range tests {
		result := NormalizeEmail(tt.input)
		if result != tt.expected {
			t.Errorf("NormalizeEmail(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestNormalizeName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"priya sharma", "Priya Sharma"},
		{"  RAHUL   GUPTA  ", "Rahul Gupta"},
		{"ananya", "Ananya"},
		{"", ""},
	}

	for _, tt := range tests {
		result := NormalizeName(tt.input)
		if result != tt.expected {
			t.Errorf("NormalizeName(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestNormalizeBranch(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"cse", "Computer Science and Engineering"},
		{"CSE", "Computer Science and Engineering"},
		{"ece", "Electronics and Communication Engineering"},
		{"Mechanical Engineering", "Mechanical Engineering"},
		// Campus-location noise is stripped, so the variant collapses to plain CSE.
		{"COMPUTER SCIENCE & ENGINEERING (PATIALA CAMPUS)", "Computer Science and Engineering"},
		// A real specialization keeps its parenthetical label.
		{"Software Engineering", "Computer Science and Engineering (Software Engineering)"},
		{"", ""},
	}

	for _, tt := range tests {
		result := NormalizeBranch(tt.input)
		if result != tt.expected {
			t.Errorf("NormalizeBranch(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestDetectFormat(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"data.csv", "csv"},
		{"data.CSV", "csv"},
		{"report.tsv", "tsv"},
		{"sheet.xlsx", "xlsx"},
		{"unknown.txt", "unknown"},
	}

	for _, tt := range tests {
		result := DetectFormat(tt.path)
		if result != tt.expected {
			t.Errorf("DetectFormat(%q) = %q, want %q", tt.path, result, tt.expected)
		}
	}
}

func TestAssignConfidence(t *testing.T) {
	tests := []struct {
		tier     int
		expected float64
	}{
		{1, 95},
		{2, 82},
		{3, 70},
		{4, 58},
		{5, 40},
		{99, 50},
	}

	for _, tt := range tests {
		result := AssignConfidence(tt.tier)
		if result != tt.expected {
			t.Errorf("AssignConfidence(%d) = %f, want %f", tt.tier, result, tt.expected)
		}
	}
}
