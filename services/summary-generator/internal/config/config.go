package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port               string
	SupabaseURL        string
	SupabaseServiceKey string
	GroqAPIKey         string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:               getEnv("PORT", "8083"),
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

	return cfg, nil
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
