CREATE TABLE companion_usage (
  period TEXT PRIMARY KEY NOT NULL,
  requests INTEGER NOT NULL CHECK(requests > 0),
  last_requested_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE discovery_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  text TEXT NOT NULL,
  article_id INTEGER,
  article_title TEXT,
  created_at TEXT NOT NULL
);
