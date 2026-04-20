# Deployment Guide (DE + EN)

## Reality Check / Realitaetscheck

DE:
- OneDrive kann keine laufende API oder SQLite-Engine hosten.
- OneDrive ist nur Dateispeicher (gut fuer Backups).

EN:
- OneDrive cannot host a running API or SQLite engine.
- OneDrive is file storage only (good for backups).

## Zielnah an Netlify/GitHub / Close to Netlify/GitHub

### Option A (Empfohlen) / Recommended

DE:
- Frontend: Netlify oder GitHub Pages
- API: Netlify Functions (spaeter) oder kleine API-Runtime
- DB: Turso (libSQL, SQLite-kompatibel, im Netz)
- Vorteil: SQLite bleibt erhalten, sehr nah am Netlify-Stack.

EN:
- Frontend: Netlify or GitHub Pages
- API: Netlify Functions (later) or small API runtime
- DB: Turso (libSQL, SQLite-compatible, hosted)
- Benefit: keep SQLite semantics and stay close to Netlify.

### Option B (Uebergang mit bestehendem Flask) / Transition with existing Flask

DE:
- Frontend: Netlify oder GitHub Pages
- API: Flask auf Render/Fly/PythonAnywhere
- DB: `new_2026_04_20/iny_v2.db` auf dem API-Host
- Backup: Upload nach OneDrive mit `new_2026_04_20/backup_db_to_onedrive.py`

EN:
- Frontend: Netlify or GitHub Pages
- API: Flask on Render/Fly/PythonAnywhere
- DB: `new_2026_04_20/iny_v2.db` on API host storage
- Backup: upload to OneDrive via `new_2026_04_20/backup_db_to_onedrive.py`

## Aktuelle Projektdateien / Current Project Files

- `new_2026_04_20/requirements.txt`
- `new_2026_04_20/Procfile`
- `server.py` (CORS + `/api/health`)
- `new_2026_04_20/backup_db_to_onedrive.py`

## ENV Variablen / Environment Variables

- `INY_DB_PATH=/opt/app/data/iny_v2.db`
- `INY_ALLOWED_ORIGINS=https://YOURUSER.github.io,https://YOURAPP.netlify.app,http://127.0.0.1:5500,http://localhost:5500`

## DB Initialisierung / DB Initialization

DE/EN:
- `python new_2026_04_20/init_db_v2.py --db /opt/app/data/iny_v2.db --alliance INY`
- `python new_2026_04_20/migrate_to_sqlite_v2.py --source google --db /opt/app/data/iny_v2.db --alliance INY --year-week 2616`

## Lokal prod-nah testen / Local Production-like Testing

DE:
- Frontend immer ueber statischen Server testen (nicht `file://`).
- API getrennt starten (lokal oder remote), exakt wie spaeter nach Push.

EN:
- Always test frontend via static server (not `file://`).
- Run API separately (local or remote), same separation as after deploy.

## OneDrive Backup

DE/EN manual:
- `python new_2026_04_20/backup_db_to_onedrive.py --db /opt/app/data/iny_v2.db --remote-path Apps/INY/iny_v2.db`

DE/EN scheduled:
- Run hourly/daily via cron or Task Scheduler.

## Kostenlos-Hinweis / Free Tier Note

DE:
- Free tiers koennen schlafen und Limits aendern.

EN:
- Free tiers may sleep and limits can change.
