const fs = require('fs');
const path = require('path');

const BOOKMARKS_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'Google',
  'Chrome',
  'User Data',
  'Default',
  'Bookmarks'
);

function parseChromeTitle(title) {
  const raw = String(title || '').trim();
  // "Page Title - Google Chrome" or "Page Title - Chromium" or "... - Chrome"
  const cleaned = raw
    .replace(/\s-\sGoogle Chrome$/i, '')
    .replace(/\s-\sChrome$/i, '')
    .replace(/\s-\sChromium$/i, '')
    .trim();
  return {
    tabTitle: cleaned || raw || null,
    rawTitle: raw,
  };
}

function flattenBookmarks(node, out, limit, depth = 0) {
  if (!node || out.length >= limit || depth > 4) return;
  if (node.type === 'url' && node.url) {
    out.push({
      name: node.name || node.url,
      url: node.url,
    });
    return;
  }
  const children = node.children || [];
  for (const child of children) {
    if (out.length >= limit) break;
    flattenBookmarks(child, out, limit, depth + 1);
  }
}

function readBookmarkBar(limit = 16) {
  if (!fs.existsSync(BOOKMARKS_PATH)) {
    return { available: false, reason: 'bookmarks-file-missing', items: [] };
  }
  try {
    // Chrome may hold a lock; reading is usually fine while Chrome is open
    const data = JSON.parse(fs.readFileSync(BOOKMARKS_PATH, 'utf8'));
    const bar = data?.roots?.bookmark_bar;
    const items = [];
    flattenBookmarks(bar, items, limit);
    return {
      available: true,
      items,
      source: BOOKMARKS_PATH,
    };
  } catch (err) {
    return { available: false, reason: err.message || 'read-failed', items: [] };
  }
}

function getChromeContext(foreground) {
  const title = parseChromeTitle(foreground?.title || '');
  const bookmarks = readBookmarkBar(16);
  return {
    app: 'chrome',
    title,
    bookmarks,
    quickLinks: [
      { name: 'New Tab', url: 'chrome://newtab/' },
      { name: 'Downloads', url: 'chrome://downloads/' },
      { name: 'History', url: 'chrome://history/' },
      { name: 'Bookmarks', url: 'chrome://bookmarks/' },
    ],
  };
}

module.exports = {
  getChromeContext,
  parseChromeTitle,
};
