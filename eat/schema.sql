CREATE TABLE IF NOT EXISTS eat_pool (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL CHECK (revision > 0),
    shops TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
