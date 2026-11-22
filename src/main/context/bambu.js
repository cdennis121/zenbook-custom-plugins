const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const STUDIO_EXE = path.join(
  process.env['ProgramFiles'] || 'C:\\Program Files',
  'Bambu Studio',
  'bambu-studio.exe'
);

const HANDY_CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Bambu Suite', 'bambu-handy.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'BambuHandy', 'Bambu Handy.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'BambuHandy', 'Bambu Handy.exe'),
];

const STUDIO_APPDATA = path.join(process.env.APPDATA || '', 'BambuStudio');
const STUDIO_CONF = path.join(STUDIO_APPDATA, 'BambuStudio.conf');

function firstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function parseStudioConf() {
  if (!fs.existsSync(STUDIO_CONF)) {
    return { ok: false, reason: 'conf-missing' };
  }
  try {
    let raw = fs.readFileSync(STUDIO_CONF, 'utf8');
    // Studio appends an MD5 checksum trailer after the JSON body
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < 0) return { ok: false, reason: 'conf-not-json' };
    raw = raw.slice(start, end + 1);
    const conf = JSON.parse(raw);
    return { ok: true, conf };
  } catch (err) {
    return { ok: false, reason: err.message || 'conf-parse-failed' };
  }
}

/**
 * Extract known printers WITHOUT exposing access codes or tokens.
 */
function extractPrinters(conf) {
  const printers = [];
  const seen = new Set();

  const access = conf.access_code || {};
  for (const deviceId of Object.keys(access)) {
    if (seen.has(deviceId)) continue;
    seen.add(deviceId);
    const ams = conf.ams_filament_ids?.[deviceId];
    printers.push({
      deviceId,
      shortId: deviceId.slice(-6),
      hasAccessCode: Boolean(access[deviceId]),
      amsSlots: ams ? String(ams).split(',').filter(Boolean) : [],
      // Live MQTT/LAN status not wired in v1 (needs explicit connect design)
      liveStatus: null,
    });
  }

  // Also note model keys that look like selected machine presets
  const modelHints = [];
  for (const key of Object.keys(conf)) {
    if (/^(N2S|N1|A1|P1|X1|P1S|X1C|O1)/i.test(key) && typeof conf[key] === 'object') {
      modelHints.push(key);
    }
  }

  return { printers, modelHints };
}

function getBambuContext(foreground) {
  const handyPath = firstExisting(HANDY_CANDIDATES);
  const studioPath = fs.existsSync(STUDIO_EXE) ? STUDIO_EXE : null;
  const preferredApp = handyPath ? 'handy' : studioPath ? 'studio' : 'none';

  const parsed = parseStudioConf();
  let printers = [];
  let modelHints = [];
  let confOk = false;
  let confReason = null;

  if (parsed.ok) {
    confOk = true;
    const extracted = extractPrinters(parsed.conf);
    printers = extracted.printers;
    modelHints = extracted.modelHints;
  } else {
    confReason = parsed.reason;
  }

  return {
    app: 'bambu',
    preferredApp,
    handyInstalled: Boolean(handyPath),
    studioInstalled: Boolean(studioPath),
    handyPath,
    studioPath,
    windowTitle: foreground?.title || '',
    printers,
    modelHints,
    confOk,
    confReason,
    blockers: [
      !handyPath
        ? 'Bambu Handy is not installed on this machine; matching Bambu Studio instead.'
        : null,
      printers.length === 0
        ? 'No printer device IDs found in BambuStudio.conf yet.'
        : null,
      'Live print job status requires Bambu LAN/MQTT (or cloud) with the printer access code — not connected in v1. Access codes stay in Studio; this plugin never displays them.',
    ].filter(Boolean),
    actions: {
      canOpenStudio: Boolean(studioPath),
      canOpenHandy: Boolean(handyPath),
    },
  };
}

async function openBambuApp(which = 'auto') {
  const handyPath = firstExisting(HANDY_CANDIDATES);
  const studioPath = fs.existsSync(STUDIO_EXE) ? STUDIO_EXE : null;
  let target = null;
  if (which === 'handy') target = handyPath;
  else if (which === 'studio') target = studioPath;
  else target = handyPath || studioPath;
  if (!target) return { ok: false, reason: 'app-not-found' };
  const err = await shell.openPath(target);
  return err ? { ok: false, reason: err } : { ok: true, path: target };
}

module.exports = {
  getBambuContext,
  openBambuApp,
};
