package generator

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/edge-language-coach/summary-generator/internal/groq"
	"github.com/edge-language-coach/summary-generator/internal/supabase"
)

type Generator struct {
	db   *supabase.Client
	groq *groq.Client
}

func New(db *supabase.Client, groqClient *groq.Client) *Generator {
	return &Generator{db: db, groq: groqClient}
}

type sessionRow struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Status string `json:"status"`
	Topic  struct {
		Title string `json:"title"`
	} `json:"topic"`
}

type messageRow struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Turn    int    `json:"turn"`
}

type feedbackRow struct {
	Type    string          `json:"type"`
	Content json.RawMessage `json:"content"`
}

type mistakeItem struct {
	Original   string `json:"original"`
	Correction string `json:"correction"`
	Explanation string `json:"explanation"`
}

type goodPointItem struct {
	Phrase string `json:"phrase"`
	Reason string `json:"reason"`
}

// Run generates a summary for a completed session and stores it on the session row.
func (g *Generator) Run(sessionID, userID string) error {
	// 1. Fetch session + topic title
	sessionData, err := g.db.Get("sessions", url.Values{
		"select": []string{"id,user_id,status,topic:topics(title)"},
		"id":     []string{"eq." + sessionID},
	})
	if err != nil {
		return fmt.Errorf("fetch session: %w", err)
	}
	var sessions []sessionRow
	if err := json.Unmarshal(sessionData, &sessions); err != nil || len(sessions) == 0 {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	session := sessions[0]

	if session.UserID != userID {
		return fmt.Errorf("session %s does not belong to user %s", sessionID, userID)
	}
	if session.Status != "complete" {
		return fmt.Errorf("session %s is not complete (status: %s)", sessionID, session.Status)
	}

	topicTitle := session.Topic.Title

	// 2. Fetch messages ordered by turn
	msgData, err := g.db.Get("messages", url.Values{
		"select":     []string{"role,content,turn"},
		"session_id": []string{"eq." + sessionID},
		"order":      []string{"turn.asc,created_at.asc"},
	})
	if err != nil {
		return fmt.Errorf("fetch messages: %w", err)
	}
	var messages []messageRow
	if err := json.Unmarshal(msgData, &messages); err != nil {
		return fmt.Errorf("parse messages: %w", err)
	}
	if len(messages) == 0 {
		log.Printf("summary-generator: session %s has no messages, skipping", sessionID)
		return nil
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

	// 4. Fetch feedback
	fbData, err := g.db.Get("feedback", url.Values{
		"select":     []string{"type,content"},
		"session_id": []string{"eq." + sessionID},
	})
	if err != nil {
		return fmt.Errorf("fetch feedback: %w", err)
	}
	var feedbackRows []feedbackRow
	json.Unmarshal(fbData, &feedbackRows) // non-fatal

	// 5. Extract mistakes and good points into human-readable strings
	var mistakeLines []string
	var goodPointLines []string

	for _, fb := range feedbackRows {
		switch fb.Type {
		case "mistakes":
			var wrapper struct {
				Mistakes []mistakeItem `json:"mistakes"`
			}
			if err := json.Unmarshal(fb.Content, &wrapper); err == nil {
				for _, m := range wrapper.Mistakes {
					mistakeLines = append(mistakeLines,
						fmt.Sprintf("- %q → %q: %s", m.Original, m.Correction, m.Explanation))
				}
			}
		case "good_points":
			var wrapper struct {
				GoodPoints []goodPointItem `json:"goodPoints"`
			}
			if err := json.Unmarshal(fb.Content, &wrapper); err == nil {
				for _, gp := range wrapper.GoodPoints {
					goodPointLines = append(goodPointLines,
						fmt.Sprintf("- %q: %s", gp.Phrase, gp.Reason))
				}
			}
		}
	}

	mistakesStr := "(none)"
	if len(mistakeLines) > 0 {
		mistakesStr = strings.Join(mistakeLines, "\n")
	}
	goodPointsStr := "(none)"
	if len(goodPointLines) > 0 {
		goodPointsStr = strings.Join(goodPointLines, "\n")
	}

	// 6. Call Groq
	summary, err := g.groq.GenerateSummary(topicTitle, transcript, mistakesStr, goodPointsStr)
	if err != nil {
		return fmt.Errorf("groq GenerateSummary: %w", err)
	}

	// 7. PATCH sessions.summary
	if err := g.db.PatchRaw("sessions", "id=eq."+sessionID, map[string]any{
		"summary": summary,
	}); err != nil {
		return fmt.Errorf("patch session summary: %w", err)
	}

	log.Printf("summary-generator: session %s — summary stored (score %d)", sessionID, summary.Score)
	return nil
}
