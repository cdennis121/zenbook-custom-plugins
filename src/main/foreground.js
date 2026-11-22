/**
 * Windows foreground-window watcher via koffi + Win32 APIs.
 * Polls GetForegroundWindow and resolves process name + window title.
 */
const koffi = require('koffi');
const path = require('path');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const psapi = koffi.load('psapi.dll');

const GetForegroundWindow = user32.func('GetForegroundWindow', 'void *', []);
const GetWindowTextW = user32.func('GetWindowTextW', 'int', ['void *', 'void *', 'int']);
const GetWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['void *']);
const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', [
  'void *',
  'uint32 *',
]);

const OpenProcess = kernel32.func('OpenProcess', 'void *', ['uint32', 'int', 'uint32']);
const CloseHandle = kernel32.func('CloseHandle', 'int', ['void *']);
const QueryFullProcessImageNameW = kernel32.func('QueryFullProcessImageNameW', 'int', [
  'void *',
  'uint32',
  'void *',
  'uint32 *',
]);

// Fallback if QueryFullProcessImageNameW unavailable on very old Windows
let GetModuleFileNameExW;
try {
  GetModuleFileNameExW = psapi.func('GetModuleFileNameExW', 'uint32', [
    'void *',
    'void *',
    'void *',
    'uint32',
  ]);
} catch {
  GetModuleFileNameExW = null;
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_READ = 0x0010;

function readWideString(ptr, maxChars) {
  if (!ptr) return '';
  // koffi decode: read UTF-16LE from buffer
  const buf = koffi.decode(ptr, 'char16', maxChars);
  if (typeof buf === 'string') return buf.replace(/\0+$/, '');
  return String(buf || '').replace(/\0+$/, '');
}

function getWindowTitle(hwnd) {
  if (!hwnd) return '';
  const len = GetWindowTextLengthW(hwnd);
  if (len <= 0) return '';
  const buf = Buffer.alloc((len + 1) * 2);
  GetWindowTextW(hwnd, buf, len + 1);
  return buf.toString('utf16le').replace(/\0+$/, '');
}

function getProcessPath(pid) {
  if (!pid) return '';
  let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (ptrAddress(handle) === 0) {
    handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
  }
  if (ptrAddress(handle) === 0) return '';

  try {
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeUInt32LE(520, 0);
    const nameBuf = Buffer.alloc(520 * 2);
    const ok = QueryFullProcessImageNameW(handle, 0, nameBuf, sizeBuf);
    if (ok) {
      return nameBuf.toString('utf16le').replace(/\0+$/, '');
    }
    if (GetModuleFileNameExW) {
      const n = GetModuleFileNameExW(handle, null, nameBuf, 520);
      if (n > 0) return nameBuf.toString('utf16le').replace(/\0+$/, '');
    }
    return '';
  } finally {
    CloseHandle(handle);
  }
}

function ptrAddress(ptr) {
  if (!ptr) return 0;
  try {
    // koffi External/pointer objects are not String()-able
    return Number(koffi.address(ptr)) || 0;
  } catch {
    return 0;
  }
}

function getForegroundApp() {
  const hwnd = GetForegroundWindow();
  if (!hwnd || ptrAddress(hwnd) === 0) {
    return { processName: '', title: '', pid: 0, exePath: '', hwnd: 0 };
  }

  const pidPtr = Buffer.alloc(4);
  GetWindowThreadProcessId(hwnd, pidPtr);
  const pid = pidPtr.readUInt32LE(0);
  const title = getWindowTitle(hwnd);
  const exePath = getProcessPath(pid);
  const processName = exePath
    ? path.basename(exePath).toLowerCase()
    : '';

  return { processName, title, pid, exePath, hwnd: ptrAddress(hwnd) };
}

function createForegroundWatcher({ intervalMs = 500, onChange }) {
  let lastKey = '';
  let timer = null;

  const tick = () => {
    try {
      const app = getForegroundApp();
      const key = `${app.pid}|${app.processName}|${app.title}`;
      if (key !== lastKey) {
        lastKey = key;
        onChange?.(app);
      }
    } catch (err) {
      console.error('[foreground] poll error', err);
    }
  };

  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    peek: getForegroundApp,
  };
}

module.exports = {
  getForegroundApp,
  createForegroundWatcher,
};
