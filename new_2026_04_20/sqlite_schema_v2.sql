PRAGMA foreign_keys = ON;

-- =============================================
-- INY SQLite v2 schema
-- Requirements covered:
-- - alliance column in every table
-- - stable player IDs (name changes do not break history)
-- - Discord + email auth without password storage
-- - rank model R1..R5
-- - weekly snapshots by YYWW (e.g. 2616)
-- =============================================

CREATE TABLE IF NOT EXISTS alliances (
  alliance            TEXT PRIMARY KEY,
  alliance_name       TEXT NOT NULL,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (length(alliance) >= 2)
);

CREATE TABLE IF NOT EXISTS ranks (
  alliance            TEXT NOT NULL,
  rank_code           INTEGER NOT NULL,
  rank_name           TEXT NOT NULL,
  is_login_allowed    INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, rank_code),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  CHECK (rank_code BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS sites (
  alliance            TEXT NOT NULL,
  site_key            TEXT NOT NULL,
  site_name           TEXT NOT NULL,
  min_rank_code       INTEGER,
  allow_email_login   INTEGER NOT NULL DEFAULT 1,
  allow_discord_login INTEGER NOT NULL DEFAULT 1,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, site_key),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  FOREIGN KEY (alliance, min_rank_code) REFERENCES ranks(alliance, rank_code)
);

CREATE TABLE IF NOT EXISTS users (
  alliance            TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, user_id),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  CHECK (status IN ('active', 'blocked', 'deleted'))
);

CREATE TABLE IF NOT EXISTS user_emails (
  alliance            TEXT NOT NULL,
  email_id            TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  email_normalized    TEXT NOT NULL,
  is_verified         INTEGER NOT NULL DEFAULT 0,
  verified_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, email_id),
  UNIQUE (alliance, email_normalized),
  FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_discord_accounts (
  alliance            TEXT NOT NULL,
  discord_link_id     TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  discord_user_id     TEXT NOT NULL,
  discord_username    TEXT,
  discord_avatar      TEXT,
  verified_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, discord_link_id),
  UNIQUE (alliance, discord_user_id),
  FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  alliance            TEXT NOT NULL,
  challenge_id        TEXT NOT NULL,
  user_id             TEXT,
  channel             TEXT NOT NULL,
  target              TEXT NOT NULL,
  token_hash          TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  consumed_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, challenge_id),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id) ON DELETE CASCADE,
  CHECK (channel IN ('email_magic_link', 'email_otp', 'discord_oauth'))
);

CREATE TABLE IF NOT EXISTS sessions (
  alliance            TEXT NOT NULL,
  session_id          TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  site_key            TEXT NOT NULL,
  session_token_hash  TEXT NOT NULL,
  issued_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at          TEXT NOT NULL,
  revoked_at          TEXT,
  ip_address          TEXT,
  user_agent          TEXT,
  PRIMARY KEY (alliance, session_id),
  UNIQUE (alliance, session_token_hash),
  FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id) ON DELETE CASCADE,
  FOREIGN KEY (alliance, site_key) REFERENCES sites(alliance, site_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS players (
  alliance            TEXT NOT NULL,
  player_id           TEXT NOT NULL,
  current_name        TEXT NOT NULL,
  current_rank_code   INTEGER NOT NULL,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  retired_at          TEXT,
  PRIMARY KEY (alliance, player_id),
  UNIQUE (alliance, current_name),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  FOREIGN KEY (alliance, current_rank_code) REFERENCES ranks(alliance, rank_code),
  CHECK (length(current_name) >= 2)
);

CREATE TABLE IF NOT EXISTS player_name_history (
  alliance            TEXT NOT NULL,
  name_event_id       TEXT NOT NULL,
  player_id           TEXT NOT NULL,
  player_name         TEXT NOT NULL,
  valid_from_yw       INTEGER NOT NULL,
  valid_to_yw         INTEGER,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, name_event_id),
  UNIQUE (alliance, player_name, valid_from_yw),
  FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id) ON DELETE CASCADE,
  CHECK ((valid_from_yw % 100) BETWEEN 1 AND 53),
  CHECK (valid_to_yw IS NULL OR (valid_to_yw % 100) BETWEEN 1 AND 53)
);

CREATE TABLE IF NOT EXISTS player_identities (
  alliance            TEXT NOT NULL,
  identity_id         TEXT NOT NULL,
  player_id           TEXT NOT NULL,
  discord_user_id     TEXT,
  email_normalized    TEXT,
  source              TEXT NOT NULL DEFAULT 'manual',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, identity_id),
  FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id) ON DELETE CASCADE,
  CHECK (discord_user_id IS NOT NULL OR email_normalized IS NOT NULL),
  CHECK (source IN ('manual', 'discord_oauth', 'email_link'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_player_identities_discord
  ON player_identities(alliance, discord_user_id)
  WHERE discord_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_player_identities_email
  ON player_identities(alliance, email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS player_user_links (
  alliance            TEXT NOT NULL,
  link_id             TEXT NOT NULL,
  player_id           TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  link_type           TEXT NOT NULL DEFAULT 'owner',
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, link_id),
  UNIQUE (alliance, player_id, user_id),
  FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id) ON DELETE CASCADE,
  FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id) ON DELETE CASCADE,
  CHECK (link_type IN ('owner', 'admin', 'viewer'))
);

