document.addEventListener('DOMContentLoaded', () => {
  const pages = [
    ['Produkt', [['product-guidelines.html','Produktprinzipien'],['ux-review.html','Kritisches UX-Review'],['information-hierarchy.html','Informationshierarchie'],['content-guidelines.html','Sprache & Tonalität']]],
    ['Grundlagen', [['index.html','Start'],['tokens.html','Tokens'],['colors.html','Farben'],['typography.html','Typografie'],['spacing.html','Spacing']]],
    ['Komponenten', [['buttons.html','Buttons'],['tags.html','Tags & Chips'],['forms.html','Formulare'],['cards.html','Cards'],['feedback.html','Feedback'],['dialogs.html','Dialoge'],['navigation.html','Navigation']]],
    ['Richtlinien', [['responsive.html','Responsives Verhalten'],['accessibility.html','Barrierefreiheit'],['motion.html','Bewegung'],['icons.html','Icons'],['assets.html','Medien'],['loading-states.html','Ladezustände'],['empty-states.html','Leere Zustände']]]
  ];
  const current = location.pathname.split('/').pop() || 'index.html';
  const sidebar = document.querySelector('.ds-sidebar');
  if (sidebar) {
    sidebar.setAttribute('aria-label','Design-System-Navigation');
    sidebar.innerHTML = `<a class="ds-brand" href="index.html" aria-label="PlattenTreff Gestaltungssystem – Startseite"><span class="ds-brand-logo" aria-hidden="true"><img class="ds-logo-light" src="../../images/logo/logo-plattentreff.svg" alt=""><img class="ds-logo-dark" src="../../images/logo/logo-plattentreff-negative.svg" alt=""></span><small>Gestaltungssystem</small></a>${pages.map(([group,links]) => `<div class="ds-nav-group"><span class="ds-nav-label">${group}</span><nav class="ds-nav">${links.map(([href,label]) => `<a href="${href}"${href === current ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('')}</nav></div>`).join('')}<div class="ds-sidebar-footer">Ohne Framework · Mobile zuerst<br>Dokumentationsstand 1.1</div>`;
  }

  if (!document.querySelector('.ds-skip')) document.body.insertAdjacentHTML('afterbegin','<a class="ds-skip" href="#main-content">Zum Inhalt springen</a>');
  const main = document.querySelector('.ds-main');
  if (main) main.id = 'main-content';
  const header = document.querySelector('.ds-header-inner');
  if (header && !header.querySelector('.ds-eyebrow')) header.querySelector('div')?.insertAdjacentHTML('afterbegin','<span class="ds-eyebrow">PlattenTreff Richtlinie</span>');
  let toolbar = document.querySelector('.ds-toolbar');
  if (header && !toolbar) { toolbar = document.createElement('div'); toolbar.className = 'ds-toolbar'; header.append(toolbar); }
  if (toolbar && !toolbar.querySelector('[data-ds-theme-toggle]')) toolbar.insertAdjacentHTML('beforeend','<button class="code" type="button" data-ds-theme-toggle aria-label="Farbschema wechseln">☾ <span>Farbschema</span></button>');
  if (toolbar && !toolbar.querySelector('[data-ds-toggle-sidebar]')) toolbar.insertAdjacentHTML('afterbegin','<button class="ds-icon-button ds-menu-button" type="button" data-ds-toggle-sidebar aria-label="Navigation öffnen" aria-expanded="false">☰</button>');

  const navToggle = document.querySelector('[data-ds-toggle-sidebar]');
  navToggle?.addEventListener('click', () => {
    const open = sidebar?.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(Boolean(open)));
    navToggle.setAttribute('aria-label', open ? 'Navigation schließen' : 'Navigation öffnen');
  });
  sidebar?.addEventListener('click', e => { if (e.target === sidebar && innerWidth <= 820) sidebar.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { sidebar?.classList.remove('open'); document.querySelectorAll('dialog[open]').forEach(d => d.close()); } });

  const savedTheme = localStorage.getItem('ds-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  document.querySelector('[data-ds-theme-toggle]')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('ds-theme',next);
    populateTokens();
  });

  function populateTokens() {
    document.querySelectorAll('[data-token]').forEach(el => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(el.dataset.token).trim();
      el.textContent = value || '—';
    });
  }
  populateTokens();

  document.querySelectorAll('[data-ds-snackbar]').forEach(button => button.addEventListener('click', () => {
    let live = document.querySelector('.ds-snackbar-live');
    if (!live) { live = document.createElement('div'); live.className = 'ds-snackbar-live ds-toast'; live.setAttribute('role','status'); document.body.append(live); }
    live.textContent = button.dataset.dsSnackbar || 'Erfolgreich gespeichert';
    live.classList.add('is-visible');
    clearTimeout(live.hideTimer); live.hideTimer = setTimeout(() => live.classList.remove('is-visible'),2600);
  }));
  document.querySelectorAll('[data-ds-dialog]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.dsDialog)?.showModal()));
  document.querySelectorAll('[data-ds-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(document.querySelector(button.dataset.copy)?.textContent || '');
    const old = button.textContent; button.textContent = 'Kopiert'; setTimeout(() => button.textContent = old,1400);
  }));
});
