const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const ALLIANCE = process.env.INY_ALLIANCE || 'INY';

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    },
    body: JSON.stringify(payload)
  };
}

function safeRank(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

function normalizeDiscordId(value) {
  const discordId = String(value ?? '').trim()
  if (!discordId) return ''
  if (!/^\d+$/.test(discordId)) throw new Error('Discord-ID muss numerisch sein')
  return discordId
}

async function getDiscordAccessMember(con, discordId) {
  const [rows] = await con.execute(
    `
      SELECT
        p.current_name,
        p.current_rank_code,
        COALESCE(pid.discord_user_id, puld.discord_user_id) AS discord_user_id
      FROM players p
      LEFT JOIN (
        SELECT alliance, player_id, MIN(discord_user_id) AS discord_user_id
        FROM player_identities
        WHERE discord_user_id IS NOT NULL
        GROUP BY alliance, player_id
      ) pid ON pid.alliance = p.alliance AND pid.player_id = p.player_id
      LEFT JOIN (
        SELECT pul.alliance, pul.player_id, MIN(uda.discord_user_id) AS discord_user_id
        FROM player_user_links pul
        JOIN user_discord_accounts uda
          ON uda.alliance = pul.alliance AND uda.user_id = pul.user_id
        GROUP BY pul.alliance, pul.player_id
      ) puld ON puld.alliance = p.alliance AND puld.player_id = p.player_id
      WHERE p.alliance = ?
        AND p.is_active = 1
        AND p.current_rank_code IN (4, 5)
        AND COALESCE(pid.discord_user_id, puld.discord_user_id) = ?
      LIMIT 1
    `,
    [ALLIANCE, discordId]
  );
  return rows[0] || null;
}

async function ensureAccessRequestsTable(con) {
  await con.execute(
    `
      CREATE TABLE IF NOT EXISTS access_requests (
        alliance VARCHAR(50) NOT NULL,
        request_id CHAR(36) NOT NULL,
        discord_user_id VARCHAR(50) NOT NULL,
        discord_username VARCHAR(100) NULL,
        discord_avatar VARCHAR(255) NULL,
        requested_alliance VARCHAR(50) NOT NULL,
        requested_player_name VARCHAR(150) NOT NULL,
        note VARCHAR(255) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME NULL,
        PRIMARY KEY (alliance, request_id),
        UNIQUE KEY uq_access_requests_pending (alliance, discord_user_id, status),
        KEY ix_access_requests_status (alliance, status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function verifyDiscord(con, discordIdRaw) {
  let discordId;
  try {
    discordId = normalizeDiscordId(discordIdRaw);
  } catch {
    return json(200, { ok: false, error: 'Discord-ID fehlt oder ungueltig' });
  }
  if (!discordId) return json(200, { ok: false, error: 'Discord-ID fehlt' });

  const member = await getDiscordAccessMember(con, discordId);
  if (!member) return json(200, { ok: false, error: 'Kein Zugriff' });

  return json(200, {
    ok: true,
    member_name: member.current_name,
    role: roleFromRank(member.current_rank_code)
  });
}

async function submitAccessRequest(con, body) {
  let discordId;
  try {
    discordId = normalizeDiscordId(body.discord_id);
  } catch (err) {
    return json(400, { error: err.message });
  }

  const requestedPlayerName = String(body.player_name || '').trim();
  const requestedAlliance = String(body.alliance || ALLIANCE).trim().toUpperCase();
  const discordUsername = String(body.discord_username || '').trim() || null;
  const discordAvatar = String(body.discord_avatar || '').trim() || null;
  const note = String(body.note || '').trim() || null;

  if (!discordId) return json(400, { error: 'Discord-ID fehlt' });
  if (!requestedPlayerName) return json(400, { error: 'Spielername fehlt' });

  await ensureAccessRequestsTable(con);
  await con.execute(
    `
      INSERT INTO access_requests (
        alliance, request_id, discord_user_id, discord_username, discord_avatar,
        requested_alliance, requested_player_name, note, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      ON DUPLICATE KEY UPDATE
        discord_username = VALUES(discord_username),
        discord_avatar = VALUES(discord_avatar),
        requested_alliance = VALUES(requested_alliance),
        requested_player_name = VALUES(requested_player_name),
        note = VALUES(note),
        created_at = CURRENT_TIMESTAMP,
        reviewed_at = NULL
    `,
    [ALLIANCE, randomUUID(), discordId, discordUsername, discordAvatar, requestedAlliance, requestedPlayerName, note]
  );
  return json(200, { ok: true });
}

async function listAccessRequests(con, statusRaw) {
  const status = String(statusRaw || 'pending').trim().toLowerCase() || 'pending';
  await ensureAccessRequestsTable(con);
  const [rows] = await con.execute(
    `
      SELECT
        request_id,
        discord_user_id,
        discord_username,
        discord_avatar,
        requested_alliance,
        requested_player_name,
        note,
        status,
        created_at
      FROM access_requests
      WHERE alliance = ? AND status = ?
      ORDER BY created_at DESC
      LIMIT 200
    `,
    [ALLIANCE, status]
  );
  return json(200, rows);
}

async function resolveAccessRequest(con, requestIdRaw, body) {
  const requestId = decodeURIComponent(requestIdRaw || '');
  const status = String((body || {}).status || 'accepted').trim().toLowerCase();
  if (!['accepted', 'mapped', 'rejected'].includes(status)) {
    return json(400, { error: 'Ungueltiger Status' });
  }

  await ensureAccessRequestsTable(con);
  const [result] = await con.execute(
    `
      UPDATE access_requests
      SET status = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE alliance = ? AND request_id = ? AND status = 'pending'
    `,
    [status, ALLIANCE, requestId]
  );
  return json(200, { ok: true, updated: !!result.affectedRows });
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
      SELECT
        p.player_id,
        p.alliance,
        p.current_name,
        p.current_rank_code,
        COALESCE(pid.discord_user_id, puld.discord_user_id) AS discord_user_id,
        puld.discord_username,
        puld.discord_avatar
      FROM players p
      LEFT JOIN (
        SELECT alliance, player_id, MIN(discord_user_id) AS discord_user_id
        FROM player_identities
        WHERE discord_user_id IS NOT NULL
        GROUP BY alliance, player_id
      ) pid ON pid.alliance = p.alliance AND pid.player_id = p.player_id
      LEFT JOIN (
        SELECT
          pul.alliance,
          pul.player_id,
          MIN(uda.discord_user_id) AS discord_user_id,
          MIN(uda.discord_username) AS discord_username,
          MIN(uda.discord_avatar) AS discord_avatar
        FROM player_user_links pul
        JOIN user_discord_accounts uda
          ON uda.alliance = pul.alliance AND uda.user_id = pul.user_id
        GROUP BY pul.alliance, pul.player_id
      ) puld ON puld.alliance = p.alliance AND puld.player_id = p.player_id
      WHERE p.alliance = ? AND p.is_active = 1
      ORDER BY p.current_name
    `,
    [ALLIANCE]
  );

  return rows.map((r) => ({
    id: r.player_id,
    alliance: r.alliance,
    name: r.current_name,
    default_rank: r.current_rank_code,
    role: roleFromRank(r.current_rank_code),
    discord_id: r.discord_user_id || null,
    discord_username: r.discord_username || null,
    discord_avatar: r.discord_avatar || null,
    discord_connected: !!r.discord_user_id,
    discord_avatar_url: r.discord_user_id && r.discord_avatar
      ? `https://cdn.discordapp.com/avatars/${r.discord_user_id}/${r.discord_avatar}.png?size=64`
      : null
  }));
}

async function swapMemberIdToDiscord(con, nameRaw) {
  const name = decodeURIComponent(nameRaw || '');
  const [rows] = await con.execute(
    `
      SELECT
        p.player_id,
        p.current_name,
        p.current_rank_code,
        p.is_active,
        p.created_at,
        p.retired_at,
        COALESCE(pid.discord_user_id, puld.discord_user_id) AS discord_user_id
      FROM players p
      LEFT JOIN (
        SELECT alliance, player_id, MIN(discord_user_id) AS discord_user_id
        FROM player_identities
        WHERE discord_user_id IS NOT NULL
        GROUP BY alliance, player_id
      ) pid ON pid.alliance = p.alliance AND pid.player_id = p.player_id
      LEFT JOIN (
        SELECT pul.alliance, pul.player_id, MIN(uda.discord_user_id) AS discord_user_id
        FROM player_user_links pul
        JOIN user_discord_accounts uda
          ON uda.alliance = pul.alliance AND uda.user_id = pul.user_id
        GROUP BY pul.alliance, pul.player_id
      ) puld ON puld.alliance = p.alliance AND puld.player_id = p.player_id
      WHERE p.alliance = ? AND p.current_name = ?
    `,
    [ALLIANCE, name]
  );

  if (!rows.length) return json(404, { error: 'Mitglied nicht gefunden' });

  const oldPlayerId = rows[0].player_id;
  const discordUserId = rows[0].discord_user_id;
  if (!discordUserId) return json(400, { error: 'Kein verknuepfter Discord-Account vorhanden' });
  if (String(discordUserId).length > 36) return json(400, { error: 'Discord-ID ist zu lang fuer player_id' });
  if (oldPlayerId === discordUserId) return json(200, { ok: true, swapped: false, player_id: oldPlayerId });

  const [takenRows] = await con.execute(
    `
      SELECT 1
      FROM players
      WHERE alliance = ? AND player_id = ? AND player_id <> ?
      LIMIT 1
    `,
    [ALLIANCE, discordUserId, oldPlayerId]
  );
  if (takenRows.length) return json(409, { error: 'Discord-ID wird bereits von einem anderen Spieler genutzt' });

  await con.beginTransaction();
  try {
    const tempName = `__swap__${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await con.execute('UPDATE players SET current_name = ? WHERE alliance = ? AND player_id = ?', [tempName, ALLIANCE, oldPlayerId]);
    await con.execute(
      `
        INSERT INTO players (alliance, player_id, current_name, current_rank_code, is_active, created_at, retired_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [ALLIANCE, discordUserId, rows[0].current_name, rows[0].current_rank_code, rows[0].is_active, rows[0].created_at, rows[0].retired_at]
    );
    await con.execute('UPDATE weekly_entries SET player_id = ? WHERE alliance = ? AND player_id = ?', [discordUserId, ALLIANCE, oldPlayerId]);
    await con.execute('UPDATE player_name_history SET player_id = ? WHERE alliance = ? AND player_id = ?', [discordUserId, ALLIANCE, oldPlayerId]);
    await con.execute('UPDATE player_identities SET player_id = ? WHERE alliance = ? AND player_id = ?', [discordUserId, ALLIANCE, oldPlayerId]);
    await con.execute('UPDATE player_user_links SET player_id = ? WHERE alliance = ? AND player_id = ?', [discordUserId, ALLIANCE, oldPlayerId]);
    await con.execute('DELETE FROM players WHERE alliance = ? AND player_id = ?', [ALLIANCE, oldPlayerId]);
    await con.commit();
    return json(200, { ok: true, swapped: true, old_player_id: oldPlayerId, player_id: discordUserId });
  } catch (err) {
    await con.rollback();
    if (String(err.code || '').includes('DUP_ENTRY')) {
      return json(409, { error: 'ID-Tausch nicht moeglich (Konflikt)' });
    }
    throw err;
  }
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
  let discordId;
  try {
    discordId = Object.prototype.hasOwnProperty.call(body, 'discord_id') ? normalizeDiscordId(body.discord_id) : undefined;
  } catch (err) {
    return json(400, { error: err.message });
  }

  const [rows] = await con.execute(
    `
      SELECT player_id, current_name
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

      if (newName !== rows[0].current_name) {
        await con.execute(
          `
            INSERT INTO player_name_history (alliance, name_event_id, player_id, player_name, valid_from_yw)
            VALUES (?, ?, ?, ?, 0)
          `,
          [ALLIANCE, randomUUID(), playerId, newName]
        );
      }

    if (discordId !== undefined) {
      if (!discordId) {
        await con.execute('UPDATE player_identities SET discord_user_id = NULL WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
      } else {
        const [conflictRows] = await con.execute(
          `
            SELECT 1
            FROM player_identities
            WHERE alliance = ? AND discord_user_id = ? AND player_id <> ?
            LIMIT 1
          `,
          [ALLIANCE, discordId, playerId]
        );
        if (conflictRows.length) {
          await con.rollback();
          return json(409, { error: 'Discord-ID ist bereits einem anderen Spieler zugeordnet' });
        }

        const [identityRows] = await con.execute(
          `
            SELECT identity_id
            FROM player_identities
            WHERE alliance = ? AND player_id = ?
            ORDER BY created_at, identity_id
          `,
          [ALLIANCE, playerId]
        );

        if (identityRows.length) {
          await con.execute('UPDATE player_identities SET discord_user_id = NULL WHERE alliance = ? AND player_id = ?', [ALLIANCE, playerId]);
          await con.execute('UPDATE player_identities SET discord_user_id = ? WHERE alliance = ? AND identity_id = ?', [discordId, ALLIANCE, identityRows[0].identity_id]);
        } else {
          await con.execute(
            `
              INSERT INTO player_identities (alliance, identity_id, player_id, discord_user_id)
              VALUES (?, ?, ?, ?)
            `,
            [ALLIANCE, randomUUID(), playerId, discordId]
          );
        }
      }
    }

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

    if (event.httpMethod === 'GET' && route === '/verify-discord') {
      const discordId = (event.queryStringParameters || {}).discord_id;
      return await verifyDiscord(con, discordId);
    }

    if (segments[0] === 'access-requests') {
      if (event.httpMethod === 'GET' && segments.length === 1) {
        const status = (event.queryStringParameters || {}).status;
        return await listAccessRequests(con, status);
      }
      if (event.httpMethod === 'POST' && segments.length === 1) {
        return await submitAccessRequest(con, body);
      }
      if (event.httpMethod === 'POST' && segments.length === 3 && segments[2] === 'resolve') {
        return await resolveAccessRequest(con, segments[1], body);
      }
    }

    if (segments[0] === 'members') {
      if (event.httpMethod === 'GET' && segments.length === 1) {
        return json(200, await getMembers(con));
      }
      if (event.httpMethod === 'POST' && segments.length === 1) {
        return await addMember(con, body);
      }
      if (event.httpMethod === 'POST' && segments.length === 3 && segments[2] === 'swap-id-to-discord') {
        return await swapMemberIdToDiscord(con, segments[1]);
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
