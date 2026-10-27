// main.js — маршрутизатор, верхня панель з меню аватара, перевірка бекендів, повідомлення про зв'язок
import { $, h, api, state, store, setUser, onState, toast, applyAppearance, setTheme, LOGO_SVG, fmtInt, backend, checkBackends,
  applyBetterBackend, startBackendWatch, onBackend, getToken, setToken, refreshResourceToken, assetUrl } from './core.js';
import { installIcons } from './icons.js';

applyAppearance();

const ROUTES = {
  '/': () => import('./pages/landing.js'),
  '/login': () => import('./pages/login.js'),
  '/auth': () => import('./pages/auth.js'),
  '/help': () => import('./pages/help.js'),
  '/projects': () => import('./pages/projects.js'),
  '/stego': () => import('./pages/simple.js'),
  '/analysis': () => import('./pages/analysis.js'),
  '/profile': () => import('./pages/profile.js'),
  '/settings': () => import('./pages/settings.js'),
  '/project': () => import('./pages/project.js'),
  '/admin': () => import('./pages/admin.js'),
  '/share': () => import('./pages/share.js'),
};
// сторінки, що працюють без бекенда
const PUBLIC = new Set(['/', '/login', '/auth', '/help', '/settings']);
// сторінки, що потребують бекенда, але не вимагають входу (посилання для обміну)
const OPEN = new Set(['/share']);
// сторінки, де показуємо попередження про запасний (повільніший) бекенд
const SLOW_PAGES = new Set(['/stego', '/project', '/analysis']);

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, query = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const base = '/' + (segs[0] || '');
  return { path: base, param: segs[1], query: Object.fromEntries(new URLSearchParams(query)), raw };
}

