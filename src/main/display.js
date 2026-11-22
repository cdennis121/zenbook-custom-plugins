const { screen } = require('electron');
const fs = require('fs');
const path = require('path');

function deepMerge(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function loadConfig() {
  const root = path.join(__dirname, '..', '..');
  const configPath = path.join(root, 'config.json');
  const localPath = path.join(root, 'config.local.json');
  let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (fs.existsSync(localPath)) {
    try {
      config = deepMerge(config, JSON.parse(fs.readFileSync(localPath, 'utf8')));
    } catch (err) {
      console.warn('[config] failed to read config.local.json', err.message || err);
    }
  }
  return config;
}

/**
 * Rank displays for ScreenPad-like targeting.
 * Zenbook Duo ScreenPad is typically the bottommost, often wide/short display.
 */
function scoreDisplay(display, all, hints) {
  let score = 0;
  const { width, height, y } = display.bounds;
  const aspect = width / Math.max(height, 1);

  if (hints.preferBottommost) {
    const maxY = Math.max(...all.map((d) => d.bounds.y));
    if (y === maxY && all.length > 1) score += 50;
    // Prefer lower center-y among displays
    score += Math.round(y / 10);
  }

  if (aspect >= (hints.minAspectRatio || 2.0)) {
    score += 30;
  }

  // Slight preference for non-primary (ScreenPad is usually not primary)
  if (!display.primary) score += 10;

  // Prefer shorter height (ScreenPad is short)
  if (height < 800) score += 15;
  if (height < 500) score += 10;

  return score;
}

function pickTargetDisplay(config = loadConfig()) {
  const displays = screen.getAllDisplays();
  const cfg = config.display || {};

  if (cfg.forceIndex != null && displays[cfg.forceIndex]) {
    return { display: displays[cfg.forceIndex], reason: `forceIndex=${cfg.forceIndex}` };
  }

  if (displays.length === 1) {
    return { display: displays[0], reason: 'only-display' };
  }

  if (cfg.preferScreenPad !== false) {
    const hints = cfg.matchHints || {};
    const ranked = [...displays]
      .map((d) => ({ display: d, score: scoreDisplay(d, displays, hints) }))
      .sort((a, b) => b.score - a.score);

    if (ranked[0] && ranked[0].score > 0) {
      return {
        display: ranked[0].display,
        reason: `screenpad-heuristic score=${ranked[0].score}`,
      };
    }
  }

  const idx = cfg.fallbackIndex ?? 1;
  const display = displays[idx] || displays[displays.length - 1];
  return { display, reason: `fallbackIndex=${idx}` };
}

function summarizeDisplays() {
  return screen.getAllDisplays().map((d, i) => ({
    index: i,
    id: d.id,
    primary: d.primary,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    size: d.size,
  }));
}

module.exports = {
  loadConfig,
  pickTargetDisplay,
  summarizeDisplays,
};
