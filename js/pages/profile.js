// profile.js — профіль: ім’я, аватар, баланс пакселів, поповнення (Monobank), промокод, активність як у GitHub
import { h, api, state, setUser, toast, fmtInt, fmtDate, fmtDay, onState, assetUrl, setToken, store, promptDialog, confirmDialog, modal } from '../core.js';
import { go } from '../main.js';
import { openPayModal } from '../paymodal.js';

const KIND = {
  login: 'Вхід в акаунт', register: 'Створено акаунт', profile: 'Зміни профілю', project_new: 'Новий проєкт', project_edit: 'Редагування проєкту',
  project_rename: 'Перейменування проєкту', project_delete: 'Видалено проєкт', preview: 'Передперегляд', download: 'Завантаження результату',
  decode: 'Декодування', payment: 'Створено рахунок', payment_ok: 'Оплату підтверджено', promo: 'Промокод', export_py: 'Експорт .py',
  export_vnp: 'Експорт .vnp', import_vnp: 'Імпорт .vnp', logout: 'Вихід', logout_all: 'Вихід на всіх пристроях', password: 'Пароль',
  link: 'Прив’язано спосіб входу', unlink: 'Відв’язано спосіб входу', admin_action: 'Дія адміністратора', autolink_reset: 'Безпека акаунта',
};
const PROVIDERS = [['google', 'Google', '🟢'], ['discord', 'Discord', '🟣']];

function resizeToDataURL(file, side = 384) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = side;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Не вдалося прочитати зображення.'));
    img.src = URL.createObjectURL(file);
  });
}

function heatmap(days) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 52 * 7 - ((today.getDay() + 6) % 7));   // понеділок 52 тижні тому
  const cells = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toLocaleDateString('sv-SE'), n = days[key] || 0;
    const level = n === 0 ? 0 : n < 3 ? 1 : n < 7 ? 2 : n < 14 ? 3 : 4;
    cells.push(h('i', { 'data-l': level, title: `${key}: ${n} дій` }));
  }
  return h('div', { class: 'heat-wrap' }, h('div', { class: 'heat' }, cells));
}

