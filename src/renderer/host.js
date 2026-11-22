const frame = document.getElementById('pluginFrame');
const empty = document.getElementById('empty');
const pluginName = document.getElementById('pluginName');
const fgLabel = document.getElementById('fgLabel');
const btnReload = document.getElementById('btnReload');
const btnRetarget = document.getElementById('btnRetarget');

let currentEntry = null;

function formatFg(fg) {
  if (!fg) return '—';
  const proc = fg.processName || '?';
  const title = fg.title ? ` — ${fg.title}` : '';
  return `${proc}${title}`;
}

function applyState(state) {
  if (!state) return;

  fgLabel.textContent = formatFg(state.foreground);
  fgLabel.title = formatFg(state.foreground);

  const active = state.activePlugin;
  pluginName.textContent = active?.name || 'Home';

  if (active?.entryUrl) {
    empty.classList.add('hidden');
    if (currentEntry !== active.entryUrl) {
      currentEntry = active.entryUrl;
      frame.src = active.entryUrl;
    } else if (frame.contentWindow) {
      // Push live state into the already-loaded plugin
      frame.contentWindow.postMessage({ type: 'duo:state', state }, '*');
    }
  } else {
    currentEntry = null;
    frame.removeAttribute('src');
    empty.classList.remove('hidden');
  }
}

window.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  const reply = (payload) => event.source?.postMessage(payload, '*');

  switch (data.type) {
    case 'duo:getState': {
      const state = await window.duoHost.getState();
      reply({ type: 'duo:state', state });
      break;
    }
    case 'duo:getContext': {
      const context = await window.duoHost.getContext();
      reply({ type: 'duo:context', context });
      break;
    }
    case 'duo:openExternal':
      if (data.url) await window.duoHost.openExternal(data.url);
      break;
    case 'duo:openPath':
      if (data.path) await window.duoHost.openPath(data.path);
      break;
    case 'duo:openInCursor':
      if (data.path) await window.duoHost.openInCursor(data.path);
      break;
    case 'duo:revealPath':
      if (data.path) await window.duoHost.revealPath(data.path);
      break;
    case 'duo:copyText':
      if (typeof data.text === 'string') await window.duoHost.copyText(data.text);
      break;
    case 'duo:openBambu':
      await window.duoHost.openBambu(data.which || 'auto');
      break;
    case 'duo:runInTerminal':
      await window.duoHost.runInTerminal({
        cwd: data.cwd,
        command: data.command || '',
        cwdOnly: Boolean(data.cwdOnly),
      });
      break;
    case 'duo:setPlugin':
      if (data.id) await window.duoHost.setPlugin(data.id);
      break;
    default:
      break;
  }
});

btnReload.addEventListener('click', async () => {
  await window.duoHost.reloadPlugins();
});

btnRetarget.addEventListener('click', async () => {
  await window.duoHost.retargetDisplay();
});

window.duoHost.onState(applyState);
window.duoHost.getState().then(applyState);
