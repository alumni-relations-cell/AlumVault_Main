package verifier

import (
	"fmt"
	"net"
	"net/smtp"
	"regexp"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
)

// SMTPStatus represents the result of an SMTP verification.
type SMTPStatus string

const (
	StatusValid    SMTPStatus = "valid"
	StatusInvalid  SMTPStatus = "invalid"
	StatusCatchAll SMTPStatus = "catch_all"
	StatusTimeout  SMTPStatus = "timeout"
	StatusError    SMTPStatus = "error"
)

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// VerifyResult contains the result of an email verification.
type VerifyResult struct {
	Email  string     `json:"email"`
	Status SMTPStatus `json:"status"`
	Error  string     `json:"error,omitempty"`
}

// VerifyEmail performs a full SMTP verification of the given email address.
// Steps: syntax check → MX lookup → SMTP connect → HELO → MAIL FROM → RCPT TO
func VerifyEmail(email string, mxCache *MXCache, connPool *ConnectionPool) *VerifyResult {
	email = strings.ToLower(strings.TrimSpace(email))

	// Step 1: Syntax validation
	if !emailRegex.MatchString(email) {
		return &VerifyResult{Email: email, Status: StatusInvalid, Error: "invalid syntax"}
	}

	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return &VerifyResult{Email: email, Status: StatusInvalid, Error: "invalid format"}
	}
	domain := parts[1]

	// Step 2: MX lookup
	mxRecords := mxCache.Lookup(domain)
	if len(mxRecords) == 0 {
		return &VerifyResult{Email: email, Status: StatusInvalid, Error: "no MX records found"}
	}

	// Step 3: Acquire rate limit slot for this domain
	connPool.Acquire(domain)
	defer connPool.Release(domain)

	// Step 4: Try each MX server
	var lastErr error
	for _, mx := range mxRecords {
		result := trySMTPVerify(email, mx, domain)
		if result.Status != StatusTimeout && result.Status != StatusError {
			return result
		}
		lastErr = fmt.Errorf("%s", result.Error)
	}

	if lastErr != nil {
		return &VerifyResult{Email: email, Status: StatusTimeout, Error: lastErr.Error()}
	}
	return &VerifyResult{Email: email, Status: StatusError, Error: "all MX servers failed"}
}

func trySMTPVerify(email, mxHost, domain string) *VerifyResult {
	// Connect with timeout
	conn, err := net.DialTimeout("tcp", mxHost+":25", 10*time.Second)
	if err != nil {
		log.Debug().Str("mx", mxHost).Err(err).Msg("SMTP connect failed")
		return &VerifyResult{Email: email, Status: StatusTimeout, Error: err.Error()}
	}
	defer conn.Close()

	// Set deadline for entire SMTP conversation
	conn.SetDeadline(time.Now().Add(15 * time.Second))

	client, err := smtp.NewClient(conn, mxHost)
	if err != nil {
		return &VerifyResult{Email: email, Status: StatusError, Error: err.Error()}
	}
	defer client.Close()

	// HELO/EHLO
	if err := client.Hello("verify.alumni.thapar.edu"); err != nil {
		return &VerifyResult{Email: email, Status: StatusError, Error: fmt.Sprintf("HELO failed: %v", err)}
	}

	// MAIL FROM (use a no-reply sender)
	if err := client.Mail("noreply@alumni.thapar.edu"); err != nil {
		return &VerifyResult{Email: email, Status: StatusError, Error: fmt.Sprintf("MAIL FROM failed: %v", err)}
	}

	// RCPT TO — this is the actual verification step
	err = client.Rcpt(email)
	if err != nil {
		errStr := err.Error()
		// 550 = mailbox not found, 551 = user not local, 552 = exceeded,
		// 553 = not allowed, 450/451 = temporary failure
		if strings.Contains(errStr, "550") || strings.Contains(errStr, "551") ||
			strings.Contains(errStr, "553") || strings.Contains(errStr, "invalid") {
			return &VerifyResult{Email: email, Status: StatusInvalid, Error: errStr}
		}
		return &VerifyResult{Email: email, Status: StatusError, Error: errStr}
	}

	// Check for catch-all
	catchAll := IsCatchAll(domain, mxHost)
	if catchAll {
		return &VerifyResult{Email: email, Status: StatusCatchAll}
	}

	return &VerifyResult{Email: email, Status: StatusValid}
}
