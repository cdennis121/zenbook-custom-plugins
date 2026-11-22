const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const {
  loadConfig,
  pickTargetDisplay,
  summarizeDisplays,
} = require('./display');
const { createForegroundWatcher } = require('./foreground');
const { discoverPlugins, resolveActivePlugin } = require('./plugins');
const { getContextForApp } = require('./context');
const { openBambuApp } = require('./context/bambu');
const { runInTerminal } = require('./terminal');
const { openInCursor } = require('./open-in-cursor');

const isDev = process.argv.includes('--dev');
const listOnly = process.argv.includes('--list-displays');

let mainWindow = null;
let watcher = null;
let config = null;
let plugins = [];
let activePluginId = null;
let lastForeground = null;
let lastContext = null;

function placeOnTargetDisplay(win) {
  const { display, reason } = pickTargetDisplay(config);
  const { x, y, width, height } = display.bounds;
  console.log(`[display] target id=${display.id} ${width}x${height} @${x},${y} (${reason})`);

  win.setBounds({ x, y, width, height });
  if (config.window?.fullscreen !== false) {
    win.setFullScreen(false);
  }
  return display;
}

function buildState() {
  const active = plugins.find((p) => p.id === activePluginId) || null;
  return {
    activePluginId,
    activePlugin: active
      ? {
          id: active.id,
          name: active.name,
          description: active.description,
          entryUrl: `file://${active.entryUrl.replace(/\\/g, '/')}`,
        }
      : null,
    plugins: plugins.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      priority: p.priority,
      match: p.match,
    })),
    foreground: lastForeground,
    context: lastContext,
    displays: summarizeDisplays(),
    config,
  };
}

function refreshContext() {
  try {
    lastContext = getContextForApp(lastForeground, activePluginId);
  } catch (err) {
    console.error('[context] failed', err);
    lastContext = { app: 'error', error: String(err.message || err) };
  }
}

function pushState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  refreshContext();
  mainWindow.webContents.send('host:state', buildState());
}

