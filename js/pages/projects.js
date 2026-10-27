// projects.js — менеджер проєктів: власні (редагуються) та заблоковані: експорт, куплений .py, отриманий за посиланням
import { h, api, toast, promptDialog, confirmDialog, fmtDate } from '../core.js';
import { triggerDownload } from '../parts.js';
import { go } from '../main.js';
import { openShareModal } from '../share.js';

const VNP_ICON = '<svg viewBox="0 0 64 64"><defs><linearGradient id="vg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5c8a"/><stop offset="1" stop-color="#5b7cff"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#vg)"/><g fill="#fff"><rect x="10" y="14" width="18" height="12" rx="3"/><rect x="36" y="38" width="18" height="12" rx="3"/><circle cx="46" cy="21" r="5"/></g><path d="M28 20h8M24 26v18h12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 64 64"><defs><linearGradient id="lg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b48cff"/><stop offset="1" stop-color="#4dd0e1"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#lg2)"/><rect x="18" y="29" width="28" height="22" rx="5" fill="#fff"/><path d="M23 29v-6a9 9 0 0 1 18 0v6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="40" r="3.4" fill="#5b4bd0"/></svg>';
const KIND = {
  own: { label: 'Мій проєкт', cls: '' },
  export: { label: '🔒 Експорт', cls: 'kind-export', hint: 'Заблокована копія: можна переглядати, ділитися, перейменовувати й видаляти.' },
  bought: { label: '🐍 Куплений .py', cls: 'kind-bought', hint: 'Оплачений проєкт: Python-код можна завантажувати безліч разів.' },
  received: { label: '📥 Отриманий', cls: 'kind-received', hint: 'Проєкт, яким з вами поділилися: його можна використовувати, але не змінювати.' },
};

export default {
  async mount(root) {
    const grid = h('div', { class: 'projects' }, [1, 2, 3].map(() => h('div', { class: 'skeleton' })));
    const fileInput = h('input', { type: 'file', accept: '.vnp', hidden: true });
    const page = h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', {}, h('h1', {}, 'Проєкти'), h('div', { class: 'sub' }, 'Ваші нодові конвеєри. Заблоковані копії (експорт, куплені, отримані) мають окремий вигляд і не редагуються.')),
        h('div', { class: 'row-gap' },
          h('button', { class: 'btn ghost', onclick: () => fileInput.click() }, '⬆ Імпорт .vnp'),
          h('button', { class: 'btn', onclick: create }, '＋ Новий проєкт'))),
      grid, fileInput);
    root.append(page);

    async function create() {
      const name = await promptDialog('Новий проєкт', 'Новий проєкт', 'Назва проєкту', 'Створити');
      if (name === null) return;
      const r = await api('/api/projects', { method: 'POST', json: { name } });
      go('/project/' + r.id);
    }

    fileInput.onchange = async () => {
      const file = fileInput.files[0]; fileInput.value = '';
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.vnp')) { toast('Потрібен файл проєкту з розширенням .vnp.', 'error'); return; }
      const r = await api('/api/projects/import', { method: 'POST', body: await file.arrayBuffer(), headers: { 'Content-Type': 'application/octet-stream' } });
      toast(`Проєкт «${r.name}» імпортовано.`, 'ok');
      if (r.warnings?.length) toast('У проєкті є зауваження: ' + r.warnings[0], 'warn');
      load();
    };

    async function load() {
      const { projects } = await api('/api/projects');
      grid.replaceChildren(...projects.map(card), h('button', { class: 'project-card new-card', onclick: create }, '＋ Додати новий проєкт'));
    }

    function card(p) {
      const open = () => go('/project/' + p.id);
      const k = KIND[p.kind] || KIND.own, locked = p.locked;
      const rename = h('button', { class: 'btn ghost small', onclick: async () => {
        const name = await promptDialog('Перейменувати проєкт', p.name, 'Нова назва');
        if (name) { await api(`/api/projects/${p.id}`, { method: 'PATCH', json: { name } }); load(); }
      } }, '✎ Назва');
      const del = h('button', { class: 'btn danger small', title: 'Видалити', onclick: async () => {
        const extra = locked ? ' Заблоковану копію не можна відновити — її не можна й створити заново без оплати/посилання.' : ' (збережіть .vnp, якщо потрібна копія).';
        if (await confirmDialog('Видалити проєкт?', `«${p.name}» буде видалено без можливості відновлення${extra}`, 'Видалити', true)) {
          await api(`/api/projects/${p.id}`, { method: 'DELETE' }); toast('Проєкт видалено.', 'ok'); load();
        }
      } }, '🗑');
      const actions = [h('button', { class: 'btn small', onclick: open }, locked ? 'Відкрити' : 'Відкрити')];
      if (!locked) {
        actions.push(
          h('button', { class: 'btn ghost small', title: 'Створити заблоковану копію, якою можна ділитися за посиланням', onclick: async () => {
            const r = await api(`/api/projects/${p.id}/export`, { method: 'POST' }); toast('Створено заблоковану копію (експорт).', 'ok'); load();
          } }, '⇪ Експорт'),
          h('button', { class: 'btn ghost small', title: 'Завантажити проєкт у файл .vnp', onclick: () => triggerDownload(`/api/projects/${p.id}/export.vnp`) }, '⬇ .vnp'));
      } else {
        if (p.kind === 'bought') actions.push(h('button', { class: 'btn ghost small', onclick: () => triggerDownload(`/api/projects/${p.id}/export.py`) }, '⬇ .py'));
        if ((p.kind === 'export' || p.kind === 'bought') && p.author?.id) actions.push(h('button', { class: 'btn ghost small', onclick: () => openShareModal(p) }, '🔗 Поділитися'));
      }
      actions.push(rename, del);
      return h('div', { class: `project-card ${k.cls}${locked ? ' locked' : ''}` },
        locked && h('span', { class: 'lock-mark' }, p.kind === 'bought' ? '🐍' : p.kind === 'received' ? '📥' : '🔒'),
        h('div', { class: 'project-top' }, h('div', { class: 'vnp-badge', html: locked ? LOCK_ICON : VNP_ICON }),
          h('div', {}, h('div', { class: 'project-name' }, p.name), locked && h('span', { class: 'kind-tag', title: k.hint }, k.label))),
        h('div', { class: 'project-meta' },
          p.author && h('span', {}, 'Автор: ', h('b', {}, p.author.name)),
          h('span', {}, 'Створено: ', fmtDate(p.created_at)), !locked && h('span', {}, 'Змінено: ', fmtDate(p.updated_at)), h('span', {}, `Нод: ${p.restricted ? '🔒 приховано' : p.nodes}`)),
        h('div', { class: 'project-actions' }, actions));
    }

    await load();
  },
};
