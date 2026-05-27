package verifier

import (
	"net"
	"sort"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// MXCache provides MX record lookups with a 1-hour TTL cache.
type MXCache struct {
	mu    sync.RWMutex
	cache map[string]*mxEntry
}

type mxEntry struct {
	records   []string
	expiresAt time.Time
}

// NewMXCache creates a new MX record cache.
func NewMXCache() *MXCache {
	return &MXCache{cache: make(map[string]*mxEntry)}
}

// Lookup returns the MX servers for a domain, using cache when available.
// Results are sorted by MX priority (lowest first).
func (c *MXCache) Lookup(domain string) []string {
	c.mu.RLock()
	entry, ok := c.cache[domain]
	c.mu.RUnlock()

	if ok && time.Now().Before(entry.expiresAt) {
		return entry.records
	}

	// Cache miss — do DNS lookup
	records := lookupMX(domain)

	c.mu.Lock()
	c.cache[domain] = &mxEntry{
		records:   records,
		expiresAt: time.Now().Add(1 * time.Hour),
	}
	c.mu.Unlock()

	return records
}

// lookupMX performs a DNS MX lookup for the given domain.
func lookupMX(domain string) []string {
	mxRecords, err := net.LookupMX(domain)
	if err != nil {
		log.Warn().Str("domain", domain).Err(err).Msg("MX lookup failed")
		return nil
	}

	// Sort by preference (lowest first)
	sort.Slice(mxRecords, func(i, j int) bool {
		return mxRecords[i].Pref < mxRecords[j].Pref
	})

	hosts := make([]string, 0, len(mxRecords))
	for _, mx := range mxRecords {
		host := mx.Host
		// Remove trailing dot from DNS names
		if len(host) > 0 && host[len(host)-1] == '.' {
			host = host[:len(host)-1]
		}
		hosts = append(hosts, host)
	}

	return hosts
}

// Invalidate removes a domain from the cache.
func (c *MXCache) Invalidate(domain string) {
	c.mu.Lock()
	delete(c.cache, domain)
	c.mu.Unlock()
}
