// share.js — керування посиланнями для обміну заблокованим проєктом: права перегляду, термін дії, відкликання
import { h, api, toast, modal, confirmDialog, fmtDate, backend } from './core.js';

export const shareUrl = (token) => `${location.origin}${location.pathname.replace(/index\.html$/, '')}#/share/${token}`;

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Посилання скопійовано.', 'ok', 2500); } catch { toast('Не вдалося скопіювати — виділіть посилання й скопіюйте вручну.', 'error'); }
}

const OPTS = [
  ['can_tree', 'Дозволити переглядати дерево нод', 'Інакше отримувач бачить лише поля для вводу та результат — структура прихована.'],
  ['allow_py', 'Дозволити купувати/завантажувати .py', 'Python-код містить усю структуру, тому вмикає й перегляд дерева.'],
  ['can_save', 'Дозволити додати до своїх проєктів', 'Без цього проєкт можна лише подивитися за посиланням.'],
  ['show_author', 'Показувати автора', 'Ваше ім\'я буде видно в отриманій копії.'],
];

/** Вікно «Поділитися» для заблокованого проєкту project = {id, name}. */
export async function openShareModal(project) {
  if (backend.down) return toast('Немає зв\'язку з сервером.', 'error');
  const state = { can_tree: false, allow_py: false, can_save: true, show_author: true };
  const list = h('div', { class: 'share-list' });
  const expires = h('select', { class: 'input' }, [['', 'без обмеження'], ['1', '1 день'], ['7', '7 днів'], ['30', '30 днів']].map(([v, l]) => new Option(l, v)));
  expires.value = '7';
  const checks = h('div', { class: 'share-opts' });
  const paintChecks = () => checks.replaceChildren(...OPTS.map(([k, label, hint]) => {
    const i = h('input', { type: 'checkbox', checked: state[k] });
    i.onchange = () => { state[k] = i.checked; if (k === 'allow_py' && i.checked) state.can_tree = true; paintChecks(); };
    return h('label', { class: 'check' }, i, h('span', {}, label, h('small', {}, hint)));
  }));
  const load = async () => {
    const d = await api(`/api/projects/${project.id}/shares`);
    list.replaceChildren(...(d.shares.length ? d.shares.map((s) => {
      const url = shareUrl(s.token);
      const flags = [s.can_tree && 'дерево', s.allow_py && '.py', s.can_save && 'збереження', s.show_author && 'автор'].filter(Boolean).join(' · ') || 'лише результат';
      return h('div', { class: 'share-row' },
        h('div', { class: 'share-main' }, h('input', { class: 'input', readOnly: true, value: url, onfocus: (e) => e.target.select() }),
          h('small', {}, `${flags} · переглядів ${s.views}, збережень ${s.saves}${s.expires_at ? ' · до ' + fmtDate(s.expires_at) : ' · без терміну'}`)),
        h('button', { class: 'btn small', onclick: () => copy(url) }, '⧉ Копіювати'),
        h('button', { class: 'btn danger small', title: 'Відкликати посилання', onclick: async () => {
          if (!await confirmDialog('Відкликати посилання?', 'Воно перестане працювати. Уже збережені копії лишаться в отримувачів.', 'Відкликати', true)) return;
          await api(`/api/shares/${s.token}`, { method: 'DELETE' }); toast('Відкликано.', 'ok'); load();
        } }, '🗑'));
    }) : [h('p', { class: 'fine-note' }, 'Активних посилань ще немає.')]));
  };
  paintChecks();
  const create = h('button', { class: 'btn', onclick: async () => {
    const s = await api(`/api/projects/${project.id}/shares`, { method: 'POST', json: { ...state, expires_days: expires.value ? +expires.value : null } });
    await copy(shareUrl(s.token)); load();
  } }, '＋ Створити посилання');
  const content = h('div', { class: 'share-modal' },
    h('p', { class: 'fine-note' }, `Проєкт «${project.name}». Отримувач не зможе змінювати його: лише переглядати (якщо дозволено), користуватися й перейменовувати свою копію.`),
    h('h4', {}, 'Нове посилання'), checks, h('label', { class: 'field' }, h('span', {}, 'Термін дії'), expires), create, h('h4', {}, 'Активні посилання'), list);
  modal({ title: 'Поділитися проєктом', content, actions: [{ label: 'Закрити', value: null }] });
  document.querySelector('#modal-root .modal:last-child')?.classList.add('wide');
  await load();
}
