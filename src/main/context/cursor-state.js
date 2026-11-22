const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CURSOR_USER = path.join(process.env.APPDATA || '', 'Cursor', 'User');
const STATE_DB = path.join(CURSOR_USER, 'globalStorage', 'state.vscdb');

function findSqlite3() {
  // Prefer PATH, then common user-local installs (no hard-coded usernames)
  const candidates = ['sqlite3'];
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (home) {
    candidates.push(
      path.join(home, 'anaconda3', 'Library', 'bin', 'sqlite3.exe'),
      path.join(home, 'miniconda3', 'Library', 'bin', 'sqlite3.exe'),
      path.join(home, 'scoop', 'shims', 'sqlite3.exe')
    );
  }
  if (process.env.SQLITE3_PATH) {
    candidates.unshift(process.env.SQLITE3_PATH);
  }

  for (const c of candidates) {
    if (c === 'sqlite3') {
      try {
        execFileSync('sqlite3', ['-version'], {
          timeout: 1500,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        return 'sqlite3';
      } catch {
        continue;
      }
    }
    if (c.endsWith('.exe') && fs.existsSync(c)) return c;
  }
  return null;
}

function readStateValue(key) {
  const sqlite = findSqlite3();
  if (!sqlite || !fs.existsSync(STATE_DB)) return null;
  try {
    const out = execFileSync(
      sqlite,
      [STATE_DB, `SELECT value FROM ItemTable WHERE key = '${key.replace(/'/g, "''")}';`],
      {
        encoding: 'utf8',
        timeout: 2500,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 2 * 1024 * 1024,
      }
    ).trim();
    if (!out) return null;
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/**
 * Cursor's authoritative recent/open folder list (first entry is usually current).
 */
function readRecentlyOpenedFolders(limit = 12) {
  const data = readStateValue('history.recentlyOpenedPathsList');
  const entries = data?.entries || [];
  const out = [];
  for (const entry of entries) {
    if (out.length >= limit) break;
    const uri = entry.folderUri || entry.fileUri || null;
    if (!uri) continue;
    out.push({
      uri,
      label: entry.label || null,
      remoteAuthority: entry.remoteAuthority || null,
    });
  }
  return out;
}

module.exports = {
  readRecentlyOpenedFolders,
  readStateValue,
  STATE_DB,
};
