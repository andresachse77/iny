# Netlify Functions Setup (TiDB)

## Ziel

- Statisches Frontend auf Netlify
- API als Netlify Function
- Daten in TiDB Cloud

## Neue Dateien

- netlify/functions/api.js
- netlify/package.json
- netlify.toml

## Netlify Projekt konfigurieren

1. Repo mit Netlify verbinden.
2. Keine Build-Einstellungen manuell setzen, da netlify.toml bereits konfiguriert ist.
3. Deploy starten.

## Environment Variables in Netlify

- INY_ALLIANCE=INY
- MYSQL_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
- MYSQL_PORT=4000
- MYSQL_DATABASE=iny
- MYSQL_USER=... 
- MYSQL_PASSWORD=...

## API-Endpunkte

- /.netlify/functions/api/health
- /.netlify/functions/api/members
- /.netlify/functions/api/entries/2616

## Frontend auf Netlify Function zeigen

index2.html verwendet auf Netlify automatisch:

- /.netlify/functions/api

Optional manuell im Browser:

```javascript
localStorage.setItem('iny_api_base', '/.netlify/functions/api');
location.reload();
```
