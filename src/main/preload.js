const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('duoHost', {
  getState: () => ipcRenderer.invoke('host:get-state'),
  getContext: () => ipcRenderer.invoke('host:get-context'),
  reloadPlugins: () => ipcRenderer.invoke('host:reload-plugins'),
  setPlugin: (id) => ipcRenderer.invoke('host:set-plugin', id),
  openExternal: (url) => ipcRenderer.invoke('host:open-external', url),
  openPath: (p) => ipcRenderer.invoke('host:open-path', p),
  openInCursor: (p) => ipcRenderer.invoke('host:open-in-cursor', p),
  revealPath: (p) => ipcRenderer.invoke('host:reveal-path', p),
  copyText: (text) => ipcRenderer.invoke('host:copy-text', text),
  openBambu: (which) => ipcRenderer.invoke('host:open-bambu', which),
  runInTerminal: (payload) => ipcRenderer.invoke('host:run-in-terminal', payload),
  retargetDisplay: () => ipcRenderer.invoke('host:retarget-display'),
  onState: (handler) => {
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('host:state', listener);
    return () => ipcRenderer.removeListener('host:state', listener);
  },
});
