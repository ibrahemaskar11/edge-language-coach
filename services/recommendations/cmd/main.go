package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/edge-language-coach/recommendations/internal/config"
	"github.com/edge-language-coach/recommendations/internal/engine"
	"github.com/edge-language-coach/recommendations/internal/supabase"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	db := supabase.New(cfg.SupabaseURL, cfg.SupabaseServiceKey)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("GET /recommend", func(w http.ResponseWriter, r *http.Request) {
		userID := r.URL.Query().Get("userId")
		if userID == "" {
			http.Error(w, `{"error":"userId is required"}`, http.StatusBadRequest)
			return
		}

		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 || limit > 50 {
			limit = 10
		}

		scores, err := engine.Recommend(db, userID, limit)
		if err != nil {
			log.Printf("recommend error for user %s: %v", userID, err)
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(scores)
	})

	log.Printf("recommendations service starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
