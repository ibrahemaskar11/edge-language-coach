-- Prevent duplicate topic titles at the database level (case-insensitive).
-- The scraper's application-level dedup is the first line of defence;
-- this index is the hard stop that survives concurrent runs and Redis outages.
CREATE UNIQUE INDEX IF NOT EXISTS topics_title_lower_uq ON topics (lower(title));
