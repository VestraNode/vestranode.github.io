// assistant.js — чат-помічник у довідці: питання про сайт і стего. Відповіді дає бекенд (/api/assistant), ключ моделі лишається на сервері.
import { h, api } from './core.js';
import { ico, hasIcon } from './icons.js';

// розмова живе в пам'яті сторінки: переходи по сайту її зберігають, а перезавантаження (F5, нова вкладка) починає чат заново
let sharedHistory = [];
try { sessionStorage.removeItem('vn_assistant_chat'); } catch { /* ігноруємо */ }
const MAX_LEN = 600;
const SUGGEST = ['Як сховати текст у фото?', 'Яку версію стего обрати?', 'Що таке пакселі й як їх купити?', 'Як надіслати фото через Telegram, щоб дані не зникли?'];

function inline(text, link) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('b', {}, m[1]) : m[2] !== undefined ? h('code', {}, m[2]) : link(m[3], m[4]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Мінімальний безпечний рендер відповіді: **жирний**, `код`, списки; усе інше — звичайний текст. */
// на сайті свої іконки, тож чужих емодзі у відповідях моделі не показуємо (їх просто прибираємо)
const NATIVE_EMOJI = /[\p{Extended_Pictographic}‍️]/gu;

function renderAnswer(text, link) {
  text = String(text).replace(NATIVE_EMOJI, (ch) => (hasIcon(ch) ? ch : '')).replace(/[ \t]+\n/g, '\n');
  const nodes = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)/.exec(line), num = /^\d+[.)]\s+(.*)/.exec(line);
    if (bullet || num) {
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { list = { tag, el: h(tag, {}) }; nodes.push(list.el); }
      list.el.append(h('li', {}, ...inline((bullet || num)[1], link)));
    } else {
      list = null;
      if (line) nodes.push(h('p', {}, ...inline(line.replace(/^#{1,4}\s+/, ''), link)));
    }
  }
  return nodes;
}

const modelName = (id) => String(id || '').replace(/:free$/, '');

/** Плавна поява тексту: слова одне за одним проявляються (opacity), усе тривало не довше ~3 с. */
function reveal(box, done) {
  const words = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const node of texts) {
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.append(part); continue; }
      const span = h('span', { class: 'as-w' }, part);
      words.push(span); frag.append(span);
    }
    node.replaceWith(frag);
  }
  if (!words.length || matchMedia('(prefers-reduced-motion: reduce)').matches) { words.forEach((w) => w.classList.add('on')); done?.(); return; }
  const step = Math.max(12, Math.min(40, 2800 / words.length));
  let i = 0;
  const timer = setInterval(() => {
    for (let k = 0; k < (step < 16 ? 2 : 1) && i < words.length; k++) words[i++].classList.add('on');
    done?.(true);
    if (i >= words.length) { clearInterval(timer); done?.(); }
  }, step);
}

