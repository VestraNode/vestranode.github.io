// paymodal.js — вікно «основна оплата на технічних роботах»: тимчасова оплата зірками через Telegram-бота (посилання + стилізований QR)
import { h, api, state, toast, setUser, modal, assetUrl, backend } from './core.js';
import { triggerDownload } from './parts.js';

/** Стилізований QR із «рідкою» згладженістю: сусідні пікселі зливаються в одну форму, зовнішні кути заокруглені, внутрішні (увігнуті) згладжені.
 *  Параметри підібрано так, щоб код читався (перевірено декодером OpenCV): сильніше заокруглення ламає розпізнавання «очей». rows — масив рядків "0101…". */
export function qrSvg(rows, { size = 220, round = 0.42, fillet = 0.32, eye = 0.75 } = {}) {
  const n = rows.length, q = 2, total = n + q * 2, id = 'qg' + Math.random().toString(36).slice(2, 7);
  const on = (x, y) => y >= 0 && x >= 0 && y < n && x < n && rows[y][x] === '1';
  const inFinder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const on2 = (x, y) => on(x, y) && !inFinder(x, y);                       // «очі» малюються окремо
  const f = (v) => +v.toFixed(3), d = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!on2(x, y)) continue;
    const t = on2(x, y - 1), b = on2(x, y + 1), l = on2(x - 1, y), r = on2(x + 1, y), X = x + q, Y = y + q;
    // радіус кута > 0 лише там, де обидва сусіди з цього боку порожні (зовнішній кут)
    const tl = !t && !l ? round : 0, tr = !t && !r ? round : 0, br = !b && !r ? round : 0, bl = !b && !l ? round : 0;
    d.push(`M${f(X + tl)} ${Y}H${f(X + 1 - tr)}${tr ? `A${tr} ${tr} 0 0 1 ${X + 1} ${f(Y + tr)}` : ''}V${f(Y + 1 - br)}${br ? `A${br} ${br} 0 0 1 ${f(X + 1 - br)} ${Y + 1}` : ''}H${f(X + bl)}${bl ? `A${bl} ${bl} 0 0 1 ${X} ${f(Y + 1 - bl)}` : ''}V${f(Y + tl)}${tl ? `A${tl} ${tl} 0 0 1 ${f(X + tl)} ${Y}` : ''}Z`);
    // увігнуті кути: обидва сусіди по сторонах є, а по діагоналі порожньо — додаємо плавне «заливання»
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (on2(x + dx, y) && on2(x, y + dy) && !on2(x + dx, y + dy)) {
        const px = X + (dx > 0 ? 1 : 0), py = Y + (dy > 0 ? 1 : 0), sweep = dx * dy > 0 ? 0 : 1;
        d.push(`M${px} ${py}H${f(px + dx * fillet)}A${fillet} ${fillet} 0 0 ${sweep} ${px} ${f(py + dy * fillet)}Z`);
      }
    }
  }
  const eyeSvg = (cx, cy) => `<rect x="${cx + q + 0.5}" y="${cy + q + 0.5}" width="6" height="6" rx="${eye}" fill="none" stroke="url(#${id})" stroke-width="1"/><rect x="${cx + q + 2}" y="${cy + q + 2}" width="3" height="3" rx="${eye / 2}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="geometricPrecision" role="img" aria-label="QR-код">`
    + `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${total}" y2="${total}"><stop offset="0" stop-color="#4c3fd1"/><stop offset="1" stop-color="#d6336c"/></linearGradient></defs>`
    + `<g fill="url(#${id})"><path d="${d.join('')}"/>${eyeSvg(0, 0)}${eyeSvg(n - 7, 0)}${eyeSvg(0, n - 7)}</g></svg>`;
  return h('div', { class: 'qr-tile', html: svg });
}

const copy = async (text, ok = 'Скопійовано.') => {
  try { await navigator.clipboard.writeText(text); toast(ok, 'ok', 2500); } catch { toast('Не вдалося скопіювати — виділіть і скопіюйте вручну.', 'error'); }
};

const botBlock = (info, deep) => {
  const url = deep && info.deep_url ? info.deep_url : info.url, qr = deep && info.qr_deep ? info.qr_deep : info.qr;
  if (!info.enabled) return h('div', { class: 'pay-bot off' }, h('b', {}, 'Бот ще не налаштований'), h('small', {}, 'Адміністратор має вказати bot_username у backend/config/telegram.json.'));
  return h('div', { class: 'pay-bot' }, qr ? qrSvg(qr, { size: 176 }) : null,
    h('div', { class: 'pay-bot-info' }, h('small', {}, 'Telegram-бот оплати'), h('b', {}, '@' + info.username),
      h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, '✈ Відкрити бота'),
      h('small', {}, 'Або наведіть камеру телефона на QR-код.')));
};

