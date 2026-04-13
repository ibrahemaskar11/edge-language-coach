package groq

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	apiURL = "https://api.groq.com/openai/v1/chat/completions"
	model  = "llama-3.3-70b-versatile"
)

var systemPrompt = strings.TrimSpace(`
You are an Italian language learning analyst. Given a coaching session transcript and the feedback that was generated, produce a structured summary of the student's performance.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "overallNote": "2–3 sentence assessment of the student's performance in this session",
  "keyVocabulary": ["Italian phrase or word the student used or was introduced to"],
  "grammarFocus": ["Grammar pattern practiced or corrected in this session"],
  "mistakeTags": ["High-level mistake category, e.g. Passato Prossimo, Article Agreement, Verb Conjugation"],
  "score": 7,
  "encouragement": "A brief, warm motivational message in English for the student"
}

Rules:
- keyVocabulary: 3–5 items, prefer Italian phrases the student used or the coach introduced
- grammarFocus: 2–3 patterns; derive from the corrections and conversation flow
- mistakeTags: 1–4 high-level categories summarising the mistakes; use consistent Italian grammar terms
- score: integer 1–10 reflecting overall session quality (vocabulary, grammar, engagement)
- encouragement: 1–2 sentences, warm and specific to what went well
- If the session is very short or has no mistakes, still return all fields with empty arrays where appropriate
`)

type Summary struct {
	OverallNote    string   `json:"overallNote"`
	KeyVocabulary  []string `json:"keyVocabulary"`
	GrammarFocus   []string `json:"grammarFocus"`
	MistakeTags    []string `json:"mistakeTags"`
	Score          int      `json:"score"`
	Encouragement  string   `json:"encouragement"`
}

type Client struct {
	apiKey string
	http   *http.Client
}

func New(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) GenerateSummary(topicTitle, transcript, mistakes, goodPoints string) (*Summary, error) {
	userMsg := fmt.Sprintf(
		"Topic: %s\n\nTranscript:\n%s\n\nMistakes made:\n%s\n\nGood points:\n%s",
		topicTitle, transcript, mistakes, goodPoints,
	)

	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMsg},
		},
		"temperature":     0.4,
		"response_format": map[string]string{"type": "json_object"},
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("groq API error %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("groq response parse error: %w", err)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("groq returned no choices")
	}

	var summary Summary
	if err := json.Unmarshal([]byte(result.Choices[0].Message.Content), &summary); err != nil {
		return nil, fmt.Errorf("groq summary parse error: %w", err)
	}

	// Clamp score to 1–10
	if summary.Score < 1 {
		summary.Score = 1
	}
	if summary.Score > 10 {
		summary.Score = 10
	}

	return &summary, nil
}
