const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const ALLIANCE = process.env.INY_ALLIANCE || 'INY';

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

function safeRank(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

function roleFromRank(rankCode) {
  if (rankCode === 5) return 'r5';
  if (rankCode === 4) return 'r4';
  return 'normal';
}

function routeFromPath(path) {
  const marker = '/.netlify/functions/api';
  const idx = path.indexOf(marker);
  if (idx === -1) return '/';
  const route = path.slice(idx + marker.length);
  return route || '/';
}

async function openDb() {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }

  return mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number.parseInt(process.env.MYSQL_PORT || '4000', 10),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });
}

async function getMembers(con) {
  const [rows] = await con.execute(
    `
      SELECT current_name, current_rank_code
      FROM players
      WHERE alliance = ? AND is_active = 1
      ORDER BY current_name
    `,
    [ALLIANCE]
  );

  return rows.map((r) => ({
    name: r.current_name,
    default_rank: r.current_rank_code,
    role: roleFromRank(r.current_rank_code)
  }));
}

async function getEntries(con, kw) {
  const [rows] = await con.execute(
    `
      SELECT we.entry_id, we.final_rank_code, p.current_name
      FROM weekly_entries we
      JOIN players p ON p.alliance = we.alliance AND p.player_id = we.player_id
      WHERE we.alliance = ? AND we.year_week = ?
      ORDER BY p.current_name
    `,
    [ALLIANCE, kw]
  );

  const result = [];
  for (const row of rows) {
    const [flagsRows] = await con.execute(
      `
        SELECT flag_key
        FROM weekly_entry_flags
        WHERE alliance = ? AND entry_id = ?
      `,
      [ALLIANCE, row.entry_id]
    );

    const flags = {};
    for (const f of flagsRows) flags[f.flag_key] = true;

    result.push({
      name: row.current_name,
      rank: row.final_rank_code,
      flags
    });
  }

  return result;
}

async function addMember(con, body) {
  const name = (body.name || '').trim();
  if (!name) return json(400, { error: 'Name fehlt' });

  const rank = safeRank(body.default_rank ?? body.rank ?? 3);
  const playerId = randomUUID();
  const nameEventId = randomUUID();

  try {
    await con.beginTransaction();
    await con.execute(
      `
        INSERT INTO players (alliance, player_id, current_name, current_rank_code, is_active)
        VALUES (?, ?, ?, ?, 1)
      `,
      [ALLIANCE, playerId, name, rank]
    );

    await con.execute(
      `
        INSERT INTO player_name_history (alliance, name_event_id, player_id, player_name, valid_from_yw)
        VALUES (?, ?, ?, ?, 0)
      `,
      [ALLIANCE, nameEventId, playerId, name]
    );

    await con.commit();
    return json(201, { ok: true });
  } catch (err) {
    await con.rollback();
    if (String(err.code || '').includes('DUP_ENTRY')) {
      return json(409, { error: 'Mitglied existiert bereits' });
    }
    throw err;
  }
}

async function updateMember(con, oldName, body) {
  const newName = (body.name || oldName || '').trim();
  if (!newName) return json(400, { error: 'Name fehlt' });

  const rank = safeRank(body.default_rank ?? body.rank ?? 3);

  const [rows] = await con.execute(
    `
      SELECT player_id
      FROM players
      WHERE alliance = ? AND current_name = ?
    `,
    [ALLIANCE, decodeURIComponent(oldName)]
  );

  if (!rows.length) return json(404, { error: 'Mitglied nicht gefunden' });
  const playerId = rows[0].player_id;

  try {
    await con.beginTransaction();

    await con.execute(
      `
        UPDATE players
        SET current_name = ?, current_rank_code = ?, is_active = 1, retired_at = NULL
        WHERE alliance = ? AND player_id = ?
      `,
      [newName, rank, ALLIANCE, playerId]
    );

    await con.execute(
      `
        INSERT INTO player_name_history (alliance, name_event_id, player_id, player_name, valid_from_yw)
        VALUES (?, ?, ?, ?, 0)
      `,
      [ALLIANCE, randomUUID(), playerId, newName]
    );

    await con.commit();
    return json(200, { ok: true });
  } catch (err) {
    await con.rollback();
    if (String(err.code || '').includes('DUP_ENTRY')) {
      return json(409, { error: 'Name existiert bereits' });
    }
    throw err;
  }
}