function createWindow() {
  const winCfg = config.window || {};
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 400,
    frame: winCfg.frameless === false,
    autoHideMenuBar: true,
    resizable: !!winCfg.resizable,
    alwaysOnTop: !!winCfg.alwaysOnTop,
    backgroundColor: '#0f1419',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  placeOnTargetDisplay(mainWindow);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    placeOnTargetDisplay(mainWindow);
    mainWindow.show();
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function activateForApp(appInfo) {
  lastForeground = appInfo;
  const selfNames = ['electron.exe', 'duo-plugin-container.exe'];
  if (selfNames.includes((appInfo.processName || '').toLowerCase())) {
    pushState();
    return;
  }

  const next = resolveActivePlugin(plugins, appInfo, config.defaultPluginId || 'home');
  const nextId = next?.id || null;
  if (nextId !== activePluginId) {
    activePluginId = nextId;
    console.log(
      `[plugins] active=${activePluginId || '(none)'} foreground=${appInfo.processName} "${appInfo.title}"`
    );
  }
  pushState();
}

function findChromeExe() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function wireIpc() {
  ipcMain.handle('host:get-state', () => {
    refreshContext();
    return buildState();
  });

  ipcMain.handle('host:get-context', () => {
    refreshContext();
    return lastContext;
  });

  ipcMain.handle('host:reload-plugins', () => {
    plugins = discoverPlugins();
    if (lastForeground) activateForApp(lastForeground);
    else {
      activePluginId = config.defaultPluginId || 'home';
      pushState();
    }
    return plugins.map((p) => p.id);
  });

  ipcMain.handle('host:set-plugin', (_e, pluginId) => {
    if (plugins.some((p) => p.id === pluginId)) {
      activePluginId = pluginId;
      pushState();
      return true;
    }
    return false;
  });

  ipcMain.handle('host:open-external', async (_e, url) => {
    if (typeof url !== 'string') return false;
    if (/^https?:/i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    // chrome:// pages — launch Chrome directly
    if (/^chrome:\/\//i.test(url)) {
      const chrome = findChromeExe();
      if (!chrome) return false;
      spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }
    return false;
  });

  ipcMain.handle('host:open-path', async (_e, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath) return { ok: false };
    if (!fs.existsSync(targetPath)) return { ok: false, reason: 'missing' };
    const err = await shell.openPath(targetPath);
    return err ? { ok: false, reason: err } : { ok: true };
  });

  ipcMain.handle('host:open-in-cursor', (_e, targetPath) => {
    return openInCursor(targetPath);
  });

  ipcMain.handle('host:reveal-path', (_e, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath) return false;
    if (!fs.existsSync(targetPath)) return false;
    shell.showItemInFolder(targetPath);
    return true;
  });

  ipcMain.handle('host:copy-text', (_e, text) => {
    if (typeof text !== 'string') return false;
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('host:open-bambu', async (_e, which) => openBambuApp(which || 'auto'));

  ipcMain.handle('host:run-in-terminal', (_e, payload) => {
    const cwd = payload?.cwd;
    const command = payload?.command || '';
    const cwdOnly = Boolean(payload?.cwdOnly);

    // Only allow running against the current Cursor workspace context
    const allowedCwd =
      lastContext?.app === 'cursor' && lastContext?.workspacePath
        ? path.resolve(lastContext.workspacePath)
        : null;
    if (!allowedCwd || !cwd || path.resolve(cwd) !== allowedCwd) {
      return { ok: false, reason: 'cwd-not-allowed' };
    }

    if (cwdOnly || !command) {
      return runInTerminal({ cwd: allowedCwd, cwdOnly: true });
    }

    // Allow only commands advertised by project inspection (or copy-safe npm scripts)
    const allowed = new Set();
    for (const s of lastContext.project?.shortcuts || []) {
      if (s.kind === 'run' && s.run) allowed.add(s.run);
    }
    for (const s of lastContext.project?.scripts || []) {
      if (s.run) allowed.add(s.run);
    }
    if (!allowed.has(command)) {
      return { ok: false, reason: 'command-not-allowed' };
    }
    return runInTerminal({ cwd: allowedCwd, command });
  });

  ipcMain.handle('host:retarget-display', () => {
    if (mainWindow) {
      const d = placeOnTargetDisplay(mainWindow);
      pushState();
      return { id: d.id, bounds: d.bounds };
    }
    return null;
  });
}

app.whenReady().then(() => {
  config = loadConfig();
  plugins = discoverPlugins();

  if (listOnly) {
    console.log(JSON.stringify(summarizeDisplays(), null, 2));
    const pick = pickTargetDisplay(config);
    console.log(
      'picked:',
      pick.display.id,
      pick.display.bounds,
      pick.reason
    );
    app.quit();
    return;
  }

  console.log(
    `[plugins] loaded: ${plugins.map((p) => p.id).join(', ') || '(none)'}`
  );

  wireIpc();
  createWindow();

  activePluginId = config.defaultPluginId || 'home';

  watcher = createForegroundWatcher({
    intervalMs: config.foregroundPollMs || 500,
    onChange: activateForApp,
  });
  watcher.start();

  setTimeout(() => {
    try {
      activateForApp(watcher.peek());
    } catch {
      pushState();
    }
  }, 300);

  // Periodic context refresh while a data plugin is active (git/bookmarks)
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!activePluginId || activePluginId === 'home') return;
    pushState();
  }, 4000);

  const { screen } = require('electron');
  screen.on('display-added', () => mainWindow && placeOnTargetDisplay(mainWindow));
  screen.on('display-removed', () => mainWindow && placeOnTargetDisplay(mainWindow));
  screen.on('display-metrics-changed', () => mainWindow && placeOnTargetDisplay(mainWindow));
});

app.on('window-all-closed', () => {
  watcher?.stop();
  app.quit();
});
