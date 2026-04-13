package generator

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/edge-language-coach/flashcard-generator/internal/groq"
	"github.com/edge-language-coach/flashcard-generator/internal/supabase"
)

type Generator struct {
	db   *supabase.Client
	groq *groq.Client
}

func New(db *supabase.Client, groqClient *groq.Client) *Generator {
	return &Generator{db: db, groq: groqClient}
}

type sessionRow struct {
	TopicID string `json:"topic_id"`
	Topic   struct {
		Title string `json:"title"`
	} `json:"topic"`
}

type messageRow struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Turn    int    `json:"turn"`
}

type flashcardRow struct {
	ID    string `json:"id"`
	Front string `json:"front"`
}

type flashcardInsert struct {
	TopicID string `json:"topic_id"`
	Type    string `json:"type"`
	Front   string `json:"front"`
	Back    string `json:"back"`
}

type userFlashcardInsert struct {
	UserID      string `json:"user_id"`
	FlashcardID string `json:"flashcard_id"`
}

// Run extracts flashcards from a completed session and inserts them for the user.
// Returns the number of new flashcards generated.
func (g *Generator) Run(sessionID, userID string) (int, error) {
	// 1. Fetch session + topic
	sessionData, err := g.db.Get("sessions", url.Values{
		"select": []string{"topic_id,topic:topics(title)"},
		"id":     []string{"eq." + sessionID},
	})
	if err != nil {
		return 0, fmt.Errorf("fetch session: %w", err)
	}
	var sessions []sessionRow
	if err := json.Unmarshal(sessionData, &sessions); err != nil || len(sessions) == 0 {
		return 0, fmt.Errorf("session not found: %s", sessionID)
	}
	session := sessions[0]
	topicID := session.TopicID
	topicTitle := session.Topic.Title

	// 2. Fetch messages
	msgData, err := g.db.Get("messages", url.Values{
		"select":     []string{"role,content,turn"},
		"session_id": []string{"eq." + sessionID},
		"order":      []string{"turn.asc,created_at.asc"},
	})
	if err != nil {
		return 0, fmt.Errorf("fetch messages: %w", err)
	}
	var messages []messageRow
	if err := json.Unmarshal(msgData, &messages); err != nil {
		return 0, fmt.Errorf("parse messages: %w", err)
	}
	if len(messages) == 0 {
		log.Printf("generator: session %s has no messages, skipping", sessionID)
		return 0, nil
	}

	// 3. Build transcript
	var sb strings.Builder
	for _, m := range messages {
		label := "Coach"
		if m.Role == "user" {
			label = "Student"
		}
		sb.WriteString(fmt.Sprintf("%s: %s\n", label, m.Content))
	}
	transcript := sb.String()

	// 4. Fetch existing flashcard fronts for this topic (deduplication)
	existingData, err := g.db.Get("flashcards", url.Values{
		"select":   []string{"id,front"},
		"topic_id": []string{"eq." + topicID},
	})
	if err != nil {
		return 0, fmt.Errorf("fetch existing flashcards: %w", err)
	}
	var existing []flashcardRow
	json.Unmarshal(existingData, &existing) // non-fatal

	existingFronts := make(map[string]bool, len(existing))
	for _, fc := range existing {
		existingFronts[strings.ToLower(strings.TrimSpace(fc.Front))] = true
	}

	// 5. Call Groq
	cards, err := g.groq.ExtractFlashcards(topicTitle, transcript)
	if err != nil {
		return 0, fmt.Errorf("groq extraction: %w", err)
	}

	// 6. Insert new flashcards + user_flashcards
	generated := 0
	for _, card := range cards {
		normFront := strings.ToLower(strings.TrimSpace(card.Front))
		if existingFronts[normFront] {
			log.Printf("generator: skipping duplicate front %q", card.Front)
			continue
		}
		if card.Front == "" || card.Back == "" {
			continue
		}

		// Validate type
		cardType := card.Type
		switch cardType {
		case "VOCABULARY", "GRAMMAR", "TRANSLATE TO ITALIAN":
			// valid
		default:
			cardType = "VOCABULARY"
		}

		// Insert flashcard
		inserted, err := g.db.Post("flashcards", flashcardInsert{
			TopicID: topicID,
			Type:    cardType,
			Front:   card.Front,
			Back:    card.Back,
		}, "return=representation")
		if err != nil {
			log.Printf("generator: insert flashcard error: %v", err)
			continue
		}

		var rows []flashcardRow
		if err := json.Unmarshal(inserted, &rows); err != nil || len(rows) == 0 {
			log.Printf("generator: parse inserted flashcard error: %v", err)
			continue
		}
		flashcardID := rows[0].ID

		// Insert user_flashcard (ignore conflict — user may already have it from another session)
		_, err = g.db.Post("user_flashcards", userFlashcardInsert{
			UserID:      userID,
			FlashcardID: flashcardID,
		}, "resolution=ignore-duplicates")
		if err != nil {
			log.Printf("generator: insert user_flashcard error (non-fatal): %v", err)
		}

		// Upsert user_topics so deck shows up in the flashcard page
		g.db.Post("user_topics", map[string]string{
			"user_id":  userID,
			"topic_id": topicID,
		}, "resolution=ignore-duplicates")

		existingFronts[normFront] = true
		generated++
		log.Printf("generator: created flashcard %q [%s]", card.Front, cardType)
	}

	log.Printf("generator: session %s — generated %d new flashcards", sessionID, generated)
	return generated, nil
}
