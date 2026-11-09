// assistant.js — чат-помічник у довідці: питання про сайт і стего. Відповіді дає бекенд (/api/assistant), ключ моделі лишається на сервері.
import { h, api } from './core.js';

const STORE = 'vn_assistant_chat';
const MAX_LEN = 600;
const SUGGEST = ['Як сховати текст у фото?', 'Яку версію стего обрати?', 'Що таке пакселі й як їх купити?', 'Як надіслати фото через Telegram, щоб дані не зникли?'];

function inline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('b', {}, m[1]) : h('code', {}, m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Мінімальний безпечний рендер відповіді: **жирний**, `код`, списки; усе інше — звичайний текст. */
function renderAnswer(text) {
  const nodes = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)/.exec(line), num = /^\d+[.)]\s+(.*)/.exec(line);
    if (bullet || num) {
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { list = { tag, el: h(tag, {}) }; nodes.push(list.el); }
      list.el.append(h('li', {}, ...inline((bullet || num)[1])));
    } else {
      list = null;
      if (line) nodes.push(h('p', {}, ...inline(line.replace(/^#{1,4}\s+/, ''))));
    }
  }
  return nodes;
}

export function createAssistant() {
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORE) || '[]').filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'); } catch { history = []; }
  let busy = false;

  const list = h('div', { class: 'as-list', role: 'log', 'aria-live': 'polite' });
  const input = h('textarea', { class: 'input as-input', rows: 1, maxlength: MAX_LEN, placeholder: 'Спитайте про сайт або стего…', 'aria-label': 'Питання помічнику' });
  const send = h('button', { class: 'btn as-send', type: 'button', 'aria-label': 'Надіслати' }, '➤');
  const clear = h('button', { class: 'as-clear', type: 'button', title: 'Очистити розмову' }, 'Очистити');
  const close = h('button', { class: 'as-close', type: 'button', 'aria-label': 'Закрити' }, '✕');
  const root = h('aside', { class: 'help-chat', 'aria-label': 'Помічник' },
    h('div', { class: 'as-head' }, h('div', {}, h('b', {}, '🤖 Помічник'), h('small', {}, 'Відповіді створює ШІ, він може помилятися')), clear, close),
    list,
    h('div', { class: 'as-foot' }, input, send));

  const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(history.slice(-20))); } catch { /* ігноруємо */ } };
  const scroll = () => { list.scrollTop = list.scrollHeight; };
  const bubble = (role, content) => h('div', { class: `as-msg ${role}` }, ...(role === 'assistant' ? renderAnswer(content) : [content]));

  function paint() {
    list.replaceChildren();
    if (!history.length) {
      list.append(h('div', { class: 'as-hello' }, h('p', {}, 'Привіт! Я відповідаю на питання про VestraNode: версії стего, редактор нод, пакселі, експорт у Python, стегоаналіз.'),
        h('div', { class: 'as-chips' }, SUGGEST.map((q) => h('button', { class: 'as-chip', type: 'button', onclick: () => ask(q) }, q)))));
    } else history.forEach((m) => list.append(bubble(m.role, m.content)));
    scroll();
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
      const r = await api('/api/assistant', { method: 'POST', json: { messages: history.slice(-7) }, silent: true });
      history.push({ role: 'assistant', content: r.answer });
      wait.replaceWith(bubble('assistant', r.answer));
    } catch (e) {
      history.pop();                                       // питання не зараховуємо — його можна надіслати знову
      wait.replaceWith(h('div', { class: 'as-msg err' }, e.offline ? 'Немає зв’язку з сервером.' : (e.message || 'Не вдалося отримати відповідь.')));
      input.value = text; fit();
    }
    busy = false; send.disabled = false; save(); scroll(); input.focus();
  }

  function fit() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  input.addEventListener('input', fit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  send.addEventListener('click', () => ask(input.value));
  clear.addEventListener('click', () => { history = []; save(); paint(); });
  close.addEventListener('click', () => root.classList.remove('open'));
  paint();
  return { el: root, open: () => { root.classList.add('open'); input.focus(); }, toggle: () => root.classList.toggle('open') };
}
