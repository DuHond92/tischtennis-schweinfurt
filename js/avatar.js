// ╔══════════════════════════════════════════════════════════════╗
// ║  AVATAR — zentrale Logik                                     ║
// ║  Priorität: Foto → Emoji → Initialen                        ║
// ╚══════════════════════════════════════════════════════════════╝

function getInitials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

// Vollständige Avatar-Kreis-Div (inkl. Größe, Border-Radius, Hintergrund)
function getAvatarHtml(profile, { size = 40, border = 'none', extraStyle = '' } = {}) {
  const url   = profile?.avatar_url;
  const emoji = profile?.avatar_emoji;
  const name  = profile?.username || profile?.name || '';
  const s     = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;overflow:hidden;position:relative;${border !== 'none' ? `border:${border};` : ''}${extraStyle}`;

  if (url) {
    const bg   = _avatarBg(name);
    const init = getInitials(name);
    const fs   = Math.round(size * 0.34);
    return `<div style="${s};background:${bg};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#fff;">${init}<img src="${escAttr(url)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" loading="lazy"></div>`;
  }
  if (emoji && emoji.trim()) {
    const efs = Math.round(size * 0.55);
    return `<div style="${s};background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:${efs}px;">${emoji}</div>`;
  }
  const bg   = _avatarBg(name);
  const init = getInitials(name);
  const fs   = Math.round(size * 0.34);
  return `<div style="${s};background:${bg};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#fff;">${init}</div>`;
}

// Nur Inhalts-HTML für bereits gestylte Container-Divs (.comment-avatar etc.)
// Der Container braucht: overflow:hidden; position:relative;
function getAvatarContent(profile) {
  const url   = profile?.avatar_url;
  const emoji = profile?.avatar_emoji;
  const name  = profile?.username || '';
  if (url) {
    return `<img src="${escAttr(url)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'" loading="lazy">`;
  }
  if (emoji && emoji.trim()) return emoji;
  return getInitials(name);
}

function _avatarBg(name) {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#06b6d4'];
  return colors[(name || '?').charCodeAt(0) % colors.length];
}

// ── Profilseite ──────────────────────────────────────────────────

function updateProfileAvatarEl(user) {
  const el = document.getElementById('profile-avatar-el');
  if (!el) return;
  el.style.cssText = '';  // Reset inline styles
  if (user.avatar_url) {
    el.innerHTML = `<img src="${escAttr(user.avatar_url)}?v=${Date.now()}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'">`;
    el.style.overflow  = 'hidden';
    el.style.fontSize  = '0';
    el.style.padding   = '0';
  } else if (user.avatar_emoji) {
    el.textContent = user.avatar_emoji;
  } else {
    el.textContent     = getInitials(user.username);
    el.style.fontSize  = '1.4rem';
    el.style.fontWeight = '700';
  }
}

// ── Picker ───────────────────────────────────────────────────────

function openAvatarPicker() {
  if (!sb.isLoggedIn()) { openSheet('auth-sheet'); return; }
  openSheet('avatar-picker-sheet');
}

function openEmojiPicker() {
  closeAllSheets();
  setTimeout(() => openSheet('emoji-picker-sheet'), 200);
}

async function onAvatarFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';
  await uploadAvatarFile(file);
}

async function openAvatarPhotoLibrary() {
  const file = await pickImageFromPhotoLibrary('avatar-file-input');
  if (file) await uploadAvatarFile(file);
}

async function uploadAvatarFile(file) {
  if (!file) return;
  closeAllSheets();
  showToast('Bild wird hochgeladen…', '⏳');
  try {
    const blob = await _resizeImage(file, 512);
    const url  = await _uploadAvatarToStorage(blob);
    await _saveAvatarToProfile({ avatar_url: url, avatar_emoji: null });
    if (currentUser) { currentUser.avatar_url = url; currentUser.avatar_emoji = null; }
    updateProfileAvatarEl(currentUser);
    if (typeof renderProfile === 'function') renderProfile();
    if (typeof renderHome === 'function') renderHome();
    showToast('Profilbild aktualisiert!');
  } catch (e) {
    console.error('Avatar upload error:', e);
    showToast('Fehler beim Hochladen', 'error');
  }
}

async function selectAvatarEmoji(emoji) {
  try {
    await _saveAvatarToProfile({ avatar_emoji: emoji, avatar_url: null });
    if (currentUser) { currentUser.avatar_emoji = emoji; currentUser.avatar_url = null; }
    updateProfileAvatarEl(currentUser);
    if (typeof renderProfile === 'function') renderProfile();
    if (typeof renderHome === 'function') renderHome();
    closeAllSheets();
    showToast('Emoji gespeichert!');
  } catch (e) {
    showToast('Fehler beim Speichern', 'error');
  }
}

async function removeAvatar() {
  try {
    await _saveAvatarToProfile({ avatar_emoji: null, avatar_url: null });
    if (currentUser) { currentUser.avatar_emoji = null; currentUser.avatar_url = null; }
    updateProfileAvatarEl(currentUser);
    if (typeof renderProfile === 'function') renderProfile();
    if (typeof renderHome === 'function') renderHome();
    closeAllSheets();
    showToast('Profilbild entfernt');
  } catch (e) {
    showToast('Fehler beim Entfernen', 'error');
  }
}

// ── Interne Helpers ───────────────────────────────────────────────

async function _resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const side   = Math.min(img.width, img.height);
        const size   = Math.min(side, maxSize);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        // Center-crop to square
        const sx = (img.width  - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function _uploadAvatarToStorage(blob) {
  const uid   = sb.getUserId();
  const token = await sb.getValidToken();
  const path  = `${uid}/avatar.jpg`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'image/jpeg',
      'x-upsert':      'true'
    },
    body: blob
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || 'Upload fehlgeschlagen');
  }
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

async function _saveAvatarToProfile(updates) {
  const qb = new QueryBuilder('profiles');
  const { error } = await qb.eq('id', sb.getUserId()).update(updates);
  if (error) throw new Error('Profile update fehlgeschlagen');
}
