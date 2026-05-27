// Package matcher provides string similarity algorithms for alumni name matching.
package matcher

import (
	"math"
	"strings"
	"unicode/utf8"
)

// LevenshteinDistance returns the minimum number of single-character edits
// (insertions, deletions, substitutions) required to change string a into b.
func LevenshteinDistance(a, b string) int {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))

	la, lb := utf8.RuneCountInString(a), utf8.RuneCountInString(b)
	ra, rb := []rune(a), []rune(b)

	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	d := make([][]int, la+1)
	for i := range d {
		d[i] = make([]int, lb+1)
		d[i][0] = i
	}
	for j := 1; j <= lb; j++ {
		d[0][j] = j
	}
	for i := 1; i <= la; i++ {
		for j := 1; j <= lb; j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			d[i][j] = minOf(d[i-1][j]+1, minOf(d[i][j-1]+1, d[i-1][j-1]+cost))
		}
	}
	return d[la][lb]
}

// JaroWinkler returns the Jaro-Winkler similarity between two strings.
// Returns a value between 0.0 (no similarity) and 1.0 (exact match).
// The Winkler modification gives more favorable ratings to strings that
// match from the beginning (common prefix bonus up to 4 chars).
func JaroWinkler(a, b string) float64 {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))

	if a == b {
		return 1.0
	}

	ra, rb := []rune(a), []rune(b)
	la, lb := len(ra), len(rb)

	if la == 0 || lb == 0 {
		return 0.0
	}

	// Jaro distance
	matchDistance := int(math.Max(float64(la), float64(lb)))/2 - 1
	if matchDistance < 0 {
		matchDistance = 0
	}

	aMatches := make([]bool, la)
	bMatches := make([]bool, lb)

	matches := 0
	transpositions := 0

	for i := 0; i < la; i++ {
		start := maxOf(0, i-matchDistance)
		end := minOf(i+matchDistance+1, lb)

		for j := start; j < end; j++ {
			if bMatches[j] || ra[i] != rb[j] {
				continue
			}
			aMatches[i] = true
			bMatches[j] = true
			matches++
			break
		}
	}

	if matches == 0 {
		return 0.0
	}

	k := 0
	for i := 0; i < la; i++ {
		if !aMatches[i] {
			continue
		}
		for !bMatches[k] {
			k++
		}
		if ra[i] != rb[k] {
			transpositions++
		}
		k++
	}

	jaro := (float64(matches)/float64(la) +
		float64(matches)/float64(lb) +
		float64(matches-transpositions/2)/float64(matches)) / 3.0

	// Winkler modification: common prefix bonus (up to 4 characters)
	prefixLen := 0
	maxPrefix := minOf(4, minOf(la, lb))
	for i := 0; i < maxPrefix; i++ {
		if ra[i] == rb[i] {
			prefixLen++
		} else {
			break
		}
	}

	// p = scaling factor, typically 0.1
	return jaro + float64(prefixLen)*0.1*(1.0-jaro)
}

// NormalizedSimilarity returns a similarity score between 0.0 and 1.0
// based on Levenshtein distance. 1.0 means identical strings.
func NormalizedSimilarity(a, b string) float64 {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))

	maxLen := math.Max(float64(utf8.RuneCountInString(a)), float64(utf8.RuneCountInString(b)))
	if maxLen == 0 {
		return 1.0
	}
	dist := float64(LevenshteinDistance(a, b))
	return 1.0 - (dist / maxLen)
}

func minOf(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxOf(a, b int) int {
	if a > b {
		return a
	}
	return b
}
