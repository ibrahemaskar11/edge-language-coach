package scraper

import (
	"encoding/json"
	"log"
	"math"
	"net/url"
	"strings"
	"time"

	"github.com/edge-language-coach/topic-scraper/internal/groq"
	"github.com/edge-language-coach/topic-scraper/internal/rotator"
	"github.com/edge-language-coach/topic-scraper/internal/rss"
	"github.com/edge-language-coach/topic-scraper/internal/supabase"
)

type TopicInsert struct {
	Title         string   `json:"title"`
	Description   string   `json:"description"`
	Level         string   `json:"level"`
	Category      string   `json:"category"`
	TalkingPoints []string `json:"talking_points"`
}

type Scraper struct {
	db       *supabase.Client
	groq     *groq.Client
	rotator  *rotator.Rotator
	feedURLs []string
}

func New(db *supabase.Client, groqClient *groq.Client, rot *rotator.Rotator, feedURLs []string) *Scraper {
	return &Scraper{db: db, groq: groqClient, rotator: rot, feedURLs: feedURLs}
}

func (s *Scraper) Run() {
	log.Println("scraper: starting run")
	articles := rss.FetchAll(s.feedURLs)
	log.Printf("scraper: fetched %d articles", len(articles))

	existingTitles, err := s.fetchExistingTitles()
	if err != nil {
		log.Printf("scraper: failed to fetch existing titles: %v", err)
		return
	}

	inserted := 0
	skipped := 0
	categoryCount := make(map[string]int)

	for _, article := range articles {
		topic, err := s.groq.ExtractTopic(article.Title, article.Description)
		if err != nil {
			log.Printf("scraper: groq error for %q: %v", article.Title, err)
			continue
		}

		if isDuplicate(topic.Title, existingTitles) {
			log.Printf("scraper: skipping duplicate %q", topic.Title)
			skipped++
			continue
		}

		if !isValidCategory(topic.Category) {
			topic.Category = "Daily Life"
		}
		if !isValidLevel(topic.Level) {
			topic.Level = "B1"
		}

		if categoryCount[topic.Category] >= categoryCapFor(topic.Category) {
			log.Printf("scraper: skipping %q — category %q cap reached", topic.Title, topic.Category)
			skipped++
			continue
		}

		payload := TopicInsert{
			Title:         topic.Title,
			Description:   topic.Description,
			Level:         topic.Level,
			Category:      topic.Category,
			TalkingPoints: topic.TalkingPoints,
		}

		_, err = s.db.Post("topics", payload, "return=representation")
		if err != nil {
			log.Printf("scraper: insert error for %q: %v", topic.Title, err)
			continue
		}

		existingTitles = append(existingTitles, topic.Title)
		categoryCount[topic.Category]++
		inserted++
		log.Printf("scraper: inserted topic %q [%s/%s]", topic.Title, topic.Level, topic.Category)

		// Rate limit: stay under 12k TPM on the free Groq tier (~800 tokens/call → 5s gap)
		time.Sleep(5 * time.Second)
	}

	log.Printf("scraper: run complete — inserted=%d skipped=%d", inserted, skipped)

	// After every scrape run, re-score and rotate the active topic pool
	s.rotator.Run()
}

func (s *Scraper) fetchExistingTitles() ([]string, error) {
	cutoff := time.Now().UTC().Add(-30 * 24 * time.Hour).Format(time.RFC3339)
	data, err := s.db.Get("topics", url.Values{
		"select":     []string{"title"},
		"created_at": []string{"gte." + cutoff},
	})
	if err != nil {
		return nil, err
	}

	var rows []struct {
		Title string `json:"title"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}

	titles := make([]string, 0, len(rows))
	for _, r := range rows {
		titles = append(titles, r.Title)
	}
	return titles, nil
}

func isDuplicate(newTitle string, existing []string) bool {
	norm := strings.ToLower(strings.TrimSpace(newTitle))
	for _, t := range existing {
		e := strings.ToLower(strings.TrimSpace(t))
		if e == norm {
			return true
		}
		if strings.HasPrefix(norm, e) || strings.HasPrefix(e, norm) {
			if math.Abs(float64(len(norm)-len(e))) < 20 {
				return true
			}
		}
	}
	return false
}

var validCategories = map[string]bool{
	"Daily Life": true, "Technology": true, "Culture": true, "Society": true,
	"Sports": true, "Politics": true, "Economy": true, "Food": true, "Travel": true,
}

var validLevels = map[string]bool{
	"A2": true, "B1": true, "B2": true, "C1": true,
}

func isValidCategory(c string) bool { return validCategories[c] }
func isValidLevel(l string) bool    { return validLevels[l] }

// categoryCapFor sets the maximum topics per category per scrape run.
// Heavy/depressing news categories are capped at 1; lifestyle topics get more room.
var categoryCaps = map[string]int{
	"Politics":   0, // excluded — too heavy for language learners
	"Economy":    1,
	"Society":    4,
	"Sports":     1,
	"Daily Life": 4,
	"Culture":    3,
	"Food":       4,
	"Travel":     3,
	"Technology": 2,
}

func categoryCapFor(category string) int {
	if cap, ok := categoryCaps[category]; ok {
		return cap
	}
	return 2
}
