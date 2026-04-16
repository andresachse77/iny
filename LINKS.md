# INY Ranking – Wichtige Links

## Live-Seite
- **GitHub Pages:** https://andresachse77.github.io/iny/

## GitHub Repository
- **Repo:** https://github.com/andresachse77/iny

## Discord Developer Portal
- **Applications:** https://discord.com/developers/applications
- **OAuth2 Redirect URL** (muss eingetragen sein): `https://andresachse77.github.io/iny/`
- **Client ID:** `1494427568361967626`

## Google Sheets / Apps Script
- **Apps Script Deployment URL:** `https://script.google.com/macros/s/AKfycbwx7gIyMTktzN4wBH_MP2MDYnN7WjYPm3ApVeA2OoigERCPQZsK3CVzNSkq2XPrVlnp/exec`
- **Apps Script Editor:** Google Sheet öffnen → Erweiterungen → Apps Script

## GitHub Pages aktivieren
- **Settings:** https://github.com/andresachse77/iny/settings/pages
- Source: Deploy from branch → main → / (root)

## Zugriff-Sheet (Discord-IDs)

| Discord-ID | Name |
|---|---|
| 1285702094388461741 | Itja |
| 639784255215501322 | Daniel |
| 799382191552725013 | MDF |
| 747358363335131197 | Lion |

## Workflow bei Code-Änderungen
1. Code in VS Code ändern
2. `git add . && git commit -m "..." && git push origin main`
3. GitHub Pages aktualisiert sich automatisch (~1 Min)

## Workflow bei Apps Script Änderungen
1. `google_apps_script.js` → Inhalt kopieren
2. Google Sheet → Erweiterungen → Apps Script → Code.gs ersetzen → Speichern
3. Bereitstellen → Neue Bereitstellung → Web-App → Jeder → Bereitstellen
4. Neue URL in `index.html` (const API) und `archive_week.py` (API_URL) eintragen
5. Committen + pushen
