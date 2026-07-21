// ╔══════════════════════════════════════════════════════════════╗
// ║           DIAGNOSE-LOGGING (iOS Standalone Debug)           ║
// ╚══════════════════════════════════════════════════════════════╝

window._PT_LOGS = [];
const _PT_MAX_LOGS = 600;

function ptLog(tag, msg, data) {
  const entry = {
    t: new Date().toISOString(),
    tag,
    msg,
    data: data !== undefined ? _ptSafeStr(data) : undefined,
    level: 'info',
  };
  window._PT_LOGS.push(entry);
  if (window._PT_LOGS.length > _PT_MAX_LOGS) window._PT_LOGS.shift();
  // Mirror to console for Safari Web Inspector
  if (data !== undefined) console.log(`[PT:${tag}]`, msg, data);
  else console.log(`[PT:${tag}]`, msg);
}

function ptLogError(tag, msg, err) {
  const entry = {
    t: new Date().toISOString(),
    tag,
    msg,
    err: err ? (err.message || String(err)).slice(0, 300) : undefined,
    level: 'error',
  };
  window._PT_LOGS.push(entry);
  if (window._PT_LOGS.length > _PT_MAX_LOGS) window._PT_LOGS.shift();
  console.error(`[PT:${tag}]`, msg, err);
}

function _ptSafeStr(v) {
  try { return JSON.stringify(v).slice(0, 300); } catch { return String(v).slice(0, 300); }
}

function showDiagnosticLogs() {
  if (!currentUser || !['moderator', 'admin'].includes(currentUser.role)) return;
  const logs  = window._PT_LOGS || [];
  const lines = logs.map(l => {
    const ts   = l.t.slice(11, 23);
    const icon = l.level === 'error' ? '!! ' : '   ';
    const err  = l.err  ? ` | ERR: ${l.err}`  : '';
    const data = l.data ? ` | ${l.data}` : '';
    return `${ts} ${icon}[${l.tag}] ${l.msg}${err}${data}`;
  }).join('\n');

  // Remove existing modal if open
  document.getElementById('_pt_diag_modal')?.remove();

  const modal = document.createElement('div');
  modal.id = '_pt_diag_modal';
  modal.style.cssText = [
    'position:fixed', 'inset:0',
    'background:rgba(0,0,0,.92)',
    'z-index:99999',
    'display:flex',
    'flex-direction:column',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'font-family:monospace',
  ].join(';');

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#111;flex-shrink:0;border-bottom:1px solid #333;';
  const title = document.createElement('span');
  title.style.cssText = 'color:#fff;font-weight:700;font-size:14px;';
  title.textContent   = `Diagnose-Log — ${logs.length} Einträge`;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1;padding:0 4px;';
  closeBtn.onclick = () => modal.remove();
  hdr.appendChild(title);
  hdr.appendChild(closeBtn);

  // Log body
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow-y:auto;padding:10px 12px;';
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#4ade80;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all;margin:0;';
  pre.textContent = lines || '(keine Einträge)';
  body.appendChild(pre);

  // Footer buttons
  const ftr = document.createElement('div');
  ftr.style.cssText = 'padding:10px 12px;background:#111;flex-shrink:0;display:flex;gap:8px;border-top:1px solid #333;';
  const copyBtn  = document.createElement('button');
  const clearBtn = document.createElement('button');
  const btnBase  = 'flex:1;background:#222;border:1px solid #444;color:#fff;padding:10px 8px;border-radius:8px;cursor:pointer;font-size:13px;';
  copyBtn.style.cssText  = btnBase;
  clearBtn.style.cssText = btnBase;
  copyBtn.textContent    = 'Kopieren';
  clearBtn.textContent   = 'Löschen';
  copyBtn.onclick  = () => {
    navigator.clipboard?.writeText(lines).then(() => { copyBtn.textContent = '✓ Kopiert'; setTimeout(() => { copyBtn.textContent = 'Kopieren'; }, 2000); });
  };
  clearBtn.onclick = () => { window._PT_LOGS = []; modal.remove(); };
  ftr.appendChild(copyBtn);
  ftr.appendChild(clearBtn);

  modal.appendChild(hdr);
  modal.appendChild(body);
  modal.appendChild(ftr);
  document.body.appendChild(modal);
  // Scroll to bottom (newest entries last in DOM order for readability)
  body.scrollTop = body.scrollHeight;
}
