// device.js — підтвердження входу настільної програми: #/device?code=XXXX-XXXX (сторінка потребує входу; без нього router веде на вхід/реєстрацію)
import { h, api, state, toast } from '../core.js';
import { forgetDevice } from '../main.js';

export default {
  async mount(root, r) {
    const box = h('div', { class: 'card', style: { maxWidth: '520px', margin: '40px auto', display: 'grid', gap: '14px', padding: '28px' } });
    root.append(h('div', { class: 'page' }, box));
    const code = String(r.query.code || '').toUpperCase();
    const message = (title, text) => box.replaceChildren(h('h1', {}, title), h('p', {}, text));

    let info;
    try { info = await api(`/api/desktop/link/info?code=${encodeURIComponent(code)}`, { silent: true }); }
    catch (e) {
      if (e.status === 404) forgetDevice();                  // код застарів або вже використаний
      message('Вхід у програму', e.message); return;
    }

    const answer = async (allow) => {
      box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        await api('/api/desktop/link/approve', { method: 'POST', json: { code: info.code, allow }, silent: true });
        forgetDevice();
        if (allow) message('Вхід підтверджено', 'Поверніться в застосунок VestraNode. Цю вкладку можна закрити.');
        else message('Вхід скасовано', 'Доступ до акаунта не надано.');
      } catch (e) { toast(e.message, 'error'); box.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
    };

    box.replaceChildren(
      h('h1', {}, 'Увійти в застосунок VestraNode?'),
      h('p', {}, 'Акаунт: ', h('b', {}, state.user?.email || '')),
      h('p', {}, 'Код підтвердження: ', h('b', { style: { fontSize: '22px', letterSpacing: '2px' } }, info.code)),
      h('div', { class: 'list' },
        h('div', {}, h('span', {}, 'Пристрій'), h('span', {}, info.name)),
        h('div', {}, h('span', {}, 'Система'), h('span', {}, info.os || '—')),
        h('div', {}, h('span', {}, 'IP-адреса'), h('span', {}, info.ip))),
      h('p', { class: 'sub' }, 'Підтверджуйте, лише якщо ви самі почали вхід і коди збігаються.'),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn', onclick: () => answer(true) }, 'Дозволити'),
        h('button', { class: 'btn ghost', onclick: () => answer(false) }, 'Скасувати')));
  },
};