const PAGES = new Set(['/stego', '/analysis', '/projects', '/help', '/profile', '/settings']);
const EXTERNAL = /^https:\/\/(vn\.raimex\.space|github\.com\/VestraNode\/Chunky)(\/[\w\-./#?=&%]*)?$/;

/** helpIds — відомі id статей довідки; openHelp(id) — відкрити статтю без перезавантаження сторінки. */
export function createAssistant({ helpIds = new Set(), openHelp = null } = {}) {
  let history = sharedHistory;
  let busy = false;

  const list = h('div', { class: 'as-list', role: 'log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input as-input', rows: 1, maxlength: MAX_LEN, placeholder: 'Спитайте про сайт або стего…', 'aria-label': 'Питання помічнику' });
  const send = h('button', { class: 'btn as-send', type: 'button', 'aria-label': 'Надіслати' }, ico('plane'));
  const clear = h('button', { class: 'as-clear', type: 'button', title: 'Очистити розмову' }, 'Очистити');
  const close = h('button', { class: 'as-close', type: 'button', 'aria-label': 'Закрити' }, ico('x'));
  const modelLine = h('div', { class: 'as-model' });
  const root = h('aside', { class: 'help-chat', 'aria-label': 'Помічник' },
    h('div', { class: 'as-head' }, h('div', {}, h('b', { class: 'as-title' }, ico('robot'), ' Помічник'), h('small', {}, 'Відповіді створює ШІ, він може помилятися')), clear, close),
    list,
    h('div', { class: 'as-foot' }, input, send),
    modelLine);

  const save = () => { if (history.length > 20) history.splice(0, history.length - 20); };
  const scroll = () => { list.scrollTop = list.scrollHeight; };
  // гіперпосилання з відповіді: лише перевірені адреси (стаття довідки, сторінка сайту, наш репозиторій); усе інше показуємо звичайним текстом
  function link(label, href) {
    const help = /^#\/help\/([\w-]+)$/.exec(href);
    if (help && helpIds.has(help[1])) {
      return h('a', { class: 'as-link', href, onclick: (e) => {
        if (!openHelp) return;
        e.preventDefault(); openHelp(help[1]);
        if (getComputedStyle(root).position === 'fixed') root.classList.remove('open');      // на вузьких екранах панель закриває статтю — ховаємо її
      } }, label);
    }
    if (/^#(\/[a-z]+)$/.test(href) && PAGES.has(href.slice(1))) return h('a', { class: 'as-link', href }, label);
    if (EXTERNAL.test(href)) return h('a', { class: 'as-link', href, target: '_blank', rel: 'noopener noreferrer' }, label);
    return label;
  }
  const bubble = (role, content) => h('div', { class: `as-msg ${role}` }, ...(role === 'assistant' ? renderAnswer(content, link) : [content]));
  const showModel = () => {
    const last = [...history].reverse().find((m) => m.role === 'assistant' && m.model);
    modelLine.textContent = last ? `Модель: ${modelName(last.model)}` : 'Модель підбирається автоматично (безкоштовні моделі OpenRouter)';
  };

  function paint() {
    list.replaceChildren();
    if (!history.length) {
      list.append(h('div', { class: 'as-hello' }, h('p', {}, 'Привіт! Я відповідаю на питання про VestraNode: версії стего, редактор нод, пакселі, експорт у Python, стегоаналіз.'),
        h('div', { class: 'as-chips' }, SUGGEST.map((q) => h('button', { class: 'as-chip', type: 'button', onclick: () => ask(q) }, q)))));
    } else history.forEach((m) => list.append(bubble(m.role, m.content)));
    scroll(); showModel();
  }

  async function ask(text) {
    text = String(text || '').trim().slice(0, MAX_LEN);
    if (!text || busy) return;
    busy = true; send.disabled = true; input.value = ''; fit();
    history.push({ role: 'user', content: text });
    if (history.length === 1) list.replaceChildren();
    list.append(bubble('user', text));
    const wait = h('div', { class: 'as-msg assistant as-wait' }, h('span', {}), h('span', {}), h('span', {}));
    list.append(wait); scroll();
    try {
      const r = await api('/api/assistant', { method: 'POST', json: { messages: history.slice(-7).map(({ role, content }) => ({ role, content })) }, silent: true });
      history.push({ role: 'assistant', content: r.answer, model: r.model });
      const msg = bubble('assistant', r.answer);
      wait.replaceWith(msg); showModel();
      reveal(msg, () => scroll());
    } catch (e) {
      history.pop();                                       // питання не зараховуємо — його можна надіслати знову
      wait.replaceWith(h('div', { class: 'as-msg err' }, e.offline ? 'Немає зв’язку з сервером.' : (e.message || 'Не вдалося отримати відповідь.')));
      input.value = text; fit();
    }
    busy = false; send.disabled = false; save(); scroll(); if (matchMedia('(hover: hover)').matches) input.focus();
  }

  function fit() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  send.addEventListener('click', () => ask(input.value));
  clear.addEventListener('click', () => { history.length = 0; paint(); });
  close.addEventListener('click', () => root.classList.remove('open'));
  paint();
  return { el: root, open: () => { root.classList.add('open'); input.focus(); }, toggle: () => root.classList.toggle('open') };
}
