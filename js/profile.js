// ╔══════════════════════════════════════════════════════════════╗
// ║           PROFIL                                             ║
// ╚══════════════════════════════════════════════════════════════╝
function renderProfile() {
  const guestView  = document.getElementById('profile-guest-view');
  const loggedView = document.getElementById('profile-logged-view');
  if (!currentUser) {
    if (guestView)  guestView.style.display  = '';
    if (loggedView) loggedView.style.display = 'none';
    return;
  }
  if (guestView)  guestView.style.display  = 'none';
  if (loggedView) loggedView.style.display = '';
  _renderSetupHint(currentUser);

  // Benachrichtigungen-Toggle: Zustand aus localStorage wiederherstellen
  const notifToggle = document.getElementById('notif-toggle');
  if (notifToggle) notifToggle.checked = localStorage.getItem('tt_notifs_enabled') !== '0';

  // Avatar & Name
  updateProfileAvatarEl(currentUser);
  document.querySelector('.profile-name').textContent = currentUser.username || 'Spieler';

  // Sub-Zeile: Wohnort + Mitglied seit
  const subEl = document.getElementById('profile-sub-line');
  if (subEl) {
    const subParts = [];
    if (currentUser.city) subParts.push(currentUser.city);
    if (currentUser.created_at) {
      const since = new Date(currentUser.created_at).toLocaleDateString('de-DE', {month:'long', year:'numeric'});
      subParts.push('Mitglied seit ' + since);
    }
    subEl.textContent = subParts.join(' · ');
  }

  // Mini-Account-Sheet + Rank-Karte aktualisieren
  const psNameEl = document.getElementById('ps-name-el');
  if (psNameEl) psNameEl.textContent = currentUser.username || 'Spieler';
  const psAvEl = document.getElementById('ps-avatar-el');
  if (psAvEl) psAvEl.textContent = currentUser.avatar_emoji || '😎';
  // Skill level
  const skill = currentUser.skill_level || null;
  document.querySelectorAll('.skill-opt').forEach((el, i) => {
    el.classList.toggle('active', ['anfaenger','fortgeschritten','profi'][i] === skill);
  });

  // Spielpartner
  if (typeof renderSpielpartnerSection === 'function') renderSpielpartnerSection();
  // Meine Spiele
  renderMyEventsSection();
  // Meine Einträge (Plattenvorschläge)
  if (typeof renderMySuggestionsSection === 'function') renderMySuggestionsSection();

  // Sign-out button
  const signOutBtn = document.querySelector('#profile-signout-btn');
  if (signOutBtn) signOutBtn.onclick = confirmSignOut;

  // Moderation link
  const adminItem = document.getElementById('admin-nav-item');
  const canModerate = ['moderator', 'admin'].includes(currentUser.role);
  if (adminItem) {
    adminItem.style.display = canModerate ? '' : 'none';
  }
  const diagnosticItem = document.getElementById('diagnostic-log-nav-item');
  if (diagnosticItem) diagnosticItem.style.display = canModerate ? '' : 'none';
}

function _isProfileComplete(u) {
  return getProfileCompletion(u).isComplete;
}

function getProfileCompletion(u) {
  const profile = u || {};
  const items = [
    { key: 'avatar', label: 'Profilbild oder Avatar hinzufügen', complete: !!(profile.avatar_url || profile.avatar_emoji) },
    { key: 'city',   label: 'Wohnort ergänzen',                   complete: !!String(profile.city || '').trim() },
    { key: 'skill',  label: 'Spielniveau auswählen',             complete: !!profile.skill_level },
    { key: 'bio',    label: '„Über mich“ ergänzen',              complete: !!String(profile.bio || '').trim() }
  ];
  const completedCount = items.filter(item => item.complete).length;
  return {
    percent: Math.round((completedCount / items.length) * 100),
    isComplete: completedCount === items.length,
    missing: items.filter(item => !item.complete),
    items
  };
}

function profileCompletionCardHtml(u) {
  const completion = getProfileCompletion(u);
  if (completion.isComplete) return '';
  const missing = completion.missing;
  return `
    <section class="profile-completion-card" aria-labelledby="profile-completion-title">
      <div class="profile-completion-head">
        <span class="profile-completion-icon" aria-hidden="true">${ic('user', 18)}</span>
        <div>
          <div class="profile-completion-title" id="profile-completion-title">Profil vervollständigen</div>
          <div class="profile-completion-value">${completion.percent} % abgeschlossen</div>
        </div>
      </div>
      <div class="profile-completion-progress" role="progressbar" aria-label="Profilfortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion.percent}">
        <span style="--profile-progress:${completion.percent}%"></span>
      </div>
      <p class="profile-completion-copy">Vervollständige dein Profil, damit andere Spieler dich besser kennenlernen und leichter Kontakt aufnehmen können.</p>
      <ul class="profile-completion-list">
        ${missing.map(item => `<li>${escHtml(item.label)}</li>`).join('')}
      </ul>
      <button type="button" class="btn btn-primary profile-completion-button" onclick="openProfileEditSheet()">Profil vervollständigen</button>
    </section>`;
}

