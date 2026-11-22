const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function findCursorCli() {
  const candidates = [
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'cursor',
      'resources',
      'app',
      'bin',
      'cursor.cmd'
    ),
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'cursor',
      'Cursor.exe'
    ),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

/**
 * Open a file or folder in an existing Cursor window.
 * Files use --goto; folders reuse the window / add as needed.
 */
function openInCursor(targetPath, { newWindow = false } = {}) {
  if (!targetPath || typeof targetPath !== 'string') {
    return { ok: false, reason: 'missing-path' };
  }
  const abs = path.resolve(targetPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, reason: 'missing' };
  }

  const cli = findCursorCli();
  if (!cli) {
    return { ok: false, reason: 'cursor-cli-not-found' };
  }

  const isDir = fs.statSync(abs).isDirectory();
  const args = [];
  if (newWindow) args.push('--new-window');
  else args.push('--reuse-window');

  if (isDir) {
    args.push(abs);
  } else {
    // Open file in the already-open Cursor window at line 1
    args.push('--goto', `${abs}:1`);
  }

  try {
    // cursor.cmd needs shell on Windows; Cursor.exe can run directly
    const useShell = cli.toLowerCase().endsWith('.cmd') || cli.toLowerCase().endsWith('.bat');
    spawn(cli, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: useShell,
    }).unref();
    return { ok: true, path: abs, cli, args };
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }
}

module.exports = {
  openInCursor,
  findCursorCli,
};
