// core.js — DOM-хелпери, API, сповіщення, спадні списки, діалоги, сховище налаштувань
const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** '14px' → '0.875rem' у стилях елементів інтерфейсу (масштаб регулюється font-size кореня); позиції й transform лишаються в px. */
const pxToRem = (k, v) => (typeof v === 'string' && !/^(left|top|right|bottom|transform|translate)$/.test(k) && /^-?\d*\.?\d+px$/.test(v) && Math.abs(parseFloat(v)) !== 1 ? `${parseFloat(v) / 16}rem` : v);

/** h('div', {class:'x', onclick: fn}, child, 'text', [..]) — створення DOM-елементів (префікс 'svg:' для SVG). */
export function h(tag, props, ...children) {
  const isSvg = tag.startsWith('svg:');
  const el = isSvg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = pxToRem(sk, sv); } }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (!isSvg && k in el && !k.includes('-') && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

// ---------------------------------------------------------------- сховище клієнта (кеш налаштувань і входу)
export const store = {
  get(key, def = null) {
    try { const v = localStorage.getItem('vn:' + key); return v === null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, value) { try { localStorage.setItem('vn:' + key, JSON.stringify(value)); } catch { /* недоступно */ } },
  del(key) { try { localStorage.removeItem('vn:' + key); } catch { /* недоступно */ } },
};

// ---------------------------------------------------------------- налаштування й бекенди
export const CFG = Object.assign({ backends: [{ name: 'Основний', url: '' }], healthTimeoutMs: 4000, recheckSec: 30, links: {}, packs: [], regen: { floor: 50, hours: 6 }, pricing: {} }, window.VN_CONFIG || {});

/** backend.index — який бекенд зараз використовується (0 = основний), -1 — жоден не відповідає. */
export const backend = {
  list: CFG.backends.map((b) => ({ name: b.name, url: String(b.url || '').replace(/\/+$/, ''), alive: null, ms: null, db: '' })),
  index: -1, better: -1, checked: false,
  get current() { return this.index >= 0 ? this.list[this.index] : null; },
  get base() { return (this.current || this.list[0]).url; },
  get fallback() { return this.index > 0; },
  get down() { return this.checked && this.index < 0; },
};
const backendListeners = new Set();
export const onBackend = (fn) => { backendListeners.add(fn); return () => backendListeners.delete(fn); };

async function probe(b) {
  const ctl = new AbortController(), t0 = performance.now();
  const timer = setTimeout(() => ctl.abort(), CFG.healthTimeoutMs);
  try {
    const res = await fetch(`${b.url}/api/health`, { cache: 'no-store', signal: ctl.signal });
    const j = await res.json();
    b.alive = !!j.ok; b.ms = Math.round(performance.now() - t0); b.db = j.db || '';
  } catch { b.alive = false; b.ms = null; } finally { clearTimeout(timer); }
}

/** Перевіряє всі бекенди одночасно й обирає перший робочий за пріоритетом. immediate=false: не міняти робочий бекенд посеред роботи. */
export async function checkBackends({ immediate = false } = {}) {
  await Promise.all(backend.list.map(probe));
  const first = backend.list.findIndex((b) => b.alive);
  const cur = backend.index;
  const wasChecked = backend.checked;
  backend.checked = true;
  if (cur >= 0 && backend.list[cur].alive && first >= 0 && first < cur && !immediate && wasChecked) backend.better = first;   // краший ожив — перейдемо при наступній навігації
  else { backend.index = first; backend.better = -1; }
  backendListeners.forEach((fn) => fn(backend));
  return first;
}
export function applyBetterBackend() {
  if (backend.better >= 0 && backend.list[backend.better]?.alive) { backend.index = backend.better; backend.better = -1; backendListeners.forEach((fn) => fn(backend)); return true; }
  return false;
}
let recheckTimer = 0;
export function startBackendWatch() {
  clearInterval(recheckTimer);
  recheckTimer = setInterval(() => checkBackends(), Math.max(10, CFG.recheckSec) * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkBackends(); });
}

// ---------------------------------------------------------------- токен входу
export const getToken = () => store.get('token', null);
export const setToken = (t) => (t ? store.set('token', t) : store.del('token'));
let rtoken = null, rtokenTimer = 0;
/** Короткий токен для посилань на зображення/завантаження (для них не можна додати заголовок Authorization). */
export async function refreshResourceToken() {
  clearTimeout(rtokenTimer);
  if (!getToken()) { rtoken = null; return; }
  try {
    const r = await api('/api/auth/rtoken', { method: 'POST', silent: true });
    rtoken = r.token; rtokenTimer = setTimeout(refreshResourceToken, Math.max(60, r.ttl - 600) * 1000);
  } catch { rtokenTimer = setTimeout(refreshResourceToken, 60000); }
}
/** Повна адреса ресурсу бекенда (аватар тощо, без авторизації). */
export const assetUrl = (path) => (path && path.startsWith('/') ? backend.base + path : path || '');
/** Адреса ресурсу, що потребує входу (фото, завантаження): додає короткий токен. */
export function authUrl(path) {
  if (!path) return path;
  const sep = path.includes('?') ? '&' : '?';
  return backend.base + path + (rtoken ? `${sep}access_token=${encodeURIComponent(rtoken)}` : '');
}
/** Початок входу через Google/Discord (повне перенаправлення браузера на бекенд). */
export function oauthUrl(provider) {
  const nonce = crypto.getRandomValues(new Uint32Array(4)).join('-');
  store.set('oauth_nonce', nonce);
  return `${backend.base}/auth/${provider}/login?return=${encodeURIComponent(location.origin)}&n=${encodeURIComponent(nonce)}`;
}

// ---------------------------------------------------------------- загальний стан
export const state = { user: null, pub: { links: CFG.links, packs: CFG.packs, regen: CFG.regen, pricing: CFG.pricing, providers: {} }, nodeDefs: null };
const listeners = new Set();
export const onState = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emitState = () => listeners.forEach((fn) => fn(state));

export function setUser(user) {
  state.user = user;
  if (user) store.set('user', { name: user.name, avatar: user.avatar, paxels: user.paxels });  // кеш для миттєвого показу
  emitState();
}

// ---------------------------------------------------------------- API
export async function api(path, { method = 'GET', json, body, headers = {}, raw = false, silent = false } = {}) {
  const init = { method, headers: { ...headers } };
  const token = getToken();
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] = 'application/json'; }
  else if (body !== undefined) init.body = body;
  let res;
  try { res = await fetch(backend.base + path, init); } catch {
    const err = new Error('Немає зв\'язку з сервером.');
    err.offline = true;
    checkBackends({ immediate: true });         // можливо, бекенд упав — перевіряємо й, за потреби, переходимо на запасний
    if (!silent) toast(err.message, 'error');
    throw err;
  }
  if (raw) return res;
  let data = {};
  try { data = await res.json(); } catch { /* не JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || `Помилка ${res.status}`);
    err.status = res.status; err.data = data;
    if (res.status === 401 && token) { setToken(null); setUser(null); }
    if (!silent) toast(err.message, 'error');
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------- сповіщення (помилки — червоні)
const ICONS = { error: '✖', ok: '✔', info: 'ℹ', warn: '⚠' };
export function toast(message, kind = 'info', ms = 6500) {
  const root = $('#toasts');
  const el = h('div', { class: `toast ${kind}` }, h('span', { class: 'ico' }, ICONS[kind] || 'ℹ'),
    h('div', { class: 'msg' }, message), h('button', { title: 'Закрити', onclick: () => el.remove() }, '✕'));
  root.append(el);
  if (ms) setTimeout(() => el.remove(), kind === 'error' ? ms + 2500 : ms);
  return el;
}
export const toastError = (m) => toast(m, 'error');

// ---------------------------------------------------------------- модальні вікна
export function modal({ title, text, content, actions }) {
  return new Promise((resolve) => {
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const box = h('div', { class: 'modal' }, h('h3', {}, title), text && h('p', {}, text), content,
      h('div', { class: 'actions' }, actions.map((a) => h('button', { class: `btn ${a.cls || 'ghost'}`, onclick: () => close(a.value) }, a.label))));
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(null); } }, box);
    document.addEventListener('keydown', onKey);
    $('#modal-root').append(back);
    const first = $('input', box); if (first) { first.focus(); first.select?.(); }
    box._close = close; box._back = back;
  });
}

export const confirmDialog = (title, text, okLabel = 'Так', danger = false) =>
  modal({ title, text, actions: [{ label: 'Скасувати', value: false }, { label: okLabel, value: true, cls: danger ? 'danger' : '' }] });

export async function promptDialog(title, value = '', placeholder = '', okLabel = 'Зберегти') {
  const input = h('input', { class: 'input', value, placeholder, maxLength: 60 });
  const result = modal({ title, content: input, actions: [{ label: 'Скасувати', value: null }, { label: okLabel, value: '__ok__' }] });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.closest('.modal')._close('__ok__'); });
  const r = await result;
  return r === '__ok__' ? input.value.trim() : null;
}

// ---------------------------------------------------------------- спадний список
const CHEV = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TICK = '<svg class="tick" viewBox="0 0 18 18"><path d="M4 9.5l3.2 3.2L14 5.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** select([[value,label],...], value, onChange, {up}) -> елемент із .value / .setValue() / .setOptions() */
export function select(options, value, onChange, { up = false, cls = '' } = {}) {
  let opts = options, val = value;
  const label = h('span', { class: 'dd-val' });
  const btn = h('button', { type: 'button', class: 'dd-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, label, h('span', { class: 'dd-chev', html: CHEV }));
  const menu = h('div', { class: `dd-menu${up ? ' up' : ''}`, role: 'listbox', hidden: true });
  const root = h('div', { class: `dd ${cls}` }, btn, menu);

  const paint = () => {
    const cur = opts.find((o) => String(o[0]) === String(val));
    label.textContent = cur ? cur[1] : '—';
    menu.replaceChildren(...opts.map(([v, l]) => {
      const it = h('button', { type: 'button', class: `dd-item${String(v) === String(val) ? ' on' : ''}`, role: 'option' }, h('span', {}, l), h('span', { html: TICK }));
      it.onclick = () => { setOpen(false); if (String(v) !== String(val)) { val = v; paint(); onChange && onChange(v); } btn.focus(); };
      return it;
    }));
  };
  const outside = (e) => { if (!root.contains(e.target)) setOpen(false); };
  function setOpen(open) {
    root.classList.toggle('open', open); menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    if (open) { document.addEventListener('pointerdown', outside); ($('.dd-item.on', menu) || $('.dd-item', menu))?.focus(); }
    else document.removeEventListener('pointerdown', outside);
  }
  btn.onclick = () => setOpen(menu.hidden);
  btn.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } };
  menu.onkeydown = (e) => {
    const items = $$('.dd-item', menu), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { setOpen(false); btn.focus(); }
  };
  Object.defineProperty(root, 'value', { get: () => val, set: (v) => { val = v; paint(); } });
  root.setOptions = (o) => { opts = o; paint(); };
  paint();
  return root;
}

// ---------------------------------------------------------------- контекстне меню
let ctxEl = null;
export function closeCtx() { ctxEl?.remove(); ctxEl = null; }
export function contextMenu(x, y, items) {
  closeCtx();
  ctxEl = h('div', { class: 'ctx' }, items.map((it) => it === '-' ? h('hr') :
    h('button', { class: it.danger ? 'danger' : '', onclick: () => { closeCtx(); it.action(); } }, it.icon && h('span', {}, it.icon), it.label)));
  document.body.append(ctxEl);
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  ctxEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => {
    const off = (e) => { if (!ctxEl?.contains(e.target)) { closeCtx(); document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
  });
}

// ---------------------------------------------------------------- форматування
export const fmtInt = (n) => Math.round(n).toLocaleString('uk-UA');
export const fmtNum = (n, d = 2) => Number(n).toLocaleString('uk-UA', { maximumFractionDigits: d });
export function fmtBytes(n) {
  const base = Number.isInteger(n) ? fmtInt(n) : fmtNum(n, 1);
  return n >= 1024 ? `${base} Б (${fmtNum(n / 1024, 1)} КБ)` : `${base} Б`;
}
export const fmtDate = (iso) => iso ? new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtDay = (iso) => iso ? new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleDateString('uk-UA', { dateStyle: 'long' }) : '—';

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function b64ToBuf(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

// ---------------------------------------------------------------- тема й акцентний колір
export function hexToRgb(hex) { const x = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }

export const DEFAULT_SCALE = 0.714;                       // ≈ «браузерний масштаб 71 %» (інтерфейс менший у 1,4 раза)
/** Поточний масштаб інтерфейсу (1 = 100 %). */
export const uiScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
export function setScale(v) { store.set('scale', Math.min(1.3, Math.max(0.6, v))); applyAppearance(); }

/** Автомасштаб за розміром вікна: на екранах більших за Full HD (2K, 4K, ultrawide) інтерфейс пропорційно росте, а не лишається крихітним.
 *  Опорний розмір — вікно 1920×960 (Full HD з рядком браузера); менші вікна не зменшуються. Крок 5 %, щоб розмітка не «тремтіла» при зміні розміру. */
export function autoFactor() {
  if ((store.get('prefs', {}) || {}).autoscale === false) return 1;
  const f = Math.min(innerWidth / 1920, innerHeight / 960);
  return Math.min(2.5, Math.max(1, Math.round(f * 20) / 20));
}
const rootPx = () => `${(16 * store.get('scale', DEFAULT_SCALE) * autoFactor()).toFixed(3)}px`;
let rescaleTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(rescaleTimer);
  rescaleTimer = setTimeout(() => { if (document.documentElement.style.fontSize !== rootPx()) document.documentElement.style.fontSize = rootPx(); }, 120);
});

export function applyAppearance() {
  const theme = store.get('theme', 'dark'), accent = store.get('accent', '#7c9cff');
  document.documentElement.style.fontSize = rootPx();
  document.documentElement.dataset.theme = theme;
  const [r, g, b] = hexToRgb(accent);
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--on-accent', (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0b0c10' : '#ffffff');
  document.documentElement.classList.toggle('no-anim', (store.get('prefs', {}) || {}).anim === false);
}
export function setTheme(theme) { store.set('theme', theme); applyAppearance(); }
export function setAccent(hex) { store.set('accent', hex); applyAppearance(); }

export const LOGO_SVG = '<svg viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5c8a"/><stop offset="1" stop-color="#7a5cff"/></linearGradient><mask id="lm" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="M14.75 20L26.25 44 37.75 20" fill="none" stroke="#000" stroke-width="15.5" stroke-linecap="round" stroke-linejoin="round"/></mask></defs><rect width="64" height="64" rx="16" fill="url(#lg)"/><path d="M37.75 20L49.25 44" fill="none" stroke="#4cc9ff" stroke-width="9" stroke-linecap="round" mask="url(#lm)"/><path d="M14.75 20L26.25 44 37.75 20" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
