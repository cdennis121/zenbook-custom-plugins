function duo(msg) {
  window.parent.postMessage(msg, '*');
}

const tabTitle = document.getElementById('tabTitle');
const quickLinks = document.getElementById('quickLinks');
const bookmarkRow = document.getElementById('bookmarkRow');
const bmNote = document.getElementById('bmNote');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeButton(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.innerHTML = `<span class="label">${escapeHtml(label)}</span>`;
  btn.title = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function render(state) {
  const ctx = state?.context;
  if (!ctx || ctx.app !== 'chrome') {
    tabTitle.textContent = 'Waiting for Chrome…';
    return;
  }

  tabTitle.textContent = ctx.title?.tabTitle || 'Chrome';
  tabTitle.title = ctx.title?.rawTitle || '';

  quickLinks.innerHTML = '';
  for (const link of ctx.quickLinks || []) {
    quickLinks.appendChild(
      makeButton(link.name, () => duo({ type: 'duo:openExternal', url: link.url }))
    );
  }
  quickLinks.appendChild(
    makeButton('Copy tab title', () =>
      duo({ type: 'duo:copyText', text: ctx.title?.tabTitle || '' })
    )
  );

  bookmarkRow.innerHTML = '';
  const bm = ctx.bookmarks;
  if (!bm?.available) {
    bmNote.textContent = `Bookmarks unavailable: ${bm?.reason || 'unknown'}`;
    return;
  }
  if (!bm.items?.length) {
    bmNote.textContent = 'Bookmark bar is empty.';
    return;
  }
  bmNote.textContent = `${bm.items.length} from Chrome bookmark bar (local profile).`;
  for (const item of bm.items) {
    bookmarkRow.appendChild(
      makeButton(item.name, () => duo({ type: 'duo:openExternal', url: item.url }))
    );
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.type === 'duo:state') render(event.data.state);
});

duo({ type: 'duo:getState' });
setInterval(() => duo({ type: 'duo:getState' }), 2000);
