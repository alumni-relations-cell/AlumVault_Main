package verifier

import (
	"testing"
)

func TestEmailSyntaxValidation(t *testing.T) {
	valid := []string{
		"test@example.com",
		"user.name@domain.co.in",
		"priya+tag@gmail.com",
	}
	invalid := []string{
		"not-an-email",
		"@domain.com",
		"user@",
		"",
		"user@.com",
	}

	for _, email := range valid {
		if !emailRegex.MatchString(email) {
			t.Errorf("Expected %q to be valid", email)
		}
	}

	for _, email := range invalid {
		if emailRegex.MatchString(email) {
			t.Errorf("Expected %q to be invalid", email)
		}
	}
}

func TestMXCache(t *testing.T) {
	cache := NewMXCache()

	// First lookup should do DNS (gmail.com should have MX records)
	records := cache.Lookup("gmail.com")
	if len(records) == 0 {
		t.Skip("No MX records found for gmail.com (might be network restricted)")
	}

	// Second lookup should come from cache
	records2 := cache.Lookup("gmail.com")
	if len(records2) != len(records) {
		t.Errorf("Cache miss: got %d records, want %d", len(records2), len(records))
	}

	// Invalidate and check
	cache.Invalidate("gmail.com")
}

func TestConnectionPoolDomainGroup(t *testing.T) {
	pool := NewConnectionPool()

	tests := []struct {
		domain   string
		expected string
	}{
		{"gmail.com", "gmail"},
		{"googlemail.com", "gmail"},
		{"outlook.com", "outlook"},
		{"hotmail.com", "outlook"},
		{"custom-domain.com", "default"},
	}

	for _, tt := range tests {
		group := pool.domainGroup(tt.domain)
		if group != tt.expected {
			t.Errorf("domainGroup(%q) = %q, want %q", tt.domain, group, tt.expected)
		}
	}
}
