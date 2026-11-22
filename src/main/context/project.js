const fs = require('fs');
const path = require('path');

const SCRIPT_PRIORITY = [
  'dev',
  'start',
  'android',
  'ios',
  'web',
  'lint',
  'test',
  'build',
  'typecheck',
  'type-check',
];

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectDeps(pkg) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
}

function detectStacks(deps, pkg) {
  const names = Object.keys(deps);
  const has = (n) => names.includes(n);
  const stacks = [];

  if (has('next')) stacks.push('next');
  if (has('expo') || has('expo-router') || has('@expo/cli')) stacks.push('expo');
  if (has('react-native') && !stacks.includes('expo')) stacks.push('react-native');
  if (has('vite') && !stacks.includes('next')) stacks.push('vite');
  if (has('nuxt') || has('nuxt3')) stacks.push('nuxt');
  if (has('@nestjs/core')) stacks.push('nest');
  if (has('electron')) stacks.push('electron');

  // package.json "expo" key is common in Expo apps
  if (pkg.expo && !stacks.includes('expo')) stacks.push('expo');

  return stacks;
}

function pickScripts(scripts) {
  if (!scripts || typeof scripts !== 'object') return [];
  const keys = Object.keys(scripts);
  const ranked = [...keys].sort((a, b) => {
    const ia = SCRIPT_PRIORITY.indexOf(a);
    const ib = SCRIPT_PRIORITY.indexOf(b);
    const sa = ia === -1 ? 100 + a.length : ia;
    const sb = ib === -1 ? 100 + b.length : ib;
    return sa - sb;
  });
  return ranked.slice(0, 8).map((name) => ({
    name,
    command: scripts[name],
    run: `npm run ${name}`,
  }));
}

function buildShortcuts(stacks, workspacePath, scripts) {
  const shortcuts = [];
  const push = (item) => {
    if (!shortcuts.some((s) => s.id === item.id)) shortcuts.push(item);
  };

  if (stacks.includes('next')) {
    push({
      id: 'next-dev',
      label: 'Next dev',
      kind: 'run',
      run: 'npm run dev',
      hint: 'npm run dev',
    });
    push({
      id: 'next-local',
      label: 'localhost:3000',
      kind: 'url',
      url: 'http://localhost:3000',
    });
    push({
      id: 'next-docs',
      label: 'Next docs',
      kind: 'url',
      url: 'https://nextjs.org/docs',
    });
  }

  if (stacks.includes('expo')) {
    const startScript = scripts.find((s) => s.name === 'start');
    push({
      id: 'expo-start',
      label: 'Expo start',
      kind: 'run',
      run: startScript ? 'npm start' : 'npx expo start',
      hint: startScript ? 'npm start' : 'npx expo start',
    });
    push({
      id: 'expo-android',
      label: 'Expo Android',
      kind: 'run',
      run: scripts.some((s) => s.name === 'android')
        ? 'npm run android'
        : 'npx expo start --android',
    });
    push({
      id: 'expo-web',
      label: 'Expo web',
      kind: 'run',
      run: scripts.some((s) => s.name === 'web')
        ? 'npm run web'
        : 'npx expo start --web',
    });
    push({
      id: 'expo-docs',
      label: 'Expo docs',
      kind: 'url',
      url: 'https://docs.expo.dev/',
    });
  }

  if (stacks.includes('vite') && !stacks.includes('next')) {
    push({
      id: 'vite-dev',
      label: 'Vite dev',
      kind: 'run',
      run: scripts.some((s) => s.name === 'dev') ? 'npm run dev' : 'npx vite',
    });
    push({
      id: 'vite-local',
      label: 'localhost:5173',
      kind: 'url',
      url: 'http://localhost:5173',
    });
  }

  // Always useful when a workspace is known
  if (workspacePath) {
    push({
      id: 'term',
      label: 'Terminal here',
      kind: 'run',
      run: '',
      cwdOnly: true,
    });
    const pkg = path.join(workspacePath, 'package.json');
    if (fs.existsSync(pkg)) {
      push({
        id: 'pkg',
        label: 'package.json',
        kind: 'path',
        path: pkg,
      });
    }
    for (const name of ['README.md', 'AGENTS.md', 'AGENTS.template.md']) {
      const p = path.join(workspacePath, name);
      if (fs.existsSync(p)) {
        push({
          id: `doc-${name}`,
          label: name,
          kind: 'path',
          path: p,
        });
      }
    }
  }

  return shortcuts;
}

