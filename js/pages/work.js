// work.js — робочий режим проєкту: ліворуч входи й кнопки, у центрі Lab (4 фото, статистика) + термінал, праворуч дерево проєкту
import { h, $, api, state, store, toast, modal, confirmDialog, setUser, fmtInt, fmtNum, debounce, assetUrl } from '../core.js';
import { Lab, Terminal } from '../lab.js';
import { photoDrop, uploadPhoto, dropServer, chargeAndDownload, triggerDownload, stepLabel } from '../parts.js';
import { openPayModal } from '../paymodal.js';

const KIND_ICON = { image: '🖼', text: '✎', key: '🔑', number: '№', bool: '⏻' };

export function mountWork(body, { pid, project, defs, graph, onEdit }) {
  const byType = Object.fromEntries(defs.nodes.map((n) => [n.id, n]));
  const cat = Object.fromEntries(defs.categories.map((c) => [c.id, c]));
  const nodeById = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  const colorOf = (n) => cat[byType[n.type].category].color;
  const titleOf = (n) => n.name || (n.type.startsWith('import_') ? (n.params?.label || byType[n.type].title) : byType[n.type].title);

  const term = new Terminal();
  const lab = new Lab({ terminal: term, mode: 'encode', compact: true });
  const S = { mode: 'encode', photos: {}, values: {}, enc: null, dec: null, dirty: false, busy: 0, seq: 0, pyInfo: null };

  const imports = graph.nodes.filter((n) => n.type.startsWith('import_'));
  const stego = graph.nodes.find((n) => n.type === 'stego');
  const stegoImg = graph.edges.find((e) => stego && e.to[0] === stego.id && e.to[1] === 'image');
  const mainImageNode = (stegoImg && nodeById[stegoImg.from[0]]?.type === 'import_image') ? stegoImg.from[0] : (imports.find((n) => n.type === 'import_image')?.id || null);
  const stegoInput = (name, def) => { const v = Number(stego?.inputs?.[name]); return Number.isFinite(v) && v > 0 ? v : def; };
  const stegoThreshold = () => { const v = Number(stego?.inputs?.threshold); return Number.isFinite(v) ? v : 8; };
  const mainPhoto = () => S.photos[mainImageNode] || null;

  // ------------------------------------------------------------- ліва панель
  const modeSeg = h('div', { class: 'seg' });
  const cards = h('div', { class: 'in-list', style: { display: 'grid', gap: '12px' } });
  const btnPreview = h('button', { class: 'btn', onclick: () => run() }, 'Передперегляд');
  const btnDownload = h('button', { class: 'btn ghost', onclick: download }, 'Завантажити');
  const btnPy = h('button', { class: 'btn ghost', onclick: downloadPy }, 'Завантажити .py');
  const msg = h('div', { class: 'result-box', hidden: true });

  const side = h('aside', { class: 'work-side' },
    h('div', { class: 'work-scroll' },
      h('div', { class: 'tool-title' }, '▶ Робочий режим'),
      state.pub?.archive_days ? h('small', { class: 'archive-note' }, `Результати кодування й декодування зберігаються ${state.pub.archive_days} днів.`) : null,
      h('div', {}, modeSeg), cards,
      h('div', { style: { height: '60px' } })),
    h('div', { class: 'tool-buttons' }, msg, btnPreview, btnDownload, btnPy));

  const treeBox = h('div', { class: 'tree' });
  const tree = h('aside', { class: 'work-tree' }, h('h4', {}, 'Дерево проєкту'), h('small', {}, 'Від кінцевої ноди «Стего» до джерел даних.'), treeBox);
  const main = h('div', { class: 'work-main' }, lab.el);
  body.append(h('div', { class: 'work' }, side, main, tree));

  // ------------------------------------------------------------- допоміжне
  function busy(d) { S.busy += d; side.classList.toggle('busy', S.busy > 0); paint(); }
  function touched() { if (S.enc || S.dec) { S.dirty = true; lab.set({ stale: true }); } paint(); }
  const shown = () => imports.filter((n) => !(S.mode === 'decode' && n.type === 'import_text'));

  function inputsPayload() {
    const out = {};
    for (const n of imports) {
      if (S.mode === 'decode' && n.type === 'import_text') continue;
      if (n.type === 'import_image') { const p = S.photos[n.id]; if (p?.id) out[n.id] = { image_id: p.id }; }
      else if (n.type === 'import_number') { const v = S.values[n.id]; if (v !== undefined && v !== '') out[n.id] = Number(v); }
      else if (n.type === 'import_bool') { if (S.values[n.id] !== undefined) out[n.id] = !!S.values[n.id]; }
      else if (S.values[n.id] !== undefined) out[n.id] = S.values[n.id];
    }
    return out;
  }
  const textsFilled = () => imports.filter((n) => n.type === 'import_text').every((n) => (S.values[n.id] || '').length > 0);

  // ------------------------------------------------------------- картки входів
  function buildCards() {
    cards.replaceChildren(...shown().map((n, i) => {
      const label = n.params?.label || byType[n.type].title, kind = n.type.slice(7);
      const head = h('div', { class: 'in-head' }, h('i', { style: { background: colorOf(n) } }), `${KIND_ICON[kind] || ''} ${label}`);
      let control;
      if (kind === 'image') {
        const drop = photoDrop({ onFile: (f) => setPhoto(n, f, drop), onClear: () => clearPhoto(n, drop) });
        drop.set(S.photos[n.id] || null); control = drop.el;
      } else if (kind === 'text') {
        const ta = h('textarea', { class: 'textarea', rows: 5, placeholder: 'Впишіть текст або завантажте .txt…' }); ta.value = S.values[n.id] || '';
        const file = h('input', { type: 'file', accept: '.txt,text/plain', hidden: true }), info = h('small', {});
        const upd = () => { const t = S.values[n.id] || ''; info.textContent = t ? `${fmtInt([...t].length)} символів · ${fmtInt(new Blob([t]).size)} байт` : ''; };
        ta.addEventListener('input', () => { S.values[n.id] = ta.value; upd(); touched(); });
        file.onchange = async () => { const f = file.files[0]; file.value = ''; if (!f) return; const t = await f.text(); ta.value = t; S.values[n.id] = t; upd(); term.add('info', `Текст із файлу «${f.name}»: ${fmtInt([...t].length)} символів.`, 'input'); touched(); };
        upd(); control = h('div', { style: { display: 'grid', gap: '8px' } }, ta, h('div', { class: 'row-gap' }, h('button', { class: 'btn ghost small', onclick: () => file.click() }, 'Завантажити .txt'), file, info));
      } else if (kind === 'key') {
        const inp = h('input', { class: 'input', placeholder: 'порожньо — без ключа', autocomplete: 'off', value: S.values[n.id] || '' });
        inp.addEventListener('input', () => { S.values[n.id] = inp.value; touched(); }); control = inp;
      } else if (kind === 'number') {
        const def = n.params?.default ?? 0, inp = h('input', { class: 'input', type: 'number', step: 'any', value: S.values[n.id] ?? def });
        S.values[n.id] ??= def; inp.addEventListener('input', () => { S.values[n.id] = inp.value; touched(); }); control = inp;
      } else {
        const def = !!n.params?.default; S.values[n.id] ??= def;
        const chk = h('input', { type: 'checkbox', checked: !!S.values[n.id] }); chk.onchange = () => { S.values[n.id] = chk.checked; touched(); };
        control = h('label', { class: 'switch' }, chk, h('i'));
      }
      return h('div', { class: 'in-card' }, head, control);
    }));
    if (!shown().length) cards.append(h('div', { class: 'in-card' }, h('small', {}, 'У проєкті немає вхідних нод. Додайте «Імпорт» у режимі редагування.')));
  }

  // ------------------------------------------------------------- фото
  async function setPhoto(n, file, drop) {
    clearPhoto(n, drop, false);
    term.add('info', `Вибрано фото «${file.name}» (${fmtNum(file.size / 1024, 0)} КБ).`, titleOf(n));
    busy(1);
    try {
      const p = await uploadPhoto(file); S.photos[n.id] = p; drop.set(p);
      if (n.id === mainImageNode) { lab.set({ photo: p }); await analyze(); }
    } catch (e) { toast(e.message, 'error'); term.add('error', e.message, 'upload'); clearPhoto(n, drop, false); } finally { busy(-1); }
  }
  function clearPhoto(n, drop, rerender = true) {
    const p = S.photos[n.id];
    if (p) { dropServer(p.id); URL.revokeObjectURL(p.url); delete S.photos[n.id]; }
    drop.set(null);
    if (n.id === mainImageNode) { S.enc = S.dec = null; S.dirty = false; lab.set({ photo: null, analysis: null, enc: null, dec: null, encError: null, decError: null, stale: false }); }
    if (rerender) paint();
  }
  async function analyze(x) {
    const p = mainPhoto(); if (!p?.id) return;
    const seq = ++S.seq;
    try {
      const d = await api('/api/lab/analyze', { method: 'POST', json: { id: p.id, x: x || stegoInput('x', 8), y: stegoInput('y', 40), threshold: stegoThreshold() }, silent: true });
      if (seq !== S.seq) return;
      term.ingest(d.logs); p.width = d.width; p.height = d.height;
      lab.set({ photo: p, analysis: d, threshold: stegoThreshold() });
    } catch (e) { term.add('error', e.message, 'analyze'); }
  }

  // ------------------------------------------------------------- запуск графа
  async function run() {
    const enc = S.mode === 'encode';
    if (!mainPhoto()?.id) return toast('Завантажте фото для ноди «Стего».', 'error');
    busy(1); msg.hidden = true;
    try {
      const d = await api('/api/work/run', { method: 'POST', json: { project_id: pid, mode: S.mode, inputs: inputsPayload() }, silent: true });
      term.ingest(d.logs);
      if (enc) {
        if (S.enc) dropServer(S.enc.enc_id);
        S.enc = d; S.dirty = false;
        lab.set({ enc: d, encError: null, hasText: true, stale: false, analysis: { ...(lab.data.analysis || {}), chunk_size: d.chunk_size, rows: d.rows, cols: d.cols, max_possible: d.max_possible, grid: d.grid, histogram: d.histogram, width: d.stats.width, height: d.stats.height, noise_channels: lab.data.analysis?.noise_channels, pollution_index: lab.data.analysis?.pollution_index, capacity_bytes: d.stats.capacity_bytes } });
      } else {
        S.dec = d; S.dirty = false;
        await analyze(d.chunk_size);
        lab.set({ dec: d, decError: null, stale: false });
        showMsg(`Розкодовано «${d.result.label}»: ${fmtInt(d.text_chars)} символів.`, true);
      }
    } catch (e) {
      term.ingest(e.data?.logs); term.add('error', e.message, e.data?.node ? (nodeById[e.data.node] ? titleOf(nodeById[e.data.node]) : 'граф') : 'граф');
      if (enc) { S.enc = null; lab.set({ enc: null, encError: e.message, hasText: true, stale: false }); } else { S.dec = null; lab.set({ dec: null, decError: e.message, stale: false }); }
      toast(e.message, 'error'); showMsg(e.message, false); term.setOpen(true);
    } finally { busy(-1); }
  }
  function showMsg(text, ok) { msg.hidden = false; msg.className = `result-box ${ok ? 'ok' : 'bad'}`; msg.textContent = text; }

  async function download() {
    const base = (mainPhoto()?.name || project.name || 'result').replace(/\.[^.]+$/, '');
    if (S.mode === 'encode') {
      if (!S.enc || S.dirty) await run();
      if (!S.enc) return;
      try { await chargeAndDownload(S.enc.enc_id, `${base}_stego.png`); S.enc.charged = true; } catch (e) { term.add('error', e.message, 'pay'); }
    } else {
      if (!S.dec || S.dirty) await run();
      if (S.dec) triggerDownload(`/api/lab/text/${S.dec.text_id}`);
    }
  }

  // ------------------------------------------------------------- .py
  async function loadPyInfo() {
    try { S.pyInfo = await api(`/api/projects/${pid}/py`, { silent: true }); } catch { S.pyInfo = null; }
    paint();
  }
  async function downloadPy() {
    const info = S.pyInfo || await api(`/api/projects/${pid}/py`);
    S.pyInfo = info;
    if (info.can_download) {
      triggerDownload(`/api/projects/${pid}/export.py`); toast('Завантаження .py розпочато.', 'ok'); return;
    }
    if (state.pub?.pay_maintenance) {            // основна оплата на технічних роботах → тимчасово Telegram-бот (зірки)
      openPayModal({ kind: 'py', projectId: pid, onPaid: () => loadPyInfo() }); return;
    }
    const ok = await confirmDialog('Придбати генерацію .py?',
      `Самостійний скрипт на ${info.nodes} нод коштує ${info.price_uah} ₴ (≈ ${info.stars} ⭐: 1 ⭐ до 20 нод, понад 20 — 2 ⭐, далі +1 ⭐ за кожні наступні 20). Після оплати файл для цієї версії проєкту можна завантажувати без обмежень. Оплата — через Monobank у новій вкладці.`, `Оплатити ${info.price_uah} ₴`);
    if (!ok) return;
    const pay = await api('/api/payments/create', { method: 'POST', json: { kind: 'py', project_id: pid } });
    window.open(assetUrl(pay.page_url), '_blank', 'noopener');
    toast('Відкрито сторінку оплати. Очікуємо підтвердження…', 'info');
    const started = Date.now();
    clearInterval(S.payTimer);
    S.payTimer = setInterval(async () => {
      try {
        const st = await api('/api/payments/' + pay.id, { silent: true });
        if (st.status === 'success') {
          clearInterval(S.payTimer); setUser(st.user); await loadPyInfo();
          toast('Оплату підтверджено. Завантажуємо .py…', 'ok'); triggerDownload(`/api/projects/${pid}/export.py`);
        } else if (st.status !== 'created' || Date.now() - started > 15 * 60 * 1000) { clearInterval(S.payTimer); toast('Оплату не завершено.', 'error'); }
      } catch { /* пробуємо ще */ }
    }, 2500);
  }

  // ------------------------------------------------------------- дерево
  function buildTree() {
    if (project.restricted) { treeBox.replaceChildren(h('p', { class: 'fine-note' }, '🔒 Автор приховав структуру проєкту. Ви можете користуватися ним у робочому режимі, але не бачите, з чого він складається.')); return; }
    const incoming = {};
    graph.edges.forEach((e) => { (incoming[e.to[0]] ||= []).push(e); });
    const seen = new Set();
    const pill = (n, portLabel) => h('span', { class: 'pill', style: { '--c': colorOf(n) }, title: byType[n.type].desc }, h('i'), h('span', {}, titleOf(n)), portLabel ? h('em', {}, portLabel) : null);
    function branch(n, portLabel, trail) {
      const kids = (incoming[n.id] || []).filter((e) => nodeById[e.from[0]] && !trail.has(e.from[0]));
      const el = h('div', { class: 'tnode' }, pill(n, portLabel));
      if (kids.length) el.append(h('div', { class: 'tchildren' }, kids.map((e) => {
        const from = nodeById[e.from[0]], port = byType[n.type].inputs.concat(...Object.values(byType[n.type].variants?.inputs || {})).find((p) => p.name === e.to[1]);
        seen.add(from.id);
        return branch(from, `→ ${port?.label || e.to[1]}`, new Set([...trail, n.id]));
      })));
      return el;
    }
    const nodes = [];
    if (stego) { seen.add(stego.id); nodes.push(branch(stego, '', new Set())); }
    const rest = graph.nodes.filter((n) => !seen.has(n.id));
    if (rest.length) nodes.push(h('div', { style: { marginTop: '14px' } }, h('small', {}, 'Не підключені до «Стего»'), h('div', { class: 'tchildren', style: { paddingLeft: 0 } }, rest.map((n) => pill(n)))));
    treeBox.replaceChildren(...nodes);
  }

  // ------------------------------------------------------------- відмальовка кнопок
  function paint() {
    modeSeg.replaceChildren(...[['encode', 'Кодувати'], ['decode', 'Декодувати']].map(([id, l]) => h('button', { class: S.mode === id ? 'on' : '', onclick: () => setMode(id) }, l)));
    const enc = S.mode === 'encode', has = !!mainPhoto()?.id, price = S.enc?.price?.price;
    btnPreview.textContent = enc ? 'Передперегляд' : 'Розкодувати'; btnPreview.disabled = !has || S.busy > 0;
    btnDownload.disabled = S.busy > 0 || !has || (enc && !textsFilled());
    btnDownload.textContent = enc ? (price !== undefined ? `Завантажити фото · ${price} пакс.` : 'Завантажити фото') : 'Завантажити текст';
    const pi = S.pyInfo;
    btnPy.hidden = project.perms && !project.perms.py;
    btnPy.textContent = !pi ? 'Завантажити .py' : pi.can_download ? 'Завантажити .py' : state.pub?.pay_maintenance ? `Завантажити .py · ${pi.stars} ⭐` : `Завантажити .py · ${pi.price_uah} ₴`;
    btnPy.title = pi?.free ? 'Безкоштовно завдяки преміуму' : pi?.unlocked ? 'Вже оплачено для цієї версії проєкту' : 'Самостійний Python-скрипт цього проєкту';
  }
  function setMode(m) {
    if (m === S.mode) return;
    S.mode = m; S.enc = S.dec = null; S.dirty = false; msg.hidden = true;
    lab.data.mode = m; lab.set({ mode: m, enc: null, dec: null, encError: null, decError: null, stale: false });
    buildCards(); paint(); if (mainPhoto()?.id) analyze();
  }

  if (!stego) toast('У проєкті немає ноди «Стего» — відкрийте редагування.', 'error');
  buildCards(); buildTree(); paint(); loadPyInfo();

  return {
    destroy() {
      clearInterval(S.payTimer);
      Object.values(S.photos).forEach((p) => { dropServer(p.id); URL.revokeObjectURL(p.url); });
      if (S.enc) dropServer(S.enc.enc_id);
      lab.destroy(); term.destroy();
    },
  };
}

export default { mount() { /* технічний модуль: використовується через mountWork */ } };
