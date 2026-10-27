// auth.js — повернення з Google/Discord: бекенд перенаправляє сюди з токеном у фрагменті адреси (#/auth?token=…&n=…)
import { h, store, toast } from '../core.js';
import { go, afterLogin } from '../main.js';

export default {
  async mount(root, r) {
    root.append(h('div', { class: 'empty-page' }, h('h2', {}, 'Входимо…'), h('p', { style: { color: 'var(--muted)' } }, 'Завершуємо вхід в акаунт.')));
    const nonce = store.get('oauth_nonce', null);
    store.del('oauth_nonce');
    history.replaceState(null, '', '#/auth');                       // токен не лишається в адресному рядку
    if (!r.query.token || !nonce || nonce !== r.query.n) {          // захист від підміни входу (CSRF)
      toast('Не вдалося завершити вхід: сесія входу не збігається. Спробуйте ще раз.', 'error', 9000);
      go('/login'); return;
    }
    await afterLogin(r.query.token);
    toast('Ви увійшли в акаунт.', 'ok');
    go('/projects');
  },
};
