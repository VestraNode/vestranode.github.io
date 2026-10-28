// admin.js — адмін-панель: огляд, користувачі (пакселі, преміум, блокування…), активність, архів операцій (30 днів), платежі, помилки
import { h, api, toast, modal, confirmDialog, promptDialog, fmtInt, fmtDate, fmtBytes, authUrl, assetUrl, debounce } from '../core.js';
import { triggerDownload } from '../parts.js';
import { searchField } from '../icons.js';

const KIND = { encode: 'Кодування', decode: 'Декодування' };
const ORIGIN = { stego: 'Стего', project: 'Проєкт' };
const PAY = { created: 'очікує', success: 'оплачено', failure: 'відхилено', expired: 'прострочено' };
const PROMO_STATE = { active: ['активний', ''], disabled: ['вимкнено', 'dim'], expired: ['прострочено', 'bad'], exhausted: ['вичерпано', 'gold'] };
const el = (tag, cls, ...kids) => h(tag, { class: cls }, ...kids);

function table(head, rows, empty = 'Порожньо.') {
  if (!rows.length) return h('p', { class: 'fine-note' }, empty);
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))), h('tbody', {}, rows)));
}
const avatarOf = (u) => (assetUrl(u.avatar) ? h('img', { class: 'mini-av', src: assetUrl(u.avatar), referrerPolicy: 'no-referrer' }) : h('span', { class: 'mini-av ph' }, (u.name || '?')[0].toUpperCase()));
const prettyBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : n >= 1024 ? `${Math.round(n / 1024)} КБ` : `${n} Б`);

