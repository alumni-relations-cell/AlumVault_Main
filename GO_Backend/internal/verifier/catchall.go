package verifier

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net"
	"net/smtp"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// catchAllCache caches catch-all detection results per domain.
var catchAllCache = struct {
	mu    sync.RWMutex
	cache map[string]*catchAllEntry
}{cache: make(map[string]*catchAllEntry)}

type catchAllEntry struct {
	isCatchAll bool
	expiresAt  time.Time
}

// IsCatchAll detects if a domain is a catch-all by testing a random address.
// A catch-all domain accepts mail for any address (e.g., xz99random@domain).
func IsCatchAll(domain, mxHost string) bool {
	// Check cache first
	catchAllCache.mu.RLock()
	entry, ok := catchAllCache.cache[domain]
	catchAllCache.mu.RUnlock()

	if ok && time.Now().Before(entry.expiresAt) {
		return entry.isCatchAll
	}

	// Generate a random probe email
	probeEmail := generateRandomEmail(domain)

	result := probeCatchAll(probeEmail, mxHost)

	// Cache result for 1 hour
	catchAllCache.mu.Lock()
	catchAllCache.cache[domain] = &catchAllEntry{
		isCatchAll: result,
		expiresAt:  time.Now().Add(1 * time.Hour),
	}
	catchAllCache.mu.Unlock()

	return result
}

func probeCatchAll(probeEmail, mxHost string) bool {
	conn, err := net.DialTimeout("tcp", mxHost+":25", 10*time.Second)
	if err != nil {
		return false
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(15 * time.Second))

	client, err := smtp.NewClient(conn, mxHost)
	if err != nil {
		return false
	}
	defer client.Close()

	if err := client.Hello("verify.alumni.thapar.edu"); err != nil {
		return false
	}
	if err := client.Mail("noreply@alumni.thapar.edu"); err != nil {
		return false
	}

	// If a random address is accepted, it's a catch-all domain
	err = client.Rcpt(probeEmail)
	if err == nil {
		log.Debug().Str("probe", probeEmail).Msg("Domain is catch-all")
		return true
	}

	// SMTP error means the address was rejected — not catch-all
	errStr := err.Error()
	if strings.Contains(errStr, "550") || strings.Contains(errStr, "551") ||
		strings.Contains(errStr, "553") {
		return false
	}

	return false
}

func generateRandomEmail(domain string) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 12)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		b[i] = chars[n.Int64()]
	}
	return fmt.Sprintf("xz99probe_%s@%s", string(b), domain)
}
