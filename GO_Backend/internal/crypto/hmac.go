package crypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// SignMessage creates an HMAC-SHA256 signature of the given message body.
func SignMessage(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifySignature checks that the provided signature matches the HMAC-SHA256
// of the message body using the given secret.
func VerifySignature(body []byte, signature, secret string) bool {
	expected := SignMessage(body, secret)
	return hmac.Equal([]byte(expected), []byte(signature))
}

// SignJSON marshals the payload to JSON and produces an HMAC-SHA256 signature.
func SignJSON(payload interface{}, secret string) ([]byte, string, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, "", err
	}
	sig := SignMessage(data, secret)
	return data, sig, nil
}

// BlindIndex generates an HMAC-SHA256 blind index for searchable encrypted fields.
func BlindIndex(value, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
