// editor.js — редактор нод: полотно, ноди, порти за типом, з'єднання, виділення, меню, палітра, інспектор, undo/redo
import { h, $, $$, select, toast, contextMenu, closeCtx, debounce, store, uiScale, autoFactor } from './core.js';
import { searchField } from './icons.js';

const NODE_W = 232;
const GRID = 20;
let uid = 0;

export class NodeEditor {
  /**
   * opts: { defs, graph, onChange(graph), prefs:{snap,autosave,hints}, canDeleteNode? }
   */
  constructor(opts) {
    this.readonly = !!opts.readonly; this.defs = opts.defs; this.graph = opts.graph; this.onChange = opts.onChange || (() => {}); this.prefs = opts.prefs || {};
    this.byType = Object.fromEntries(this.defs.nodes.map((n) => [n.id, n]));
    this.cat = Object.fromEntries(this.defs.categories.map((c) => [c.id, c]));
    this.types = this.defs.types;
    this.sel = new Set(); this.selEdge = null; this.view = this.graph.view || { x: 0, y: 0, zoom: Math.max(1, autoFactor()) };
    this.nodeEls = new Map(); this.ports = new Map(); this.portOff = new Map(); this.hist = []; this.future = [];
    this.build();
  }

  // ===================================================================== побудова DOM
  build() {
    this.paletteEl = h('aside', { class: 'ed-palette' });
    this.world = h('div', { class: 'ed-world' });
    this.svg = h('svg:svg', { class: 'ed-edges' });
    this.nodesLayer = h('div', { class: 'ed-nodes' });
    this.world.append(this.svg, this.nodesLayer);
    this.tipEl = h('div', { class: 'ed-tip', hidden: true });
    this.boxEl = h('div', { class: 'ed-box', hidden: true });
    this.saveEl = h('span', { class: 'ed-save' }, '');
    this.hud = h('div', { class: 'ed-hud' },
      h('button', { class: 'icon-btn', title: 'Відмінити (Ctrl+Z)', onclick: () => this.undo() }, '↶'), h('button', { class: 'icon-btn', title: 'Повторити (Ctrl+Y)', onclick: () => this.redo() }, '↷'),
      h('span', { class: 'sep' }), h('button', { class: 'icon-btn', title: 'Збільшити', onclick: () => this.zoomBy(1.2) }, '＋'),
      this.zoomEl = h('span', { class: 'zoom-label' }, '100%'), h('button', { class: 'icon-btn', title: 'Зменшити', onclick: () => this.zoomBy(1 / 1.2) }, '－'),
      h('button', { class: 'icon-btn', title: 'Вмістити все', onclick: () => this.fit() }, '⛶'), this.saveEl);
    this.board = h('div', { class: 'ed-board', tabindex: 0 }, this.world, this.boxEl, this.hud);
    this.inspector = h('aside', { class: 'ed-inspector' });
    this.el = h('div', { class: `ed${this.readonly ? ' ro' : ''}` }, this.paletteEl, this.board, this.inspector, this.tipEl);

    this.bindBoard();
    this.buildPalette();
    this.renderAll();
    this.applyView();
    this.renderInspector();
  }

  // ===================================================================== допоміжне: порти й типи
  ports_in(node) {
    const d = this.byType[node.type], v = d.variants;
    if (v) { const key = (node.params || {})[v.param] || Object.keys(v.inputs)[0]; return v.inputs[key] || d.inputs; }
    return d.inputs;
  }
  ports_out(node) { return this.byType[node.type].outputs; }
  portType(nodeId, side, name) {
    const n = this.node(nodeId); if (!n) return null;
    const list = side === 'out' ? this.ports_out(n) : this.ports_in(n);
    return list.find((p) => p.name === name)?.type || null;
  }
  node(id) { return this.graph.nodes.find((n) => n.id === id); }
  title(node) { return node.name || (node.type.startsWith('import_') ? (node.params?.label || this.byType[node.type].title) : this.byType[node.type].title); }
  color(node) { return this.cat[this.byType[node.type].category].color; }
  typeLabel(t) { return this.types[t]?.label || t; }
  accepts(nodeId, port) { const n = this.node(nodeId); return (n && this.ports_in(n).find((p) => p.name === port)?.accepts) || []; }
  incoming(nodeId, port) { return this.graph.edges.find((e) => e.to[0] === nodeId && e.to[1] === port); }

