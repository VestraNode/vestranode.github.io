// share.js — сторінка за посиланням для обміну: що це за проєкт, хто автор, що дозволено; «Додати до моїх проєктів»
import { h, api, state, store, toast, fmtDate } from '../core.js';
import { go } from '../main.js';
import { NodeEditor } from '../editor.js';

export default {
  async mount(root, r) {
    const token = r.param;
    const wrap = h('div', { class: 'page share-page' });
    root.append(wrap);
    let data;
    try { data = await api(`/api/share/${token}`, { silent: true }); } catch (e) {
      wrap.append(h('div', { class: 'empty-page' }, h('h2', {}, 'Посилання недоступне'), h('p', { style: { color: 'var(--muted)' } }, e.message), h('a', { class: 'btn', href: '#/' }, 'На головну')));
      return;
    }
    const defs = state.nodeDefs || (state.nodeDefs = await api('/api/nodes'));
    let editor = null;

    const perm = (ok, label) => h('span', { class: `share-perm ${ok ? "on" : ""}` }, ok ? '✔' : '✖', ' ', label);
    const save = async () => {
      if (!state.user) { go('/login?next=' + encodeURIComponent(`/share/${token}`)); return; }
      const res = await api(`/api/share/${token}/save`, { method: 'POST' });
      toast(res.already ? 'Цей проєкт уже є у ваших.' : 'Проєкт додано до ваших «Проєктів».', 'ok');
      go('/project/' + res.id + '?mode=work');
    };
    const actions = data.mine ? [h('span', { class: 'fine-note' }, 'Це ваше посилання.')]
      : data.saved_project_id ? [h('button', { class: 'btn', onclick: () => go('/project/' + data.saved_project_id) }, 'Відкрити мою копію')]
        : data.can_save ? [h('button', { class: 'btn', onclick: save }, state.user ? '＋ Додати до моїх проєктів' : 'Увійти й додати до проєктів')]
          : [h('span', { class: 'fine-note' }, 'Автор дозволив лише перегляд за посиланням.')];

    const board = h('div', { class: 'share-board' });
    wrap.append(
      h('div', { class: 'share-hero card' },
        h('div', { class: 'share-title' }, h('span', { class: 'kind-tag big kind-export' }, '🔒 Кодер, яким із вами поділилися'), h('h1', {}, data.name)),
        h('div', { class: 'share-meta' }, data.author ? h('span', {}, 'Автор: ', h('b', {}, data.author.name)) : h('span', {}, 'Автор прихований'), h('span', {}, `Нод: ${data.can_tree ? data.nodes : '🔒'}`),
          data.expires_at && h('span', {}, 'Діє до ', fmtDate(data.expires_at))),
        h('div', { class: 'share-perms' }, perm(data.can_tree, 'перегляд дерева нод'), perm(data.can_save, 'додати до своїх проєктів'), perm(data.allow_py, 'Python-код')),
        h('p', { class: 'fine-note' }, 'Отриману копію не можна змінити — лише використовувати, перейменувати й видалити.'),
        h('div', { class: 'row-gap' }, ...actions)),
      data.can_tree ? h('div', { class: 'card share-tree' }, h('h3', {}, 'Дерево нод'), board)
        : h('div', { class: 'card' }, h('p', { class: 'fine-note' }, '🔒 Автор приховав структуру: після додавання ви побачите лише поля для вводу й результат.')));

    if (data.can_tree) {
      editor = new NodeEditor({ defs, graph: data.graph, readonly: true, onChange() {}, prefs: store.get('prefs', {}) || {} });
      board.append(editor.el);
      requestAnimationFrame(() => { editor.renderAll(); editor.fit(); editor.renderAll(); });
    }
    return () => editor?.destroy();
  },
};
