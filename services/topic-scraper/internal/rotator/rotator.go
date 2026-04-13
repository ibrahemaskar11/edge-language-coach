package rotator

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/edge-language-coach/topic-scraper/internal/supabase"
)

type Rotator struct {
	db       *supabase.Client
	poolSize int
}

func New(db *supabase.Client, poolSize int) *Rotator {
	return &Rotator{db: db, poolSize: poolSize}
}

type topicRow struct {
	ID        string `json:"id"`
	CreatedAt string `json:"created_at"`
}

type sessionRow struct {
	TopicID string `json:"topic_id"`
}

type scored struct {
	id    string
	score int
}

// Run scores all topics and sets is_active=true for the top poolSize, false for the rest.
func (r *Rotator) Run() {
	log.Println("rotator: starting run")

	// Fetch all topics
	topicData, err := r.db.Get("topics", url.Values{
		"select": []string{"id,created_at"},
	})
	if err != nil {
		log.Printf("rotator: fetch topics error: %v", err)
		return
	}
	var topics []topicRow
	if err := json.Unmarshal(topicData, &topics); err != nil {
		log.Printf("rotator: parse topics error: %v", err)
		return
	}
	if len(topics) == 0 {
		log.Println("rotator: no topics found, nothing to do")
		return
	}

	// Fetch all sessions to count engagement per topic
	sessionData, err := r.db.Get("sessions", url.Values{
		"select": []string{"topic_id"},
	})
	if err != nil {
		log.Printf("rotator: fetch sessions error: %v", err)
		return
	}
	var sessions []sessionRow
	json.Unmarshal(sessionData, &sessions) // non-fatal

	sessionCounts := make(map[string]int, len(sessions))
	for _, s := range sessions {
		sessionCounts[s.TopicID]++
	}

	// Score: engagement × 2 + freshness bonus
	now := time.Now().UTC()
	sevenDaysAgo := now.Add(-7 * 24 * time.Hour)
	thirtyDaysAgo := now.Add(-30 * 24 * time.Hour)

	scores := make([]scored, 0, len(topics))
	for _, t := range topics {
		s := sessionCounts[t.ID] * 2

		if createdAt, err := time.Parse(time.RFC3339, t.CreatedAt); err == nil {
			switch {
			case createdAt.After(sevenDaysAgo):
				s += 10 // brand new — boost into rotation
			case createdAt.After(thirtyDaysAgo):
				s += 3
			}
		}

		scores = append(scores, scored{id: t.ID, score: s})
	}

	// Sort descending
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].score > scores[j].score
	})

	// Split into active / inactive pools
	poolSize := r.poolSize
	if poolSize > len(scores) {
		poolSize = len(scores)
	}

	activeIDs := make([]string, poolSize)
	for i, s := range scores[:poolSize] {
		activeIDs[i] = s.id
	}

	var inactiveIDs []string
	for _, s := range scores[poolSize:] {
		inactiveIDs = append(inactiveIDs, s.id)
	}

	// Activate top N
	if err := r.db.PatchRaw("topics",
		"id=in.("+strings.Join(activeIDs, ",")+")",
		map[string]bool{"is_active": true},
	); err != nil {
		log.Printf("rotator: activate error: %v", err)
	} else {
		log.Printf("rotator: activated %d topics", len(activeIDs))
	}

	// Deactivate the rest (only if there are any)
	if len(inactiveIDs) > 0 {
		if err := r.db.PatchRaw("topics",
			"id=in.("+strings.Join(inactiveIDs, ",")+")",
			map[string]bool{"is_active": false},
		); err != nil {
			log.Printf("rotator: deactivate error: %v", err)
		} else {
			log.Printf("rotator: deactivated %d topics", len(inactiveIDs))
		}
	}

	log.Printf("rotator: done — active=%d total=%d", len(activeIDs), len(topics))
}

// joinIDs formats a slice of UUIDs for a PostgREST in() filter.
func joinIDs(ids []string) string {
	return fmt.Sprintf("(%s)", strings.Join(ids, ","))
}