function listTopFiles(workspacePath, limit = 8) {
  if (!workspacePath || !fs.existsSync(workspacePath)) return [];
  try {
    return fs
      .readdirSync(workspacePath, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const full = path.join(workspacePath, d.name);
        return { name: d.name, path: full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function readWorkspaceGlobs(workspacePath) {
  const globs = [];
  const yaml = path.join(workspacePath, 'pnpm-workspace.yaml');
  if (fs.existsSync(yaml)) {
    const text = fs.readFileSync(yaml, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*['"]?([^'"#]+)['"]?/);
      if (m) globs.push(m[1].trim());
    }
  }
  const pkg = readJsonSafe(path.join(workspacePath, 'package.json'));
  if (Array.isArray(pkg?.workspaces)) {
    for (const g of pkg.workspaces) globs.push(String(g));
  } else if (Array.isArray(pkg?.workspaces?.packages)) {
    for (const g of pkg.workspaces.packages) globs.push(String(g));
  }
  // Common defaults for turbo repos
  if (!globs.length) {
    for (const g of ['apps/*', 'packages/*']) {
      if (fs.existsSync(path.join(workspacePath, g.split('/')[0]))) globs.push(g);
    }
  }
  return [...new Set(globs)];
}

function expandWorkspacePackages(workspacePath) {
  const results = [];
  for (const glob of readWorkspaceGlobs(workspacePath)) {
    // Only support simple patterns like apps/* or packages/*
    const m = glob.match(/^([^/*]+)\/\*$/);
    if (!m) continue;
    const dir = path.join(workspacePath, m[1]);
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const pkgPath = path.join(dir, ent.name, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = readJsonSafe(pkgPath);
      if (!pkg) continue;
      const deps = collectDeps(pkg);
      const stacks = detectStacks(deps, pkg);
      const scripts = pickScripts(pkg.scripts || {});
      results.push({
        name: pkg.name || ent.name,
        folder: ent.name,
        relativeDir: path.join(m[1], ent.name),
        path: path.join(dir, ent.name),
        stacks,
        scripts,
        packageManager: fs.existsSync(path.join(workspacePath, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : 'npm',
      });
    }
  }
  return results;
}

function buildMonorepoShortcuts(workspacePackages) {
  const shortcuts = [];
  const push = (item) => {
    if (!shortcuts.some((s) => s.id === item.id)) shortcuts.push(item);
  };

  for (const wp of workspacePackages) {
    const pm = wp.packageManager === 'pnpm' ? 'pnpm' : 'npm';
    const filter = wp.name;
    if (wp.stacks.includes('next')) {
      push({
        id: `next-${wp.folder}`,
        label: `${wp.folder} Next dev`,
        kind: 'run',
        run:
          pm === 'pnpm'
            ? `pnpm --filter ${filter} dev`
            : `npm run dev --workspace=${filter}`,
        hint: `${wp.relativeDir} (next)`,
      });
      push({
        id: `next-local-${wp.folder}`,
        label: `${wp.folder} :3000`,
        kind: 'url',
        url: 'http://localhost:3000',
      });
    }
    if (wp.stacks.includes('expo')) {
      push({
        id: `expo-${wp.folder}`,
        label: `${wp.folder} Expo`,
        kind: 'run',
        run:
          pm === 'pnpm'
            ? `pnpm --filter ${filter} start`
            : `npm run start --workspace=${filter}`,
        hint: `${wp.relativeDir} (expo)`,
      });
      if (wp.scripts.some((s) => s.name === 'android')) {
        push({
          id: `expo-android-${wp.folder}`,
          label: `${wp.folder} Android`,
          kind: 'run',
          run:
            pm === 'pnpm'
              ? `pnpm --filter ${filter} android`
              : `npm run android --workspace=${filter}`,
        });
      }
    }
    if (wp.stacks.includes('vite') && !wp.stacks.includes('next') && /api|web|admin/i.test(wp.folder)) {
      const hasDev = wp.scripts.some((s) => s.name === 'dev');
      if (hasDev) {
        push({
          id: `vite-${wp.folder}`,
          label: `${wp.folder} dev`,
          kind: 'run',
          run:
            pm === 'pnpm'
              ? `pnpm --filter ${filter} dev`
              : `npm run dev --workspace=${filter}`,
        });
      }
    }
  }
  return shortcuts;
}

function inspectDocsProject(workspacePath) {
  const files = listTopFiles(workspacePath, 10);
  const shortcuts = buildShortcuts([], workspacePath, []);
  return {
    available: false,
    stacks: files.some((f) => /\.md$/i.test(f.name)) ? ['docs'] : [],
    packageName: path.basename(workspacePath),
    scripts: [],
    shortcuts,
    packageJson: null,
    files,
  };
}

function inspectProject(workspacePath) {
  if (!workspacePath || !fs.existsSync(workspacePath)) {
    return {
      available: false,
      stacks: [],
      packageName: null,
      scripts: [],
      shortcuts: [],
      packageJson: null,
      files: [],
    };
  }

  const pkgPath = path.join(workspacePath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return inspectDocsProject(workspacePath);
  }

  const pkg = readJsonSafe(pkgPath);
  if (!pkg) {
    return {
      available: false,
      stacks: [],
      packageName: null,
      scripts: [],
      shortcuts: [],
      packageJson: pkgPath,
      files: listTopFiles(workspacePath, 8),
    };
  }

  const deps = collectDeps(pkg);
  const stacks = detectStacks(deps, pkg);
  const scripts = pickScripts(pkg.scripts || {});
  let shortcuts = buildShortcuts(stacks, workspacePath, scripts);
  const workspacePackages = expandWorkspacePackages(workspacePath);
  const childStacks = [
    ...new Set(workspacePackages.flatMap((p) => p.stacks)),
  ];
  const mergedStacks = [...new Set([...stacks, ...childStacks])];
  if (workspacePackages.length) {
    shortcuts = [
      ...buildMonorepoShortcuts(workspacePackages),
      ...shortcuts.filter((s) => !/^next-|^expo-|^vite-/i.test(s.id) || s.id === 'term' || s.id.startsWith('doc-') || s.id === 'pkg'),
    ];
    // Dedupe by id
    const seen = new Set();
    shortcuts = shortcuts.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }

  return {
    available: true,
    stacks: mergedStacks,
    packageName: pkg.name || path.basename(workspacePath),
    scripts,
    shortcuts,
    packageJson: pkgPath,
    files: listTopFiles(workspacePath, 8),
    workspacePackages: workspacePackages.map((p) => ({
      name: p.name,
      folder: p.folder,
      stacks: p.stacks,
      relativeDir: p.relativeDir,
    })),
    monorepo: workspacePackages.length > 0,
  };
}

module.exports = {
  inspectProject,
};
