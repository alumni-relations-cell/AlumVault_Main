package queue

import "encoding/json"

// ImportMessage is published by Node API when a CSV is uploaded.
type ImportMessage struct {
	JobID         string            `json:"job_id"`
	FilePath      string            `json:"file_path"`
	SourceType    string            `json:"source_type"`
	SourceTier    int               `json:"source_tier"`
	ColumnMapping map[string]string `json:"column_mapping"`
	InitiatedBy   string            `json:"initiated_by"`
	Signature     string            `json:"signature"`
}

// EnrichMessage is published by Python pipeline after Apollo/LinkedIn lookup.
type EnrichMessage struct {
	AlumniID    string          `json:"alumni_id"`
	LinkedinURL string          `json:"linkedin_url"`
	ApolloData  json.RawMessage `json:"apollo_data"`
	SourceTier  int             `json:"source_tier"`
	ImportID    string          `json:"source_import_id"`
	Signature   string          `json:"signature"`
}

// VerifyEmailMessage is published by the matcher when a new email is found.
type VerifyEmailMessage struct {
	AlumniID          string  `json:"alumni_id"`
	Email             string  `json:"email"`
	CurrentConfidence float64 `json:"current_confidence"`
	Signature         string  `json:"signature"`
}

// ReviewMessage is published when a match is sent to human review.
type ReviewMessage struct {
	ReviewID         string  `json:"review_id"`
	ExistingAlumniID string  `json:"existing_alumni_id"`
	MatchScore       float64 `json:"match_score"`
	ImportJobID      string  `json:"import_job_id"`
}

// CampaignBounceMessage represents a bounce event from GMass.
type CampaignBounceMessage struct {
	CampaignID  string `json:"campaign_id"`
	AlumniID    string `json:"alumni_id"`
	Email       string `json:"email"`
	BounceType  string `json:"bounce_type"`
	Reason      string `json:"reason"`
}

// MatchRecord represents a normalized record ready for matching.
type MatchRecord struct {
	JobID        string            `json:"job_id"`
	RowIndex     int               `json:"row_index"`
	FullName     string            `json:"full_name"`
	BatchYear    int               `json:"batch_year"`
	Branch       string            `json:"branch"`
	Degree       string            `json:"degree"`
	Email        string            `json:"email"`
	Phone        string            `json:"phone"`
	Company      string            `json:"company"`
	Title        string            `json:"title"`
	LinkedinURL  string            `json:"linkedin_url"`
	City         string            `json:"city"`
	SourceTier   int               `json:"source_tier"`
	SourceName   string            `json:"source_name"`
	RawFields    map[string]string `json:"raw_fields"`
}