function _renderSetupHint(u) {
  const el = document.getElementById('profile-setup-hint');
  if (!el) return;
  el.innerHTML = profileCompletionCardHtml(u);
}

function renderMyEventsSection() {
  const el = document.getElementById('profile-my-events');
  if (!el || !currentUser) return;
  const uid = sb.getUserId();
  const src = allEvents.length ? allEvents : [];
  const myEvents = src.filter(e =>
    e.creatorId === uid || (e.participants || []).some(p => p.id === uid)
  );
  if (!myEvents.length) {
    el.innerHTML = `
      <div class="empty-state-card">
        <div class="esc-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="esc-title">Noch kein Spiel geplant?</div>
        <div class="esc-body">Entdecke Spiele in deiner Nähe oder erstelle dein erstes eigenes Spiel.</div>
        <button class="esc-btn" onclick="showPage('events')">Spiele entdecken</button>
      </div>`;
    return;
  }
  const shown = myEvents.slice(0, 3);
  const hasMore = myEvents.length > 3;
  el.innerHTML = shown.map(e => {
    const label = typeLabel(e.type);
    const date  = formatEventDate(e);
    return `
    <div class="profile-event-row" role="button" tabindex="0"
         onclick="showEventDetail(${e.id})"
         onkeydown="if(event.key==='Enter'||event.key===' ')showEventDetail(${e.id})">
      <div class="per-content">
        <div class="per-name">${escHtml(e.name)}</div>
        <div class="per-meta">${ic('calendar', 10)} ${date}${label ? ` · ${label}` : ''}</div>
        <div class="per-meta">${icPlate(10)} ${escHtml(e.tname || '–')}</div>
      </div>
    </div>`;
  }).join('') + (hasMore ? `<div class="per-showall" role="button" tabindex="0" onclick="openHistorySheet()" onkeydown="if(event.key==='Enter')openHistorySheet()">Alle anzeigen</div>` : '');
}

function _myEventsList() {
  const uid = sb.getUserId();
  return allEvents.filter(e =>
    e.creatorId === uid || (e.participants || []).some(p => p.id === uid)
  );
}

