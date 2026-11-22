function duo(msg) {
  window.parent.postMessage(msg, '*');
}

const els = {
  appEyebrow: document.getElementById('appEyebrow'),
  headline: document.getElementById('headline'),
  sub: document.getElementById('sub'),
  printerList: document.getElementById('printerList'),
  blockerText: document.getElementById('blockerText'),
  btnOpen: document.getElementById('btnOpen'),
  btnStudio: document.getElementById('btnStudio'),
};

function render(state) {
  const ctx = state?.context;
  if (!ctx || ctx.app !== 'bambu') {
    els.headline.textContent = 'Bambu';
    els.sub.textContent = 'Waiting for Bambu Studio / Handy…';
    return;
  }

  const mode = ctx.handyInstalled
    ? 'Handy + Studio'
    : ctx.studioInstalled
      ? 'Studio (Handy not installed)'
      : 'No Bambu app found';

  els.appEyebrow.textContent = ctx.preferredApp === 'handy' ? 'Bambu Handy' : 'Bambu Studio';
  els.headline.textContent =
    ctx.printers?.length === 1
      ? '1 known printer'
      : `${ctx.printers?.length || 0} known printers`;

  const models = (ctx.modelHints || []).slice(0, 4).join(', ');
  els.sub.textContent = [
    mode,
    models ? `Presets seen: ${models}` : null,
    ctx.windowTitle ? `Window: ${ctx.windowTitle}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  els.btnOpen.disabled = !ctx.actions?.canOpenHandy && !ctx.actions?.canOpenStudio;
  els.btnStudio.disabled = !ctx.actions?.canOpenStudio;

  els.printerList.innerHTML = '';
  if (!ctx.printers?.length) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML =
      '<div class="id">No devices yet</div><div class="meta">Bind a printer in Bambu Studio to populate local config.</div>';
    els.printerList.appendChild(empty);
  } else {
    for (const p of ctx.printers) {
      const card = document.createElement('div');
      card.className = 'card';
      const ams =
        p.amsSlots?.length > 0
          ? `AMS slots: ${p.amsSlots.length}`
          : 'No AMS ids cached';
      card.innerHTML = `
        <div class="id">…${escapeHtml(p.shortId || p.deviceId)}</div>
        <div class="meta">${p.hasAccessCode ? 'Access code on file in Studio' : 'No access code'} · ${escapeHtml(ams)}</div>
      `;
      els.printerList.appendChild(card);
    }
  }

  if (ctx.blockers?.length) {
    els.blockerText.textContent = ctx.blockers.join(' ');
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

els.btnOpen.addEventListener('click', () => duo({ type: 'duo:openBambu', which: 'auto' }));
els.btnStudio.addEventListener('click', () => duo({ type: 'duo:openBambu', which: 'studio' }));

document.querySelectorAll('button[data-url]').forEach((btn) => {
  btn.addEventListener('click', () => {
    duo({ type: 'duo:openExternal', url: btn.dataset.url });
  });
});

window.addEventListener('message', (event) => {
  if (event.data?.type === 'duo:state') render(event.data.state);
});

duo({ type: 'duo:getState' });
setInterval(() => duo({ type: 'duo:getState' }), 3000);
