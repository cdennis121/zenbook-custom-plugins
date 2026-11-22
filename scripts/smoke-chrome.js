/**
 * Chrome companion smoke — no personal project paths beyond Chrome profile APIs.
 */
const { app } = require('electron');

app.whenReady().then(() => {
  try {
    const { getForegroundApp } = require('../src/main/foreground');
    const { discoverPlugins, resolveActivePlugin } = require('../src/main/plugins');
    const { loadConfig } = require('../src/main/display');
    const { getChromeContext } = require('../src/main/context/chrome');

    const config = loadConfig();
    const plugins = discoverPlugins();
    const fg = getForegroundApp();
    const active = resolveActivePlugin(plugins, fg, config.defaultPluginId || 'home');
    const ctx = getChromeContext(fg);

    console.log(
      JSON.stringify(
        {
          foreground: { processName: fg.processName, title: fg.title },
          activePluginId: active?.id || null,
          tabTitle: ctx.title?.tabTitle,
          bookmarksAvailable: ctx.bookmarks?.available,
          bookmarkCount: ctx.bookmarks?.items?.length || 0,
          bookmarkSample: (ctx.bookmarks?.items || []).slice(0, 5).map((i) => ({
            name: i.name,
            host: (() => {
              try {
                return new URL(i.url).host;
              } catch {
                return null;
              }
            })(),
          })),
          quickLinks: ctx.quickLinks?.map((q) => q.name),
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
