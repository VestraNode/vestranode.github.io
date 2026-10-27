// project.js — сторінка проєкту: панель зверху (назва, режими, стан) + редактор нод / перегляд (для заблокованих) або робочий режим
import { h, api, state, store, toast } from '../core.js';
import { go } from '../main.js';
import { NodeEditor } from '../editor.js';
import { mountWork } from './work.js';
import { openShareModal } from '../share.js';

const KIND_BADGE = { export: '🔒 Експорт', bought: '🐍 Куплений .py', received: '📥 Отриманий' };

export default {
  async mount(root, r) {
    const pid = Number(r.param);
    if (!pid) { go('/projects'); return; }
    let project, defs;
    try {
      [project, defs] = await Promise.all([api(`/api/projects/${pid}`), state.nodeDefs ? Promise.resolve(state.nodeDefs) : api('/api/nodes')]);
    } catch { go('/projects'); return; }
    state.nodeDefs = defs;

    const locked = project.locked, canTree = project.perms.tree;
    // режими: власний — edit/work; заблокований — view (якщо автор дозволив бачити дерево) / work
    let mode = r.query.mode === 'work' || (locked && !canTree) ? 'work' : locked ? 'view' : 'edit';
    let editor = null, work = null, dirty = false, saving = false, saveTimer = 0, destroyed = false;
    const graph = project.graph;

    const nameInput = h('input', { class: 'proj-name', value: project.name, maxLength: 60, spellcheck: false, title: 'Натисніть, щоб перейменувати' });
    const status = h('span', { class: 'proj-status' }, locked ? 'Лише перегляд' : 'Збережено');
    const seg = h('div', { class: 'seg' });
    const body = h('div', { class: 'proj-body' });
    const extras = [];
    if (locked) {
      extras.push(h('span', { class: `kind-tag big kind-${project.kind}` }, KIND_BADGE[project.kind] || 'Заблоковано'));
      if (project.author) extras.push(h('span', { class: 'proj-author' }, 'Автор: ', h('b', {}, project.author.name)));
      if ((project.kind === 'export' || project.kind === 'bought') && project.author?.id === state.user?.id) extras.push(h('button', { class: 'btn ghost small', onclick: () => openShareModal(project) }, '🔗 Поділитися'));
    } else {
      extras.push(h('button', { class: 'btn ghost small', title: 'Створити заблоковану копію цього проєкту (її можна передати за посиланням)', onclick: async () => {
        if (dirty) { clearTimeout(saveTimer); await save(); }
        const res = await api(`/api/projects/${pid}/export`, { method: 'POST' });
        toast('Створено заблоковану копію в «Проєктах» — її можна переглядати й передавати за посиланням.', 'ok');
      } }, '⇪ Експорт'));
    }
    root.append(h('div', { class: 'proj-bar' + (locked ? ' locked' : '') },
      h('a', { class: 'back', href: '#/projects', title: 'До проєктів' }, '←'), nameInput, ...extras, h('span', { class: 'spacer' }), status, seg), body);

    const setStatus = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };

    nameInput.addEventListener('change', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.value = project.name; return; }
      if (name === project.name) return;
      try { await api(`/api/projects/${pid}`, { method: 'PATCH', json: { name } }); project.name = name; setStatus('Назву збережено', 'ok'); } catch { nameInput.value = project.name; }
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

    async function save() {
      if (locked || saving || !dirty) return;
      saving = true; dirty = false; setStatus('Збереження…');
      try {
        const res = await api(`/api/projects/${pid}/graph`, { method: 'PUT', json: { graph }, silent: true });
        const errs = res.check?.errors?.length || 0;
        setStatus(errs ? `Збережено · помилок: ${errs}` : 'Збережено', errs ? 'warn' : 'ok');
      } catch (e) { dirty = true; setStatus('Не збережено: ' + e.message, 'err'); }
      finally { saving = false; if (dirty && !destroyed) scheduleSave(); }
    }
    const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 700); };
    const onChange = () => { if (locked) return; dirty = true; setStatus('Зміни…', 'warn'); scheduleSave(); };

    function paintSeg() {
      const modes = locked ? (canTree ? [['view', '👁 Перегляд'], ['work', '▶ Робота']] : [['work', '▶ Робота']]) : [['edit', '✎ Редагування'], ['work', '▶ Робота']];
      seg.replaceChildren(...modes.map(([id, l]) => h('button', { class: mode === id ? 'on' : '', onclick: () => setMode(id) }, l)));
      seg.hidden = modes.length < 2;
    }

    async function setMode(m) {
      if (m === mode && (editor || work)) return;
      if (dirty) { clearTimeout(saveTimer); await save(); }
      teardown(); mode = m; paintSeg();
      history.replaceState(null, '', `#/project/${pid}${m === 'work' ? '?mode=work' : ''}`);
      body.replaceChildren();
      if (m === 'edit' || m === 'view') {
        editor = new NodeEditor({ defs, graph, onChange, readonly: m === 'view', prefs: store.get('prefs', {}) || {} });
        body.append(editor.el); editor.initHistory();
        requestAnimationFrame(() => {
          const v = graph.view;
          editor.renderAll();   // порти вимірюються лише коли поле вже в DOM
          if (!v || (v.x === 0 && v.y === 0 && v.zoom === 1)) { editor.fit(); editor.renderAll(); }
        });
      } else {
        work = mountWork(body, { pid, project, defs, graph, onEdit: () => setMode(locked ? 'view' : 'edit') });
      }
    }
    function teardown() { editor?.destroy(); editor = null; work?.destroy(); work = null; }

    const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    paintSeg();
    await setMode(mode);

    return async () => {
      destroyed = true; clearTimeout(saveTimer); window.removeEventListener('beforeunload', beforeUnload);
      if (dirty) { saving = false; await save(); }
      teardown();
    };
  },
};
