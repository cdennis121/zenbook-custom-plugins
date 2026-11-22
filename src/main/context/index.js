const { getCursorContext } = require('./cursor');
const { getChromeContext } = require('./chrome');
const { getBambuContext } = require('./bambu');

function getContextForApp(foreground, activePluginId) {
  const proc = (foreground?.processName || '').toLowerCase();

  if (
    activePluginId === 'cursor-helper' ||
    proc === 'cursor.exe'
  ) {
    return getCursorContext(foreground);
  }

  if (
    activePluginId === 'chrome-companion' ||
    proc === 'chrome.exe' ||
    proc === 'msedge.exe'
  ) {
    return getChromeContext(foreground);
  }

  if (
    activePluginId === 'bambu-status' ||
    proc.includes('bambu') ||
    proc.includes('handy')
  ) {
    return getBambuContext(foreground);
  }

  return {
    app: 'none',
    foreground,
  };
}

module.exports = {
  getContextForApp,
  getCursorContext,
  getChromeContext,
  getBambuContext,
};
