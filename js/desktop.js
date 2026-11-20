// desktop.js — оболонка настільної програми VestraNode (Windows / Microsoft Store): вкладки у стилі Figma.
// Закріплені вкладки: Проєкти, Стего, Стегоаналіз; далі — відкриті проєкти (кожен у своїй вкладці), «+» створює новий проєкт.
// Програма працює у гостьовому режимі: усе рахується на цьому ПК, нічого, крім проєктів, не зберігається.
import { h, api, state, store, toast, LOGO_SVG } from './core.js';
import { ico } from './icons.js';

export const DESKTOP = !!window.VN_DESKTOP || new URLSearchParams(location.search).has('desktop');
if (DESKTOP) document.documentElement.classList.add('desktop');

const PINNED = [
  { path: '/projects', label: 'Проєкти', icon: 'folder' },
  { path: '/stego', label: 'Стего', icon: 'lock' },
  { path: '/analysis', label: 'Стегоаналіз', icon: 'chart' },
];
const KEY = 'dtabs';
let refreshing = false;
const names = new Map();                                   // id проєкту -> назва (для підписів вкладок)

const tabs = () => store.get(KEY, []).filter((t) => t && t.id);
const saveTabs = (list) => store.set(KEY, list.slice(0, 30));

async function refreshNames() {
  try {
    const { projects } = await api('/api/projects', { silent: true });
    names.clear();
    projects.forEach((p) => names.set(String(p.id), p.name));
  } catch { /* ігноруємо */ }
}

/** Викликається з router-а при кожному переході: додає вкладку відкритого проєкту. */
export function trackRoute(r) {
  if (r.path === '/project' && r.param) {
    const list = tabs();
    if (!list.some((t) => t.id === r.param)) { list.push({ id: r.param }); saveTabs(list); }
  }
}

async function newProject() {
  try {
    const r = await api('/api/projects', { method: 'POST', json: { name: 'Новий проєкт' } });
    const id = r.project?.id ?? r.id;
    if (id) { await refreshNames(); location.hash = `#/project/${id}`; }
  } catch (e) { toast(e.message || 'Не вдалося створити проєкт', 'error'); }
}

function closeTab(id, current) {
  const list = tabs().filter((t) => t.id !== id);
  saveTabs(list);
  if (current) location.hash = list.length ? `#/project/${list[list.length - 1].id}` : '#/projects';
  else renderDesktopBar(parseNow());
}

const parseNow = () => {
  const raw = location.hash.replace(/^#/, '') || '/';
  const segs = raw.split('?')[0].split('/').filter(Boolean);
  return { path: '/' + (segs[0] || ''), param: segs[1] };
};

function accountMenu(btn) {
  const old = document.querySelector('.dt-menu'); if (old) { old.remove(); return; }
  const open = (url) => { window.open(url, '_blank', 'noopener'); };
  const item = (icon, text, fn) => h('button', { class: 'dt-menu-item', type: 'button', onclick: () => { menu.remove(); fn(); } }, ico(icon), h('span', {}, text));
  const menu = h('div', { class: 'dt-menu' },
    h('div', { class: 'dt-menu-head' }, h('b', {}, 'Гостьовий режим'), h('small', {}, 'Проєкти зберігаються лише на цьому комп’ютері')),
    item('user', 'Увійти або зареєструватися на сайті', () => open('https://vn.raimex.space/#/login')),
    item('help', 'Довідка', () => open('https://vn.raimex.space/#/help')),
    item('link', 'Відкрити vn.raimex.space', () => open('https://vn.raimex.space/')));
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`; menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  const away = (e) => { if (!menu.contains(e.target) && !btn.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', away, true); } };
  document.addEventListener('pointerdown', away, true);
}

export function renderDesktopBar(r) {
  const bar = document.getElementById('topbar');
  bar.classList.add('dt-bar'); bar.classList.remove('transparent');
  const current = r.path === '/project' ? r.param : null;
  const pin = (t) => h('a', { class: `dt-tab pinned${r.path === t.path ? ' on' : ''}`, href: `#${t.path}`, title: t.label }, ico(t.icon), h('span', {}, t.label));
  const projTabs = tabs().map((t) => {
    const on = current === t.id;
    return h('a', { class: `dt-tab proj${on ? ' on' : ''}`, href: `#/project/${t.id}`, title: names.get(t.id) || 'Проєкт' }, ico('nodes'), h('span', {}, names.get(t.id) || 'Проєкт'),
      h('button', { class: 'dt-x', type: 'button', 'aria-label': 'Закрити вкладку', onclick: (e) => { e.preventDefault(); e.stopPropagation(); closeTab(t.id, on); } }, ico('x')));
  });
  const acc = h('button', { class: 'dt-acc', type: 'button', title: 'Гостьовий режим' }, ico('user'), h('span', {}, 'Гість'));
  acc.onclick = () => accountMenu(acc);
  bar.replaceChildren(
    h('div', { class: 'dt-logo', html: LOGO_SVG, title: 'VestraNode' }),
    h('div', { class: 'dt-tabs' }, ...PINNED.map(pin), h('i', { class: 'dt-sep' }), ...projTabs,
      h('button', { class: 'dt-add', type: 'button', title: 'Новий проєкт', 'aria-label': 'Новий проєкт', onclick: newProject }, ico('plus'))),
    h('div', { class: 'dt-spacer' }), acc);
  if (tabs().some((t) => !names.has(t.id)) && !refreshing) { refreshing = true; refreshNames().then(() => { refreshing = false; renderDesktopBar(parseNow()); }); }
}
