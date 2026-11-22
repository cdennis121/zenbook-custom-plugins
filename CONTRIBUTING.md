# Contributing

## Host changes

1. Fork / clone this repo.
2. `npm install` && `npm start`.
3. Prefer small PRs; keep secrets and machine-specific paths out of commits (`config.local.json` is gitignored).

## New official plugin

1. Copy `plugins/_template` → `plugins/<id>/`.
2. Implement UI + `plugin.json` match rules.
3. Document behavior in the README table.
4. Open a PR.

## Community catalog only

If your plugin lives in another repo, add a row to [`COMMUNITY_PLUGINS.md`](./COMMUNITY_PLUGINS.md).

## Code of conduct

Be respectful. No malware, credential stealers, or plugins that exfiltrate local data without clear user consent and documentation.
