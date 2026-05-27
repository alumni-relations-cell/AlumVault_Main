package verifier

import (
	"strings"
	"sync"
	"time"
)

// ConnectionPool provides per-domain rate limiting for SMTP connections.
// Gmail/Google: 2/sec, Outlook/MS: 2/sec, Others: 5/sec, per-IP total: 100/min.
type ConnectionPool struct {
	mu        sync.Mutex
	semaphores map[string]chan struct{}
	globalSem chan struct{}   // per-IP total: 100/min
	rates     map[string]int // max concurrent per domain group
}

// NewConnectionPool creates a rate-limited connection pool.
func NewConnectionPool() *ConnectionPool {
	return &ConnectionPool{
		semaphores: make(map[string]chan struct{}),
		globalSem:  make(chan struct{}, 100), // 100 concurrent total
		rates: map[string]int{
			"gmail":   2,
			"google":  2,
			"outlook": 2,
			"hotmail": 2,
			"live":    2,
			"default": 5,
		},
	}
}

// Acquire blocks until a rate limit slot is available for the domain.
func (p *ConnectionPool) Acquire(domain string) {
	group := p.domainGroup(domain)

	p.mu.Lock()
	sem, ok := p.semaphores[group]
	if !ok {
		limit := p.rates[group]
		if limit == 0 {
			limit = p.rates["default"]
		}
		sem = make(chan struct{}, limit)
		p.semaphores[group] = sem
	}
	p.mu.Unlock()

	// Per-domain rate limit
	sem <- struct{}{}
	// Global rate limit
	p.globalSem <- struct{}{}

	// Add delay to space out connections
	ratePerSec := p.rates[group]
	if ratePerSec == 0 {
		ratePerSec = p.rates["default"]
	}
	delay := time.Second / time.Duration(ratePerSec)
	time.Sleep(delay)
}

// Release frees a rate limit slot for the domain.
func (p *ConnectionPool) Release(domain string) {
	group := p.domainGroup(domain)

	p.mu.Lock()
	sem, ok := p.semaphores[group]
	p.mu.Unlock()

	if ok {
		<-sem
	}
	<-p.globalSem
}

// domainGroup maps a domain to its rate limit group.
func (p *ConnectionPool) domainGroup(domain string) string {
	lower := strings.ToLower(domain)
	if strings.Contains(lower, "gmail") || strings.Contains(lower, "google") {
		return "gmail"
	}
	if strings.Contains(lower, "outlook") || strings.Contains(lower, "hotmail") ||
		strings.Contains(lower, "live.com") || strings.Contains(lower, "microsoft") {
		return "outlook"
	}
	return "default"
}