export default {
  async mount(root, r) {
    const wrap = h('div', { class: 'page' });
    root.append(wrap);
    let timer = null;

    async function refreshUser() { const me = await api('/api/me'); setUser(me.user); return me.user; }

    async function checkReturn() {
      if (r.query.linked) { toast(`Акаунт ${r.query.linked === 'google' ? 'Google' : 'Discord'} прив’язано.`, 'ok'); history.replaceState(null, '', '#/profile'); }
      if (r.query.error) { toast(r.query.error, 'error', 9000); history.replaceState(null, '', '#/profile'); }
      if (!r.query.pay) return;
      try {
        const st = await api('/api/payments/' + r.query.pay);
        setUser(st.user);
        if (st.status === 'success') toast(st.kind === 'paxels' ? `Оплату підтверджено: +${st.paxels} пакселів.` : 'Оплату підтверджено — .py доступний для завантаження.', 'ok');
        else if (st.status === 'created') toast('Платіж ще обробляється — оновіть сторінку за хвилину.', 'info');
        else toast('Оплату не завершено.', 'error');
      } finally { history.replaceState(null, '', '#/profile'); }
    }

    async function render() {
      const u = state.user;
      const act = await api('/api/me/activity');
      clearInterval(timer);

      const avatar = u.avatar ? h('img', { class: 'avatar', src: assetUrl(u.avatar), referrerPolicy: 'no-referrer' }) : h('div', { class: 'avatar' }, u.name[0].toUpperCase());
      const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
      fileInput.onchange = async () => {
        const f = fileInput.files[0]; if (!f) return;
        try { const data = await resizeToDataURL(f); const res = await api('/api/me/avatar', { method: 'POST', json: { data } }); setUser(res.user); toast('Аватар оновлено.', 'ok'); render(); }
        catch (e) { toast(e.message, 'error'); }
      };
      const nameInput = h('input', { class: 'input', value: u.name, maxLength: 40 });
      const regenEl = h('small', {});
      const tick = () => {
        if (!u.next_regen) { regenEl.textContent = `Баланс не нижчий за ${u.regen_floor} — відновлення не потрібне.`; return; }
        const ms = new Date(u.next_regen) - Date.now();
        if (ms <= 0) { regenEl.textContent = 'Пакселі відновлюються…'; refreshUser().then(render); clearInterval(timer); return; }
        const m = Math.floor(ms / 60000);
        regenEl.textContent = `Відновлення до ${u.regen_floor} через ${Math.floor(m / 60)} год ${m % 60} хв`;
      };
      tick(); timer = setInterval(tick, 20000);

      const promo = h('input', { class: 'input', placeholder: 'Промокод або код із бота' });
      const premium = u.premium.active && h('div', { class: 'premium-box' },
        h('div', {}, h('span', { class: 'premium-tag' }, 'ПРЕМІУМ'), ' ', u.premium.text && h('b', {}, u.premium.text)),
        h('div', { style: { marginTop: '6px', color: 'var(--muted)' } }, 'дійсний до ', fmtDay(u.premium.until)),
        u.premium.free_py && h('small', {}, 'Безкоштовна генерація .py'));

      const maint = !!state.pub?.pay_maintenance, stars = Object.fromEntries((state.pub?.stars_packs || []).map((p) => [p.paxels, p.stars]));
      const packs = (state.pub?.packs || []).map((p) => h('button', { class: 'pack-btn', title: maint ? `${p.paxels} пакселів за ${stars[p.paxels] ?? '?'} ⭐ (Telegram-бот)` : `Поповнити на ${p.paxels} пакселів за ${p.price_uah} ₴`, onclick: async () => {
        if (maint) { openPayModal({ kind: 'paxels', onPaid: () => render() }); return; }          // основна оплата на технічних роботах → Telegram-бот
        const res = await api('/api/payments/create', { method: 'POST', json: { kind: 'paxels', paxels: p.paxels } });
        if (res.mock) toast('Тестовий режим оплати (mock) — гроші не списуються.', 'warn', 3000);
        location.href = assetUrl(res.page_url);
      } }, h('span', {}, fmtInt(p.paxels)), h('small', {}, maint ? `${stars[p.paxels] ?? '—'} ⭐` : `${p.price_uah} ₴`)));

      const side = h('div', { class: 'card profile-card' },
        h('div', { class: 'profile-avatar' }, avatar, h('button', { title: 'Змінити аватар', onclick: () => fileInput.click() }, '✎'), fileInput),
        h('div', { class: 'name-row' }, nameInput, h('button', { class: 'btn', onclick: async () => {
          const res = await api('/api/me', { method: 'PATCH', json: { name: nameInput.value } }); setUser(res.user); toast('Ім\'я збережено.', 'ok'); render();
        } }, 'Зберегти')),
        h('small', {}, u.email, ' · з ', fmtDay(u.created_at)),
        premium,
        h('div', { class: 'balance' }, h('small', {}, 'Баланс'), h('div', { class: 'big' }, fmtInt(u.paxels), h('small', {}, ' пакс.')), regenEl),
        h('div', { style: { width: '100%' } }, h('div', { class: 'label', style: { textAlign: 'left', marginBottom: '8px' } }, 'Поповнити пакселі'), h('div', { class: 'pack-grid' }, packs)),
        h('div', { class: 'promo-row' }, promo, h('button', { class: 'btn', onclick: async () => {
          const res = await api('/api/promo', { method: 'POST', json: { code: promo.value } }); setUser(res.user); toast(res.message, 'ok'); render();
        } }, 'Активувати')));

      const linkStart = async (id) => {
        const nonce = String(Math.random()).slice(2);
        const res = await api(`/api/auth/link/${id}`, { method: 'POST', json: { return: location.origin, n: nonce } });
        location.href = res.url;
      };
      const providerRows = PROVIDERS.map(([id, label, dot]) => {
        const linked = u.identities.includes(id), available = state.pub?.providers?.[id];
        return h('div', { class: 'sec-row' }, h('span', {}, dot, ' ', h('b', {}, label), ' ', h('small', {}, linked ? 'прив’язано' : available ? 'не прив’язано' : 'не налаштовано на сервері')),
          linked ? h('button', { class: 'btn ghost small', onclick: async () => {
            if (!await confirmDialog(`Відв’язати ${label}?`, 'Ви більше не зможете входити цим способом, доки не прив’яжете його знову.', 'Відв’язати', true)) return;
            const res = await api(`/api/me/identities/${id}`, { method: 'DELETE' }); setUser(res.user); toast('Відв’язано.', 'ok'); render();
          } }, 'Відв’язати') : h('button', { class: 'btn small', disabled: !available, onclick: () => linkStart(id) }, 'Прив’язати'));
      });
      const passwordRow = h('div', { class: 'sec-row' }, h('span', {}, '🔑 ', h('b', {}, 'Пароль'), ' ', h('small', {}, u.has_password ? 'задано' : 'не задано (вхід лише через Google/Discord)')),
        h('button', { class: 'btn small', onclick: async () => {
          const cur = h('input', { class: 'input', type: 'password', placeholder: 'Поточний пароль', autocomplete: 'current-password' });
          const nw = h('input', { class: 'input', type: 'password', placeholder: 'Новий пароль (мін. 8 символів)', autocomplete: 'new-password' });
          const box = h('div', { style: { display: 'grid', gap: '10px' } }, u.has_password && cur, nw);
          const ok = await modal({ title: u.has_password ? 'Змінити пароль' : 'Задати пароль', content: box, actions: [{ label: 'Скасувати', value: false }, { label: 'Зберегти', value: true }] });
          if (!ok) return;
          const res = await api('/api/me/password', { method: 'POST', json: { current: cur.value, new: nw.value } });
          setToken(res.token); toast('Пароль збережено. Інші пристрої вилогінено.', 'ok'); const me = await api('/api/me'); setUser(me.user); render();
        } }, u.has_password ? 'Змінити' : 'Задати'));
      const security = h('div', { class: 'card' }, h('div', { class: 'section-title' }, h('h3', {}, 'Вхід і безпека'), h('small', {}, u.email_verified ? 'пошту підтверджено' : 'пошту не підтверджено')),
        h('div', { class: 'sec-list' }, ...providerRows, passwordRow),
        h('p', { class: 'fine-note' }, 'Якщо ви входите через Google/Discord з тією ж поштою, акаунти об’єднуються автоматично.'),
        h('button', { class: 'btn ghost small', onclick: async () => { await api('/api/auth/logout-all', { method: 'POST' }); setToken(null); setUser(null); store.del('user'); toast('Усі сеанси завершено.', 'ok'); go('/login'); } }, 'Вийти на всіх пристроях'));

      const activeDays = Object.keys(act.days).length;
      const main = h('div', { class: 'stack' },
        security,
        h('div', { class: 'card span-all' },
          h('div', { class: 'section-title' }, h('h3', {}, 'Активність'), h('small', {}, 'останні 12 місяців')),
          h('div', { class: 'stat-row' }, h('div', {}, h('small', {}, 'Усього дій'), h('b', {}, fmtInt(act.total))),
            h('div', {}, h('small', {}, 'Активних днів'), h('b', {}, fmtInt(activeDays))), h('div', {}, h('small', {}, 'Серія днів'), h('b', {}, fmtInt(act.streak)))),
          heatmap(act.days),
          h('div', { class: 'heat-legend' }, 'менше', [0, 1, 2, 3, 4].map((l) => h('i', { style: { background: l ? `color-mix(in srgb, var(--accent) ${[0, 30, 55, 80, 100][l]}%, transparent)` : 'color-mix(in srgb, var(--text) 8%, transparent)' } })), 'більше')),
        h('div', { class: 'card' }, h('div', { class: 'section-title' }, h('h3', {}, 'Остання активність')),
          h('div', { class: 'list' }, act.recent.length ? act.recent.map((a) => h('div', {}, h('span', {}, KIND[a.kind] || a.kind, a.detail ? ` — ${a.detail}` : ''), h('span', { class: 'when' }, fmtDate(a.ts)))) : h('small', {}, 'Поки порожньо.'))),
        h('div', { class: 'card' }, h('div', { class: 'section-title' }, h('h3', {}, 'Рух пакселів')),
          h('div', { class: 'list' }, act.ledger.map((l) => h('div', {}, h('span', {}, l.reason), h('span', { class: 'when' }, h('span', { class: l.delta > 0 ? 'delta-plus' : 'delta-minus' }, (l.delta > 0 ? '+' : '') + l.delta), ` → ${l.balance_after} · ${fmtDate(l.ts)}`))))));

      wrap.replaceChildren(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Профіль'), h('div', { class: 'sub' }, 'Баланс, активність і налаштування акаунта'))),
        h('div', { class: 'profile-grid' }, side, main));
    }

    await checkReturn();
    await refreshUser();
    await render();
    return () => clearInterval(timer);
  },
};
