# zenbook-custom-plugins

Local Windows host for the ASUS Zenbook Duo secondary screen (ScreenPad Plus). It fills that display and swaps small HTML plugins based on the foreground app.

**Stack:** Electron + plain HTML/CSS/JS plugins (fast iteration for ScreenPad widgets).

## Quick start

```powershell
git clone https://github.com/cdennis121/zenbook-custom-plugins.git
cd zenbook-custom-plugins
npm install
npm start
```

Useful commands:

| Command | Purpose |
|--------|---------|
| `npm start` | Run on ScreenPad / fallback display |
| `npm run list-displays` | Print displays + which one would be picked |
| `npm run dev` | Start with DevTools |

Copy `config.example.json` → `config.local.json` to pin a display index (gitignored), e.g. `"display": { "forceIndex": 1 }` after `list-displays`.

## Built-in plugins

| Plugin | Match | Shows |
|--------|-------|-------|
| `home` | default | Idle / how-to |
| `cursor-helper` | `cursor.exe` | Window/workspace, git, Next/Expo/monorepo workflow, open files in Cursor |
| `chrome-companion` | `chrome.exe` | Tab title, bookmark bar, chrome:// shortcuts |
| `bambu-status` | Bambu Studio / Handy | Known printers from local Studio config (no access codes shown) |

Community plugins: see [`COMMUNITY_PLUGINS.md`](./COMMUNITY_PLUGINS.md).  
Plugin API: see [`docs/plugin-api.md`](./docs/plugin-api.md).

## Add a plugin

1. Copy `plugins/_template` → `plugins/my-plugin` (`_` folders are ignored).
2. Edit `plugin.json` (`processNames` / `titlePatterns` / `priority` / `entry`).
3. Build HTML/CSS/JS; talk to the host via `postMessage` (see plugin API docs).
4. Click **Reload** in the chrome bar or restart.

## Display targeting

1. `display.forceIndex` if set (via `config.json` or `config.local.json`)
2. Else ScreenPad heuristic (bottommost / wide-short / non-primary)
3. Else `fallbackIndex` (default `1`)

## Privacy

Plugins may read **local** app data on your machine (Cursor workspace list, Chrome bookmarks, Bambu Studio config keys). Nothing is uploaded by this host. Bambu access codes stay in Studio and are never displayed.

## License

MIT — see [LICENSE](./LICENSE).