function openHistorySheet() {
  if (!currentUser) return;
  const past = _myEventsList()
    .filter(e => isEventCompleted(e))
    .sort((a, b) => {
      const da = new Date(`${a.dateStr || '1970-01-01'}T${a.time || '00:00'}`);
      const db = new Date(`${b.dateStr || '1970-01-01'}T${b.time || '00:00'}`);
      return db - da;
    });

  const body = document.getElementById('history-body');
  if (!body) return;

  if (!past.length) {
    body.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="history-empty-title">Noch keine vergangenen Spiele</div>
        <div class="history-empty-text">Vergangene Spielrunden erscheinen später hier.</div>
      </div>`;
  } else {
    body.innerHTML = past.map(e => {
      const label = typeLabel(e.type);
      const date  = formatEventDate(e);
      return `
      <div class="profile-event-row" role="button" tabindex="0"
           onclick="_openEventFromHistory(${e.id})"
           onkeydown="if(event.key==='Enter'||event.key===' ')_openEventFromHistory(${e.id})">
        <div class="per-content">
          <div class="per-name">${escHtml(e.name)}</div>
          <div class="per-meta">${ic('calendar', 10)} ${date}${label ? ` · ${label}` : ''}</div>
          <div class="per-meta">${icPlate(10)} ${escHtml(e.tname || '–')}</div>
        </div>
      </div>`;
    }).join('') + '<div class="pb-safe"></div>';
  }

  PTAnalytics.track('game_history_opened', { source: 'profile' });
  openSheet('history-sheet');
}

function _openEventFromHistory(eventId) {
  _eventDetailReturn = 'history-sheet';
  showEventDetail(eventId);
}

function _syncMySearchSkillLevel(skillLevel) {
  const myId = String(sb.getUserId() || '');
  if (!myId || !Array.isArray(allPlayerSearches)) return;
  allPlayerSearches.forEach(search => {
    if (String(search.userId) === myId) search.skillLevel = skillLevel || '';
  });
}

async function selectSkill(el) {
  const vals=['anfaenger','fortgeschritten','profi'];
  document.querySelectorAll('.skill-opt').forEach((o,i)=>{
    o.classList.toggle('active', o===el);
  });
  const skill = vals[Array.from(document.querySelectorAll('.skill-opt')).indexOf(el)];
  if(sb.isLoggedIn() && skill) {
    const qb = new QueryBuilder('profiles');
    await qb.eq('id', sb.getUserId()).update({ skill_level: skill });
    if(currentUser) currentUser.skill_level = skill;
    _syncMySearchSkillLevel(skill);
  }
  renderProfile();
  if (typeof renderHome === 'function') renderHome();
  if (typeof renderEvents === 'function') renderEvents();
  showToast('Spielniveau gespeichert!');
}

function openProfileEditSheet() {
  if (!sb.isLoggedIn() || !currentUser) { openSheet('auth-sheet'); return; }
  document.getElementById('edit-name').value      = currentUser.username  || '';
  document.getElementById('edit-email').value     = localStorage.getItem('sb_email') || '';
  document.getElementById('edit-city').value      = currentUser.city      || '';
  document.getElementById('edit-gender').value    = currentUser.gender    || 'not_specified';
  document.getElementById('edit-birthdate').value = currentUser.birthdate || '';
  document.getElementById('edit-club').value      = currentUser.club_name || '';
  document.getElementById('edit-bio').value       = currentUser.bio       || '';
  document.getElementById('edit-skill').value     = currentUser.skill_level || '';
  _updateBioCounter();
  openSheet('profile-edit-sheet');
}

function _updateBioCounter() {
  const bio     = document.getElementById('edit-bio');
  const counter = document.getElementById('edit-bio-counter');
  if (bio && counter) counter.textContent = bio.value.length;
}

async function saveProfile() {
  if (!sb.isLoggedIn()) return;
  const name      = document.getElementById('edit-name').value.trim();
  const city      = document.getElementById('edit-city').value.trim();
  const gender    = document.getElementById('edit-gender')?.value || 'not_specified';
  const birthdate = document.getElementById('edit-birthdate')?.value || null;
  const club      = document.getElementById('edit-club')?.value.trim() || '';
  const bio       = (document.getElementById('edit-bio')?.value || '').trim().slice(0, 160);
  const skill     = document.getElementById('edit-skill')?.value || null;

  if (!name) {
    showInlineError('profile-name-error', { title: 'Spielername fehlt', desc: 'Bitte einen Spielernamen eingeben.' });
    document.getElementById('edit-name')?.focus();
    return;
  }
  clearInlineError('profile-name-error');

  const btn = document.getElementById('profile-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichern…'; }

  const qb = new QueryBuilder('profiles');
  const { error } = await qb.eq('id', sb.getUserId()).update({
    username:   name,
    city:       city   || null,
    gender:     gender,
    birthdate:  birthdate || null,
    club_name:  club   || null,
    bio:        bio    || null,
    skill_level: skill
  });

  if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
  if (error) { showToast('Profil konnte nicht gespeichert werden', 'error'); return; }

  if (currentUser) {
    currentUser.username  = name;
    currentUser.city      = city;
    currentUser.gender    = gender;
    currentUser.birthdate = birthdate;
    currentUser.club_name = club;
    currentUser.bio       = bio;
    currentUser.skill_level = skill;
    _syncMySearchSkillLevel(skill);
  }
  closeAllSheets();
  showToast('Profil gespeichert');
  renderProfile();
  if (typeof renderHome === 'function') renderHome();
  if (typeof renderEvents === 'function') renderEvents();
}

async function changePassword() {
  const pw1 = document.getElementById('edit-pw-new')?.value  || '';
  const pw2 = document.getElementById('edit-pw-confirm')?.value || '';
  if (!pw1) {
    showInlineError('profile-pw-error', { title: 'Neues Passwort fehlt', desc: 'Bitte ein neues Passwort eingeben.' });
    document.getElementById('edit-pw-new')?.focus(); return;
  }
  if (pw1.length < 6) {
    showInlineError('profile-pw-error', { title: 'Passwort zu kurz', desc: 'Mindestens 6 Zeichen erforderlich.' });
    document.getElementById('edit-pw-new')?.focus(); return;
  }
  if (pw1 !== pw2) {
    showInlineError('profile-pw-error', { title: 'Passwörter stimmen nicht überein', desc: 'Bitte beide Felder gleich ausfüllen.' });
    document.getElementById('edit-pw-confirm')?.focus(); return;
  }
  clearInlineError('profile-pw-error');

  const btn = document.getElementById('edit-pw-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Wird gespeichert…'; }

  try {
    const res  = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sb.getToken()}`, 'apikey': SUPABASE_ANON },
      body:    JSON.stringify({ password: pw1 })
    });
    const data = await res.json();
    if (btn) { btn.disabled = false; btn.textContent = 'Passwort ändern'; }
    if (!res.ok || data.error) {
      showInlineError('profile-pw-error', { title: 'Fehler beim Ändern', desc: data.error?.message || 'Bitte erneut versuchen.' });
      return;
    }
    document.getElementById('edit-pw-new').value     = '';
    document.getElementById('edit-pw-confirm').value = '';
    clearInlineError('profile-pw-error');
    showToast('Passwort geändert');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Passwort ändern'; }
    showInlineError('profile-pw-error', { title: 'Fehler beim Ändern', desc: 'Bitte erneut versuchen.' });
  }
}