async function deleteMember(con, nameRaw) {
  const name = decodeURIComponent(nameRaw || '');
  const [rows] = await con.execute(
    `
      SELECT player_id
      FROM players
      WHERE alliance = ? AND current_name = ?
    `,
    [ALLIANCE, name]
  );

  if (!rows.length) return json(200, { ok: true });

  const playerId = rows[0].player_id;

  await con.beginTransaction();
  try {
    await con.execute(
      `
        DELETE wef
        FROM weekly_entry_flags wef
        JOIN weekly_entries we ON wef.alliance = we.alliance AND wef.entry_id = we.entry_id
        WHERE wef.alliance = ? AND we.player_id = ?
      `,
      [ALLIANCE, playerId]
    );
    await con.execute('DELETE FROM weekly_entries WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
    await con.execute('DELETE FROM player_name_history WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
    await con.execute('DELETE FROM player_user_links WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
    await con.execute('DELETE FROM player_identities WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
    await con.execute('DELETE FROM players WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
    await con.commit();
    return json(200, { ok: true });
  } catch (err) {
    await con.rollback();
    throw err;
  }
}

async function saveEntry(con, kw, body) {
  const name = (body.name || '').trim();
  if (!name) return json(400, { error: 'Name fehlt' });

  const rank = safeRank(body.rank ?? 3);
  const flags = body.flags || {};

  await con.beginTransaction();
  try {
    await con.execute(
      `
        INSERT INTO week_periods (alliance, year_week)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE year_week = VALUES(year_week)
      `,
      [ALLIANCE, kw]
    );

    const [playerRows] = await con.execute(
      `
        SELECT player_id
        FROM players
        WHERE alliance = ? AND current_name = ?
      `,
      [ALLIANCE, name]
    );

    let playerId;
    if (playerRows.length) {
      playerId = playerRows[0].player_id;
      await con.execute(
        `
          UPDATE players
          SET current_rank_code = ?, is_active = 1, retired_at = NULL
          WHERE alliance = ? AND player_id = ?
        `,
        [rank, ALLIANCE, playerId]
      );
    } else {
      playerId = randomUUID();
      await con.execute(
        `
          INSERT INTO players (alliance, player_id, current_name, current_rank_code, is_active)
          VALUES (?, ?, ?, ?, 1)
        `,
        [ALLIANCE, playerId, name, rank]
      );
      await con.execute(
        `
          INSERT INTO player_name_history (alliance, name_event_id, player_id, player_name, valid_from_yw)
          VALUES (?, ?, ?, ?, ?)
        `,
        [ALLIANCE, randomUUID(), playerId, name, kw]
      );
    }

    const [entryRows] = await con.execute(
      `
        SELECT entry_id
        FROM weekly_entries
        WHERE alliance = ? AND year_week = ? AND player_id = ?
      `,
      [ALLIANCE, kw, playerId]
    );

    let entryId;
    if (entryRows.length) {
      entryId = entryRows[0].entry_id;
      await con.execute(
        `
          UPDATE weekly_entries
          SET base_rank_code = ?, final_rank_code = ?, afk = ?, updated_at = CURRENT_TIMESTAMP
          WHERE alliance = ? AND entry_id = ?
        `,
        [rank, rank, flags.afk ? 1 : 0, ALLIANCE, entryId]
      );
    } else {
      entryId = randomUUID();
      await con.execute(
        `
          INSERT INTO weekly_entries (alliance, entry_id, year_week, player_id, base_rank_code, final_rank_code, afk)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [ALLIANCE, entryId, kw, playerId, rank, rank, flags.afk ? 1 : 0]
      );
    }

    await con.execute('DELETE FROM weekly_entry_flags WHERE alliance = ? AND entry_id = ?', [ALLIANCE, entryId]);

    for (const [flagKey, active] of Object.entries(flags)) {
      if (!active) continue;
      await con.execute(
        'INSERT INTO weekly_entry_flags (alliance, entry_id, flag_key) VALUES (?, ?, ?)',
        [ALLIANCE, entryId, flagKey]
      );
    }

    await con.commit();
    return json(200, { ok: true });
  } catch (err) {
    await con.rollback();
    throw err;
  }
}

async function deleteEntry(con, kw, nameRaw) {
  const name = decodeURIComponent(nameRaw || '');
  const [rows] = await con.execute(
    `
      SELECT we.entry_id
      FROM weekly_entries we
      JOIN players p ON p.alliance = we.alliance AND p.player_id = we.player_id
      WHERE we.alliance = ? AND we.year_week = ? AND p.current_name = ?
    `,
    [ALLIANCE, kw, name]
  );

  if (!rows.length) return json(200, { ok: true });

  const entryId = rows[0].entry_id;
  await con.beginTransaction();
  try {
    await con.execute('DELETE FROM weekly_entry_flags WHERE alliance = ? AND entry_id = ?', [ALLIANCE, entryId]);
    await con.execute('DELETE FROM weekly_entries WHERE alliance = ? AND entry_id = ?', [ALLIANCE, entryId]);
    await con.commit();
    return json(200, { ok: true });
  } catch (err) {
    await con.rollback();
    throw err;
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization'
      },
      body: ''
    };
  }

  const route = routeFromPath(event.path || '/');
  const segments = route.split('/').filter(Boolean);

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }
  }

  let con;
  try {
    con = await openDb();

    if (event.httpMethod === 'GET' && route === '/health') {
      const [rows] = await con.execute('SELECT 1 AS ok');
      return json(200, {
        ok: !!rows.length,
        backend: 'netlify-function-tidb',
        alliance: ALLIANCE,
        database: process.env.MYSQL_DATABASE,
        host: process.env.MYSQL_HOST,
        port: Number.parseInt(process.env.MYSQL_PORT || '4000', 10)
      });
    }

    if (segments[0] === 'members') {
      if (event.httpMethod === 'GET' && segments.length === 1) {
        return json(200, await getMembers(con));
      }
      if (event.httpMethod === 'POST' && segments.length === 1) {
        return await addMember(con, body);
      }
      if (event.httpMethod === 'PUT' && segments.length === 2) {
        return await updateMember(con, segments[1], body);
      }
      if (event.httpMethod === 'DELETE' && segments.length === 2) {
        return await deleteMember(con, segments[1]);
      }
    }

    if (segments[0] === 'entries') {
      const kw = Number.parseInt(segments[1], 10);
      if (!Number.isFinite(kw)) return json(400, { error: 'Ungueltige KW' });

      if (event.httpMethod === 'GET' && segments.length === 2) {
        return json(200, await getEntries(con, kw));
      }
      if (event.httpMethod === 'POST' && segments.length === 2) {
        return await saveEntry(con, kw, body);
      }
      if (event.httpMethod === 'DELETE' && segments.length === 3) {
        return await deleteEntry(con, kw, segments[2]);
      }
    }

    return json(404, { error: `Route not found: ${event.httpMethod} ${route}` });
  } catch (err) {
    return json(500, { error: String(err.message || err) });
  } finally {
    if (con) await con.end();
  }
};
