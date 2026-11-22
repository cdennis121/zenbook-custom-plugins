function requestState() {
  window.parent.postMessage({ type: 'duo:getState' }, '*');
}

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'duo:state') return;
  const fg = data.state?.foreground;
  const el = document.getElementById('fg');
  if (!fg) {
    el.textContent = 'No foreground app detected.';
    return;
  }
  el.textContent = `Foreground: ${fg.processName || '?'}${fg.title ? ` — ${fg.title}` : ''}`;
});

requestState();
setInterval(requestState, 1000);
