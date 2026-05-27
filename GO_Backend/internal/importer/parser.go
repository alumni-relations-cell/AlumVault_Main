package importer

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/xuri/excelize/v2"
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

// ParseXLSX reads an Excel .xlsx file and returns all rows.
// Prefers a sheet named "alumni_data" if present, otherwise uses the first sheet.
func ParseXLSX(filePath string) ([]RawRow, error) {
	f, err := excelize.OpenFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open XLSX file: %w", err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("XLSX file has no sheets")
	}

	sheetName := sheets[0]
	for _, s := range sheets {
		if strings.EqualFold(s, "alumni_data") {
			sheetName = s
			break
		}
	}

	raw, err := f.GetRows(sheetName)
	if err != nil {
		return nil, fmt.Errorf("failed to read sheet %q: %w", sheetName, err)
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("sheet %q is empty", sheetName)
	}

	header := make([]string, len(raw[0]))
	for i, h := range raw[0] {
		header[i] = strings.TrimSpace(strings.ToLower(h))
	}

	var rows []RawRow
	for i := 1; i < len(raw); i++ {
		record := raw[i]
		fields := make(map[string]string)
		hasValue := false
		for j, val := range record {
			if j < len(header) {
				v := strings.TrimSpace(val)
				fields[header[j]] = v
				if v != "" {
					hasValue = true
				}
			}
		}
		if !hasValue {
			continue
		}
		rows = append(rows, RawRow{Index: i - 1, Fields: fields})
	}

	log.Info().Int("totalRows", len(rows)).Str("sheet", sheetName).Str("file", filePath).Msg("XLSX parsed")
	return rows, nil
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
