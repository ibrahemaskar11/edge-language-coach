package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/edge-language-coach/flashcard-generator/internal/config"
	"github.com/edge-language-coach/flashcard-generator/internal/generator"
	"github.com/edge-language-coach/flashcard-generator/internal/groq"
	"github.com/edge-language-coach/flashcard-generator/internal/supabase"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	db := supabase.New(cfg.SupabaseURL, cfg.SupabaseServiceKey)
	groqClient := groq.New(cfg.GroqAPIKey)
	gen := generator.New(db, groqClient)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("POST /generate", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			SessionID string `json:"sessionId"`
			UserID    string `json:"userId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}
		if body.SessionID == "" || body.UserID == "" {
			http.Error(w, `{"error":"sessionId and userId are required"}`, http.StatusBadRequest)
			return
		}

		count, err := gen.Run(body.SessionID, body.UserID)
		if err != nil {
			log.Printf("generate error: %v", err)
			http.Error(w, `{"error":"generation failed"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int{"generated": count})
	})

	log.Printf("flashcard-generator service starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
