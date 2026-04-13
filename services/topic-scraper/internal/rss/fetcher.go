package rss

import (
	"log"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
)

// heavyKeywords are Italian/English terms that signal war, violence, or heavy political
// content unsuitable for a language-learning app. Articles matching any of these are
// dropped before calling the LLM, saving tokens and keeping topics light.
var heavyKeywords = []string{
	"guerra", "conflitto armato", "bombardamento", "missili", "attacco militare",
	"morti", "vittime", "ostaggi", "terrorismo", "attentato",
	"sanzioni", "embargo", "escalation",
}

type Article struct {
	Title       string
	Description string
	PublishedAt time.Time
}

// FetchAll fetches all RSS feeds and returns articles published in the last 48 hours.
// Each feed is limited to 10 items; total across all feeds is capped at 30.
func FetchAll(feedURLs []string) []Article {
	cutoff := time.Now().UTC().Add(-48 * time.Hour)
	parser := gofeed.NewParser()
	parser.UserAgent = "edge-language-coach/topic-scraper"

	var articles []Article

	for _, feedURL := range feedURLs {
		feed, err := parser.ParseURL(feedURL)
		if err != nil {
			log.Printf("rss: failed to parse %s: %v", feedURL, err)
			continue
		}

		count := 0
		for _, item := range feed.Items {
			if count >= 10 {
				break
			}
			if len(articles) >= 30 {
				return articles
			}

			published := time.Now().UTC()
			if item.PublishedParsed != nil {
				published = *item.PublishedParsed
			} else if item.UpdatedParsed != nil {
				published = *item.UpdatedParsed
			}

			if published.Before(cutoff) {
				continue
			}

			desc := item.Description
			if desc == "" {
				desc = item.Content
			}
			if desc == "" {
				desc = item.Title
			}

			if isHeavy(item.Title, desc) {
				log.Printf("rss: skipping heavy article %q", item.Title)
				continue
			}

			articles = append(articles, Article{
				Title:       item.Title,
				Description: desc,
				PublishedAt: published,
			})
			count++
		}
	}

	return articles
}

func isHeavy(title, desc string) bool {
	combined := strings.ToLower(title + " " + desc)
	for _, kw := range heavyKeywords {
		if strings.Contains(combined, kw) {
			return true
		}
	}
	return false
}
