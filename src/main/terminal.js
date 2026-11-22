const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Open a shell in cwd, optionally running a single command.
 * Prefers Windows Terminal (`wt`); falls back to `cmd /k`.
 * Commands are only accepted from host-built shortcut allowlists.
 */
function runInTerminal({ cwd, command, cwdOnly = false }) {
  if (!cwd || !fs.existsSync(cwd)) {
    return { ok: false, reason: 'missing-cwd' };
  }

  const abs = path.resolve(cwd);
  const wt = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WindowsApps',
    'wt.exe'
  );
  const hasWt = fs.existsSync(wt);

  try {
    if (cwdOnly || !command) {
      if (hasWt) {
        spawn(wt, ['-d', abs], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('cmd.exe', ['/k', `cd /d "${abs}"`], {
          detached: true,
          stdio: 'ignore',
          cwd: abs,
        }).unref();
      }
      return { ok: true, mode: hasWt ? 'wt' : 'cmd', cwd: abs };
    }

    // Keep command as a single string after cd — no shell metachar injection from UI text we control
    const safeCmd = String(command).replace(/[\r\n]/g, ' ').trim();
    if (!safeCmd) return { ok: false, reason: 'empty-command' };

    if (hasWt) {
      spawn(wt, ['-d', abs, 'cmd', '/k', safeCmd], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      spawn('cmd.exe', ['/k', `cd /d "${abs}" && ${safeCmd}`], {
        detached: true,
        stdio: 'ignore',
        cwd: abs,
      }).unref();
    }
    return { ok: true, mode: hasWt ? 'wt' : 'cmd', cwd: abs, command: safeCmd };
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  }
}

module.exports = {
  runInTerminal,
};
