CREATE TABLE IF NOT EXISTS eat_pool (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL CHECK (revision > 0),
    shops TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eat_meals (
    id TEXT PRIMARY KEY,
    shop_id TEXT,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    dish TEXT NOT NULL DEFAULT '',
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    note TEXT NOT NULL DEFAULT '',
    eaten_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS eat_meals_eaten_at ON eat_meals (eaten_at DESC, created_at DESC);
