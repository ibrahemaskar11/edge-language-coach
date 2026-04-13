package main

import (
	"log"
	"net/http"
	"time"

	"github.com/edge-language-coach/topic-scraper/internal/config"
	"github.com/edge-language-coach/topic-scraper/internal/groq"
	"github.com/edge-language-coach/topic-scraper/internal/rotator"
	"github.com/edge-language-coach/topic-scraper/internal/scraper"
	"github.com/edge-language-coach/topic-scraper/internal/supabase"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	db := supabase.New(cfg.SupabaseURL, cfg.SupabaseServiceKey)
	groqClient := groq.New(cfg.GroqAPIKey)
	rot := rotator.New(db, cfg.RotationPoolSize)
	s := scraper.New(db, groqClient, rot, cfg.RSSFeeds)

	// Run immediately on startup, then every 6 hours
	go func() {
		s.Run()
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			s.Run()
		}
	}()

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("POST /scrape", func(w http.ResponseWriter, r *http.Request) {
		go s.Run()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"status":"scrape started"}`))
	})

	log.Printf("topic-scraper service starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
