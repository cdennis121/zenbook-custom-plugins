function duo(msg) {
  window.parent.postMessage(msg, '*');
}

const els = {
  workspace: document.getElementById('workspace'),
  fileLine: document.getElementById('fileLine'),
  branch: document.getElementById('branch'),
  changes: document.getElementById('changes'),
  stackTags: document.getElementById('stackTags'),
  shortcutRow: document.getElementById('shortcutRow'),
  scriptRow: document.getElementById('scriptRow'),
  fileRow: document.getElementById('fileRow'),
  scriptsHeading: document.getElementById('scriptsHeading'),
  filesHeading: document.getElementById('filesHeading'),
  recentList: document.getElementById('recentList'),
  statusNote: document.getElementById('statusNote'),
  btnCopyPath: document.getElementById('btnCopyPath'),
  btnReveal: document.getElementById('btnReveal'),
  btnOpenFolder: document.getElementById('btnOpenFolder'),
};

let workspacePath = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeBtn(label, { primary = false, title = '', onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  if (primary) btn.classList.add('primary');
  btn.title = title || label;
  btn.innerHTML = `<span class="label">${escapeHtml(label)}</span>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function runCommand(command, cwdOnly = false) {
  if (!workspacePath) return;
  duo({
    type: 'duo:runInTerminal',
    cwd: workspacePath,
    command: command || '',
    cwdOnly,
  });
  els.statusNote.textContent = cwdOnly
    ? `Opened terminal in ${workspacePath}`
    : `Started: ${command}`;
}

function renderShortcuts(ctx) {
  els.shortcutRow.innerHTML = '';
  const shortcuts = ctx.project?.shortcuts || [];
  if (!workspacePath) {
    els.shortcutRow.appendChild(
      document.createTextNode('Open a folder workspace in Cursor to unlock Next/Expo actions.')
    );
    return;
  }
  if (!shortcuts.length) {
    els.shortcutRow.appendChild(
      document.createTextNode('No package.json stack detected — Terminal still works.')
    );
    return;
  }

  for (const s of shortcuts) {
    if (s.kind === 'run') {
      els.shortcutRow.appendChild(
        makeBtn(s.label, {
          primary: /dev|start|expo/i.test(s.label),
          title: s.hint || s.run || 'Open terminal',
          onClick: () => runCommand(s.run || '', Boolean(s.cwdOnly)),
        })
      );
    } else if (s.kind === 'url') {
      els.shortcutRow.appendChild(
        makeBtn(s.label, {
          title: s.url,
          onClick: () => duo({ type: 'duo:openExternal', url: s.url }),
        })
      );
    } else if (s.kind === 'path' && s.path) {
      els.shortcutRow.appendChild(
        makeBtn(s.label, {
          title: `Open in Cursor: ${s.path}`,
          onClick: () => duo({ type: 'duo:openInCursor', path: s.path }),
        })
      );
    }
  }
}

function renderScripts(ctx) {
  els.scriptRow.innerHTML = '';
  const scripts = ctx.project?.scripts || [];
  if (!scripts.length) {
    els.scriptsHeading.style.display = 'none';
    els.scriptRow.style.display = 'none';
    return;
  }
  els.scriptsHeading.style.display = '';
  els.scriptRow.style.display = '';
  for (const s of scripts) {
    els.scriptRow.appendChild(
      makeBtn(s.name, {
        title: s.command,
        onClick: () => runCommand(s.run),
      })
    );
  }
}

function renderFiles(ctx) {
  els.fileRow.innerHTML = '';
  const files = ctx.project?.files || [];
  if (!files.length) {
    els.filesHeading.style.display = 'none';
    els.fileRow.style.display = 'none';
    return;
  }
  els.filesHeading.style.display = '';
  els.fileRow.style.display = '';
  for (const f of files.slice(0, 8)) {
    els.fileRow.appendChild(
      makeBtn(f.name, {
        title: `Open in Cursor: ${f.path}`,
        onClick: () => duo({ type: 'duo:openInCursor', path: f.path }),
      })
    );
  }
}

function renderRecent(ctx) {
  els.recentList.innerHTML = '';
  const recent = ctx.recent || [];
  if (!recent.length) {
    els.recentList.textContent = 'No recent workspaces';
    return;
  }
  for (const item of recent.slice(0, 8)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (item.remote ? ' remote' : '');
    btn.title = item.path || item.uri || '';
    btn.innerHTML = `<span class="label">${escapeHtml(item.label)}</span>${
      item.remote ? ' · remote' : ''
    }`;
    btn.addEventListener('click', () => {
      if (item.path) duo({ type: 'duo:openInCursor', path: item.path });
      else if (item.uri) duo({ type: 'duo:copyText', text: item.uri });
    });
    els.recentList.appendChild(btn);
  }
}

function render(state) {
  const ctx = state?.context;
  if (!ctx || ctx.app !== 'cursor') {
    els.workspace.textContent = 'Cursor';
    els.fileLine.textContent = 'Waiting for Cursor focus…';
    els.stackTags.textContent = '—';
    return;
  }

  workspacePath = ctx.workspacePath || null;
  els.workspace.textContent = ctx.workspaceName || 'Cursor';

  const stacks = ctx.project?.stacks || [];
  els.stackTags.textContent = stacks.length ? stacks.join(' · ') : 'general';

  const file = ctx.title?.fileName;
  const bits = [];
  if (ctx.windowLabel) bits.push(ctx.windowLabel);
  if (file) bits.push(`file: ${file}`);
  if (ctx.workspaceGuessed) bits.push('(using last local folder)');
  if (workspacePath) bits.push(workspacePath);
  els.fileLine.textContent = bits.join(' · ') || 'No workspace resolved from window title';

  if (ctx.git?.available) {
    els.branch.textContent = ctx.git.branch || 'detached';
    els.changes.textContent =
      ctx.git.changes > 0 ? `${ctx.git.changes} changed` : 'clean';
  } else {
    els.branch.textContent = 'no git';
    els.changes.textContent = '—';
  }

  const hasPath = Boolean(workspacePath);
  els.btnCopyPath.disabled = !hasPath;
  els.btnReveal.disabled = !hasPath;
  els.btnOpenFolder.disabled = !hasPath;

  renderShortcuts(ctx);
  renderScripts(ctx);
  renderFiles(ctx);
  renderRecent(ctx);

  if (!hasPath) {
    els.statusNote.textContent =
      'Focus a Cursor window with a folder open (title like file — project — Cursor).';
  } else if (ctx.project?.monorepo) {
    const apps = (ctx.project.workspacePackages || [])
      .filter((p) => p.stacks?.length)
      .map((p) => `${p.folder}(${p.stacks.join('+')})`)
      .join(', ');
    els.statusNote.textContent = `Monorepo — ${apps || stacks.join(', ')}. Tap Workflow to run filtered pnpm scripts.`;
  } else if (stacks.includes('next') || stacks.includes('expo')) {
    els.statusNote.textContent = `Detected ${stacks.join(', ')} — tap Workflow to run in Windows Terminal.`;
  } else if (ctx.project?.available) {
    els.statusNote.textContent = 'package.json found — use npm scripts or Terminal here.';
  } else if (stacks.includes('docs')) {
    els.statusNote.textContent =
      'Docs/prompts folder (no package.json) — open files, README, or Terminal. Next/Expo buttons appear in JS app folders.';
  } else {
    els.statusNote.textContent = 'Folder open — no package.json stack detected.';
  }
}

els.btnCopyPath.addEventListener('click', () => {
  if (workspacePath) duo({ type: 'duo:copyText', text: workspacePath });
});
els.btnReveal.addEventListener('click', () => {
  if (workspacePath) duo({ type: 'duo:revealPath', path: workspacePath });
});
els.btnOpenFolder.addEventListener('click', () => {
  if (workspacePath) duo({ type: 'duo:openInCursor', path: workspacePath });
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'duo:state') render(event.data.state);
});

duo({ type: 'duo:getState' });
setInterval(() => duo({ type: 'duo:getState' }), 2000);
