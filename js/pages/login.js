// login.js — вхід і реєстрація: пошта + пароль, Google, Discord
import { h, state, api, toast, LOGO_SVG, oauthUrl, backend } from '../core.js';
import { go, ready, afterLogin } from '../main.js';

const GOOGLE_ICON = '<svg viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const DISCORD_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18.3 18.3 0 0 0-6.4 0L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.6 9 -.2 13.5.2 17.9a20 20 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.3 14.3 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a20 20 0 0 0 6-3c.5-5.1-.8-9.6-3.7-13.5zM8.4 15.2c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4zm7.2 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4z"/></svg>';

export default {
  async mount(root, r) {
    await ready();
    if (state.user) { go(r.query.next || '/projects'); return; }
    if (r.query.error) toast(r.query.error, 'error', 9000);
    const pub = state.pub || {};
    const prov = pub.providers || {};
    let mode = r.query.tab === 'register' ? 'register' : 'login';

    const email = h('input', { class: 'input', type: 'email', placeholder: 'ваша@пошта.com', autocomplete: 'email' });
    const name = h('input', { class: 'input', placeholder: "Ім'я", maxLength: 40, autocomplete: 'nickname' });
    const pass = h('input', { class: 'input', type: 'password', placeholder: 'Пароль (мінімум 8 символів)', autocomplete: 'current-password' });
    const pass2 = h('input', { class: 'input', type: 'password', placeholder: 'Повторіть пароль', autocomplete: 'new-password' });
    const submit = h('button', { class: 'btn block', type: 'submit' });
    const seg = h('div', { class: 'seg auth-seg' });
    const nameField = h('label', { class: 'field' }, h('span', {}, "Ім'я"), name);
    const pass2Field = h('label', { class: 'field' }, h('span', {}, 'Повтор пароля'), pass2);
    const hint = h('p', { class: 'sub', style: { fontSize: '13px' } });

    const paint = () => {
      seg.replaceChildren(...[['login', 'Вхід'], ['register', 'Реєстрація']].map(([id, l]) => h('button', { type: 'button', class: mode === id ? 'on' : '', onclick: () => { mode = id; paint(); } }, l)));
      nameField.hidden = pass2Field.hidden = mode === 'login';
      pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
      submit.textContent = mode === 'login' ? 'Увійти' : 'Створити акаунт';
      hint.textContent = mode === 'login' ? 'Немає акаунта? Перейдіть на «Реєстрація» — новий акаунт отримує 100 пакселів.' : 'Новий акаунт отримує 100 пакселів. Якщо ви вже входили через Google чи Discord із цією поштою, просто увійдіть тим же способом.';
    };

    const form = h('form', { class: 'login-form', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (backend.down) return toast('Немає зв\'язку з сервером. Спробуйте пізніше.', 'error');
      if (mode === 'register' && pass.value !== pass2.value) return toast('Паролі не збігаються.', 'error');
      submit.disabled = true;
      try {
        const res = await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', json: { email: email.value, name: name.value, password: pass.value } });
        await afterLogin(res.token);
        toast(`Вітаємо, ${res.user.name}!`, 'ok'); go(r.query.next || '/projects');
      } catch { /* повідомлення вже показано */ } finally { submit.disabled = false; }
    } }, h('label', { class: 'field' }, h('span', {}, 'Електронна пошта'), email), nameField,
      h('label', { class: 'field' }, h('span', {}, 'Пароль'), pass), pass2Field, submit);

    const oauth = (id, cls, icon, label) => (prov[id]
      ? h('a', { class: `btn ${cls} block`, href: '#', onclick: (e) => { e.preventDefault(); location.href = oauthUrl(id); } }, h('span', { html: icon }), label)
      : h('button', { class: `btn ${cls} block`, disabled: true, title: 'Цей спосіб входу ще не налаштований на сервері' }, h('span', { html: icon }), label + ' (не налаштовано)'));

    paint();
    root.append(h('div', { class: 'auth-page' }, h('div', { class: 'auth-card' },
      h('div', { class: 'auth-logo', html: LOGO_SVG }), h('h2', {}, 'VestraNode'), seg, form,
      h('div', { class: 'divider' }, h('span', {}, 'або')),
      oauth('google', 'google', GOOGLE_ICON, 'Продовжити з Google'),
      oauth('discord', 'discord', DISCORD_ICON, 'Продовжити з Discord'),
      hint)));
  },
};
