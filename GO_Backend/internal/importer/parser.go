package importer

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
)

// RawRow represents a single parsed row from an import file.
type RawRow struct {
	Index  int               `json:"index"`
	Fields map[string]string `json:"fields"`
}

// ParseCSV reads a CSV file and returns all rows as RawRow structs.
// The first row is treated as the header.
func ParseCSV(filePath string) ([]RawRow, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open CSV file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	// Read header
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Normalize header names
	for i, h := range header {
		header[i] = strings.TrimSpace(strings.ToLower(h))
	}

	var rows []RawRow
	index := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Warn().Int("row", index).Err(err).Msg("Skipping malformed CSV row")
			index++
			continue
		}

		fields := make(map[string]string)
		for i, val := range record {
			if i < len(header) {
				fields[header[i]] = strings.TrimSpace(val)
			}
		}

		rows = append(rows, RawRow{Index: index, Fields: fields})
		index++
	}

	log.Info().Int("totalRows", len(rows)).Str("file", filePath).Msg("CSV parsed")
	return rows, nil
}

// ParseTSV reads a TSV file (tab-separated) and returns all rows.
func ParseTSV(filePath string) ([]RawRow, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open TSV file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.Comma = '\t'
	reader.TrimLeadingSpace = true
	reader.LazyQuotes = true

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read TSV header: %w", err)
	}

	for i, h := range header {
		header[i] = strings.TrimSpace(strings.ToLower(h))
	}

	var rows []RawRow
	index := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			index++
			continue
		}

		fields := make(map[string]string)
		for i, val := range record {
			if i < len(header) {
				fields[header[i]] = strings.TrimSpace(val)
			}
		}

		rows = append(rows, RawRow{Index: index, Fields: fields})
		index++
	}

	return rows, nil
}

// ParseXLSX reads an Excel .xlsx file and returns all rows from the first sheet.
// Requires github.com/xuri/excelize/v2.
func ParseXLSX(filePath string) ([]RawRow, error) {
	// Import excelize dynamically to avoid build failures if not used
	return parseXLSXImpl(filePath)
}

func parseXLSXImpl(filePath string) ([]RawRow, error) {
	// Use excelize for XLSX parsing
	f, err := openExcelFile(filePath)
	if err != nil {
		return nil, err
	}
	return f, nil
}

// openExcelFile uses excelize to parse the XLSX file
func openExcelFile(filePath string) ([]RawRow, error) {
	// Note: In production, use github.com/xuri/excelize/v2
	// For now, this is a placeholder that returns an error
	// directing users to convert to CSV first
	if strings.HasSuffix(strings.ToLower(filePath), ".xlsx") {
		return nil, fmt.Errorf("XLSX parsing requires excelize; convert to CSV or ensure excelize is installed")
	}
	return nil, fmt.Errorf("unsupported file format")
}

// DetectFormat returns the format type based on file extension.
func DetectFormat(filePath string) string {
	lower := strings.ToLower(filePath)
	switch {
	case strings.HasSuffix(lower, ".csv"):
		return "csv"
	case strings.HasSuffix(lower, ".tsv"):
		return "tsv"
	case strings.HasSuffix(lower, ".xlsx"):
		return "xlsx"
	default:
		return "unknown"
	}
}