const maintenanceNote = () => h('div', { class: 'pay-maint' }, h('span', {}, '🛠'),
  h('div', {}, h('b', {}, 'Основна система оплати наразі на технічних роботах.'), h('small', {}, 'Тому тимчасово працює оплата зірками Telegram ⭐ через бота.')));

/** Вікно оплати: kind='paxels' (пакети + код) або kind='py' (ключ замовлення + очікування оплати). */
export async function openPayModal({ kind, projectId, onPaid } = {}) {
  if (backend.down) return toast('Немає зв\'язку з сервером.', 'error');
  let order = null, timer = 0, closed = false, box;
  const close = () => { closed = true; clearInterval(timer); box?._close(null); };
  const body = h('div', { class: 'pay-modal' });
  let info;
  try {
    if (kind === 'py') order = await api(`/api/projects/${projectId}/py/order`, { method: 'POST' });
    info = await api('/api/pay/info' + (order ? `?order=${order.key}` : ''));
  } catch (e) { return; }

  if (kind === 'paxels') {
    const promo = h('input', { class: 'input', placeholder: 'PAX-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: false });
    const redeem = async () => {
      if (!promo.value.trim()) return toast('Введіть код із бота.', 'error');
      const res = await api('/api/promo', { method: 'POST', json: { code: promo.value } });
      setUser(res.user); toast(res.message, 'ok'); close(); onPaid?.(res);
    };
    promo.addEventListener('keydown', (e) => { if (e.key === 'Enter') redeem(); });
    body.append(maintenanceNote(), botBlock(info, false),
      h('ol', { class: 'pay-steps' }, h('li', {}, 'Відкрийте бота й натисніть «Купити пакселі».'),
        h('li', {}, 'Оберіть пакет: ', ...(info.packs || []).map((p, i) => h('span', { class: 'chip' }, `${p.paxels} — ${p.stars}⭐`))),
        h('li', {}, 'Оплатіть зірками. Бот надішле ', h('b', {}, 'одноразовий код'), '.'), h('li', {}, 'Введіть код нижче — пакселі одразу зарахуються.')),
      h('div', { class: 'pay-redeem' }, promo, h('button', { class: 'btn', onclick: redeem }, 'Зарахувати')));
  } else {
    const statusEl = h('div', { class: 'pay-status' }, h('span', { class: 'spin' }), 'Очікуємо оплату…');
    const keyEl = h('button', { class: 'pay-key', title: 'Натисніть, щоб скопіювати', onclick: () => copy(order.key_pretty, 'Ключ скопійовано.') }, order.key_pretty, h('small', {}, '⧉'));
    const done = (o) => {
      statusEl.replaceChildren(h('b', {}, '✅ Оплачено!'), h('span', {}, ' Проєкт додано до «Проєктів» як куплений — Python-код можна завантажувати безліч разів.'));
      body.append(h('div', { class: 'row-gap', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', onclick: () => { triggerDownload(`/api/projects/${o.result_project_id}/export.py`); } }, '⬇ Завантажити .py'),
        h('button', { class: 'btn ghost', onclick: () => { close(); location.hash = `#/project/${o.result_project_id}`; } }, 'Відкрити куплений проєкт')));
      toast('Оплату підтверджено.', 'ok'); onPaid?.(o);
    };
    const poll = async () => {
      if (closed) return;
      try { const o = await api(`/api/py/order/${order.key}`, { silent: true }); if (o.status === 'paid') { clearInterval(timer); done(o); } } catch { /* пробуємо ще */ }
    };
    body.append(maintenanceNote(),
      h('div', { class: 'pay-order' }, h('small', {}, `Проєкт «${order.project_name}» · ${order.nodes} нод · ${order.stars} ⭐ (≈ ${order.price_uah} ₴)`),
        h('small', {}, 'Ваш короткий ключ замовлення:'), keyEl),
      botBlock(info, true),
      h('ol', { class: 'pay-steps' }, h('li', {}, 'Відкрийте бота (за посиланням ключ підставиться сам) або натисніть «Завантажити Python-код» і надішліть йому ключ.'),
        h('li', {}, 'Бот покаже вартість і рахунок у зірках — оплатіть.'), h('li', {}, 'Бот підтвердить оплату, а тут завантаження відкриється автоматично.')),
      statusEl);
    if (order.status === 'paid') done(order); else timer = setInterval(poll, 3000);        // ключ постійний: цю версію могли вже оплатити
  }
  modal({ title: kind === 'py' ? 'Завантаження Python-коду' : 'Купівля пакселів', content: body, actions: [{ label: 'Закрити', value: null }] }).then(() => { closed = true; clearInterval(timer); });
  box = document.querySelector('#modal-root .modal:last-child');
  box?.classList.add('pay-box');
}