CREATE TABLE IF NOT EXISTS site_memberships (
  alliance            TEXT NOT NULL,
  membership_id       TEXT NOT NULL,
  site_key            TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  granted_rank_code   INTEGER,
  granted_by_user_id  TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, membership_id),
  UNIQUE (alliance, site_key, user_id),
  FOREIGN KEY (alliance, site_key) REFERENCES sites(alliance, site_key) ON DELETE CASCADE,
  FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id) ON DELETE CASCADE,
  FOREIGN KEY (alliance, granted_by_user_id) REFERENCES users(alliance, user_id),
  FOREIGN KEY (alliance, granted_rank_code) REFERENCES ranks(alliance, rank_code)
);

CREATE TABLE IF NOT EXISTS week_periods (
  alliance            TEXT NOT NULL,
  year_week           INTEGER NOT NULL,
  week_start_date     TEXT,
  week_end_date       TEXT,
  is_locked           INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, year_week),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  CHECK ((year_week % 100) BETWEEN 1 AND 53)
);

CREATE TABLE IF NOT EXISTS flag_categories (
  alliance            TEXT NOT NULL,
  category_key        TEXT NOT NULL,
  category_label      TEXT NOT NULL,
  category_type       TEXT NOT NULL,
  bg_color            TEXT,
  border_color        TEXT,
  label_color         TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, category_key),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  CHECK (category_type IN ('r', 'b', 'a'))
);

CREATE TABLE IF NOT EXISTS flags (
  alliance            TEXT NOT NULL,
  flag_key            TEXT NOT NULL,
  category_key        TEXT NOT NULL,
  flag_label          TEXT NOT NULL,
  flag_type           TEXT NOT NULL,
  points_weight       INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, flag_key),
  FOREIGN KEY (alliance, category_key) REFERENCES flag_categories(alliance, category_key) ON DELETE CASCADE,
  CHECK (flag_type IN ('r', 'b', 'a'))
);

CREATE TABLE IF NOT EXISTS weekly_entries (
  alliance            TEXT NOT NULL,
  entry_id            TEXT NOT NULL,
  year_week           INTEGER NOT NULL,
  player_id           TEXT NOT NULL,
  base_rank_code      INTEGER NOT NULL,
  final_rank_code     INTEGER NOT NULL,
  points_total        INTEGER NOT NULL DEFAULT 0,
  afk                 INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  entered_by_user_id  TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, entry_id),
  UNIQUE (alliance, year_week, player_id),
  FOREIGN KEY (alliance, year_week) REFERENCES week_periods(alliance, year_week) ON DELETE CASCADE,
  FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id) ON DELETE CASCADE,
  FOREIGN KEY (alliance, base_rank_code) REFERENCES ranks(alliance, rank_code),
  FOREIGN KEY (alliance, final_rank_code) REFERENCES ranks(alliance, rank_code),
  FOREIGN KEY (alliance, entered_by_user_id) REFERENCES users(alliance, user_id),
  CHECK ((year_week % 100) BETWEEN 1 AND 53)
);

CREATE TABLE IF NOT EXISTS weekly_entry_flags (
  alliance            TEXT NOT NULL,
  entry_id            TEXT NOT NULL,
  flag_key            TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, entry_id, flag_key),
  FOREIGN KEY (alliance, entry_id) REFERENCES weekly_entries(alliance, entry_id) ON DELETE CASCADE,
  FOREIGN KEY (alliance, flag_key) REFERENCES flags(alliance, flag_key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_log (
  alliance            TEXT NOT NULL,
  audit_id            TEXT NOT NULL,
  actor_user_id       TEXT,
  entity_type         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  action              TEXT NOT NULL,
  payload_json        TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (alliance, audit_id),
  FOREIGN KEY (alliance) REFERENCES alliances(alliance) ON DELETE CASCADE,
  FOREIGN KEY (alliance, actor_user_id) REFERENCES users(alliance, user_id)
);

CREATE INDEX IF NOT EXISTS ix_players_alliance_name
  ON players(alliance, current_name);

CREATE INDEX IF NOT EXISTS ix_weekly_entries_alliance_week
  ON weekly_entries(alliance, year_week);

CREATE INDEX IF NOT EXISTS ix_weekly_entries_alliance_player
  ON weekly_entries(alliance, player_id);

CREATE INDEX IF NOT EXISTS ix_sessions_alliance_user
  ON sessions(alliance, user_id);
