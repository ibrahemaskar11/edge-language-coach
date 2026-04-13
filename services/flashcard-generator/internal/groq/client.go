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
You are an Italian language learning assistant. Given a conversation transcript from a coaching session, extract 5–8 flashcard items the student should review.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "flashcards": [
    {"type": "VOCABULARY", "front": "Italian word or phrase", "back": "English meaning or explanation"},
    {"type": "GRAMMAR", "front": "Grammar concept question", "back": "Answer with a clear Italian example"},
    {"type": "TRANSLATE TO ITALIAN", "front": "English sentence", "back": "Italian translation"}
  ]
}

Rules:
- Focus on: vocabulary the student used or struggled with, grammar patterns from corrections, useful phrases introduced by the coach
- Mix the three types across the set
- Keep front/back concise — flashcard format, not an essay
- Prefer items the student got wrong or that were explicitly corrected
- If the conversation is too short to extract 5 items, return what you can
`)

type Flashcard struct {
	Type  string `json:"type"`
	Front string `json:"front"`
	Back  string `json:"back"`
}

type ExtractResponse struct {
	Flashcards []Flashcard `json:"flashcards"`
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

func (c *Client) ExtractFlashcards(topicTitle, transcript string) ([]Flashcard, error) {
	userMsg := fmt.Sprintf("Topic: %s\n\nConversation transcript:\n%s", topicTitle, transcript)

	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMsg},
		},
		"temperature":     0.3,
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

	var extracted ExtractResponse
	if err := json.Unmarshal([]byte(result.Choices[0].Message.Content), &extracted); err != nil {
		return nil, fmt.Errorf("groq flashcard parse error: %w", err)
	}

	return extracted.Flashcards, nil
}
