// ════════════════════════════════════════════════════
//  INY RANKING – Google Apps Script (Web-App API)
//  
//  Dieses Script in Google Sheets einfügen:
//  Erweiterungen → Apps Script → Code.gs ersetzen
// ════════════════════════════════════════════════════

// ── Gewichtungen (aus Formeln-Sheet Zeile 103) ──
const W = {
  vsUnter50: 5, vsTop30: 15, vsTop10: 5, vsAlle: 10,
  spendeUnter35k: 5, spendeTop20: 5, spendeAlle: 5,
  wachePkt: 10, wacheOffline: 5, wacheBonus: 15,
  seTeilnahme: 10, seTop50: 15, seTop20: 10,
  wuesteAnmeldung: 10, wuesteTeilnahme: 25, wuesteFehlen: 15,
  inaktiv: 30, schild: 10, mails: 15, falschparken: 10,
  nap: 30, verhIntern: 15, verhExtern: 30,
  umfragen: 10, support: 10, feedback: 5
};

// ── Punkte-Berechnung (1:1 aus der Excel-Formellogik) ──
function calcPoints(flags) {
  const has = k => flags[k] ? 1 : 0;

  // VS: Alle - Unter50*Abzug + Top30*Bonus + Top10*Bonus, dann *5, max 140
  const vsGesamt = W.vsAlle - (has('vsUnter50') * W.vsUnter50) + (has('vsTop30') * W.vsTop30) + (has('vsTop10') * W.vsTop10);
  const vsGewichtet = Math.min(vsGesamt * 5, 140);

  // Spenden: Alle - Unter35k*Abzug + Top20*Bonus, dann *7
  const spGesamt = W.spendeAlle - (has('spendeUnter35k') * W.spendeUnter35k) + (has('spendeTop20') * W.spendeTop20);
  const spGewichtet = spGesamt * 7;

  // Wache: Teilnahmen * Pkt + floor(Teilnahmen/2) * Bonus - Offline * Abzug
  const wTeilnahmen = has('wache1') + has('wache2') + has('wache3');
  const wOffline = has('wache1dmg') + has('wache2dmg') + has('wache3dmg');
  const wacheGesamt = (wTeilnahmen * W.wachePkt) + (Math.floor(wTeilnahmen / 2) * W.wacheBonus) - (wOffline * W.wacheOffline);

  // Spezialevents: (Teilnahme*Pkt + Top50*Pkt + Top20*Pkt) * 2
  const seGesamt = ((has('seTeilnahme') * W.seTeilnahme) + (has('seTop50') * W.seTop50) + (has('seTop20') * W.seTop20)) * 2;

  // Wüste: Anmeldung + Teilnahme - Fehlen
  const wuGesamt = (has('wuesteAnmeldung') * W.wuesteAnmeldung) + (has('wuesteTeilnahme') * W.wuesteTeilnahme) - (has('wuesteFehlen') * W.wuesteFehlen);

  // Strafpunkte
  const stGesamt = (has('inaktiv') * W.inaktiv) + (has('schild') * W.schild) + (has('mails') * W.mails)
    + (has('falschparken') * W.falschparken) + (has('nap') * W.nap)
    + (has('verhIntern') * W.verhIntern) + (has('verhExtern') * W.verhExtern);

  // Bonus
  const boGesamt = (has('umfragen') * W.umfragen) + (has('support') * W.support) + (has('feedback') * W.feedback);

  return vsGewichtet + spGewichtet + wacheGesamt + seGesamt + wuGesamt - stGesamt + boGesamt;
}

// ── Ranking aus Punkten (aus Excel: IFS-Formel in AL3) ──
function calcRanking(points, currentRank) {
  if (currentRank === 4 || currentRank === 5) return currentRank; // R4/R5 fix
  if (points > 179) return 3;
  if (points > 84) return 2;
  return 1;
}

// ── Sheet-Referenzen ──
function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

// ════════════════════════════════════════════════════
//  WEB-APP ENDPOINTS
// ════════════════════════════════════════════════════

