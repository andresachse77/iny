CREATE TABLE IF NOT EXISTS alliances (
  alliance            VARCHAR(50)  NOT NULL,
  alliance_name       VARCHAR(200) NOT NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ranks (
  alliance            VARCHAR(50)  NOT NULL,
  rank_code           INT          NOT NULL,
  rank_name           VARCHAR(50)  NOT NULL,
  is_login_allowed    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, rank_code),
  CONSTRAINT fk_ranks_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance),
  CONSTRAINT ck_ranks_code CHECK (rank_code BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sites (
  alliance            VARCHAR(50)   NOT NULL,
  site_key            VARCHAR(100)  NOT NULL,
  site_name           VARCHAR(200)  NOT NULL,
  min_rank_code       INT           NULL,
  allow_email_login   TINYINT(1)    NOT NULL DEFAULT 1,
  allow_discord_login TINYINT(1)    NOT NULL DEFAULT 1,
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, site_key),
  CONSTRAINT fk_sites_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance),
  CONSTRAINT fk_sites_rank FOREIGN KEY (alliance, min_rank_code) REFERENCES ranks(alliance, rank_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  alliance            VARCHAR(50)   NOT NULL,
  user_id             CHAR(36)      NOT NULL,
  status              VARCHAR(20)   NOT NULL DEFAULT 'active',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, user_id),
  CONSTRAINT fk_users_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_emails (
  alliance            VARCHAR(50)   NOT NULL,
  email_id            CHAR(36)      NOT NULL,
  user_id             CHAR(36)      NOT NULL,
  email_normalized    VARCHAR(320)  NOT NULL,
  is_verified         TINYINT(1)    NOT NULL DEFAULT 0,
  verified_at         DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, email_id),
  UNIQUE KEY uq_user_emails (alliance, email_normalized),
  CONSTRAINT fk_user_emails_user FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_discord_accounts (
  alliance            VARCHAR(50)   NOT NULL,
  discord_link_id     CHAR(36)      NOT NULL,
  user_id             CHAR(36)      NOT NULL,
  discord_user_id     VARCHAR(50)   NOT NULL,
  discord_username    VARCHAR(100)  NULL,
  discord_avatar      VARCHAR(255)  NULL,
  verified_at         DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, discord_link_id),
  UNIQUE KEY uq_user_discord_accounts (alliance, discord_user_id),
  CONSTRAINT fk_user_discord_user FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_challenges (
  alliance            VARCHAR(50)   NOT NULL,
  challenge_id        CHAR(36)      NOT NULL,
  user_id             CHAR(36)      NULL,
  channel             VARCHAR(30)   NOT NULL,
  target              VARCHAR(320)  NOT NULL,
  token_hash          VARCHAR(255)  NOT NULL,
  expires_at          DATETIME      NOT NULL,
  consumed_at         DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, challenge_id),
  CONSTRAINT fk_auth_challenges_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance),
  CONSTRAINT fk_auth_challenges_user FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  alliance            VARCHAR(50)   NOT NULL,
  session_id          CHAR(36)      NOT NULL,
  user_id             CHAR(36)      NOT NULL,
  site_key            VARCHAR(100)  NOT NULL,
  session_token_hash  VARCHAR(255)  NOT NULL,
  issued_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at          DATETIME      NOT NULL,
  revoked_at          DATETIME      NULL,
  ip_address          VARCHAR(64)   NULL,
  user_agent          VARCHAR(512)  NULL,
  PRIMARY KEY (alliance, session_id),
  UNIQUE KEY uq_sessions_token (alliance, session_token_hash),
  CONSTRAINT fk_sessions_user FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id),
  CONSTRAINT fk_sessions_site FOREIGN KEY (alliance, site_key) REFERENCES sites(alliance, site_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS players (
  alliance            VARCHAR(50)   NOT NULL,
  player_id           CHAR(36)      NOT NULL,
  current_name        VARCHAR(150)  NOT NULL,
  current_rank_code   INT           NOT NULL,
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retired_at          DATETIME      NULL,
  PRIMARY KEY (alliance, player_id),
  UNIQUE KEY uq_players_name (alliance, current_name),
  KEY ix_players_alliance_name (alliance, current_name),
  CONSTRAINT fk_players_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance),
  CONSTRAINT fk_players_rank FOREIGN KEY (alliance, current_rank_code) REFERENCES ranks(alliance, rank_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_name_history (
  alliance            VARCHAR(50)   NOT NULL,
  name_event_id       CHAR(36)      NOT NULL,
  player_id           CHAR(36)      NOT NULL,
  player_name         VARCHAR(150)  NOT NULL,
  valid_from_yw       INT           NOT NULL,
  valid_to_yw         INT           NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, name_event_id),
  UNIQUE KEY uq_player_name_history (alliance, player_name, valid_from_yw),
  CONSTRAINT fk_player_name_history_player FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_identities (
  alliance            VARCHAR(50)   NOT NULL,
  identity_id         CHAR(36)      NOT NULL,
  player_id           CHAR(36)      NOT NULL,
  discord_user_id     VARCHAR(50)   NULL,
  email_normalized    VARCHAR(320)  NULL,
  source              VARCHAR(30)   NOT NULL DEFAULT 'manual',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, identity_id),
  UNIQUE KEY uq_player_discord (alliance, discord_user_id),
  UNIQUE KEY uq_player_email (alliance, email_normalized),
  CONSTRAINT fk_player_identities_player FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_user_links (
  alliance            VARCHAR(50)   NOT NULL,
  link_id             CHAR(36)      NOT NULL,
  player_id           CHAR(36)      NOT NULL,
  user_id             CHAR(36)      NOT NULL,
  link_type           VARCHAR(20)   NOT NULL DEFAULT 'owner',
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, link_id),
  UNIQUE KEY uq_player_user_links (alliance, player_id, user_id),
  CONSTRAINT fk_player_user_links_player FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id),
  CONSTRAINT fk_player_user_links_user FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_memberships (
  alliance            VARCHAR(50)   NOT NULL,
  membership_id       CHAR(36)      NOT NULL,
  site_key            VARCHAR(100)  NOT NULL,
  user_id             CHAR(36)      NOT NULL,
  granted_rank_code   INT           NULL,
  granted_by_user_id  CHAR(36)      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, membership_id),
  UNIQUE KEY uq_site_memberships (alliance, site_key, user_id),
  CONSTRAINT fk_site_memberships_site FOREIGN KEY (alliance, site_key) REFERENCES sites(alliance, site_key),
  CONSTRAINT fk_site_memberships_user FOREIGN KEY (alliance, user_id) REFERENCES users(alliance, user_id),
  CONSTRAINT fk_site_memberships_granted_rank FOREIGN KEY (alliance, granted_rank_code) REFERENCES ranks(alliance, rank_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS week_periods (
  alliance            VARCHAR(50)   NOT NULL,
  year_week           INT           NOT NULL,
  week_start_date     DATE          NULL,
  week_end_date       DATE          NULL,
  is_locked           TINYINT(1)    NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, year_week),
  CONSTRAINT fk_week_periods_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS flag_categories (
  alliance            VARCHAR(50)   NOT NULL,
  category_key        VARCHAR(100)  NOT NULL,
  category_label      VARCHAR(150)  NOT NULL,
  category_type       CHAR(1)       NOT NULL,
  bg_color            VARCHAR(50)   NULL,
  border_color        VARCHAR(50)   NULL,
  label_color         VARCHAR(50)   NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, category_key),
  CONSTRAINT fk_flag_categories_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS flags (
  alliance            VARCHAR(50)   NOT NULL,
  flag_key            VARCHAR(100)  NOT NULL,
  category_key        VARCHAR(100)  NOT NULL,
  flag_label          VARCHAR(150)  NOT NULL,
  flag_type           CHAR(1)       NOT NULL,
  points_weight       INT           NOT NULL DEFAULT 0,
  is_active           TINYINT(1)    NOT NULL DEFAULT 1,
  sort_order          INT           NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, flag_key),
  CONSTRAINT fk_flags_category FOREIGN KEY (alliance, category_key) REFERENCES flag_categories(alliance, category_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS weekly_entries (
  alliance            VARCHAR(50)   NOT NULL,
  entry_id            CHAR(36)      NOT NULL,
  year_week           INT           NOT NULL,
  player_id           CHAR(36)      NOT NULL,
  base_rank_code      INT           NOT NULL,
  final_rank_code     INT           NOT NULL,
  points_total        INT           NOT NULL DEFAULT 0,
  afk                 TINYINT(1)    NOT NULL DEFAULT 0,
  notes               TEXT          NULL,
  entered_by_user_id  CHAR(36)      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, entry_id),
  UNIQUE KEY uq_weekly_entries (alliance, year_week, player_id),
  KEY ix_weekly_entries_alliance_week (alliance, year_week),
  CONSTRAINT fk_weekly_entries_week FOREIGN KEY (alliance, year_week) REFERENCES week_periods(alliance, year_week),
  CONSTRAINT fk_weekly_entries_player FOREIGN KEY (alliance, player_id) REFERENCES players(alliance, player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS weekly_entry_flags (
  alliance            VARCHAR(50)   NOT NULL,
  entry_id            CHAR(36)      NOT NULL,
  flag_key            VARCHAR(100)  NOT NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, entry_id, flag_key),
  CONSTRAINT fk_weekly_entry_flags_entry FOREIGN KEY (alliance, entry_id) REFERENCES weekly_entries(alliance, entry_id),
  CONSTRAINT fk_weekly_entry_flags_flag FOREIGN KEY (alliance, flag_key) REFERENCES flags(alliance, flag_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  alliance            VARCHAR(50)   NOT NULL,
  audit_id            CHAR(36)      NOT NULL,
  actor_user_id       CHAR(36)      NULL,
  entity_type         VARCHAR(100)  NOT NULL,
  entity_id           VARCHAR(100)  NOT NULL,
  action              VARCHAR(100)  NOT NULL,
  payload_json        LONGTEXT      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alliance, audit_id),
  CONSTRAINT fk_audit_log_alliance FOREIGN KEY (alliance) REFERENCES alliances(alliance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
