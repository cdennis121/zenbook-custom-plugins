/**
 * Generic smoke test — no personal project paths.
 * Usage: npx electron scripts/smoke-host.js
 */
const { app } = require('electron');

app.whenReady().then(() => {
  try {
    const { pickTargetDisplay, summarizeDisplays, loadConfig } = require('../src/main/display');
    const { discoverPlugins } = require('../src/main/plugins');
    const { getForegroundApp } = require('../src/main/foreground');
    const { getCursorContext } = require('../src/main/context/cursor');
    const { inspectProject } = require('../src/main/context/project');
    const path = require('path');

    const config = loadConfig();
    const pick = pickTargetDisplay(config);
    const plugins = discoverPlugins().map((p) => p.id);
    const fg = getForegroundApp();

    // Inspect this repo as a sample workspace (generic)
    const sample = path.join(__dirname, '..');
    const project = inspectProject(sample);

    console.log(
      JSON.stringify(
        {
          plugins,
          displays: summarizeDisplays().map((d) => ({
            index: d.index,
            primary: d.primary,
            bounds: d.bounds,
          })),
          picked: {
            bounds: pick.display.bounds,
            reason: pick.reason,
          },
          foreground: {
            processName: fg.processName,
            title: fg.title,
          },
          sampleProject: {
            path: sample,
            stacks: project.stacks,
            scriptNames: project.scripts.map((s) => s.name),
            shortcutLabels: project.shortcuts.map((s) => s.label),
          },
          cursorTitleParse: getCursorContext({
            processName: 'cursor.exe',
            title: 'index.js - zenbook-custom-plugins - Cursor',
          }).title,
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