export default {
  mount(root) {
    const body = h('div', { class: 'admin-body' });
    const tabs = [['overview', '📈 Огляд'], ['users', '👥 Користувачі'], ['activity', '🧾 Активність'], ['ops', '🗂 Архів (30 днів)'], ['payments', '💳 Платежі'], ['promos', '🎟 Промокоди'], ['pyorders', '🐍 Коди .py'], ['config', '⚙ Налаштування'], ['logs', '⚠ Помилки']];
    const seg = h('div', { class: 'seg admin-seg' });
    let tab = sessionStorage.getItem('admin-tab') || 'overview';
    const show = async (id) => {
      tab = id; sessionStorage.setItem('admin-tab', id);
      seg.replaceChildren(...tabs.map(([k, l]) => h('button', { class: k === id ? 'on' : '', onclick: () => show(k) }, l)));
      body.replaceChildren(h('p', { class: 'fine-note' }, 'Завантаження…'));
      try { body.replaceChildren(await VIEWS[id]()); } catch (e) { body.replaceChildren(h('p', { class: 'fine-note' }, 'Помилка: ' + e.message)); }
    };

    // ------------------------------------------------------------- огляд
    async function overview() {
      const s = await api('/api/admin/stats');
      const card = (t, v, sub) => h('div', { class: 'card stat-card' }, h('small', {}, t), h('b', {}, v), sub && h('small', {}, sub));
      return h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' }, card('Користувачів', fmtInt(s.users), `+${s.new_week} за тиждень`), card('Активні за добу', fmtInt(s.active_day)),
          card('Проєктів', fmtInt(s.projects)), card('Операцій в архіві', fmtInt(s.ops), `${s.ops_mb} МБ файлів`), card('Оплачено', `${fmtInt(s.paid_uah)} ₴`),
          card('Заблоковано', fmtInt(s.banned)), card('Помилки за добу', fmtInt(s.errors_day))),
        h('div', { class: 'card' }, h('div', { class: 'section-title' }, h('h3', {}, 'Система')),
          h('div', { class: 'kv-list' }, h('div', {}, h('span', {}, 'Бекенд'), h('b', {}, s.backend)), h('div', {}, h('span', {}, 'База даних'), h('b', {}, s.db === 'supabase' ? 'Supabase (PostgreSQL)' : 'SQLite (локально)')),
            h('div', {}, h('span', {}, 'Сховище файлів'), h('b', {}, s.storage === 'local' ? 'локальне (data/archive)' : 'Supabase Storage')), h('div', {}, h('span', {}, 'Термін зберігання архіву'), h('b', {}, `${s.archive_days} днів`)),
            h('div', {}, h('span', {}, 'Telegram-бот оплати'), h('b', { style: { color: s.telegram.alive ? 'var(--ok)' : 'var(--danger)' } }, !s.telegram.configured ? 'не налаштований (немає токена)' : s.telegram.alive ? `працює на бекенді «${s.telegram.holder}»` : 'не відповідає — запустіть бекенд, де run_telegram_bot = true')),
            h('div', {}, h('span', {}, 'Бот на цьому бекенді'), h('b', {}, s.telegram.runs_here ? 'увімкнено' : 'вимкнено (run_telegram_bot: false)'))),
          h('button', { class: 'btn ghost small', onclick: async () => { const r = await api('/api/admin/cleanup', { method: 'POST' }); toast(`Видалено прострочених записів: ${r.removed}.`, 'ok'); } }, 'Очистити прострочений архів зараз')));
    }

    // ------------------------------------------------------------- користувачі
    async function users() {
      const q = h('input', { class: 'input', placeholder: 'Пошук за поштою, іменем або #id…' });
      const list = h('div', {});
      const load = async () => {
        const d = await api('/api/admin/users?limit=100&q=' + encodeURIComponent(q.value.trim()));
        list.replaceChildren(h('small', { class: 'fine-note' }, `Знайдено: ${d.total}`), table(['', 'Користувач', 'Пакселі', 'Статус', 'Проєктів', 'Операцій', 'Створено', 'Остання активність'],
          d.users.map((u) => h('tr', { class: 'clickable', onclick: () => openUser(u.id) }, h('td', {}, avatarOf(u)),
            h('td', {}, h('b', {}, u.name), h('small', { class: 'blk' }, `#${u.id} · ${u.email}`)), h('td', {}, fmtInt(u.paxels)),
            h('td', {}, u.banned && h('span', { class: 'tag bad' }, 'бан'), u.is_admin && h('span', { class: 'tag' }, 'адмін'), u.premium.active && h('span', { class: 'tag gold' }, 'преміум'), !u.email_verified && h('span', { class: 'tag dim' }, 'пошта ✗')),
            h('td', {}, u.projects), h('td', {}, u.ops), h('td', {}, fmtDate(u.created_at)), h('td', {}, u.last_login ? fmtDate(u.last_login) : '—')))));
      };
      q.oninput = debounce(load, 300);
      await load();
      return h('div', { class: 'stack' }, h('div', { class: 'card' }, searchField(q), list));
    }

    async function openUser(uid) {
      const d = await api('/api/admin/users/' + uid), u = d.user;
      const reload = async () => { box._close(null); await openUser(uid); if (tab === 'users') show('users'); };
      const act = async (json, ok) => { const r = await api('/api/admin/users/' + uid, { method: 'PATCH', json }); toast(ok || r.done.join('; '), 'ok'); await reload(); };
      const paxIn = h('input', { class: 'input num', type: 'number', value: u.paxels });
      const addIn = h('input', { class: 'input num', type: 'number', placeholder: '+/-' });
      const reason = h('input', { class: 'input', placeholder: 'Причина (потрапить в історію)' });
      const premUntil = h('input', { class: 'input', type: 'date', value: u.premium.until ? u.premium.until.slice(0, 10) : '' });
      const premText = h('input', { class: 'input', placeholder: 'Текст після «ПРЕМІУМ»', value: u.premium.text || '' });
      const premPy = h('input', { type: 'checkbox', checked: u.premium.free_py });
      const note = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Нотатка адміна (бачать лише адміни)' }); note.value = u.note || '';
      const project = (p) => h('tr', {}, h('td', {}, `#${p.id}`), h('td', {}, h('b', {}, p.name), p.kind && p.kind !== 'own' && h('span', { class: 'tag dim' }, p.kind)), h('td', {}, p.nodes), h('td', {}, fmtDate(p.updated_at)),
        h('td', { class: 'acts' }, h('button', { class: 'btn ghost small', onclick: async () => { const g = await api('/api/admin/projects/' + p.id); modal({ title: `Проєкт «${g.name}»`, content: h('pre', { class: 'json-box' }, JSON.stringify(g.graph, null, 2)), actions: [{ label: 'Закрити', value: null }] }); } }, 'Граф'),
          h('button', { class: 'btn ghost small', onclick: () => triggerDownload(`/api/admin/projects/${p.id}/export.vnp`) }, '⬇ .vnp'),
          h('button', { class: 'btn danger small', onclick: async () => { if (await confirmDialog('Видалити проєкт?', `«${p.name}» буде видалено.`, 'Видалити', true)) { await api('/api/admin/projects/' + p.id, { method: 'DELETE' }); toast('Видалено.', 'ok'); await reload(); } } }, '🗑')));
      const content = h('div', { class: 'user-sheet' },
        h('div', { class: 'us-head' }, avatarOf(u), h('div', {}, h('h3', {}, u.name), h('small', {}, `#${u.id} · ${u.email} · ${u.email_verified ? 'пошту підтверджено' : 'пошту НЕ підтверджено'}`)),
          u.banned && h('span', { class: 'tag bad' }, 'заблоковано'), u.is_admin && h('span', { class: 'tag' }, 'адмін')),
        h('div', { class: 'us-grid' },
          h('div', { class: 'card' }, h('h4', {}, 'Пакселі'), h('div', { class: 'row-gap' }, paxIn, h('button', { class: 'btn small', onclick: () => act({ paxels: +paxIn.value, reason: reason.value }) }, 'Встановити')),
            h('div', { class: 'row-gap', style: { marginTop: '8px' } }, addIn, h('button', { class: 'btn small', onclick: () => act({ paxels_delta: +addIn.value, reason: reason.value }) }, 'Додати / відняти')), reason),
          h('div', { class: 'card' }, h('h4', {}, u.premium.active ? `Преміум до ${u.premium.until.slice(0, 10)}` : 'Преміум'), premUntil, premText,
            h('label', { class: 'check' }, premPy, h('span', {}, 'Безкоштовна генерація .py')),
            h('div', { class: 'row-gap' }, h('button', { class: 'btn small', onclick: () => act({ premium: { until: premUntil.value, text: premText.value, free_py: premPy.checked } }) }, 'Видати'),
              u.premium.active && h('button', { class: 'btn ghost small', onclick: () => act({ premium: null }) }, 'Забрати'))),
          h('div', { class: 'card' }, h('h4', {}, 'Акаунт'), h('div', { class: 'row-gap' },
            h('button', { class: 'btn ghost small', onclick: async () => { const n = await promptDialog('Змінити ім’я', u.name); if (n) act({ name: n }); } }, '✎ Ім’я'),
            u.banned ? h('button', { class: 'btn small', onclick: () => act({ banned: false }) }, 'Розблокувати')
              : h('button', { class: 'btn danger small', onclick: async () => { const r = await promptDialog('Заблокувати користувача', '', 'Причина (побачить користувач)', 'Заблокувати'); if (r !== null) act({ banned: true, ban_reason: r }); } }, '⛔ Заблокувати'),
            h('button', { class: 'btn ghost small', onclick: () => act({ force_logout: true }) }, 'Завершити сеанси'),
            u.has_password && h('button', { class: 'btn ghost small', onclick: () => act({ clear_password: true }) }, 'Скинути пароль'),
            h('button', { class: 'btn ghost small', onclick: () => act({ reset_avatar: true }) }, 'Скинути аватар'),
            h('button', { class: 'btn ghost small', onclick: () => act({ email_verified: !u.email_verified }) }, u.email_verified ? 'Зняти підтвердження пошти' : 'Підтвердити пошту'),
            !u.is_admin && h('button', { class: 'btn danger small', onclick: async () => { if (await confirmDialog('Видалити акаунт?', `${u.email} і всі його дані (проєкти, архів) буде видалено без відновлення.`, 'Видалити', true)) { await api('/api/admin/users/' + uid, { method: 'DELETE' }); toast('Акаунт видалено.', 'ok'); box._close(null); if (tab === 'users') show('users'); } } }, '🗑 Видалити акаунт')),
            h('div', { class: 'row-gap', style: { marginTop: '8px' } }, d.identities.map((i) => h('span', { class: 'tag' }, i.provider, h('button', { class: 'x', title: 'Відв’язати', onclick: async () => { await api(`/api/admin/users/${uid}/identities/${i.provider}`, { method: 'DELETE' }); toast('Відв’язано.', 'ok'); await reload(); } }, '✕'))),
              !d.identities.length && h('small', {}, 'Немає прив’язаних Google/Discord'))),
          h('div', { class: 'card' }, h('h4', {}, 'Нотатка'), note, h('button', { class: 'btn small', onclick: () => act({ note: note.value }, 'Нотатку збережено.') }, 'Зберегти'))),
        h('h4', {}, `Проєкти (${d.projects.length})`), table(['id', 'Назва', 'Нод', 'Змінено', ''], d.projects.map(project), 'Проєктів немає.'),
        h('h4', {}, `Архів операцій (${d.ops.length})`), opsTable(d.ops, () => { box._close(null); }),
        h('h4', {}, 'Платежі'), table(['Дата', 'Тип', 'Сума', 'Статус'], d.payments.map((p) => h('tr', {}, h('td', {}, fmtDate(p.created_at)), h('td', {}, p.kind === 'paxels' ? `${p.paxels} пакс.` : '.py'), h('td', {}, `${p.amount_uah} ₴`), h('td', {}, PAY[p.status] || p.status))), 'Платежів немає.'),
        h('h4', {}, 'Рух пакселів'), table(['Дата', 'Зміна', 'Причина', 'Баланс'], d.ledger.map((l) => h('tr', {}, h('td', {}, fmtDate(l.ts)), h('td', { class: l.delta > 0 ? 'delta-plus' : 'delta-minus' }, (l.delta > 0 ? '+' : '') + l.delta), h('td', {}, l.reason), h('td', {}, l.balance_after)))),
        h('h4', {}, 'Остання активність'), table(['Дата', 'Подія', 'Деталі', 'IP'], d.activity.map((a) => h('tr', {}, h('td', {}, fmtDate(a.ts)), h('td', {}, a.kind), h('td', {}, a.detail), h('td', {}, a.ip || '')))));
      let box;
      const p = modal({ title: 'Користувач', content: content, actions: [{ label: 'Закрити', value: null }] });
      box = document.querySelector('#modal-root .modal:last-child'); box.classList.add('wide');
    }

    // ------------------------------------------------------------- архів
    function opsTable(items, onOpen) {
      return table(['Дата', 'Тип', 'Звідки', 'Версія', 'Текст', 'Файли', 'Діє до', ''], items.map((o) => h('tr', { class: 'clickable', onclick: () => { onOpen && onOpen(); openOp(o.id); } },
        h('td', {}, fmtDate(o.created_at)), h('td', {}, h('span', { class: `tag ${o.kind === 'decode' ? 'gold' : ''}` }, KIND[o.kind] || o.kind)), h('td', {}, ORIGIN[o.origin] || o.origin), h('td', {}, o.version),
        h('td', { class: 'ellip' }, o.text_preview || '—'), h('td', {}, o.files.length ? `${o.files.length} · ${prettyBytes(o.size_bytes)}` : '—'), h('td', {}, fmtDate(o.expires_at)), h('td', {}, '›'))), 'Записів немає.');
    }

    async function openOp(id) {
      const o = await api('/api/admin/ops/' + id);
      const imgs = o.files.filter((f) => f.type.startsWith('image/')).map((f) => h('figure', { class: 'op-fig' },
        h('a', { href: authUrl(`/api/admin/ops/${id}/file/${f.name}`), target: '_blank', rel: 'noopener' }, h('img', { src: authUrl(`/api/admin/ops/${id}/file/${f.name}`), alt: f.name })),
        h('figcaption', {}, f.name, ' · ', prettyBytes(f.size), ' · ', h('a', { href: authUrl(`/api/admin/ops/${id}/file/${f.name}?download=1`) }, 'завантажити'))));
      modal({ title: `${KIND[o.kind] || o.kind} · ${o.email || '#' + o.user_id}`, content: h('div', { class: 'op-view' },
        h('div', { class: 'kv-list' }, h('div', {}, h('span', {}, 'Користувач'), h('b', {}, `${o.user_name || ''} (${o.email || '#' + o.user_id})`)), h('div', {}, h('span', {}, 'Коли'), h('b', {}, fmtDate(o.created_at))),
          h('div', {}, h('span', {}, 'Звідки / версія'), h('b', {}, `${ORIGIN[o.origin] || o.origin} · ${o.version}${o.project_id ? ' · проєкт #' + o.project_id : ''}`)), h('div', {}, h('span', {}, 'Параметри'), h('b', {}, Object.entries(o.params).map(([k, v]) => `${k}=${v}`).join(', ') || '—')),
          h('div', {}, h('span', {}, 'Видалиться'), h('b', {}, fmtDate(o.expires_at)))),
        imgs.length ? h('div', { class: 'op-figs' }, imgs) : h('p', { class: 'fine-note' }, 'Файли не збережено (результат не завантажували або файл завеликий).'),
        h('h4', {}, `${o.kind === 'decode' ? 'Розкодований текст' : 'Текст, який ховали'} (${fmtInt(o.text_len)} символів)`), h('pre', { class: 'json-box' }, o.text || '—'),
        h('h4', {}, 'Лог операції'), h('div', { class: 'op-log' }, o.logs.map((l) => h('div', { class: l.level }, `[${l.t}] ${l.src}: ${l.msg}`)))),
        actions: [{ label: 'Закрити', value: null }, { label: '🗑 Видалити запис', value: 'del', cls: 'danger' }] }).then(async (v) => {
        if (v === 'del' && await confirmDialog('Видалити запис архіву?', 'Текст і файли буде видалено остаточно.', 'Видалити', true)) { await api('/api/admin/ops/' + id, { method: 'DELETE' }); toast('Видалено.', 'ok'); if (tab === 'ops') show('ops'); }
      });
      document.querySelector('#modal-root .modal:last-child')?.classList.add('wide');
    }

    async function ops() {
      const q = h('input', { class: 'input', placeholder: 'Пошук за текстом…' }), uid = h('input', { class: 'input num', placeholder: 'id користувача' });
      const kind = h('div', { class: 'seg' });
      let k = '';
      const list = h('div', {});
      const load = async () => {
        kind.replaceChildren(...[['', 'Усі'], ['encode', 'Кодування'], ['decode', 'Декодування']].map(([v, l]) => h('button', { class: k === v ? 'on' : '', onclick: () => { k = v; load(); } }, l)));
        const d = await api(`/api/admin/ops?limit=100&kind=${k}&q=${encodeURIComponent(q.value)}&user_id=${uid.value}`);
        list.replaceChildren(opsTable(d.items.map((o) => ({ ...o })), null));
        // додаємо колонку користувача в підказку
      };
      q.oninput = debounce(load, 300); uid.oninput = debounce(load, 300);
      await load();
      return h('div', { class: 'card' }, h('p', { class: 'fine-note' }, 'Тексти й параметри зберігаються 30 днів; фото — лише якщо результат завантажили (кодування) або це декодування.'), h('div', { class: 'row-gap' }, searchField(q), uid, kind), list);
    }

    // ------------------------------------------------------------- активність
    async function activity() {
      const q = h('input', { class: 'input', placeholder: 'Пошук у деталях…' }), uid = h('input', { class: 'input num', placeholder: 'id користувача' }), kind = h('select', { class: 'input' });
      const tbody = h('tbody', {}), more = h('button', { class: 'btn ghost', hidden: true }, 'Показати ще');
      let last = null;
      const fetchPage = async (reset) => {
        if (reset) { last = null; tbody.replaceChildren(); }
        const d = await api(`/api/admin/activity?limit=60&q=${encodeURIComponent(q.value)}&user_id=${uid.value}&kind=${kind.value}${last ? '&before=' + last : ''}`);
        if (!kind.options.length) { kind.append(new Option('усі події', ''), ...d.kinds.map((x) => new Option(x, x))); }
        d.items.forEach((a) => tbody.append(h('tr', {}, h('td', {}, fmtDate(a.ts)), h('td', {}, a.email ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); openUser(a.user_id); } }, a.email) : `#${a.user_id}`), h('td', {}, h('span', { class: 'tag dim' }, a.kind)), h('td', {}, a.detail), h('td', {}, a.ip || ''))));
        if (d.items.length) last = d.items[d.items.length - 1].id;
        more.hidden = d.items.length < 60;
      };
      q.oninput = debounce(() => fetchPage(true), 300); uid.oninput = debounce(() => fetchPage(true), 300); kind.onchange = () => fetchPage(true); more.onclick = () => fetchPage(false);
      await fetchPage(true);
      return h('div', { class: 'card' }, h('div', { class: 'row-gap' }, searchField(q), uid, kind),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Час', 'Користувач', 'Подія', 'Деталі', 'IP'].map((t) => h('th', {}, t)))), tbody)), more);
    }

    async function payments() {
      const d = await api('/api/admin/payments?limit=100');
      return h('div', { class: 'card' }, table(['Дата', 'Користувач', 'Тип', 'Сума', 'Статус', 'Оплачено'], d.items.map((p) => h('tr', {}, h('td', {}, fmtDate(p.created_at)),
        h('td', {}, p.email || `#${p.user_id}`), h('td', {}, p.kind === 'paxels' ? `${p.paxels} пакс.` : '.py'), h('td', {}, `${p.amount_uah} ₴`), h('td', {}, PAY[p.status] || p.status), h('td', {}, p.paid_at ? fmtDate(p.paid_at) : '—'))), 'Платежів ще не було.'));
    }


    // ------------------------------------------------------------- промокоди
    function promoForm(p) {
      const edit = !!p, v = p || { type: 'paxels', paxels: 100, max_uses: 1, expires_at: '', free_py: false, premium_text: '', note: '', disabled: false };
      const code = h('input', { class: 'input', placeholder: 'наприклад SUMMER-100', value: v.code || '', disabled: edit, autocomplete: 'off' });
      const type = h('select', { class: 'input' }, new Option('Пакселі', 'paxels'), new Option('Преміум', 'premium')); type.value = v.type;
      const paxels = h('input', { class: 'input num', type: 'number', min: 1, value: v.paxels ?? 100 });
      const text = h('input', { class: 'input', placeholder: 'Текст після «ПРЕМІУМ» (напр. Founder)', value: v.premium_text || '' });
      const freePy = h('input', { type: 'checkbox', checked: !!v.free_py });
      const untilLabel = h('span', {});
      const until = h('input', { class: 'input', type: 'date', value: (v.expires_at || '').slice(0, 10) });
      const max = h('input', { class: 'input num', type: 'number', min: 1, placeholder: 'без обмеження', value: v.max_uses ?? '' });
      const note = h('input', { class: 'input', placeholder: 'Нотатка (бачите лише ви)', value: v.note || '' });
      const off = h('input', { type: 'checkbox', checked: !!v.disabled });
      const rowPax = h('label', { class: 'field' }, h('span', {}, 'Скільки пакселів дає'), paxels);
      const rowPrem = h('label', { class: 'field' }, h('span', {}, 'Текст після «ПРЕМІУМ»'), text);
      const rowFree = h('label', { class: 'check span2' }, freePy, h('span', {}, 'Безкоштовна генерація .py'));
      const sync = () => {
        rowPax.hidden = type.value !== 'paxels'; rowPrem.hidden = rowFree.hidden = type.value !== 'premium';
        untilLabel.textContent = type.value === 'premium' ? 'Преміум діє до (обов’язково)' : 'Можна активувати до (порожньо — без терміну)';
      };
      type.onchange = sync; sync();
      let box;
      const save = async () => {
        const json = { code: code.value.trim(), type: type.value, paxels: type.value === 'paxels' ? +paxels.value : null, premium_text: text.value, free_py: freePy.checked,
          expires_at: until.value, max_uses: max.value === '' ? null : +max.value, note: note.value, disabled: off.checked };
        await api(edit ? '/api/admin/promos/' + encodeURIComponent(v.code) : '/api/admin/promos', { method: edit ? 'PATCH' : 'POST', json });
        toast(edit ? 'Промокод збережено.' : 'Промокод створено.', 'ok'); box._close(null); show('promos');
      };
      const content = h('div', { class: 'promo-form' },
        h('label', { class: 'field span2' }, h('span', {}, 'Код'), code),
        h('label', { class: 'field' }, h('span', {}, 'Тип'), type), rowPax, rowPrem, rowFree,
        h('label', { class: 'field' }, untilLabel, until),
        h('label', { class: 'field' }, h('span', {}, 'Скільки разів можна активувати всього'), max),
        h('label', { class: 'field span2' }, h('span', {}, 'Нотатка'), note),
        h('label', { class: 'check span2' }, off, h('span', {}, 'Вимкнено (код не працює, але не видаляється)')),
        h('div', { class: 'promo-foot span2' }, h('button', { class: 'btn', onclick: save }, edit ? 'Зберегти' : 'Створити'),
          h('small', { class: 'fine-note' }, 'Кожен користувач може активувати код лише раз.')));
      modal({ title: edit ? `Промокод ${v.code}` : 'Новий промокод', content, actions: [{ label: 'Закрити', value: null }] });
      box = document.querySelector('#modal-root .modal:last-child'); box.classList.add('promo-box');
    }

    async function promoUses(p) {
      const d = await api(`/api/admin/promos/${encodeURIComponent(p.code)}/uses`);
      modal({ title: `Хто використав ${p.code}`, content: table(['Користувач', 'Коли'], d.items.map((u) => h('tr', {}, h('td', {}, u.email ? `${u.name} · ${u.email}` : `#${u.user_id}`), h('td', {}, fmtDate(u.used_at)))), 'Ще ніхто не використовував.'),
        actions: [{ label: 'Закрити', value: null }] });
    }

    async function promos() {
      const d = await api('/api/admin/promos');
      const reward = (p) => (p.type === 'paxels' ? `+${fmtInt(p.paxels)} пакс.` : `Преміум${p.premium_text ? ' · ' + p.premium_text : ''}${p.free_py ? ' · .py безкоштовно' : ''}`);
      return h('div', { class: 'card' },
        h('div', { class: 'row-gap', style: { justifyContent: 'space-between' } }, h('p', { class: 'fine-note' }, 'Промокоди зберігаються в базі й діють на всіх бекендах. Файл promos.json — лише початкове наповнення.'),
          h('button', { class: 'btn', onclick: () => promoForm(null) }, '＋ Новий промокод')),
        table(['Код', 'Нагорода', 'Діє до', 'Використано', 'Стан', 'Нотатка', ''], d.items.map((p) => {
          const [label, cls] = PROMO_STATE[p.state] || [p.state, 'dim'];
          return h('tr', {}, h('td', {}, h('b', {}, p.code)), h('td', {}, reward(p)), h('td', {}, p.expires_at ? fmtDate(p.expires_at) : '—'),
            h('td', {}, p.max_uses == null ? `${p.used} / ∞` : `${p.used} / ${p.max_uses}`), h('td', {}, h('span', { class: `tag ${cls}` }, label)), h('td', { class: 'ellip' }, p.note || ''),
            h('td', { class: 'acts' }, h('button', { class: 'btn ghost small', onclick: () => promoForm(p) }, '✎ Змінити'), h('button', { class: 'btn ghost small', onclick: () => promoUses(p) }, 'Хто використав'),
              h('button', { class: 'btn danger small', onclick: async () => { if (await confirmDialog('Видалити промокод?', `${p.code} буде видалено разом з історією його використань.`, 'Видалити', true)) { await api('/api/admin/promos/' + encodeURIComponent(p.code), { method: 'DELETE' }); toast('Видалено.', 'ok'); show('promos'); } } }, '🗑')));
        }), 'Промокодів ще немає.'));
    }

    // ------------------------------------------------------------- коди завантаження .py
    async function pyorders() {
      const q = h('input', { class: 'input', placeholder: 'Ключ, пошта, назва або #id проєкту…' });
      const seg2 = h('div', { class: 'seg' }), list = h('div', {}), count = h('small', { class: 'fine-note' });
      let st = '';
      const load = async () => {
        seg2.replaceChildren(...[['', 'Усі'], ['created', 'Очікують оплати'], ['paid', 'Оплачені']].map(([v, l]) => h('button', { class: st === v ? 'on' : '', onclick: () => { st = v; load(); } }, l)));
        const d = await api(`/api/admin/py-orders?limit=200&status=${st}&q=${encodeURIComponent(q.value.trim())}`);
        count.textContent = `Оплачені: ${d.counts.paid} · очікують: ${d.counts.created}`;
        list.replaceChildren(table(['Ключ', 'Користувач', 'Проєкт', 'Нод', 'Ціна', 'Статус', 'Оплат', 'Створено', 'Оновлено', 'Оплачено', ''], d.items.map((o) => h('tr', {},
          h('td', {}, h('button', { class: 'linkish mono', title: 'Скопіювати ключ', onclick: () => { navigator.clipboard?.writeText(o.key); toast('Ключ скопійовано.', 'ok'); } }, o.key_pretty)),
          h('td', {}, o.email ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); openUser(o.user_id); } }, o.email) : `#${o.user_id}`),
          h('td', {}, o.project_name ? `#${o.project_id} · ${o.project_name}` : `#${o.project_id} (видалено)`), h('td', {}, o.nodes), h('td', {}, `${o.price_uah} ₴ · ${o.stars} ★`),
          h('td', {}, h('span', { class: `tag ${o.status === 'paid' ? 'gold' : 'dim'}` }, o.status === 'paid' ? 'оплачено' : o.paid_count ? 'змінено, чекає оплати' : 'очікує оплати')),
          h('td', {}, o.paid_count || 0), h('td', {}, fmtDate(o.created_at)), h('td', {}, fmtDate(o.updated_at)),
          h('td', { title: o.charge_id ? `Платіж: ${o.charge_id}` : '' }, o.paid_at ? fmtDate(o.paid_at) + (o.tg_user_id ? ` · tg ${o.tg_user_id}` : '') : '—'),
          h('td', { class: 'acts' }, o.status !== 'paid' && h('button', { class: 'btn ghost small', title: 'Якщо зірки надійшли, а бот не зарахував', onclick: async () => {
            if (await confirmDialog('Підтвердити оплату вручну?', `Ключ ${o.key_pretty}: проєкт буде зараховано як куплений, без перевірки платежу в Telegram.`, 'Підтвердити')) { await api(`/api/admin/py-orders/${o.key}/complete`, { method: 'POST' }); toast('Оплату підтверджено.', 'ok'); load(); }
          } }, 'Підтвердити оплату')))), 'Ключів ще немає: вони створюються, коли користувач уперше натискає «Завантажити .py».'));
      };
      q.oninput = debounce(load, 300);
      await load();
      return h('div', { class: 'card' }, h('p', { class: 'fine-note' }, 'У кожного проєкту один постійний ключ: він створюється при першому натисканні «Завантажити .py», а при кожному наступному натисканні дані ключа (кількість нод, ціна) оновлюються, якщо проєкт змінився.'),
        h('div', { class: 'row-gap' }, searchField(q), seg2), count, list);
    }

    // ------------------------------------------------------------- спільні налаштування (зберігаються в БД, однакові на всіх бекендах)
    async function configView() {
      const d = await api('/api/admin/config');
      return h('div', { class: 'stack' }, h('p', { class: 'fine-note' }, 'Ціни, пакети й тексти зберігаються в базі й діють на всіх бекендах (до 5 с). Файли в backend/config лише наповнили БД при першому запуску. Секрети (токени, паролі) тут не редагуються.'),
        ...d.items.map((it) => {
          const ta = h('textarea', { class: 'textarea mono', rows: 12, spellcheck: false }); ta.value = JSON.stringify(it.data, null, 2);
          const apply = (r) => { ta.value = JSON.stringify(r.item.data, null, 2); };
          return h('div', { class: 'card' }, h('div', { class: 'section-title' }, h('h3', {}, it.title), h('small', {}, it.keys ? `Ключі: ${it.keys.join(', ')}` : 'Увесь конфіг')), ta,
            h('div', { class: 'row-gap' },
              h('button', { class: 'btn small', onclick: async () => { let data; try { data = JSON.parse(ta.value); } catch { return toast('Некоректний JSON.', 'error'); } apply(await api('/api/admin/config/' + it.name, { method: 'PUT', json: { data } })); toast('Збережено.', 'ok'); } }, 'Зберегти'),
              h('button', { class: 'btn ghost small', onclick: async () => { if (await confirmDialog('Повернути значення з файлу?', 'Поточні значення в БД буде замінено значеннями з конфіг-файлу.', 'Повернути')) { apply(await api(`/api/admin/config/${it.name}/reset`, { method: 'POST' })); toast('Повернуто.', 'ok'); } } }, 'Скинути до файлу')));
        }));
    }

    async function logs() {
      const d = await api('/api/admin/logs?limit=150');
      return h('div', { class: 'card' }, table(['Час', 'Рівень', 'Джерело', 'Повідомлення', 'Шлях', 'IP'], d.items.map((l) => h('tr', {}, h('td', {}, fmtDate(l.ts)),
        h('td', {}, h('span', { class: `tag ${l.level === 'error' ? 'bad' : 'gold'}` }, l.level)), h('td', {}, l.source), h('td', { class: 'ellip wide' }, l.message), h('td', {}, l.path || ''), h('td', {}, l.ip || ''))), 'Помилок не було.'));
    }

    const VIEWS = { overview, users, activity, ops, payments, promos, pyorders, config: configView, logs };
    root.append(h('div', { class: 'page admin-page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, '🛡 Адмін-панель'), h('div', { class: 'sub' }, 'Користувачі, пакселі, проєкти та архів операцій')), seg), body));
    show(VIEWS[tab] ? tab : 'overview');
  },
};
