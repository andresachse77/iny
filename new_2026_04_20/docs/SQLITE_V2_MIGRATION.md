# SQLite v2 Design Notes

This project now contains a v2 schema draft in `new_2026_04_20/sqlite_schema_v2.sql` plus an initializer `new_2026_04_20/init_db_v2.py`.
For data ingestion there is now also `new_2026_04_20/migrate_to_sqlite_v2.py`.

## Requirement Mapping

- Alliance in every table:
  - Every table includes `alliance TEXT NOT NULL` and uses alliance-scoped keys.
- Stable player identity despite renames:
  - `players` uses `player_id` as stable ID.
  - `player_name_history` stores old names with week validity.
- Discord identity and permissions:
  - `user_discord_accounts` stores linked Discord accounts.
  - `sites` + `site_memberships` model per-site access and rank gates.
- Email login without password storage:
  - `user_emails` stores verified email identities.
  - `auth_challenges` stores one-time challenge hashes (magic link/OTP), not passwords.
  - `sessions` stores only hashed session token material.
- Rank model R1..R5:
  - `ranks` table with `rank_code` 1..5.
  - R4/R5 login policy can be encoded via `ranks.is_login_allowed` and `sites.min_rank_code`.
- Weekly historical entries by YYWW:
  - `week_periods.year_week` and `weekly_entries.year_week` (example `2616`).

## Current UI Update

`index2.html` now supports week switching in navigation using left/right buttons and validates week input as `YYWW`.

## Suggested Migration Order

1. Create v2 db:
  - `python new_2026_04_20/init_db_v2.py --db new_2026_04_20/iny_v2.db --alliance INY`
2. Move static configuration data:
   - categories/flags into `flag_categories` and `flags`.
3. Migrate members:
   - create `players` with generated `player_id`.
   - map old names into `player_name_history`.
4. Migrate weekly data:
   - old `entries(kw)` -> `weekly_entries(year_week)`.
   - old `entry_flags` -> `weekly_entry_flags`.
5. Migrate auth:
   - Discord IDs and email identities into `player_identities` and user/link tables.
6. Update backend endpoints:
   - query by `player_id` + `year_week` instead of name + kw.

## Direct Migration Commands

1. Initialize v2 database:
  - `python new_2026_04_20/init_db_v2.py --db new_2026_04_20/iny_v2.db --alliance INY`
2. Import directly from Google Apps Script into v2:
  - `python new_2026_04_20/migrate_to_sqlite_v2.py --source google --db new_2026_04_20/iny_v2.db --alliance INY --year-week 2616`
3. Import from OneDrive Ranking.xlsx into v2 (for interim workflow):
  - `python new_2026_04_20/migrate_to_sqlite_v2.py --source onedrive --db new_2026_04_20/iny_v2.db --alliance INY --year-week 2616`
4. Run both sources in one call:
  - `python new_2026_04_20/migrate_to_sqlite_v2.py --source both --db new_2026_04_20/iny_v2.db --alliance INY --year-week 2616`

Notes:
- OneDrive mode uses Microsoft Graph device login and keeps token cache in `.graph_tokens.json`.
- `--preview` can be used to test a run without writing DB changes.

## Security Notes

- Do not store plaintext tokens.
- Store only `token_hash` and short expiry for email/discord challenges.
- Rotate sessions by revoking previous session hashes on relogin if desired.

## Hosting Reality Check

- GitHub Pages can only host static files, not Flask/Python.
- OneDrive can store files, but cannot run the API or SQLite engine.
- Recommended: host Flask+SQLite on a web runtime and use OneDrive for scheduled DB backups.
- See `new_2026_04_20/docs/DEPLOY_FREE.md` for the exact setup.

## Deployment Target (DE + EN)

DE:
- Wenn das Endziel Netlify/GitHub ist, sollte die Datenbank nicht lokal bleiben.
- Naechste, SQLite-nahe Option: Turso/libSQL als gehostete SQLite-Variante.
- Uebergangsweise kann die bestehende Flask-API remote laufen, bis auf Functions umgestellt wird.

EN:
- If Netlify/GitHub is the target, the database should not stay local.
- Closest SQLite-style option: Turso/libSQL as hosted SQLite.
- As a transition, run the existing Flask API remotely until moving to Functions.

## Bilingual Documentation Policy

DE:
- Projektdokumentation soll in Deutsch und Englisch gepflegt werden.

EN:
- Project documentation should be maintained in both German and English.
