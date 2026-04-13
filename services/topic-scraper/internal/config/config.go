package config

import (
	"fmt"
	"os"
	"strings"
)

var defaultFeeds = []string{
	// General news — Politics/Economy hard-capped downstream
	"https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml",
	"https://www.corriere.it/rss/homepage.xml",
	// Culture
	"https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml",
	// Sport
	"https://www.corriere.it/rss/sport.xml",
	"https://www.gazzetta.it/rss/homepage.xml",
	// Food — GialloZafferano
	"https://ricette.giallozafferano.it/feed/",
	// Travel
	"https://www.viaggiamo.it/feed/",
	// Lifestyle & curiosity — Wired Italia
	"https://www.wired.it/feed/rss",
}

type Config struct {
	Port               string
	SupabaseURL        string
	SupabaseServiceKey string
	GroqAPIKey         string
	RSSFeeds           []string
	RotationPoolSize   int
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		SupabaseURL:        os.Getenv("SUPABASE_URL"),
		SupabaseServiceKey: os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		GroqAPIKey:         os.Getenv("GROQ_API_KEY"),
	}

	if cfg.SupabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is required")
	}
	if cfg.SupabaseServiceKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_ROLE_KEY is required")
	}
	if cfg.GroqAPIKey == "" {
		return nil, fmt.Errorf("GROQ_API_KEY is required")
	}

	if feeds := os.Getenv("RSS_FEEDS"); feeds != "" {
		cfg.RSSFeeds = strings.Split(feeds, ",")
	} else {
		cfg.RSSFeeds = defaultFeeds
	}

	cfg.RotationPoolSize = 50
	if v := os.Getenv("ROTATION_POOL_SIZE"); v != "" {
		if n, err := fmt.Sscanf(v, "%d", &cfg.RotationPoolSize); n == 0 || err != nil {
			cfg.RotationPoolSize = 50
		}
	}

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
