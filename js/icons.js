// icons.js — власний набір іконок VestraNode (одна стильова сітка: 24×24, лінія 1.9, заокруглені кінці) і автозаміна емодзі на сайті.
// Будь-який емодзі/піктограма з таблиці GLYPH, що потрапляє в текст сторінки, автоматично замінюється на відповідну SVG-іконку (MutationObserver).
// Програмно: ico('lock') повертає готовий елемент.

const P = {   // внутрішність <svg>; за замовчуванням — контур (stroke), фігури з class="f" — заливка
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  lockkey: '<rect x="5" y="11" width="14" height="9.5" rx="2.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.7" r="1.2" class="f"/>',
  bolt: '<path d="M13.5 3 5.5 13.5h5.8L10 21l8.5-11h-5.8z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7M10.2 11v5.5M13.8 11v5.5"/>',
  star: '<path class="f" d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L12 16.7l-5.4 3.1 1.2-6.1-4.5-4.2 6.1-.7z"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  search: '<circle cx="10.8" cy="10.8" r="6"/><path d="M15.2 15.2 20 20"/>',
  play: '<path class="f" d="M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z"/>',
  pencil: '<path d="M4.5 19.5l1-4L16 5a2.1 2.1 0 0 1 3 3L8.5 18.5z"/><path d="M14 7l3 3"/>',
  code: '<path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.2 5.5l-2.4 13"/>',
  scissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.5 8.6 20 18M8.5 15.4 20 6"/>',
  chart: '<path d="M5.5 20v-7M12 20V5M18.5 20V10"/>',
  trend: '<path d="M3.5 17l6-6 4 4 7-8M15.5 7h5v5"/>',
  tray: '<path d="M12 4v11M7.8 11 12 15.2 16.2 11M4.5 19.5h15"/>',
  down: '<path d="M12 5v13.5M6.2 12.8 12 18.5l5.8-5.7"/>',
  up: '<path d="M12 19V5.5M6.2 11.2 12 5.5l5.8 5.7"/>',
  upload: '<path d="M12 15V4.5M7.8 8.5 12 4.3l4.2 4.2M4.5 19.5h15"/>',
  check: '<path d="M5 12.8l4.4 4.4L19 7.6"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="M7.8 12.4l3 3 5.4-6"/>',
  warn: '<path d="M12 4.2l9 15.6H3z"/><path d="M12 10.2v4.2M12 17.4v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2M12 7.8v.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4v5.6M12 16.4v.01"/>',
  fit: '<path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/>',
  undo: '<path d="M9 6.5 4.5 11 9 15.5M5 11h8.2a5.8 5.8 0 0 1 0 11.6H11"/>',
  redo: '<path d="M15 6.5 19.5 11 15 15.5M19 11h-8.2a5.8 5.8 0 0 0 0 11.6H13"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
  user: '<circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16 5.4a3.4 3.4 0 0 1 0 6.2M18 14.2a6.2 6.2 0 0 1 3.2 5.6"/>',
  folder: '<path d="M3.5 7.2a2 2 0 0 1 2-2h3.8l2.1 2.4h7.1a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/>',
  moon: '<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  shield: '<path d="M12 3.2l7.5 2.8v5.6c0 4.6-3.2 7.9-7.5 9.2-4.3-1.3-7.5-4.6-7.5-9.2V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
  nodes: '<rect x="3.5" y="4.5" width="7" height="5.4" rx="1.6"/><rect x="13.5" y="14.1" width="7" height="5.4" rx="1.6"/><path d="M10.5 7.2h2a2 2 0 0 1 2 2v2.1a2 2 0 0 0 2 2.8M17 14.1v-1.7"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M3.8 17.2 9 12.4l3.8 3.6 2.6-2.4 5 4.4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12.1 20 3.2M15.8 7.4l3 3M13.4 9.8l2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-.9.9M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l.9-.9"/>',
  backspace: '<path d="M21 6H9l-6 6 6 6h12z"/><path d="M13 9.8l4 4.4M17 9.8l-4 4.4"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M7.2 9.8l3 2.4-3 2.4M12.6 14.8h4.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/><circle cx="12" cy="12" r="6.6"/>',
  chat: '<path d="M4.5 5.5h15v10.5H10l-5.5 4v-4z"/>',
  logout: '<path d="M10 4.5H5v15h5M15 8l4 4-4 4M9.5 12h9.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 0 1 4.9.8c0 1.7-2.5 2-2.5 3.6M12 17.2v.01"/>',
  plane: '<path d="M20.5 3.5 10 14M20.5 3.5 14.2 20.5l-3.8-6.8-6.9-3.7z"/>',
  wrench: '<path d="M14.3 6.2a4.3 4.3 0 0 0 5.1 5.5l.1.1-8.1 8a2.2 2.2 0 0 1-3.1-3.1l8-8.1a4.3 4.3 0 0 1-2-2.4z M17.8 3.6l-2.4 2.4 2.6 2.6 2.4-2.4"/>',
  ticket: '<path d="M3.5 8.2a1.7 1.7 0 0 0 0 3.4v0.1a1.7 1.7 0 0 0 0 3.4v1.4a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V15a1.7 1.7 0 0 1 0-3.4v-.1A1.7 1.7 0 0 1 20.5 8V6.6a1 1 0 0 0-1-1h-15a1 1 0 0 0-1 1z"/><path d="M14.5 6v2M14.5 11v2M14.5 16v2"/>',
  receipt: '<path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M9 8.5h6M9 12.2h6"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.6" rx="1.4"/><path d="M5 9.1v9.4a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9.1M10 13h4"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3 10h18M6.5 15h3.2"/>',
  rocket: '<path d="M12 3.3c3.2 2.2 5 5.4 5 9.2l-2.6 3H9.6L7 12.5c0-3.8 1.8-7 5-9.2z"/><circle cx="12" cy="10" r="1.6"/><path d="M9.2 15.5 6.2 19.5M14.8 15.5l3 4M12 17v3.5"/>',
  dna: '<path d="M7.5 3.5c0 4 9 5 9 8.5s-9 4.5-9 8.5M16.5 3.5c0 4-9 5-9 8.5s9 4.5 9 8.5M8.6 7.6h6.8M8.6 16.4h6.8"/>',
  dot: '<circle class="f" cx="12" cy="12" r="5.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  power: '<path d="M12 3.5v8M7 6.7a7.7 7.7 0 1 0 10 0"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="3.4"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.6"/>',
  chevd: '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  chevr: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.4"/><path d="M15.5 8.5V6.4a1.9 1.9 0 0 0-1.9-1.9H6.4a1.9 1.9 0 0 0-1.9 1.9v7.2a1.9 1.9 0 0 0 1.9 1.9h2.1"/>',
};

