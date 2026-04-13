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
Sei un curatore di contenuti per l'apprendimento della lingua italiana. Dato un articolo italiano, estrai un argomento di conversazione leggero e coinvolgente per studenti di italiano.

Rispondi SOLO con JSON valido — nessun markdown, nessuna spiegazione, nessun blocco di codice. Schema:
{
  "title": "titolo breve e coinvolgente (5-10 parole, in italiano)",
  "description": "descrizione di 1-2 frasi in italiano di cosa tratta l'argomento",
  "level": "uno tra: A2, B1, B2, C1",
  "category": "uno tra: Daily Life, Technology, Culture, Society, Sports, Politics, Economy, Food, Travel",
  "talkingPoints": ["domanda o spunto in italiano", "...", "...", "...", "..."]
}

Regole:
- title e description devono essere in italiano, scritti in modo naturale e accattivante
- Scegli sempre l'angolazione più leggera, umana e quotidiana dell'articolo
- Se l'articolo parla di guerra, conflitti armati o violenza — trasforma il tema: parla degli effetti sulla vita quotidiana, sulla cucina, sui viaggi o sulla cultura, NON della guerra in sé
- Se l'articolo è di politica pura senza un lato umano interessante, assegna una categoria diversa (Society, Culture, Daily Life) e riformula
- level deve riflettere la complessità del vocabolario (la maggior parte degli argomenti sarà B1 o B2)
- talkingPoints devono essere 4-5 domande aperte o spunti di conversazione IN ITALIANO
- talkingPoints sono usati da un insegnante di italiano per avviare e guidare la pratica conversazionale
- talkingPoints devono suonare naturali e coinvolgenti, come li formulerebbe un insegnante madrelingua
- Ispirati agli argomenti classici della conversazione italiana: cibo, famiglia, calcio, viaggi, tradizioni, lavoro, moda, musica, cinema
`)

type TopicResponse struct {
	Title         string   `json:"title"`
	Description   string   `json:"description"`
	Level         string   `json:"level"`
	Category      string   `json:"category"`
	TalkingPoints []string `json:"talkingPoints"`
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

func (c *Client) ExtractTopic(articleTitle, articleDesc string) (*TopicResponse, error) {
	userMsg := fmt.Sprintf("Article title: %s\n\nArticle summary: %s", articleTitle, articleDesc)

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

	var topic TopicResponse
	if err := json.Unmarshal([]byte(result.Choices[0].Message.Content), &topic); err != nil {
		return nil, fmt.Errorf("groq topic parse error: %w (content: %s)", err, result.Choices[0].Message.Content)
	}

	return &topic, nil
}
