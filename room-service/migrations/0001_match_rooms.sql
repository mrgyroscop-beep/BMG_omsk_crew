CREATE TABLE match_rooms (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  host_token_hash TEXT NOT NULL,
  guest_token_hash TEXT,
  host_roster_json TEXT NOT NULL,
  guest_roster_json TEXT,
  host_ready INTEGER NOT NULL DEFAULT 0 CHECK (host_ready IN (0, 1)),
  guest_ready INTEGER NOT NULL DEFAULT 0 CHECK (guest_ready IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'preparing', 'active', 'finished')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX match_rooms_expiry_idx ON match_rooms(expires_at);

