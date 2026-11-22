const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const { inspectProject } = require('./project');
const { readRecentlyOpenedFolders } = require('./cursor-state');

const CURSOR_USER = path.join(
  process.env.APPDATA || '',
  'Cursor',
  'User'
);

function fileUriToPath(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (uri.startsWith('file:///')) {
    let p = decodeURIComponent(uri.replace(/^file:\/\/\//, ''));
    // file:///c%3A/apps/... → c:/apps/...
    if (/^[a-zA-Z]:/.test(p) || /^[a-zA-Z]%3A/i.test(uri)) {
      p = decodeURIComponent(uri.replace(/^file:\/\/\//, ''));
      p = p.replace(/\//g, path.sep);
      return p;
    }
    return p.replace(/\//g, path.sep);
  }
  if (uri.startsWith('file://')) {
    return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\//g, path.sep);
  }
  return null;
}

function parseCursorTitle(title) {
  // Typical: "file.ts - my-project - Cursor" or "my-project - Cursor"
  // Dirty/unsaved: "● file.ts - my-project - Cursor"
  // Special UI: "Cursor Agents", "Cursor Settings"
  const raw = String(title || '').replace(/^\u25CF\s*/, '').trim();
  const special = /^(cursor(\s+agents|\s+settings|\s+home)?)$/i.test(raw);
  const parts = raw.split(' - ').map((s) => s.trim()).filter(Boolean);
  let fileName = null;
  let workspaceName = null;

  if (special) {
    return { fileName: null, workspaceName: null, rawTitle: raw, specialUi: raw };
  }

  if (parts.length >= 3 && /cursor/i.test(parts[parts.length - 1])) {
    fileName = parts[0];
    workspaceName = parts[parts.length - 2];
  } else if (parts.length === 2 && /cursor/i.test(parts[1])) {
    workspaceName = parts[0];
  } else if (parts.length >= 2) {
    workspaceName = parts[parts.length - 2] || parts[0];
    if (parts.length >= 3) fileName = parts[0];
  }

  return { fileName, workspaceName, rawTitle: raw, specialUi: null };
}

function readRecentWorkspaces(limit = 8) {
  const storagePath = path.join(CURSOR_USER, 'globalStorage', 'storage.json');
  const recent = [];

  // Prefer workspaceStorage mtimes (most recently used)
  const wsRoot = path.join(CURSOR_USER, 'workspaceStorage');
  if (fs.existsSync(wsRoot)) {
    const dirs = fs
      .readdirSync(wsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const full = path.join(wsRoot, d.name);
        const metaPath = path.join(full, 'workspace.json');
        let folder = null;
        if (fs.existsSync(metaPath)) {
          try {
            folder = JSON.parse(fs.readFileSync(metaPath, 'utf8')).folder || null;
          } catch {
            folder = null;
          }
        }
        return {
          id: d.name,
          folder,
          mtime: fs.statSync(full).mtimeMs,
        };
      })
      .filter((x) => x.folder)
      .sort((a, b) => b.mtime - a.mtime);

    for (const item of dirs) {
      if (recent.length >= limit) break;
      const localPath = fileUriToPath(item.folder);
      const label = localPath
        ? path.basename(localPath)
        : decodeURIComponent(String(item.folder).split('/').pop() || item.folder);
      recent.push({
        label,
        uri: item.folder,
        path: localPath,
        remote: !localPath,
        mtime: item.mtime,
      });
    }
  }

  // Supplement from profileAssociations if needed
  if (recent.length < limit && fs.existsSync(storagePath)) {
    try {
      const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
      const map = storage?.profileAssociations?.workspaces || {};
      for (const uri of Object.keys(map).reverse()) {
        if (recent.length >= limit) break;
        if (recent.some((r) => r.uri === uri)) continue;
        const localPath = fileUriToPath(uri);
        recent.push({
          label: localPath
            ? path.basename(localPath)
            : decodeURIComponent(String(uri).split('/').pop() || uri),
          uri,
          path: localPath,
          remote: !localPath,
          mtime: 0,
        });
      }
    } catch {
      // ignore
    }
  }

  return recent;
}

function mostRecentLocal(recent) {
  return (recent || []).find(
    (r) =>
      r.path &&
      !r.remote &&
      !String(r.uri || '').includes('background-composer')
  );
}

function activeFromRecentlyOpened() {
  const opened = readRecentlyOpenedFolders(8);
  for (const item of opened) {
    if (item.remoteAuthority) continue;
    const localPath = fileUriToPath(item.uri);
    if (localPath && fs.existsSync(localPath)) {
      return { path: localPath, uri: item.uri, source: 'recentlyOpened' };
    }
  }
  return null;
}

function resolveWorkspacePath(titleInfo, recent) {
  const opened = activeFromRecentlyOpened();

  if (titleInfo.specialUi) {
    if (opened) return { path: opened.path, guessed: true, source: opened.source };
    const soft = mostRecentLocal(recent);
    return soft
      ? { path: soft.path, guessed: true, source: 'workspaceStorage' }
      : { path: null, guessed: false, source: null };
  }

  if (!titleInfo.workspaceName) {
    if (opened) return { path: opened.path, guessed: true, source: opened.source };
    return { path: null, guessed: false, source: null };
  }

  const name = titleInfo.workspaceName.toLowerCase();

  // Title workspace matching top recently-opened (handles nested folder names)
  if (opened?.path) {
    const base = path.basename(opened.path).toLowerCase();
    const parent = path.basename(path.dirname(opened.path)).toLowerCase();
    if (base === name || parent === name || opened.path.toLowerCase().includes(`\\${name}`)) {
      return { path: opened.path, guessed: false, source: 'recentlyOpened+title' };
    }
  }

  const exact = recent.find(
    (r) =>
      (r.label && r.label.toLowerCase() === name) ||
      (r.path && path.basename(r.path).toLowerCase() === name)
  );
  if (exact?.path) return { path: exact.path, guessed: false, source: 'workspaceStorage' };

  const fuzzy = recent.find(
    (r) =>
      r.path &&
      (r.path.toLowerCase().includes(`\\${name}`) ||
        r.path.toLowerCase().endsWith(`\\${name}`) ||
        r.label?.toLowerCase().includes(name))
  );
  if (fuzzy?.path) return { path: fuzzy.path, guessed: false, source: 'workspaceStorage' };

  const nested = path.join('c:\\apps', titleInfo.workspaceName, titleInfo.workspaceName);
  if (fs.existsSync(nested)) return { path: nested, guessed: true, source: 'guess-nested' };

  const guess = path.join('c:\\apps', titleInfo.workspaceName);
  if (fs.existsSync(guess)) return { path: guess, guessed: true, source: 'guess-apps' };

  if (opened) return { path: opened.path, guessed: true, source: opened.source };
  return { path: null, guessed: false, source: null };
}

function gitInfo(cwd) {
  if (!cwd || !fs.existsSync(cwd)) {
    return { available: false, reason: 'no-workspace-path' };
  }
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    return { available: false, reason: 'not a git repository' };
  }
  try {
    const opts = {
      cwd,
      encoding: 'utf8',
      timeout: 2500,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    let branch = 'HEAD';
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts).trim();
    } catch {
      branch = '(no commits)';
    }
    const status = execFileSync('git', ['status', '-sb', '--porcelain'], opts).trim();
    const lines = status.split(/\r?\n/).filter(Boolean);
    const header = lines.find((l) => l.startsWith('##')) || `## ${branch}`;
    const changes = lines.filter((l) => !l.startsWith('##')).length;
    let upstream = null;
    const m = header.match(/##\s+[^\s.]+\.\.\.(\S+)/);
    if (m) upstream = m[1];

    return {
      available: true,
      branch: branch === 'HEAD' ? '(no commits)' : branch,
      upstream,
      changes,
      header: header.replace(/^##\s+/, ''),
    };
  } catch (err) {
    const msg = String(err.stderr || err.message || 'git-failed')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)[0] || 'git-failed';
    return { available: false, reason: msg };
  }
}

function getCursorContext(foreground) {
  const titleInfo = parseCursorTitle(foreground?.title || '');
  const recent = readRecentWorkspaces(10);
  const resolved = resolveWorkspacePath(titleInfo, recent);
  const workspacePath = resolved.path;
  const git = gitInfo(workspacePath);
  const project = inspectProject(workspacePath);

  const windowLabel = titleInfo.specialUi
    ? titleInfo.specialUi
    : [titleInfo.fileName, titleInfo.workspaceName].filter(Boolean).join(' · ') ||
      foreground?.title ||
      'Cursor';

  // Prefer Cursor recently-opened order for the recent chips
  const opened = readRecentlyOpenedFolders(10)
    .map((item) => {
      const localPath = fileUriToPath(item.uri);
      return {
        label:
          item.label ||
          (localPath
            ? path.basename(localPath)
            : decodeURIComponent(String(item.uri).split('/').pop() || item.uri)),
        uri: item.uri,
        path: localPath,
        remote: Boolean(item.remoteAuthority) || !localPath,
        mtime: 0,
      };
    })
    .filter((r) => r.uri);
  const recentMerged = opened.length ? opened : recent;

  return {
    app: 'cursor',
    title: titleInfo,
    windowLabel,
    workspacePath,
    workspaceGuessed: Boolean(resolved.guessed),
    workspaceSource: resolved.source || null,
    workspaceName: titleInfo.specialUi
      ? workspacePath
        ? path.basename(workspacePath)
        : titleInfo.specialUi
      : titleInfo.workspaceName ||
        (workspacePath ? path.basename(workspacePath) : null),
    git,
    project,
    recent: recentMerged,
    homeDir: os.homedir(),
  };
}

module.exports = {
  getCursorContext,
  parseCursorTitle,
  fileUriToPath,
};