  // ===================================================================== палітра
  buildPalette() {
    const search = h('input', { class: 'input', placeholder: 'Пошук ноди…' });
    const list = h('div', { class: 'pal-list' });
    const paint = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren(...this.defs.categories.map((c) => {
        const items = this.defs.nodes.filter((n) => n.category === c.id && !n.permanent && (!q || n.title.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)));
        if (!items.length) return null;
        const open = q ? true : store.get(`pal:${c.id}`, c.id === 'import' || c.id === 'cipher');
        const head = h('button', { class: 'pal-head', style: { '--c': c.color } }, h('i'), h('b', {}, c.label), h('small', {}, items.length), h('span', { class: 'pal-chev' }, open ? '▾' : '▸'));
        const body = h('div', { class: 'pal-body', hidden: !open }, items.map((n) => h('div', { class: 'pal-item', draggable: true, title: n.desc, style: { '--c': c.color },
          onclick: () => this.addNode(n.id), ondragstart: (e) => { e.dataTransfer.setData('text/vn-node', n.id); e.dataTransfer.effectAllowed = 'copy'; } }, h('i'), n.title)));
        head.onclick = () => { body.hidden = !body.hidden; head.querySelector('.pal-chev').textContent = body.hidden ? '▸' : '▾'; if (!q) store.set(`pal:${c.id}`, !body.hidden); };
        return h('div', { class: 'pal-cat' }, head, body);
      }).filter(Boolean));
    };
    search.oninput = paint; paint();
    this.paletteEl.replaceChildren(h('div', { class: 'pal-title' }, 'Додати ноду'), searchField(search), list,
      h('div', { class: 'pal-legend' }, h('b', {}, 'Типи даних'), ...Object.entries(this.types).map(([id, t]) => h('div', {}, h('i', { style: { background: t.color } }), t.label))));
    this.board.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/vn-node')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    this.board.addEventListener('drop', (e) => {
      if (this.readonly) return;
      const id = e.dataTransfer.getData('text/vn-node'); if (!id) return; e.preventDefault();
      const p = this.toWorld(e.clientX, e.clientY); this.addNode(id, p.x - NODE_W / 2, p.y - 20);
    });
  }

  // ===================================================================== перетворення координат
  toWorld(cx, cy) { const r = this.board.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.zoom, y: (cy - r.top - this.view.y) / this.view.zoom }; }
  applyView() {
    this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.zoom})`;
    this.board.style.setProperty('--zoom', this.view.zoom);
    // решітка крапок (повернута на 45°: другий шар зсунуто на пів кроку); розмір крапок росте/зменшується з масштабом і не зливається
    const z = this.view.zoom, step = 28 * z, rad = Math.min(Math.max(0.55, 2.2 * z), step * 0.16), dot = `radial-gradient(var(--board-dot) ${rad}px, transparent ${rad + 0.8}px)`;
    this.board.style.backgroundImage = step < 7 ? 'none' : `${dot}, ${dot}`;
    this.board.style.backgroundPosition = `${this.view.x}px ${this.view.y}px, ${this.view.x + step / 2}px ${this.view.y + step / 2}px`;
    this.board.style.backgroundSize = `${step}px ${step}px`;
    this.zoomEl.textContent = Math.round(this.view.zoom * 100) + '%';
    this.graph.view = { ...this.view };
  }
  zoomBy(f, cx, cy) {
    const r = this.board.getBoundingClientRect(); cx = cx ?? r.left + r.width / 2; cy = cy ?? r.top + r.height / 2;
    const z = Math.min(2 * Math.max(1, autoFactor()), Math.max(0.3, this.view.zoom * f)), k = z / this.view.zoom, bx = cx - r.left, by = cy - r.top;
    this.view.x = bx - (bx - this.view.x) * k; this.view.y = by - (by - this.view.y) * k; this.view.zoom = z; this.applyView();
  }
  fit() {
    if (!this.graph.nodes.length) return;
    const xs = this.graph.nodes.map((n) => n.x), ys = this.graph.nodes.map((n) => n.y);
    const hs = this.graph.nodes.map((n) => (this.nodeEls.get(n.id)?.offsetHeight || 120));
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W, minY = Math.min(...ys), maxY = Math.max(...this.graph.nodes.map((n, i) => n.y + hs[i]));
    const r = this.board.getBoundingClientRect(), pad = 60;
    const z = Math.min(1.2 * uiScale(), Math.max(0.3, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))));
    this.view = { zoom: z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z };
    this.applyView();
  }

  // ===================================================================== історія та збереження
  snapshot() { return JSON.stringify({ nodes: this.graph.nodes, edges: this.graph.edges }); }
  commit(structural = true) {
    if (structural) { this.hist.push(this._last || this.snapshot()); if (this.hist.length > 80) this.hist.shift(); this.future = []; }
    this._last = this.snapshot();
    this.onChange(this.graph);
  }
  initHistory() { this._last = this.snapshot(); }
  restore(json) {
    const g = JSON.parse(json); this.graph.nodes = g.nodes; this.graph.edges = g.edges;
    this.sel = new Set([...this.sel].filter((id) => this.node(id))); this.selEdge = null; this._last = json;
    this.renderAll(); this.renderInspector(); this.onChange(this.graph);
  }
  undo() { if (!this.hist.length) return; this.future.push(this.snapshot()); this.restore(this.hist.pop()); }
  redo() { if (!this.future.length) return; this.hist.push(this.snapshot()); this.restore(this.future.pop()); }
  setSaveState(text, kind = '') { this.saveEl.textContent = text; this.saveEl.dataset.kind = kind; }

  // ===================================================================== операції з графом
  addNode(type, x, y) {
    const d = this.byType[type]; if (!d || this.readonly) return;
    if (d.permanent && this.graph.nodes.some((n) => n.type === type)) return toast('Нода «Стего» в проєкті лише одна.', 'error');
    if (x === undefined) { const r = this.board.getBoundingClientRect(), c = this.toWorld(r.left + r.width / 2, r.top + r.height / 2); x = c.x - NODE_W / 2 + (this.graph.nodes.length % 5) * 24; y = c.y - 40 + (this.graph.nodes.length % 5) * 24; }
    const node = { id: `n${Date.now().toString(36)}${(uid++).toString(36)}`, type, x: this.snap(x), y: this.snap(y), params: {}, inputs: {} };
    d.params.forEach((p) => { node.params[p.name] = p.default; });
    this.graph.nodes.push(node);
    this.sel = new Set([node.id]); this.selEdge = null;
    this.commit(); this.renderAll(); this.renderInspector();
  }
  duplicate(ids) {
    if (this.readonly) return;
    const copies = [];
    ids.map((id) => this.node(id)).filter((n) => n && !this.byType[n.type].permanent).forEach((n) => {
      const c = JSON.parse(JSON.stringify(n)); c.id = `n${Date.now().toString(36)}${(uid++).toString(36)}`; c.x += 30; c.y += 30; this.graph.nodes.push(c); copies.push(c.id);
    });
    if (!copies.length) return toast('Цю ноду дублювати не можна.', 'error');
    this.sel = new Set(copies); this.selEdge = null; this.commit(); this.renderAll(); this.renderInspector();
  }
  remove(ids) {
    if (this.readonly) return;
    const del = ids.filter((id) => { const n = this.node(id); return n && !this.byType[n.type].permanent; });
    if (del.length < ids.length) toast('Нода «Стего» постійна — її не можна видалити.', 'error');
    if (!del.length) return;
    this.graph.nodes = this.graph.nodes.filter((n) => !del.includes(n.id));
    this.graph.edges = this.graph.edges.filter((e) => !del.includes(e.from[0]) && !del.includes(e.to[0]));
    this.sel = new Set([...this.sel].filter((id) => !del.includes(id))); this.commit(); this.renderAll(); this.renderInspector();
  }
  disconnect(nodeId) { if (this.readonly) return; this.graph.edges = this.graph.edges.filter((e) => e.from[0] !== nodeId && e.to[0] !== nodeId); this.commit(); this.renderAll(); this.renderInspector(); }
  removeEdge(id) { if (this.readonly) return; this.graph.edges = this.graph.edges.filter((e) => e.id !== id); if (this.selEdge === id) this.selEdge = null; this.commit(); this.renderAll(); this.renderInspector(); }
  snap(v) { return this.prefs.snap === false ? Math.round(v) : Math.round(v / GRID) * GRID; }

  reaches(fromNode, targetNode) {
    const seen = new Set(), stack = [fromNode];
    while (stack.length) {
      const cur = stack.pop(); if (cur === targetNode) return true; if (seen.has(cur)) continue; seen.add(cur);
      this.graph.edges.forEach((e) => { if (e.from[0] === cur) stack.push(e.to[0]); });
    }
    return false;
  }
  tryConnect(a, b) {   // a, b = {node, port, side}; повертає true, якщо з'єднано
    if (this.readonly) return false;
    let out = a.side === 'out' ? a : b, inn = a.side === 'out' ? b : a;
    if (a.side === b.side) return toast('З\'єднувати можна лише вихід із входом.', 'error'), false;
    if (out.node === inn.node) return toast('Не можна з\'єднати ноду саму із собою.', 'error'), false;
    const to = this.portType(out.node, 'out', out.port), ti = this.portType(inn.node, 'in', inn.port);
    if (to !== ti && !this.accepts(inn.node, inn.port).includes(to)) return toast(`Типи не збігаються: «${this.typeLabel(to)}» → «${this.typeLabel(ti)}». З'єднання неможливе.`, 'error'), false;
    if (this.reaches(inn.node, out.node)) return toast('Таке з\'єднання створило б цикл у графі.', 'error'), false;
    this.graph.edges = this.graph.edges.filter((e) => !(e.to[0] === inn.node && e.to[1] === inn.port));
    this.graph.edges.push({ id: `e${Date.now().toString(36)}${(uid++).toString(36)}`, from: [out.node, out.port], to: [inn.node, inn.port] });
    this.commit(); this.renderAll(); this.renderInspector(); return true;
  }
  setParam(node, name, value, fromNode) {
    node.params = node.params || {}; node.params[name] = value;
    const d = this.byType[node.type];
    if (d.variants && d.variants.param === name) {     // змінилась версія → вхідні порти інші: прибираємо зв'язки на зниклі порти
      const names = new Set(this.ports_in(node).map((p) => p.name));
      this.graph.edges = this.graph.edges.filter((e) => e.to[0] !== node.id || names.has(e.to[1]));
      this.commit(); this.renderAll(); this.renderInspector(); return;
    }
    this.commit(false); if (!fromNode) this.renderNode(node); this.renderInspector(true); this.drawEdges();
  }

  // ===================================================================== рендер нод
  renderAll() {
    const ids = new Set(this.graph.nodes.map((n) => n.id));
    for (const [id, el] of this.nodeEls) if (!ids.has(id)) { el.remove(); this.nodeEls.delete(id); }
    this.graph.nodes.forEach((n) => this.renderNode(n));
    this.drawEdges();
  }

  renderNode(node) {
    const d = this.byType[node.type], color = this.color(node);
    const old = this.nodeEls.get(node.id);
    const el = h('div', { class: `node${this.sel.has(node.id) ? ' sel' : ''}${d.permanent ? ' perm' : ''}`, 'data-id': node.id, style: { '--c': color, transform: `translate(${node.x}px, ${node.y}px)` } });
    el.style.width = NODE_W + 'px';
    el.append(h('svg:svg', { class: 'sel-ring' }, h('svg:rect', {})));
    const nameInput = null;
    el.append(h('div', { class: 'node-head' }, h('span', { class: 'ttl' }, this.title(node)), d.permanent && h('span', { class: 'lock', title: 'Постійна нода' }, '🔒')));
    const body = h('div', { class: 'node-body' });

    this.ports_out(node).forEach((p) => body.append(this.portRow(node, p, 'out')));
    this.ports_in(node).forEach((p) => body.append(this.portRow(node, p, 'in')));
    d.params.forEach((p) => body.append(this.paramRow(node, p)));
    el.append(body);

    el.addEventListener('pointerdown', (e) => this.onNodeDown(e, node));
    el.addEventListener('contextmenu', (e) => this.onNodeMenu(e, node));
    if (old) old.replaceWith(el); else this.nodesLayer.append(el);
    this.nodeEls.set(node.id, el);
    this.measure(node);
    return el;
  }

  portRow(node, p, side) {
    const connected = side === 'in' ? this.incoming(node.id, p.name) : null;
    const dot = h('span', { class: 'port', 'data-node': node.id, 'data-port': p.name, 'data-side': side, style: { background: this.types[p.type].color }, 'data-tip': `${side === 'out' ? 'Виходить' : 'Приймає'}: ${[p.type, ...(p.accepts || [])].map((t) => this.typeLabel(t)).join(' або ')}` });
    dot.addEventListener('pointerdown', (e) => this.onPortDown(e, node, p, side));
    dot.addEventListener('pointerenter', (e) => this.tip(dot.dataset.tip, e));
    dot.addEventListener('pointermove', (e) => this.tip(dot.dataset.tip, e));
    dot.addEventListener('pointerleave', () => this.tip(null));
    const row = h('div', { class: `prow ${side}` });
    const label = h('span', { class: 'plabel' }, p.label);
    if (side === 'out') row.append(label, dot);
    else {
      row.append(dot, label);
      if (!connected && p.type !== 'image') row.append(this.inlineWidget(node, p));
      else if (connected) row.append(h('span', { class: 'linked' }, 'підключено'));
    }
    this.ports.set(`${node.id}:${side}:${p.name}`, dot);
    return row;
  }

  inlineWidget(node, p) {
    node.inputs = node.inputs || {};
    const val = node.inputs[p.name] ?? p.default ?? '';
    const stop = (el) => { el.addEventListener('pointerdown', (e) => e.stopPropagation()); return el; };
    if (p.type === 'bool') {
      const input = h('input', { type: 'checkbox', checked: val === true || val === 'true' });
      input.onchange = () => { node.inputs[p.name] = input.checked; this.commit(false); this.renderInspector(true); };
      return stop(h('label', { class: 'switch mini' }, input, h('i')));
    }
    const input = h('input', { class: 'nin', type: p.type === 'number' ? 'number' : 'text', step: 'any', value: val, placeholder: p.type === 'bits' ? '0101…' : '', spellcheck: false });
    input.oninput = () => { node.inputs[p.name] = p.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value; this.commit(false); };
    input.onchange = () => this.renderInspector(true);
    return stop(input);
  }

  paramRow(node, p) {
    const params = node.params || (node.params = {});
    const val = params[p.name] ?? p.default;
    const stop = (el) => { el.addEventListener('pointerdown', (e) => e.stopPropagation()); return el; };
    let control;
    if (p.kind === 'select') {
      control = select(p.options, val, (v) => this.setParam(node, p.name, v, true), { cls: 'mini-dd' });
    } else if (p.kind === 'bool') {
      const input = h('input', { type: 'checkbox', checked: !!val }); input.onchange = () => this.setParam(node, p.name, input.checked, true);
      control = h('label', { class: 'switch mini' }, input, h('i'));
    } else if (p.kind === 'textarea') {
      control = h('textarea', { class: 'nin area', rows: 2, value: val ?? '' }); control.oninput = () => this.setParam(node, p.name, control.value, true);
    } else {
      control = h('input', { class: 'nin', type: p.kind === 'number' ? 'number' : 'text', step: 'any', value: val ?? '', maxLength: 40 });
      control.oninput = () => { this.setParam(node, p.name, p.kind === 'number' ? Number(control.value) : control.value, true); if (p.name === 'label') $('.ttl', this.nodeEls.get(node.id)).textContent = this.title(node); };
    }
    return stop(h('div', { class: 'param' }, h('span', {}, p.label), control));
  }

  measure(node) {
    const el = this.nodeEls.get(node.id), nr = el.getBoundingClientRect(), z = this.view.zoom;
    $$('.port', el).forEach((dot) => {
      const r = dot.getBoundingClientRect();
      this.portOff.set(`${node.id}:${dot.dataset.side}:${dot.dataset.port}`, { dx: (r.left + r.width / 2 - nr.left) / z, dy: (r.top + r.height / 2 - nr.top) / z });
    });
  }
  portPos(nodeId, side, port) {
    const n = this.node(nodeId), o = this.portOff.get(`${nodeId}:${side}:${port}`);
    return n && o ? { x: n.x + o.dx, y: n.y + o.dy } : null;
  }

  // ===================================================================== зв'язки
  edgePath(a, b) { const dx = Math.max(50, Math.abs(b.x - a.x) * 0.5); return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`; }
  drawEdges() {
    const frag = document.createDocumentFragment();
    this.graph.edges.forEach((e) => {
      const a = this.portPos(e.from[0], 'out', e.from[1]), b = this.portPos(e.to[0], 'in', e.to[1]); if (!a || !b) return;
      const type = this.portType(e.from[0], 'out', e.from[1]), color = this.types[type]?.color || '#888', d = this.edgePath(a, b), sel = this.selEdge === e.id;
      const g = h('svg:g', { class: `edge${sel ? ' sel' : ''}`, 'data-id': e.id });
      const vis = h('svg:path', { d, class: 'edge-line', stroke: sel ? '#fff' : color, 'stroke-width': sel ? 4.5 : 3.2, fill: 'none' });
      const hit = h('svg:path', { d, class: 'edge-hit', fill: 'none', stroke: 'transparent', 'stroke-width': 18 });
      hit.addEventListener('pointerenter', (ev) => { vis.classList.add('hover'); this.tip(`Передається: ${this.typeLabel(type)}`, ev); });
      hit.addEventListener('pointermove', (ev) => this.tip(`Передається: ${this.typeLabel(type)}`, ev));
      hit.addEventListener('pointerleave', () => { vis.classList.remove('hover'); this.tip(null); });
      hit.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.button === 0) { this.selEdge = e.id; this.sel = new Set(); this.renderAll(); this.renderInspector(); } });
      hit.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (this.readonly) return; this.selEdge = e.id; this.sel = new Set(); this.renderAll(); this.renderInspector();
        contextMenu(ev.clientX, ev.clientY, [{ label: 'Видалити зв\'язок', icon: '✂', danger: true, action: () => this.removeEdge(e.id) }]); });
      g.append(vis, hit); frag.append(g);
    });
    if (this.temp) frag.append(this.temp);
    this.svg.replaceChildren(frag);
  }

  tip(text, e) {
    if (!text || this.prefs.hints === false) { this.tipEl.hidden = true; return; }
    this.tipEl.textContent = text; this.tipEl.hidden = false;
    this.tipEl.style.left = (e.clientX + 14) + 'px'; this.tipEl.style.top = (e.clientY + 14) + 'px';
  }

  // ===================================================================== взаємодія
  onPortDown(e, node, p, side) {
    if (e.button !== 0 || this.readonly) return; e.stopPropagation(); e.preventDefault();
    const start = { node: node.id, port: p.name, side }, from = this.portPos(node.id, side, p.name), type = this.portType(node.id, side, p.name);
    const color = this.types[type].color;
    const move = (ev) => {
      const w = this.toWorld(ev.clientX, ev.clientY);
      this.temp = h('svg:path', { d: side === 'out' ? this.edgePath(from, w) : this.edgePath(w, from), class: 'edge-temp', stroke: color, fill: 'none', 'stroke-width': 3 });
      this.drawEdges();
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.port');
      $$('.port.target', this.nodesLayer).forEach((x) => x.classList.remove('target')); if (target && target.dataset.side !== side) target.classList.add('target');
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      this.temp = null; $$('.port.target', this.nodesLayer).forEach((x) => x.classList.remove('target'));
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.port');
      if (target && !(target.dataset.node === start.node && target.dataset.side === start.side && target.dataset.port === start.port)) {
        if (!this.tryConnect(start, { node: target.dataset.node, port: target.dataset.port, side: target.dataset.side })) this.drawEdges();   // невдало — прибираємо «привид» лінії
      } else this.drawEdges();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  select(id, additive) {
    this.selEdge = null;
    if (additive) { this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id); } else if (!this.sel.has(id)) this.sel = new Set([id]);
    this.nodeEls.forEach((el, nid) => el.classList.toggle('sel', this.sel.has(nid)));
    this.drawEdges(); this.renderInspector();
  }

  onNodeDown(e, node) {
    if (e.button !== 0) return;
    if (e.target.closest('.port, input, textarea, select, .dd, label.switch')) return;
    e.stopPropagation(); this.closeMenus();
    this.select(node.id, e.shiftKey || e.ctrlKey || e.metaKey);
    if (this.readonly) return;
    const ids = [...this.sel], start = ids.map((id) => ({ n: this.node(id), x: this.node(id).x, y: this.node(id).y })), sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / this.view.zoom, dy = (ev.clientY - sy) / this.view.zoom;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return; moved = true;
      start.forEach((s) => { s.n.x = s.x + dx; s.n.y = s.y + dy; this.nodeEls.get(s.n.id).style.transform = `translate(${s.n.x}px, ${s.n.y}px)`; });
      this.drawEdges();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (moved) { start.forEach((s) => { s.n.x = this.snap(s.n.x); s.n.y = this.snap(s.n.y); this.nodeEls.get(s.n.id).style.transform = `translate(${s.n.x}px, ${s.n.y}px)`; }); this.drawEdges(); this.commit(); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  onNodeMenu(e, node) {
    e.preventDefault(); e.stopPropagation();
    if (this.readonly) return;
    if (!this.sel.has(node.id)) this.select(node.id, false);
    const perm = this.byType[node.type].permanent;
    contextMenu(e.clientX, e.clientY, [
      { label: 'Дублювати', icon: '⧉', action: () => this.duplicate([...this.sel]) },
      { label: 'Від\'єднати всі зв\'язки', icon: '✂', action: () => this.disconnect(node.id) },
      { label: 'Центрувати на ноді', icon: '◎', action: () => this.centerOn(node) }, '-',
      { label: perm ? 'Видалити (постійна нода)' : 'Видалити', icon: '🗑', danger: true, action: () => this.remove([...this.sel]) },
    ]);
  }
  centerOn(node) { const r = this.board.getBoundingClientRect(); this.view.x = r.width / 2 - (node.x + NODE_W / 2) * this.view.zoom; this.view.y = r.height / 2 - (node.y + 40) * this.view.zoom; this.applyView(); }
  closeMenus() { closeCtx(); }

  bindBoard() {
    const b = this.board;
    b.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
    b.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.node, .ed-hud, .edge-hit')) return;
      this.closeMenus(); b.focus();
      if (e.button === 1 || e.button === 0 && !e.shiftKey) {                 // панорамування
        e.preventDefault(); const sx = e.clientX, sy = e.clientY, ox = this.view.x, oy = this.view.y; let moved = false;
        const move = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 3) moved = true; this.view.x = ox + ev.clientX - sx; this.view.y = oy + ev.clientY - sy; this.applyView(); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          if (!moved && (this.sel.size || this.selEdge)) { this.sel = new Set(); this.selEdge = null; this.nodeEls.forEach((el) => el.classList.remove('sel')); this.drawEdges(); this.renderInspector(); } };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      } else if (e.button === 0 && e.shiftKey) {                              // рамка виділення
        const r = b.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        this.boxEl.hidden = false;
        const move = (ev) => { const x = ev.clientX - r.left, y = ev.clientY - r.top; Object.assign(this.boxEl.style, { left: Math.min(sx, x) + 'px', top: Math.min(sy, y) + 'px', width: Math.abs(x - sx) + 'px', height: Math.abs(y - sy) + 'px' }); };
        const up = (ev) => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.boxEl.hidden = true;
          const a = this.toWorld(Math.min(e.clientX, ev.clientX), Math.min(e.clientY, ev.clientY)), c = this.toWorld(Math.max(e.clientX, ev.clientX), Math.max(e.clientY, ev.clientY));
          this.sel = new Set(this.graph.nodes.filter((n) => { const el = this.nodeEls.get(n.id), hh = el?.offsetHeight || 80; return n.x < c.x && n.x + NODE_W > a.x && n.y < c.y && n.y + hh > a.y; }).map((n) => n.id));
          this.selEdge = null; this.nodeEls.forEach((el, id) => el.classList.toggle('sel', this.sel.has(id))); this.drawEdges(); this.renderInspector();
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      }
    });
    b.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.node, .edge-hit')) return; e.preventDefault();
      contextMenu(e.clientX, e.clientY, [{ label: 'Вмістити все', icon: '⛶', action: () => this.fit() }, { label: 'Скинути масштаб', icon: '◎', action: () => { this.view.zoom = uiScale(); this.applyView(); } },
        { label: 'Виділити все', icon: '▣', action: () => { this.sel = new Set(this.graph.nodes.map((n) => n.id)); this.renderAll(); this.renderInspector(); } }]);
    });
    this._key = (e) => {
      if (this.readonly || !this.el.isConnected || e.target.closest('input, textarea, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      if ((e.key === 'Delete' || e.key === 'Backspace') && (this.sel.size || this.selEdge)) { e.preventDefault(); this.selEdge ? this.removeEdge(this.selEdge) : this.remove([...this.sel]); }
      else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); this.duplicate([...this.sel]); }
      else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); this.redo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); this.sel = new Set(this.graph.nodes.map((n) => n.id)); this.renderAll(); this.renderInspector(); }
    };
    document.addEventListener('keydown', this._key);
  }

  // ===================================================================== інспектор (праворуч)
  renderInspector(soft) {
    const box = this.inspector, ids = [...this.sel];
    if (this.selEdge) {
      const e = this.graph.edges.find((x) => x.id === this.selEdge); if (!e) { box.replaceChildren(); return; }
      const type = this.portType(e.from[0], 'out', e.from[1]), a = this.node(e.from[0]), z = this.node(e.to[0]);
      box.replaceChildren(h('div', { class: 'insp-head', style: { '--c': this.types[type].color } }, h('b', {}, 'Зв\'язок'), h('small', {}, 'виділено')),
        h('div', { class: 'insp-body' }, h('div', { class: 'kv' }, h('span', {}, 'Тип даних'), h('b', {}, h('i', { class: 'dot', style: { background: this.types[type].color } }), this.typeLabel(type))),
          h('div', { class: 'kv' }, h('span', {}, 'Звідки'), h('b', {}, `${this.title(a)} · ${e.from[1]}`)), h('div', { class: 'kv' }, h('span', {}, 'Куди'), h('b', {}, `${this.title(z)} · ${e.to[1]}`)),
          h('button', { class: 'btn danger block', onclick: () => this.removeEdge(e.id) }, '✂ Видалити зв\'язок')));
      return;
    }
    if (ids.length !== 1) {
      const types = Object.entries(this.types);
      box.replaceChildren(h('div', { class: 'insp-head', style: { '--c': 'var(--accent)' } }, h('b', {}, ids.length > 1 ? `Виділено нод: ${ids.length}` : 'Проєкт'), h('small', {}, ids.length > 1 ? 'груповий режим' : 'нічого не виділено')),
        h('div', { class: 'insp-body' },
          h('div', { class: 'kv' }, h('span', {}, 'Нод'), h('b', {}, this.graph.nodes.length)), h('div', { class: 'kv' }, h('span', {}, 'Зв\'язків'), h('b', {}, this.graph.edges.length)),
          ids.length > 1 && h('div', { class: 'row-gap' }, h('button', { class: 'btn ghost', onclick: () => this.duplicate(ids) }, '⧉ Дублювати'), h('button', { class: 'btn danger', onclick: () => this.remove(ids) }, '🗑 Видалити')),
          h('p', { class: 'hint' }, 'Натисніть на ноду, щоб побачити її налаштування. Тягніть кружечок порта до кружечка іншої ноди, щоб з\'єднати. ПКМ по ноді чи зв\'язку — меню. Колесо — масштаб, перетягування фону — панорама, Shift + рамка — виділення.'),
          h('div', { class: 'type-list' }, types.map(([id, t]) => h('div', {}, h('i', { class: 'dot', style: { background: t.color } }), t.label)))));
      return;
    }
    const node = this.node(ids[0]), d = this.byType[node.type], cat = this.cat[d.category];
    const nameInput = h('input', { class: 'input', value: node.name || '', placeholder: this.byType[node.type].title, maxLength: 40 });
    nameInput.oninput = () => { node.name = nameInput.value.trim() || undefined; if (!node.name) delete node.name; $('.ttl', this.nodeEls.get(node.id)).textContent = this.title(node); this.commit(false); };
    const params = d.params.map((p) => {
      const val = node.params?.[p.name] ?? p.default; let control;
      if (p.kind === 'select') control = select(p.options, val, (v) => this.setParam(node, p.name, v, false));
      else if (p.kind === 'bool') { const i = h('input', { type: 'checkbox', checked: !!val }); i.onchange = () => this.setParam(node, p.name, i.checked, false); control = h('label', { class: 'switch' }, i, h('i')); }
      else if (p.kind === 'textarea') { control = h('textarea', { class: 'textarea', rows: 3 }); control.value = val ?? ''; control.oninput = () => this.setParam(node, p.name, control.value, false); }
      else { control = h('input', { class: 'input', type: p.kind === 'number' ? 'number' : 'text', step: 'any', value: val ?? '' }); control.oninput = () => this.setParam(node, p.name, p.kind === 'number' ? Number(control.value) : control.value, false); }
      return h('label', { class: 'field' }, h('span', {}, p.label), control);
    });
    const portInfo = (list, side) => list.map((p) => h('div', { class: 'kv' }, h('span', {}, h('i', { class: 'dot', style: { background: this.types[p.type].color } }), p.label), h('b', {}, this.typeLabel(p.type))));
    box.replaceChildren(
      h('div', { class: 'insp-head', style: { '--c': cat.color } }, h('b', {}, this.title(node)), h('small', {}, cat.label)),
      h('div', { class: 'insp-body' },
        d.desc && h('p', { class: 'desc' }, d.desc),
        h('label', { class: 'field' }, h('span', {}, 'Назва ноди'), nameInput),
        params.length ? h('div', { class: 'insp-sec' }, h('h4', {}, 'Налаштування'), params) : null,
        h('div', { class: 'insp-sec' }, h('h4', {}, 'Входи'), this.ports_in(node).length ? portInfo(this.ports_in(node), 'in') : h('small', {}, 'немає')),
        h('div', { class: 'insp-sec' }, h('h4', {}, 'Виходи'), this.ports_out(node).length ? portInfo(this.ports_out(node), 'out') : h('small', {}, 'немає')),
        d.invertible && h('p', { class: 'hint ok' }, '↩ Ця нода має зворотну дію — декодування пройде крізь неї.'),
        d.permanent && h('p', { class: 'hint' }, '🔒 Постійна нода: версія стего змінює набір входів.'),
        h('div', { class: 'row-gap' },
          h('button', { class: 'btn ghost', disabled: d.permanent, onclick: () => this.duplicate([node.id]) }, '⧉ Дублювати'),
          h('button', { class: 'btn ghost', onclick: () => this.disconnect(node.id) }, '✂ Від\'єднати'),
          h('button', { class: 'btn danger', disabled: d.permanent, onclick: () => this.remove([node.id]) }, '🗑 Видалити'))));
  }

  destroy() { document.removeEventListener('keydown', this._key); closeCtx(); }
}
