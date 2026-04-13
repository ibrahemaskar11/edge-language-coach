package engine

import (
	"encoding/json"
	"net/url"
	"sort"
	"time"

	"github.com/edge-language-coach/recommendations/internal/supabase"
)

type Topic struct {
	ID        string `json:"id"`
	Category  string `json:"category"`
	CreatedAt string `json:"created_at"`
}

type Session struct {
	TopicID string `json:"topic_id"`
	Status  string `json:"status"`
	Topic   *struct {
		Category string `json:"category"`
	} `json:"topic"`
}

type UserFlashcard struct {
	Flashcard *struct {
		TopicID string `json:"topic_id"`
	} `json:"flashcard"`
}

type TopicScore struct {
	TopicID string `json:"topicId"`
	Score   int    `json:"score"`
}

func Recommend(db *supabase.Client, userID string, limit int) ([]TopicScore, error) {
	// Fetch active topics only
	topicBytes, err := db.Get("topics", url.Values{
		"select":    []string{"id,category,created_at"},
		"is_active": []string{"eq.true"},
	})
	if err != nil {
		return nil, err
	}
	var topics []Topic
	if err := json.Unmarshal(topicBytes, &topics); err != nil {
		return nil, err
	}

	// Fetch user's sessions with topic category via embedded join
	sessionBytes, err := db.Get("sessions", url.Values{
		"select":  []string{"topic_id,status,topic:topics(category)"},
		"user_id": []string{"eq." + userID},
	})
	if err != nil {
		return nil, err
	}
	var sessions []Session
	if err := json.Unmarshal(sessionBytes, &sessions); err != nil {
		return nil, err
	}

	// Fetch user's flashcard activity
	fcBytes, err := db.Get("user_flashcards", url.Values{
		"select":  []string{"flashcard:flashcards(topic_id)"},
		"user_id": []string{"eq." + userID},
	})
	if err != nil {
		return nil, err
	}
	var flashcards []UserFlashcard
	if err := json.Unmarshal(fcBytes, &flashcards); err != nil {
		return nil, err
	}

	// Build lookup sets
	completed := make(map[string]bool)
	attempted := make(map[string]bool)
	categoryCounts := make(map[string]int)

	for _, s := range sessions {
		attempted[s.TopicID] = true
		if s.Status == "complete" {
			completed[s.TopicID] = true
		}
		if s.Topic != nil {
			categoryCounts[s.Topic.Category]++
		}
	}

	// Flashcard topic set
	fcTopics := make(map[string]bool)
	for _, fc := range flashcards {
		if fc.Flashcard != nil {
			fcTopics[fc.Flashcard.TopicID] = true
		}
	}

	// Find favorite category (mode)
	favoriteCategory := ""
	maxCount := 0
	for cat, count := range categoryCounts {
		if count > maxCount {
			maxCount = count
			favoriteCategory = cat
		}
	}

	recentThreshold := time.Now().UTC().Add(-30 * 24 * time.Hour)

	// Score each topic
	scores := make([]TopicScore, 0, len(topics))
	for _, t := range topics {
		score := 0

		if completed[t.ID] {
			score -= 20
		}
		if favoriteCategory != "" && t.Category == favoriteCategory {
			score += 10
		}
		if !attempted[t.ID] {
			score += 5
		}
		if fcTopics[t.ID] {
			score += 3
		}

		// Recency bonus
		createdAt, err := time.Parse(time.RFC3339, t.CreatedAt)
		if err == nil && createdAt.After(recentThreshold) {
			score += 3
		}

		scores = append(scores, TopicScore{TopicID: t.ID, Score: score})
	}

	// Sort descending by score
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].Score > scores[j].Score
	})

	if limit > len(scores) {
		limit = len(scores)
	}
	return scores[:limit], nil
}