export const ready = () => booted;
export const go = (to) => { if (location.hash.replace(/^#/, '') === to) route(); else location.hash = to; };

let current = null, booted = null;

// ---------------------------------------------------------------- сеанс і зв'язок
async function loadSession() {
  if (backend.index < 0) return;
  try {
    const pub = await api('/api/public', { silent: true });
    state.pub = { ...state.pub, ...pub };
  } catch { /* лишаються значення з config.js */ }
  if (!getToken()) { setUser(null); return; }
  try {
    const me = await api('/api/me', { silent: true });
    if (me.user) { setUser(me.user); await refreshResourceToken(); } else { setToken(null); setUser(null); if (me.banned) toast('Ваш акаунт заблоковано.', 'error'); }
  } catch (e) { if (!e.offline) { setToken(null); setUser(null); } }
}

export async function afterLogin(token) {
  setToken(token);
  await loadSession();
}

function renderNotice(r) {
  const box = $('#notice');
  const needsBackend = !PUBLIC.has(r.path) || r.path === '/login';
  const items = [];
  if (backend.down && needsBackend) {
    items.push(h('div', { class: 'notice bad' }, h('span', {}, '⛔ Немає зв\'язку з сервером. Ця сторінка тимчасово недоступна, але головна й довідка працюють.'),
      h('button', { class: 'btn small', onclick: async () => { await checkBackends({ immediate: true }); await loadSession(); route(); } }, 'Повторити')));
  } else if (backend.fallback && SLOW_PAGES.has(r.path)) {
    items.push(h('div', { class: 'notice warn' }, h('span', {}, '⚠ Основний сервер недоступний — зараз працює запасний, тому робота буде повільнішою.')));
  }
  box.replaceChildren(...items);
}

function offlinePage() {
  return h('div', { class: 'empty-page' }, h('h2', {}, 'Немає зв\'язку з сервером'),
    h('p', { style: { color: 'var(--muted)', maxWidth: '460px', textAlign: 'center' } }, 'Сторінка потребує сервера, а він зараз не відповідає. Головна сторінка та довідка доступні без нього.'),
    h('div', { class: 'row-gap' }, h('button', { class: 'btn', onclick: async () => { await checkBackends({ immediate: true }); await loadSession(); route(); } }, 'Спробувати знову'),
      h('a', { class: 'btn ghost', href: '#/help' }, 'Відкрити довідку')));
}

async function route() {
  const r = parseHash();
  if (current?.unmount) { try { await current.unmount(); } catch { /* ігноруємо */ } }
  current = null;
  $('.avatar-menu')?.remove(); menuOpen = false;        // меню аватара не лишається відкритим після переходу
  applyBetterBackend();
  const loader = ROUTES[r.path];
  const root = $('#app');
  root.replaceChildren();
  if (!loader) { root.append(h('div', { class: 'empty-page' }, h('h2', {}, 'Сторінку не знайдено'), h('a', { class: 'btn', href: '#/' }, 'На головну'))); renderTopbar(r); renderNotice(r); return; }
  if (!PUBLIC.has(r.path)) await booted;                       // потрібно знати, чи є зв'язок і хто увійшов
  renderNotice(r);
  if (!PUBLIC.has(r.path)) {
    if (backend.down) { renderTopbar(r); root.append(offlinePage()); return; }
    if (!state.user && !OPEN.has(r.path)) { go('/login?next=' + encodeURIComponent(r.raw)); return; }
    if (r.path === '/admin' && !state.user.is_admin) { root.append(h('div', { class: 'empty-page' }, h('h2', {}, 'Немає доступу'), h('p', { style: { color: 'var(--muted)' } }, 'Ця сторінка лише для адміністраторів.'), h('a', { class: 'btn', href: '#/' }, 'На головну'))); renderTopbar(r); return; }
  }
  renderTopbar(r);
  document.body.dataset.page = r.path.slice(1) || 'home';
  window.scrollTo(0, 0);
  try {
    const mod = await loader();
    current = (await mod.default.mount(root, r)) || null;
    if (current && typeof current === 'function') current = { unmount: current };
  } catch (e) {
    console.error(e);
    toast('Не вдалося відкрити сторінку: ' + e.message, 'error');
  }
}

// ---------------------------------------------------------------- верхня панель
const ICON = {
  user: '👤', settings: '⚙', folder: '📁', lock: '🔒', chart: '📊', moon: '🌙', yt: '▶', dc: '💬', out: '⎋', help: '❓', admin: '🛡',
};

let menuOpen = false;

function renderTopbar(r) {
  const bar = $('#topbar');
  const links = state.pub?.links || {};
  bar.classList.toggle('transparent', r.path === '/');
  const nav = h('nav', { class: 'nav' },
    h('div', { class: 'nav-dd' }, navDropdown('Продукт ▾', [
      ['#/projects', 'Редактор нод', 'Збирайте конвеєри з нодів'],
      ['#/stego', 'Стего', 'Текст у фото за кілька кліків'],
      ['#/analysis', 'Стегоаналіз', 'Шум, біти, χ²-атака']])),
    h('a', { href: '/#pricing', onclick: (e) => { e.preventDefault(); scrollToSection('pricing'); } }, 'Пакселі'),
    h('a', { href: '#/help', class: r.path === '/help' ? 'on' : '' }, 'Довідка'),
    h('div', { class: 'nav-dd' }, navDropdown('Ресурси ▾', [
      [links.youtube_url || '#', 'YouTube', 'Відео й уроки', true],
      [links.discord_url || '#', 'Discord', 'Спільнота й підтримка', true]])),
    h('a', { href: '#/projects', class: r.path === '/projects' ? 'on' : '' }, 'Проєкти'),
  );

  const cached = store.get('user', null);
  const right = h('div', { class: 'top-right' });
  if (state.user) {
    right.append(
      h('a', { class: 'paxel-chip', href: '#/profile', title: 'Баланс пакселів' }, h('i'), `${fmtInt(state.user.paxels)}`, h('small', {}, 'пакс.')),
      avatarButton(state.user));
  } else if (backend.down && cached && getToken()) {
    right.append(avatarButton({ name: cached.name, avatar: cached.avatar, email: '', premium: {} }));      // без зв'язку показуємо кешований профіль
  } else {
    right.append(h('a', { class: 'btn ghost', href: '#/login' }, 'Увійти'),
      h('a', { class: 'btn', href: '#/login?tab=register', title: 'Новий акаунт отримує 100 пакселів' }, 'Реєстрація'));
  }
  bar.replaceChildren(h('a', { class: 'logo', href: '#/' }, h('span', { html: LOGO_SVG }), 'VESTRANODE'), nav, right);
}

function scrollToSection(id) {
  const go2 = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  if (parseHash().path !== '/') { location.hash = '#/'; setTimeout(go2, 400); } else go2();
}

function navDropdown(label, items) {
  const menu = h('div', { class: 'menu', hidden: true }, items.map(([href, title, sub, ext]) =>
    h('a', { href, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null }, h('div', {}, h('b', {}, title), h('small', { style: { display: 'block' } }, sub)))));
  const btn = h('button', { type: 'button' }, label);
  const wrap = h('div', {}, btn, menu);
  const outside = (e) => { if (!wrap.contains(e.target)) { menu.hidden = true; document.removeEventListener('pointerdown', outside); } };
  btn.onclick = () => { menu.hidden = !menu.hidden; if (!menu.hidden) document.addEventListener('pointerdown', outside); };
  menu.addEventListener('click', () => { menu.hidden = true; });
  return wrap;
}

function avatarButton(u) {
  const src = assetUrl(u.avatar);
  const img = src ? h('img', { class: 'avatar', src, alt: u.name, referrerPolicy: 'no-referrer' }) : h('div', { class: 'avatar' }, (u.name || '?')[0].toUpperCase());
  const btn = h('button', { class: 'avatar-btn', type: 'button', 'aria-expanded': String(menuOpen), title: u.name }, img);
  btn.onclick = (e) => { e.stopPropagation(); toggleAvatarMenu(u); };
  return btn;
}

async function logout() {
  if (getToken() && backend.index >= 0) { try { await api('/api/auth/logout', { method: 'POST', silent: true }); } catch { /* не критично */ } }
  setToken(null); setUser(null); store.del('user');
  toast('Ви вийшли з акаунта.', 'info'); go('/');
}

function toggleAvatarMenu(u) {
  const old = $('.avatar-menu');
  if (old) { old.remove(); menuOpen = false; $('.avatar-btn')?.setAttribute('aria-expanded', 'false'); return; }
  menuOpen = true;
  $('.avatar-btn')?.setAttribute('aria-expanded', 'true');
  const links = state.pub?.links || {};
  const online = !!state.user;
  const dark = (store.get('theme', 'dark') === 'dark');
  const theme = h('input', { type: 'checkbox', checked: dark });
  theme.onchange = () => setTheme(theme.checked ? 'dark' : 'light');
  const close = () => { $('.avatar-menu')?.remove(); menuOpen = false; $('.avatar-btn')?.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (!e.target.closest('.avatar-menu') && !e.target.closest('.avatar-btn')) close(); };
  const item = (href, icon, text, ext) => h('a', { href, target: ext ? '_blank' : null, rel: ext ? 'noopener' : null, onclick: close }, h('span', {}, icon), text);
  const menu = h('div', { class: 'menu avatar-menu' },
    h('div', { class: 'who' }, h('b', {}, u.name), h('small', {}, u.email || 'немає зв\'язку з сервером'), u.premium?.active && h('span', { class: 'premium-tag' }, 'ПРЕМІУМ')),
    h('hr'),
    online && item('#/profile', ICON.user, 'Профіль'), item('#/settings', ICON.settings, 'Налаштування'),
    online && item('#/projects', ICON.folder, 'Проєкти'), online && item('#/stego', ICON.lock, 'Стего'), online && item('#/analysis', ICON.chart, 'Стегоаналіз'),
    item('#/help', ICON.help, 'Довідка'),
    online && u.is_admin && item('#/admin', ICON.admin, 'Адмін-панель'),
    h('hr'),
    h('div', { class: 'row row-split', style: { display: 'flex', alignItems: 'center', padding: '9px 12px', gap: '12px' } },
      h('span', {}, `${ICON.moon}  Темний режим`), h('label', { class: 'switch' }, theme, h('i'))),
    h('hr'),
    item(links.youtube_url || '#', ICON.yt, 'YouTube', true), item(links.discord_url || '#', ICON.dc, 'Discord', true),
    h('hr'),
    h('button', { class: 'row', onclick: () => { close(); logout(); } }, h('span', {}, ICON.out), 'Вийти'));
  document.body.append(menu);
  document.addEventListener('pointerdown', outside, true);
}

// ---------------------------------------------------------------- запуск
function boot() {
  installIcons();
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', window.scrollY > 30), { passive: true });
  onState(() => renderTopbar(parseHash()));
  onBackend(() => { const r = parseHash(); renderNotice(r); renderTopbar(r); });
  // головна й довідка показуються одразу, не чекаючи перевірки бекендів
  booted = (async () => {
    await checkBackends({ immediate: true });
    startBackendWatch();
    await loadSession();
  })();
  booted.then(() => { renderTopbar(parseHash()); renderNotice(parseHash()); });
  route();
}

// service worker: офлайн-оболонка й можливість встановити сайт як застосунок (лише https або localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* не критично */ });
}

boot();
