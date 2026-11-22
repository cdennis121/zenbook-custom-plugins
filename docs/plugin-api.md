# Plugin API

Plugins are folders under `plugins/` with a `plugin.json` manifest and an HTML entry.

Folders starting with `_` are ignored (templates/drafts).

## Manifest (`plugin.json`)

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What it does",
  "priority": 5,
  "match": {
    "processNames": ["app.exe"],
    "titlePatterns": ["(?i).*app.*"]
  },
  "entry": "index.html"
}
```

| Field | Notes |
|-------|--------|
| `id` | Unique; used by `duo:setPlugin` |
| `priority` | Higher wins when multiple match |
| `match.processNames` | Lowercased basename compare (e.g. `cursor.exe`) |
| `match.titlePatterns` | JS regex; prefix `(?i)` for case-insensitive |
| `entry` | HTML file relative to the plugin folder |

Empty `match` (or only the default plugin id) is used for the home/fallback plugin.

## Host bridge (`postMessage`)

Plugins run in a sandboxed iframe. Talk to the host:

```js
// Request full state (includes context for the active app)
window.parent.postMessage({ type: 'duo:getState' }, '*');

window.addEventListener('message', (e) => {
  if (e.data?.type === 'duo:state') {
    console.log(e.data.state.activePluginId, e.data.state.context);
  }
});

window.parent.postMessage({ type: 'duo:openExternal', url: 'https://example.com' }, '*');
window.parent.postMessage({ type: 'duo:openPath', path: 'C:\\path\\to\\folder' }, '*');
window.parent.postMessage({ type: 'duo:openInCursor', path: 'C:\\path\\to\\file.ts' }, '*');
window.parent.postMessage({ type: 'duo:revealPath', path: 'C:\\path\\to\\file' }, '*');
window.parent.postMessage({ type: 'duo:copyText', text: 'hello' }, '*');
window.parent.postMessage({ type: 'duo:runInTerminal', cwd: 'C:\\project', command: 'npm run dev' }, '*');
window.parent.postMessage({ type: 'duo:openBambu', which: 'studio' }, '*');
window.parent.postMessage({ type: 'duo:setPlugin', id: 'home' }, '*');
```

### `state.context`

Filled by the host for known apps:

- **cursor** — workspace path, git, project stacks/scripts/shortcuts, recent folders  
- **chrome** — tab title, bookmark bar items  
- **bambu** — installed apps, printer short ids (not access codes)

Terminal `run` commands are allowlisted to shortcuts/scripts advertised in Cursor context.

## Security notes

- Prefer `openInCursor` / allowlisted terminal commands over arbitrary shell.  
- Never write secrets into plugin source or commit local config that contains tokens.  
- Bambu plugin must not render `access_code` values from Studio config.
