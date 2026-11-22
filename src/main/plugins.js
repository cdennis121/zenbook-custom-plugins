const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.join(__dirname, '..', '..', 'plugins');

/**
 * Plugin manifest shape (plugin.json):
 * {
 *   "id": "cursor-helper",
 *   "name": "Cursor Helper",
 *   "match": {
 *     "processNames": ["cursor.exe"],
 *     "titlePatterns": ["(?i)cursor"]
 *   },
 *   "priority": 10,
 *   "entry": "index.html"
 * }
 */

function loadManifest(dir) {
  const manifestPath = path.join(dir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!raw.id || !raw.entry) {
    console.warn(`[plugins] skip ${dir}: missing id/entry`);
    return null;
  }
  return {
    id: raw.id,
    name: raw.name || raw.id,
    description: raw.description || '',
    match: raw.match || {},
    priority: raw.priority ?? 0,
    entry: raw.entry,
    rootDir: dir,
    entryUrl: path.join(dir, raw.entry),
  };
}

function discoverPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  const plugins = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    // Skip templates / drafts (e.g. _template)
    if (ent.name.startsWith('_')) continue;
    const manifest = loadManifest(path.join(PLUGINS_DIR, ent.name));
    if (manifest) plugins.push(manifest);
  }
  return plugins.sort((a, b) => b.priority - a.priority);
}

function compileMatchers(plugin) {
  const processNames = (plugin.match.processNames || []).map((n) =>
    String(n).toLowerCase()
  );
  // Support (?i) inline flag style by converting to RegExp with i flag
  const titlePatterns = (plugin.match.titlePatterns || [])
    .map((p) => {
      try {
        const raw = String(p);
        if (raw.startsWith('(?i)')) return new RegExp(raw.slice(4), 'i');
        return new RegExp(raw);
      } catch {
        console.warn(`[plugins] bad titlePatterns in ${plugin.id}: ${p}`);
        return null;
      }
    })
    .filter(Boolean);

  return { processNames, titlePatterns };
}

function matchesApp(plugin, app) {
  const { processNames, titlePatterns } = compileMatchers(plugin);
  const pname = (app.processName || '').toLowerCase();
  const title = app.title || '';

  if (processNames.length && processNames.includes(pname)) return true;
  if (titlePatterns.some((re) => re.test(title))) return true;
  return false;
}

function resolveActivePlugin(plugins, app, defaultPluginId = 'home') {
  // Skip matching our own Electron window title churn if process is electron/duo
  const match = plugins.find(
    (p) => p.id !== defaultPluginId && matchesApp(p, app)
  );
  if (match) return match;
  return plugins.find((p) => p.id === defaultPluginId) || null;
}

module.exports = {
  PLUGINS_DIR,
  discoverPlugins,
  matchesApp,
  resolveActivePlugin,
};
