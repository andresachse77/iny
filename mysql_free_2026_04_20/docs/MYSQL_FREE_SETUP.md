# MySQL-Compatible Free Setup (DE + EN)

## Empfehlung / Recommendation

DE:
- Fuer eine kostenlose, gehostete MySQL-kompatible Datenbank ist TiDB Cloud Starter aktuell eine gute Option.
- Vorteil: kein Kreditkarten-Zwang fuer den Einstieg laut TiDB-Doku.
- Es ist nicht MariaDB selbst, aber MySQL-kompatibel.

EN:
- For a free hosted MySQL-compatible database, TiDB Cloud Starter is currently a strong option.
- Benefit: no credit card required to get started according to TiDB docs.
- It is not MariaDB itself, but it is MySQL-compatible.

## Was in diesem Ordner liegt / Folder Contents

- `mysql_free_2026_04_20/mysql_schema.sql`
- `mysql_free_2026_04_20/init_mysql_free.py`
- `mysql_free_2026_04_20/import_ranking_xlsx_to_mysql.py`
- `mysql_free_2026_04_20/requirements.txt`

## Free-Tier Kurzfassung / Free Tier Summary

DE:
- TiDB Cloud Starter
- bis zu 5 freie Starter-Instanzen pro Organisation standardmaessig
- 5 GiB row storage
- 5 GiB columnar storage
- 50 Millionen Request Units pro Monat
- neue Verbindungen werden blockiert, wenn das Gratis-Limit erreicht ist

EN:
- TiDB Cloud Starter
- up to 5 free Starter instances per organization by default
- 5 GiB row storage
- 5 GiB columnar storage
- 50 million Request Units per month
- new connections are blocked once the free quota is reached

## Verbindung / Connection

DE:
TiDB Starter ist MySQL-kompatibel und nutzt typischerweise Port `4000` mit TLS.
Der Benutzername hat oft ein Praefix aus TiDB Cloud.

EN:
TiDB Starter is MySQL-compatible and typically uses port `4000` with TLS.
The username often includes a TiDB Cloud prefix.

PowerShell Beispiel:

```powershell
$env:MYSQL_HOST="gateway01.eu-central-1.prod.aws.tidbcloud.com"
$env:MYSQL_PORT="4000"
$env:MYSQL_DATABASE="iny"
$env:MYSQL_USER="PREFIX.root"
$env:MYSQL_PASSWORD="YOUR_PASSWORD"
```

## Schema anlegen / Initialize Schema

```powershell
python mysql_free_2026_04_20/init_mysql_free.py --alliance INY
```

## Ranking.xlsx importieren / Import Ranking.xlsx

```powershell
python mysql_free_2026_04_20/import_ranking_xlsx_to_mysql.py --alliance INY --year-week 2616
```

## Hinweise / Notes

DE:
- Wenn du spaeter strikt MariaDB willst, ist das ein weiterer Plattformwechsel.
- Fuer Netlify/GitHub ist eine gehostete MySQL-kompatible DB plus kleine API sinnvoll.

EN:
- If you later want strict MariaDB, that would be another platform change.
- For Netlify/GitHub, a hosted MySQL-compatible DB plus a small API is the practical setup.

## GitHub Pages Setup (wichtig)

DE:
- GitHub Pages kann nur statische Dateien hosten (HTML/CSS/JS).
- TiDB laeuft in der Cloud, aber du brauchst trotzdem einen API-Service (z. B. Flask auf Render/Railway/Fly.io), der mit TiDB spricht.
- Die API-Zugangsdaten (MYSQL_PASSWORD usw.) duerfen nur im API-Service liegen, nie im Frontend.

EN:
- GitHub Pages can only host static files (HTML/CSS/JS).
- TiDB runs in the cloud, but you still need an API service (for example Flask on Render/Railway/Fly.io) to talk to TiDB.
- Keep API credentials (MYSQL_PASSWORD, etc.) only in the API service, never in the frontend.

### Frontend mit API verbinden / Connect Frontend to API

Einmalig in der Browser-Konsole auf deiner GitHub-Pages-Seite ausfuehren:

```javascript
localStorage.setItem('iny_api_base', 'https://DEIN-API-HOST/api');
location.reload();
```

Alternative mit URL-Parameter (speichert automatisch):

https://DEIN-USER.github.io/DEIN-REPO/index2.html?api=https://DEIN-API-HOST/api