// символ → { name, cls }
const G = (name, cls = '') => ({ name, cls });
const GLYPH = {
  '🔒': G('lock'), '🔐': G('lockkey'), '🔑': G('key'), '⚡': G('bolt'), '🗑': G('trash'), '⭐': G('star', 'ic-star'), '✕': G('x'), '✖': G('x'), '✗': G('x'),
  '🔍': G('search'), '▶': G('play', 'ic-fill'), '✎': G('pencil'), '🐍': G('code'), '✂': G('scissors'), '📊': G('chart'), '📈': G('trend'),
  '📥': G('tray'), '⬇': G('down'), '⬆': G('up'), '⇪': G('upload'), '✔': G('check'), '✅': G('checkc'), '⚠': G('warn'), '❗': G('alert'), 'ℹ': G('info'), '⛶': G('fit'),
  '◎': G('target'), '↩': G('undo'), '↶': G('undo'), '↷': G('redo'), '⛔': G('ban'), '👤': G('user'), '👥': G('users'), '📁': G('folder'), '🗂': G('archive'),
  '🌙': G('moon'), '☀': G('sun'), '🛡': G('shield'), '🧩': G('nodes'), '🖼': G('image'), '🔗': G('link'), '⌫': G('backspace'), '▮': G('terminal'),
  '⚙': G('gear'), '💬': G('chat'), '⎋': G('logout'), '❓': G('help'), '✈': G('plane'), '🛠': G('wrench'), '🧾': G('receipt'), '🎟': G('ticket'), '💳': G('card'), '🚀': G('rocket'),
  '🧬': G('dna'), '🟢': G('dot', 'ic-fill ic-green'), '🟣': G('dot', 'ic-fill ic-purple'), '👁': G('eye'), '⏻': G('power'), '▣': G('select'), '▾': G('chevd', 'ic-chev'), '▸': G('chevr', 'ic-chev'),
};

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(`(${Object.keys(GLYPH).map(esc).join('|')})[\\uFE0E\\uFE0F]?`, 'gu');
const SKIP = 'pre, textarea, code, script, style, .term, [data-no-ico], svg';

/** Створює елемент-іконку: ico('lock'), ico('star', 'extra-class'). */
export function ico(name, cls = '') {
  const span = document.createElement('span');
  span.className = `ic${cls ? ' ' + cls : ''}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" xmlns="${NS}">${P[name] || P.dot}</svg>`;
  return span;
}

/** Поле пошуку з власною іконкою лупи зліва (замість емодзі в placeholder). */
export function searchField(input) {
  const w = document.createElement('div');
  w.className = 'search-wrap';
  w.append(ico('search'), input);
  return w;
}

function convertText(node) {
  const text = node.nodeValue;
  RE.lastIndex = 0;
  if (!text || !RE.test(text)) return;
  RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = RE.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const g = GLYPH[m[1]];
    frag.append(ico(g.name, g.cls));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  node.replaceWith(frag);
}

function convertTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest(SKIP)) convertText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest?.(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(convertText);
}

/** Вмикає автозаміну: поточна сторінка + усе, що додається пізніше (меню, модальні вікна, сповіщення). */
export function installIcons() {
  convertTree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => convertTree(n));
      if (m.type === 'characterData') convertTree(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