function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase();
  let result;
  try {
    switch (action) {
      case 'members': result = getMembers(); break;
      case 'entries': result = getEntries(parseInt(e.parameter.kw || 0)); break;
      case 'results': result = getResults(); break;
      case 'history': result = getHistory(); break;
      case 'weights': result = W; break;
      case 'verify_discord': result = verifyDiscord(e.parameter.discord_id); break;
      default: result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = (data.action || '').toLowerCase();
  let result;
  try {
    switch (action) {
      case 'save_entry': result = saveEntry(data); break;
      case 'save_wache': result = saveWache(data); break;
      case 'add_member': result = addMember(data); break;
      case 'edit_member':
      case 'update_member': result = updateMember(data); break;
      case 'delete_member': result = deleteMember(data); break;
      case 'archive_week': result = archiveWeek(data); break;
      case 'update_ergebnis': result = { ok: true }; updateErgebnis(); break;
      default: result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════
//  DATEN LESEN
// ════════════════════════════════════════════════════

// Eingaben-Sheet: A=Name, B-AB=Flags (x), AC=Rank, AD=AFK
const FLAG_COLS = [
  'vsUnter50','vsTop30','vsTop10',
  'spendeUnter35k','spendeTop20',
  'wache1','wache1dmg','wache2','wache2dmg','wache3','wache3dmg',
  'seTeilnahme','seTop50','seTop20',
  'wuesteAnmeldung','wuesteTeilnahme','wuesteFehlen',
  'inaktiv','schild','falschparken','nap','mails','verhIntern','verhExtern',
  'afk',
  'umfragen','support','feedback'
];

function getMembers() {
  const ws = getSheet('Eingaben');
  const data = ws.getRange(3, 1, ws.getLastRow() - 2, 30).getValues();
  return data.filter(r => r[0]).map(r => ({
    name: r[0],
    rank: r[29] || 2,  // AD = col 30 = index 29
    role: (r[29] === 4 ? 'r4' : r[29] === 5 ? 'r5' : 'normal')
  }));
}

function getEntries(kw) {
  // Eingaben = aktuelle Woche; für KW-spezifisch schauen wir im Archiv
  // Standardmäßig Eingaben-Sheet = aktuelle Woche
  const ws = getSheet('Eingaben');
  const data = ws.getRange(3, 1, ws.getLastRow() - 2, 30).getValues();
  const members = getMembers();

  return data.filter(r => r[0]).map((r, idx) => {
    const name = r[0];
    const rank = r[29] || 2;  // AD = col 30 = index 29
    const flags = {};
    FLAG_COLS.forEach((key, i) => {
      if (String(r[i + 1] || '').toUpperCase() === 'X') flags[key] = true;
    });
    const afk = !!flags.afk;

    // Punkte und neuen Rank berechnen
    const points = calcPoints(flags);
    const newRank = calcRanking(points, rank);

    return { name, rank, flags, points, newRank, afk };
  });
}

function getResults() {
  const entries = getEntries(0);
  const history = getHistory();
  const histMap = {};
  history.forEach(h => { histMap[h.name] = h; });

  return entries.map(e => {
    const hist = histMap[e.name] || {};
    const prevRank = hist.ranks ? hist.ranks[0] : e.rank;
    const tendenz = e.afk ? 0 : (e.newRank - e.rank);

    // Änderung (wie in Excel: nur wenn 2 Wochen hintereinander gleiche Richtung)
    const histPrevRank = hist.ranks ? hist.ranks[0] : e.rank;
    const histDelta = histPrevRank - e.rank;
    let aenderung = 0;
    if (tendenz < 0 && histDelta < 0) aenderung = -1;
    else if (tendenz > 0 && histDelta > 0) aenderung = 1;
    if (e.afk) aenderung = 0;

    return {
      name: e.name,
      points: e.points,
      rankAlt: e.rank,
      rankNeu: e.newRank,
      tendenz,
      aenderung,
      afk: e.afk,
      flags: e.flags
    };
  });
}

function getHistory() {
  const ws = getSheet('Historie');
  if (!ws) return [];
  const lastCol = ws.getLastColumn();
  const lastRow = ws.getLastRow();
  if (lastRow < 3 || lastCol < 2) return [];

  const headers = ws.getRange(1, 2, 1, lastCol - 1).getValues()[0]; // KW labels
  const data = ws.getRange(3, 1, lastRow - 2, lastCol).getValues();

  return data.filter(r => r[0]).map(r => ({
    name: r[0],
    ranks: r.slice(1).map(v => v || 0)
  }));
}

// ════════════════════════════════════════════════════
//  DATEN SCHREIBEN
// ════════════════════════════════════════════════════

function saveEntry(data) {
  const ws = getSheet('Eingaben');
  const names = ws.getRange(3, 1, ws.getLastRow() - 2, 1).getValues().flat();
  const rowIdx = names.indexOf(data.name);
  if (rowIdx === -1) return { error: 'Mitglied nicht gefunden: ' + data.name };

  const row = rowIdx + 3; // +2 Header + 1 für 1-basiert

  // Flags schreiben (B-AC = Spalten 2-29, 28 Flags)
  const flagValues = FLAG_COLS.map(k => data.flags[k] ? 'x' : '');
  ws.getRange(row, 2, 1, FLAG_COLS.length).setValues([flagValues]);

  // Ergebnis-Sheet aktualisieren
  updateErgebnis();

  return { ok: true, name: data.name };
}

// ── Wache-Flags für ein Mitglied setzen (schneller Pfad) ──
function saveWache(data) {
  const ws = getSheet('Eingaben');
  const names = ws.getRange(3, 1, ws.getLastRow() - 2, 1).getValues().flat();
  const rowIdx = names.indexOf(data.name);
  if (rowIdx === -1) return { error: 'Mitglied nicht gefunden: ' + data.name };

  const row = rowIdx + 3;
  // Wache-Spalten: wache1=col 7(idx5), wache1dmg=col 8(idx6), wache2=col 9(idx7), wache2dmg=col 10(idx8), wache3=col 11(idx9), wache3dmg=col 12(idx10)
  const wacheFlags = ['wache1','wache1dmg','wache2','wache2dmg','wache3','wache3dmg'];
  wacheFlags.forEach(k => {
    const colIdx = FLAG_COLS.indexOf(k);
    if (colIdx >= 0) {
      ws.getRange(row, colIdx + 2).setValue(data.flags[k] ? 'x' : '');
    }
  });

  updateErgebnis();
  return { ok: true, name: data.name };
}

// ── Ergebnis-Sheet aktualisieren ──
function updateErgebnis() {
  let ws = getSheet('Ergebnis');
  if (!ws) {
    ws = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Ergebnis');
  }
  
  const results = getResults();
  
  // Header
  ws.getRange(1, 1, 1, 7).setValues([['Name', 'Punkte', 'Rank alt', 'Rank neu', 'Tendenz', 'Änderung', 'AFK']]);
  ws.getRange(1, 1, 1, 7).setFontWeight('bold');
  
  // Daten leeren & neu schreiben
  if (ws.getLastRow() > 1) {
    ws.getRange(2, 1, ws.getLastRow() - 1, 7).clearContent();
  }
  
  const rows = results.map(r => [
    r.name,
    r.points,
    r.rankAlt,
    r.rankNeu,
    r.afk ? 0 : r.tendenz,
    r.aenderung,
    r.afk ? 'x' : ''
  ]);
  
  if (rows.length > 0) {
    ws.getRange(2, 1, rows.length, 7).setValues(rows);
  }
}

function addMember(data) {
  const ws = getSheet('Eingaben');
  const lastRow = ws.getLastRow() + 1;
  ws.getRange(lastRow, 1).setValue(data.name);
  ws.getRange(lastRow, 30).setValue(data.rank || 2); // AD = Rank

  // Auch in Historie eintragen
  const hist = getSheet('Historie');
  if (hist) {
    const histRow = hist.getLastRow() + 1;
    hist.getRange(histRow, 1).setValue(data.name);
  }

  return { ok: true };
}

function updateMember(data) {
  const ws = getSheet('Eingaben');
  const names = ws.getRange(3, 1, ws.getLastRow() - 2, 1).getValues().flat();
  const rowIdx = names.indexOf(data.oldName);
  if (rowIdx === -1) return { error: 'Nicht gefunden' };

  const row = rowIdx + 3;
  if (data.newName) ws.getRange(row, 1).setValue(data.newName);
  if (data.rank) ws.getRange(row, 30).setValue(data.rank);  // AD = Rank

  // Auch in Historie umbenennen
  const hist = getSheet('Historie');
  if (hist && data.newName && data.newName !== data.oldName) {
    const hNames = hist.getRange(3, 1, hist.getLastRow() - 2, 1).getValues().flat();
    const hIdx = hNames.indexOf(data.oldName);
    if (hIdx > -1) hist.getRange(hIdx + 3, 1).setValue(data.newName);
  }

  return { ok: true };
}

function deleteMember(data) {
  const ws = getSheet('Eingaben');
  const names = ws.getRange(3, 1, ws.getLastRow() - 2, 1).getValues().flat();
  const rowIdx = names.indexOf(data.name);
  if (rowIdx === -1) return { error: 'Nicht gefunden' };
  ws.deleteRow(rowIdx + 3);

  const hist = getSheet('Historie');
  if (hist) {
    const hNames = hist.getRange(3, 1, hist.getLastRow() - 2, 1).getValues().flat();
    const hIdx = hNames.indexOf(data.name);
    if (hIdx > -1) hist.deleteRow(hIdx + 3);
  }

  return { ok: true };
}

// ════════════════════════════════════════════════════
//  WOCHEN-ARCHIVIERUNG
// ════════════════════════════════════════════════════

function archiveWeek(data) {
  const results = getResults();
  const hist = getSheet('Historie');
  if (!hist) return { error: 'Historie-Sheet fehlt' };

  const lastCol = hist.getLastColumn();

  // Neue Spalte B einfügen (aktuelle Woche), alte rücken nach rechts
  hist.insertColumnBefore(2);
  hist.getRange(1, 2).setValue('KW ' + (data.kw || '?'));
  hist.getRange(2, 2).setValue('RangAkt');

  // Neue Ranks eintragen
  const names = hist.getRange(3, 1, hist.getLastRow() - 2, 1).getValues().flat();
  results.forEach(r => {
    const idx = names.indexOf(r.name);
    if (idx > -1) {
      hist.getRange(idx + 3, 2).setValue(r.rankNeu);
    }
  });

  // Eingaben-Ranks aktualisieren (Rank = neuer Rank für nächste Woche)
  const ws = getSheet('Eingaben');
  const eNames = ws.getRange(3, 1, ws.getLastRow() - 2, 1).getValues().flat();
  results.forEach(r => {
    const idx = eNames.indexOf(r.name);
    if (idx > -1) {
      ws.getRange(idx + 3, 30).setValue(r.rankNeu); // AD = Rank
      // Flags leeren für neue Woche
      ws.getRange(idx + 3, 2, 1, FLAG_COLS.length).clearContent();
    }
  });

  return { ok: true, archived: results.length };
}

// ════════════════════════════════════════════════════
//  DISCORD-ZUGRIFFSKONTROLLE
// ════════════════════════════════════════════════════

// Zugriff-Sheet: A=Discord-ID, B=Name
function verifyDiscord(discordId) {
  const ws = getSheet('Zugriff');
  if (!ws) return { ok: false, error: 'Zugriff-Sheet fehlt' };
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Keine Eintr\u00e4ge' };

  const data = ws.getRange(2, 1, lastRow - 1, 2).getValues();
  const entry = data.find(r => String(r[0]).trim() === String(discordId).trim());

  if (entry) {
    return { ok: true, name: entry[1] };
  }
  return { ok: false, error: 'Kein Zugriff' };
}
