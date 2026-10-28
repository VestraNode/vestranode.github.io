// lab.js — спільні компоненти «лабораторії»: 4 зображення, сітка чанків (пульсація), стегоаналіз, статистика, графік, термінал
import { h, $, $$, api, store, select, toast, fmtInt, fmtNum, fmtBytes, b64ToBuf, hexToRgb, debounce, authUrl, uiScale } from './core.js';

// ===================================================================== градієнти
export const GRADIENTS = {
  viridis: { name: 'Viridis', stops: ['#440154', '#3b528b', '#21908d', '#5dc863', '#fde725'] },
  inferno: { name: 'Inferno', stops: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4'] },
  plasma: { name: 'Plasma', stops: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'] },
  rainbow: { name: 'Веселка', stops: ['#30123b', '#4686fb', '#1ae4b6', '#a4fc3c', '#fabb38', '#e4460a', '#7a0403'] },
  coolwarm: { name: 'Холодний → теплий', stops: ['#3b4cc0', '#9ebeff', '#f2f2f2', '#f4a582', '#b40426'] },
  fire: { name: 'Вогонь', stops: ['#000000', '#7f0000', '#ff4500', '#ffd700', '#ffffff'] },
  ocean: { name: 'Океан', stops: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'] },
  gray: { name: 'Сірий', stops: ['#000000', '#ffffff'] },
};
const lutCache = {};
export function lutFor(id) {
  if (lutCache[id]) return lutCache[id];
  const stops = GRADIENTS[id].stops.map(hexToRgb), lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  return (lutCache[id] = lut);
}
const lutColor = (lut, idx) => `rgb(${lut[idx * 3]},${lut[idx * 3 + 1]},${lut[idx * 3 + 2]})`;
const cssGradient = (id) => `linear-gradient(90deg, ${GRADIENTS[id].stops.join(',')})`;

// ===================================================================== термінал (плаваюче вікно)
export class Terminal {
  constructor() {
    this.s = { open: false, min: false, left: null, top: null, w: 520, h: 300, ...store.get('term', {}) };
    this.body = h('div', { class: 'term-body' });
    this.el = h('div', { class: 'term', hidden: true },
      h('div', { class: 'term-bar' }, h('span', { class: 'term-dots' }, h('i'), h('i'), h('i')), h('b', {}, 'vestranode — логи'),
        h('span', { class: 'term-actions' },
          h('button', { title: 'Очистити', onclick: () => this.clear() }, '⌫'), h('button', { title: 'Згорнути', onclick: () => { this.s.min = !this.s.min; this.apply(); this.save(); } }, '—'),
          h('button', { title: 'Закрити', onclick: () => this.setOpen(false) }, '✕'))),
      this.body);
    document.body.append(this.el);
    const bar = $('.term-bar', this.el);
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const sx = e.clientX, sy = e.clientY, sl = this.s.left, st = this.s.top;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => { this.s.left = sl + ev.clientX - sx; this.s.top = st + ev.clientY - sy; this.clamp(); };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); this.save(); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
    });
    this.ro = new ResizeObserver(() => { if (!this.s.min && !this.el.hidden) { this.s.w = this.el.offsetWidth; this.s.h = this.el.offsetHeight; this.save(); } });
    this.ro.observe(this.el);
    this.apply();
    this.add('info', 'Термінал готовий: тут з\'являться логи кожної ноди та модулів стего (жовті — попередження, червоні — помилки).', 'vestra');
  }
  save() { store.set('term', this.s); }
  clamp() {
    this.s.left = Math.min(Math.max(this.s.left, 80 - this.el.offsetWidth), innerWidth - 80);
    this.s.top = Math.min(Math.max(this.s.top, 0), innerHeight - 34);
    this.el.style.left = this.s.left + 'px'; this.el.style.top = this.s.top + 'px';
  }
  apply() {
    this.el.hidden = !this.s.open; this.el.classList.toggle('min', this.s.min);
    this.el.style.width = this.s.w + 'px'; if (!this.s.min) this.el.style.height = this.s.h + 'px';
    if (this.s.left === null) { this.s.left = Math.max(10, innerWidth - this.s.w - 24); this.s.top = Math.max(10, innerHeight - this.s.h - 24); }
    this.clamp();
  }
  setOpen(v) { this.s.open = v; if (v) this.s.min = false; this.apply(); this.save(); }
  toggle() { this.setOpen(!this.s.open); }
  clear() { this.body.replaceChildren(); }
  add(level, msg, src = 'ui', t) {
    const stick = this.body.scrollHeight - this.body.scrollTop - this.body.clientHeight < 40;
    this.body.append(h('div', { class: `ln ${level === 'warn' || level === 'error' ? level : ''}` },
      h('span', { class: 't' }, t || new Date().toLocaleTimeString('uk-UA', { hour12: false })), h('span', { class: 's' }, `[${src}]`), h('span', {}, msg)));
    while (this.body.childElementCount > 700) this.body.firstChild.remove();
    if (stick) this.body.scrollTop = this.body.scrollHeight;
  }
  ingest(logs) { (logs || []).forEach((l) => this.add(l.level, l.msg, l.src, l.t)); }
  destroy() { this.ro.disconnect(); this.el.remove(); }
}

// ===================================================================== допоміжні обчислення
function histStats(hist) {
  let total = 0, sum = 0, max = 0;
  hist.forEach((v, i) => { total += v; sum += v * i; if (v > 0) max = i; });
  return { total, mean: total ? sum / total : 0, max, nonzero: total - (hist[0] || 0) };
}
const fmtPct = (a, b) => (b > 0 ? `${fmtNum((a / b) * 100, 2)} %` : '—');
const fmtIdx = (v) => (v === null || v === undefined ? '∞ (шуму немає)' : fmtNum(v, 2));

function smoothSeries(hist, range, n) {
  const sigma = Math.max(1, range / 70), out = new Float64Array(n), norm = 1 / (sigma * Math.sqrt(2 * Math.PI));
  for (let i = 0; i < n; i++) {
    const lvl = (i / (n - 1)) * range, lo = Math.floor(lvl - 3 * sigma), hi = Math.ceil(lvl + 3 * sigma);
    let acc = 0;
    for (let j = lo; j <= hi; j++) {
      const idx = j < 0 ? -j - 1 : j;
      if (idx >= hist.length) continue;
      const z = (j - lvl) / sigma; acc += hist[idx] * Math.exp(-0.5 * z * z);
    }
    out[i] = acc * norm;
  }
  return out;
}
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
function traceCurve(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
}

// ===================================================================== Lab
const PULSE_MS = 3000;
const GRID_PX = 1000;

export class Lab {
  /**
   * opts: { compact, terminal, mode: 'encode'|'decode'|'analysis', showEncodedCards }
   * data: { photo:{url,width,height,id,name}, analysis, enc, dec, hasText, params:{threshold}, error }
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.term = opts.terminal;
    const prefs = store.get('lab', {});
    this.s = { gradient: 'viridis', norm: 'image', view: 'noise', stegView: 'neighbors', stegView2: 'lsb', chartRange: 'full', chartColor: 'height', blink: '#ff2bd6', ...prefs };
    this.data = { photo: null, analysis: null, enc: null, dec: null, hasText: false, threshold: 8, mode: opts.mode || 'encode', encError: null, decError: null, stale: false };
    this.stegViews = []; this.steg = { before: null, after: null, encId: null, view: null, loading: false, error: null };
    this.steg2 = { url: null, view: null, error: null };     // другий вигляд (4-й блок у режимі «Стегоаналіз»)
    this.seq = { steg: 0 }; this.layers = null; this.raf = 0; this.pulseStart = performance.now(); this.analysisVer = 0; this.chartCache = null;
    this.el = this.build();
    this.ro = new ResizeObserver(() => this.drawChart()); this.ro.observe(this.chartWrap);
    this.loadViews();
  }

  // ------------------------------------------------------------- побудова DOM
  build() {
    const mk = (title, extra) => { const frame = h('div', { class: 'lab-frame' }); const card = h('div', { class: 'lab-card' }, h('h3', {}, title), frame, extra); return { card, frame, title: card.querySelector('h3') }; };
    this.legend = h('div', { class: 'lab-legend', hidden: true }, h('div', { class: 'bar' }), h('div', { class: 'ends' }, h('span', {}, '0'), h('span', { class: 'max' })));
    this.c1 = mk('Фото'); this.c2 = mk('Шумність чанків', this.legend); this.c3 = mk('Стегоаналіз', h('div', { class: 'lab-cap' })); this.c4 = mk('Стегоаналіз після', h('div', { class: 'lab-cap' }));
    this.stale = h('span', { class: 'lab-stale', hidden: true }, 'застаріло — натисніть «Передперегляд»'); this.c4.card.append(this.stale);
    this.cards = h('div', { class: 'lab-cards' }, this.c1.card, this.c2.card, this.c3.card, this.c4.card);

    this.gradSel = select(Object.entries(GRADIENTS).map(([id, g]) => [id, g.name]), this.s.gradient, (v) => { this.s.gradient = v; this.persist(); this.render(); this.refreshSteg(true); });
    this.normSel = select([['image', 'за максимумом фото'], ['max', 'за теор. максимумом']], this.s.norm, (v) => { this.s.norm = v; this.persist(); this.render(); });
    this.stegSel = select([['neighbors', 'Відхилення від сусідів']], this.s.stegView, (v) => { this.s.stegView = v; this.persist(); this.refreshSteg(); });
    this.stegSel2 = select([['lsb', 'Молодший біт (LSB)']], this.s.stegView2, (v) => { this.s.stegView2 = v; this.persist(); this.refreshSteg2(); });
    this.viewSeg = h('div', { class: 'seg' });
    this.blink = h('input', { type: 'color', class: 'round', value: this.s.blink, title: 'Колір мигання', oninput: (e) => { this.s.blink = e.target.value; this.persist(); this.layers = null; this.paintGrid(); } });
    this.termBtn = h('button', { class: 'btn ghost small', onclick: () => this.term?.toggle() }, '▮ Термінал');
    const tf = (label, el) => h('div', { class: 'tb-field' }, h('small', {}, label), el);
    this.toolbar = h('div', { class: 'lab-toolbar' }, tf('Градієнт', this.gradSel), tf('Нормалізація кольору', this.normSel), tf('Перегляд сітки', this.viewSeg),
      this.tf1 = tf('Стегоаналіз (фото 3 і 4)', this.stegSel), this.tf2 = tf('Другий вигляд (фото 4)', this.stegSel2), tf('Колір мигання', this.blink), tf(' ', this.termBtn));

    this.statsBox = h('div', { class: 'lab-stats' });
    this.chartWrap = h('div', { class: 'lab-chart-wrap' }, this.cv = h('canvas'), this.tip = h('div', { class: 'lab-tip', hidden: true }));
    this.chartCap = h('div', { class: 'lab-cap' });
    this.chartRange = select([['full', 'вісь: від 0 до макс. можливого'], ['data', 'вісь: до макс. у фото']], this.s.chartRange, (v) => { this.s.chartRange = v; this.persist(); this.drawChart(); }, { up: true });
    this.chartColor = select([['height', 'колір за висотою'], ['level', 'колір за рівнем шуму']], this.s.chartColor, (v) => { this.s.chartColor = v; this.persist(); this.drawChart(); }, { up: true });
    const chart = h('div', { class: 'lab-chart card' }, h('div', { class: 'lab-chart-head' }, h('h3', {}, 'Чанки за рівнем забрудненості'), h('div', { class: 'row-gap' }, this.chartRange, this.chartColor)), this.chartWrap, this.chartCap);
    this.chartWrap.addEventListener('mousemove', (e) => {
      if (!this.geo) return;
      const r = this.chartWrap.getBoundingClientRect(), f = (e.clientX - r.left - this.geo.pad.l) / this.geo.pw;
      this.drawChart(f < 0 || f > 1 ? -1 : Math.round(f * (this.geo.n - 1)));
    });
    this.chartWrap.addEventListener('mouseleave', () => this.drawChart());
    const root = h('div', { class: `lab${this.opts.compact ? ' compact' : ''}` }, this.toolbar, this.cards, h('h2', { class: 'lab-h2' }, 'Статистика'), this.statsBox, chart);
    return root;
  }

  persist() { store.set('lab', { gradient: this.s.gradient, norm: this.s.norm, stegView: this.s.stegView, stegView2: this.s.stegView2, chartRange: this.s.chartRange, chartColor: this.s.chartColor, blink: this.s.blink }); }

  async loadViews() {
    try {
      const d = await api('/api/lab/steg_views', { silent: true });
      this.stegViews = d.views;
      if (!this.stegViews.some((v) => v.id === this.s.stegView)) this.s.stegView = 'neighbors';
      this.stegSel.setOptions(this.stegViews.map((v) => [v.id, v.name])); this.stegSel.value = this.s.stegView;
      const single = this.stegViews.filter((v) => !v.pair);
      if (!single.some((v) => v.id === this.s.stegView2)) this.s.stegView2 = single.find((v) => v.id !== this.s.stegView)?.id || 'lsb';
      this.stegSel2.setOptions(single.map((v) => [v.id, v.name])); this.stegSel2.value = this.s.stegView2;
      this.render(); this.refreshSteg();
    } catch { /* без списку лишаємо типовий вигляд */ }
  }
  stegInfo() { return this.stegViews.find((v) => v.id === this.s.stegView) || null; }
  stegInfo2() { return this.stegViews.find((v) => v.id === this.s.stegView2) || null; }

  /** Другий вигляд для 4-го блока в режимі «Стегоаналіз» (поруч із першим можна порівняти, напр., LSB і хі-квадрат). */
  async refreshSteg2(force) {
    const { photo, mode } = this.data, sv = this.stegInfo2();
    if (mode !== 'analysis' || !photo?.id || !sv || sv.pair) { this.steg2 = { url: null, view: null, error: null }; this.renderCards(); return; }
    const seq = this.seq.steg2 = (this.seq.steg2 || 0) + 1;
    try {
      const d = await api('/api/lab/steg', { method: 'POST', json: { id: photo.id, view: this.s.stegView2, threshold: this.data.threshold, gradient_id: this.s.gradient, stops: GRADIENTS[this.s.gradient].stops }, silent: true });
      if (seq !== this.seq.steg2) return;
      this.steg2 = { url: authUrl(d.before_url), view: d.view, error: null };
    } catch (e) {
      if (seq !== this.seq.steg2) return;
      this.steg2 = { url: null, view: null, error: e.message };
    }
    this.renderCards();
  }

  // ------------------------------------------------------------- дані
  set(patch) {
    const prevAn = this.data.analysis;
    Object.assign(this.data, patch);
    if ('analysis' in patch && patch.analysis !== prevAn) { this.analysisVer++; this.layers = null; this.chartCache = null; }
    if ('enc' in patch || 'dec' in patch) { this.layers = null; this.pulseStart = performance.now(); }
    this.render();
    if ('photo' in patch || 'enc' in patch || 'analysis' in patch) { this.refreshSteg(); if (this.data.mode === 'analysis') this.refreshSteg2(); }
    if ('mode' in patch) this.refreshSteg2();
  }

  usedCells() {
    const a = this.data.analysis, src = this.data.mode === 'decode' ? this.data.dec : this.data.enc;
    if (!a || !src || !src.used_cells || src.chunk_size !== a.chunk_size) return null;
    if (!src._used) src._used = new Int32Array(b64ToBuf(src.used_cells));
    return src._used;
  }

  // ------------------------------------------------------------- стегоаналіз (3 і 4)
  async refreshSteg(force) {
    const { photo, enc, mode } = this.data;
    if (force && mode === 'analysis') this.refreshSteg2(true);       // змінився градієнт чи поріг — другий вигляд теж
    if (!photo?.id || !this.stegInfo()) { this.steg = { before: null, after: null, encId: null, view: null, loading: false, error: null }; this.render(); return; }
    const seq = ++this.seq.steg, encId = mode === 'encode' && enc ? enc.enc_id : null;
    this.steg = { ...this.steg, loading: true, error: null }; this.renderCards();
    try {
      const d = await api('/api/lab/steg', { method: 'POST', json: { id: photo.id, enc_id: encId, view: this.s.stegView, threshold: this.data.threshold, gradient_id: this.s.gradient, stops: GRADIENTS[this.s.gradient].stops }, silent: true });
      if (seq !== this.seq.steg) return;
      this.term?.ingest(d.logs);
      this.steg = { before: authUrl(d.before_url), after: authUrl(d.after_url), encId, view: d.view, loading: false, error: null };
    } catch (e) {
      if (seq !== this.seq.steg) return;
      this.steg = { before: null, after: null, encId: null, view: null, loading: false, error: e.message };
    }
    this.renderCards();
  }

  // ------------------------------------------------------------- рендер
  render() { this.renderToolbar(); this.renderCards(); this.renderStats(); this.drawChart(); }

  renderToolbar() {
    const usedOk = !!this.usedCells();
    if (!usedOk && this.s.view === 'used') this.s.view = 'noise';
    this.tf2.hidden = this.data.mode !== 'analysis';
    this.tf1.querySelector('small').textContent = this.data.mode === 'analysis' ? 'Стегоаналіз (фото 3)' : 'Стегоаналіз (фото 3 і 4)';
    this.viewSeg.replaceChildren(...[['noise', 'Шумність'], ['used', 'Використані чанки']].map(([id, label]) =>
      h('button', { class: this.s.view === id ? 'on' : '', disabled: id === 'used' && !usedOk, onclick: () => { this.s.view = id; this.pulseStart = performance.now(); this.render(); } }, label)));
  }

  frame(f, key, build) { if (f.dataset.key === key) return; f.dataset.key = key; f.replaceChildren(build()); }
  ph(text, err) { return h('div', { class: `lab-ph${err ? ' err' : ''}` }, text); }
  img(src) { return h('img', { src, alt: '' }); }

  renderCards() {
    const d = this.data, p = d.photo, a = d.analysis, enc = d.mode === 'encode', sv = this.stegInfo();
    const needPhoto = d.mode === 'decode' ? 'Потрібне фото з прихованою інформацією' : 'Потрібне фото';
    this.cards.style.setProperty('--ar', p?.width ? Math.min(2.2, Math.max(0.6, p.width / p.height)).toFixed(3) : '1.333');

    this.frame(this.c1.frame, p ? `img:${p.url}` : 'none', () => (p ? this.img(p.url) : this.ph(needPhoto)));
    $('h3', this.c1.card).textContent = enc || d.mode === 'analysis' ? 'Фото' : 'Фото з прихованою інформацією';

    this.frame(this.c2.frame, a?.grid ? `grid:${this.analysisVer}` : 'none', () => (a?.grid ? h('canvas') : this.ph('Потрібне фото')));
    $('h3', this.c2.card).textContent = this.s.view === 'used' ? 'Використані чанки (плавно пульсують, цикл 3 с)' : 'Шумність чанків';
    $('.lab-legend', this.c2.card)?.toggleAttribute('hidden', !a?.grid);
    this.paintGrid();

    const name = sv ? ` · ${sv.name}` : '', ready = this.steg.view === this.s.stegView;
    $('h3', this.c3.card).textContent = (enc ? 'Стегоаналіз — до кодування' : 'Стегоаналіз фото') + name;
    $('.lab-cap', this.c3.card).textContent = sv ? sv.desc : '';
    if (!p) this.frame(this.c3.frame, 'none', () => this.ph(needPhoto));
    else if (sv?.pair) this.frame(this.c3.frame, `pair${enc}`, () => this.ph(enc ? 'Цей вигляд порівнює результат з оригіналом — дивіться фото праворуч.' : 'Порівняння з оригіналом недоступне під час декодування.'));
    else if (this.steg.before && ready) this.frame(this.c3.frame, `img:${this.steg.before}`, () => this.img(this.steg.before));
    else if (this.steg.error) this.frame(this.c3.frame, `err:${this.steg.error}`, () => this.ph(this.steg.error, true));
    else this.frame(this.c3.frame, 'wait3', () => this.ph('Обчислення…'));

    const f4 = this.c4.frame; f4.classList.remove('textbox'); $('.lab-cap', this.c4.card).textContent = '';
    if (enc) {
      $('h3', this.c4.card).textContent = 'Стегоаналіз — після кодування' + name;
      if (!p && !d.hasText) this.frame(f4, 'e1', () => this.ph('Потрібен текст'));
      else if (!p) this.frame(f4, 'e2', () => this.ph('До тексту потрібне ще фото'));
      else if (!d.hasText) this.frame(f4, 'e3', () => this.ph('Потрібен текст'));
      else if (d.encError) this.frame(f4, `ee:${d.encError}`, () => this.ph(d.encError, true));
      else if (d.enc) {
        const ok = this.steg.after && this.steg.encId === d.enc.enc_id && ready;
        if (ok) this.frame(f4, `img:${this.steg.after}`, () => this.img(this.steg.after));
        else if (this.steg.error) this.frame(f4, `er:${this.steg.error}`, () => this.ph(this.steg.error, true));
        else this.frame(f4, 'w4', () => this.ph('Обчислення…'));
        $('.lab-cap', this.c4.card).textContent = `Змінено значень каналів: ${fmtInt(d.enc.stats.changed_values)}`;
      } else this.frame(f4, 'e4', () => this.ph('Кодування ще не виконано — натисніть «Передперегляд» зліва, щоб побачити результат'));
    } else if (d.mode === 'decode') {
      $('h3', this.c4.card).textContent = 'Прихований текст (початок)';
      if (!p) this.frame(f4, 'd1', () => this.ph(needPhoto));
      else if (d.decError) this.frame(f4, `de:${d.decError}`, () => this.ph(d.decError, true));
      else if (d.dec) {
        f4.classList.add('textbox');
        this.frame(f4, `dt:${d.dec.text_id}`, () => h('pre', {}, d.dec.text_preview));
        $('.lab-cap', this.c4.card).textContent = `${fmtInt(d.dec.text_chars)} символів · ${fmtInt(d.dec.text_bytes)} байт`;
      } else this.frame(f4, 'd2', () => this.ph('Натисніть «Розкодувати»'));
    } else {
      const sv2 = this.stegInfo2(), ready2 = this.steg2.view === this.s.stegView2;
      $('h3', this.c4.card).textContent = 'Стегоаналіз — другий вигляд' + (sv2 ? ` · ${sv2.name}` : '');
      $('.lab-cap', this.c4.card).textContent = sv2 ? sv2.desc : '';
      if (!p) this.frame(f4, 'an0', () => this.ph(needPhoto));
      else if (this.steg2.url && ready2) this.frame(f4, `img:${this.steg2.url}`, () => this.img(this.steg2.url));
      else if (this.steg2.error) this.frame(f4, `er2:${this.steg2.error}`, () => this.ph(this.steg2.error, true));
      else this.frame(f4, 'an-wait', () => this.ph('Обчислення…'));
    }
    this.stale.hidden = !d.stale;
  }

  // ------------------------------------------------------------- сітка чанків
  buildLayers() {
    const a = this.data.analysis, { rows, cols } = a;
    if (!a._grid) { a._grid = new Uint16Array(b64ToBuf(a.grid)); a._max = a._grid.reduce((m, v) => (v > m ? v : m), 0); }
    const used = this.usedCells(), scale = Math.max(1, Math.round(GRID_PX / cols)), W = cols * scale, H = rows * scale;
    const key = [this.analysisVer, this.s.gradient, this.s.norm, W, H, this.s.blink, used ? used.length : '-'].join('|');
    if (this.layers && this.layers.key === key) return this.layers;
    const lut = lutFor(this.s.gradient), normMax = this.s.norm === 'max' ? a.max_possible : Math.max(1, a._max);
    const make = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
    const base = make(cols, rows), bctx = base.getContext('2d'), bimg = bctx.createImageData(cols, rows);
    for (let i = 0; i < a._grid.length; i++) {
      const idx = Math.min(255, Math.round((a._grid[i] / normMax) * 255));
      bimg.data[i * 4] = lut[idx * 3]; bimg.data[i * 4 + 1] = lut[idx * 3 + 1]; bimg.data[i * 4 + 2] = lut[idx * 3 + 2]; bimg.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(bimg, 0, 0);
    let mask = null, glow = null;
    if (used) {
      mask = make(cols, rows); const mctx = mask.getContext('2d'), mimg = mctx.createImageData(cols, rows), [br, bg, bb] = hexToRgb(this.s.blink);
      for (let k = 0; k + 2 < used.length; k += 3) { const r = used[k], c = used[k + 1]; if (r >= rows || c >= cols) continue; const o = (r * cols + c) * 4; mimg.data[o] = br; mimg.data[o + 1] = bg; mimg.data[o + 2] = bb; mimg.data[o + 3] = 255; }
      mctx.putImageData(mimg, 0, 0);
      glow = make(W, H); const g = glow.getContext('2d'); g.imageSmoothingEnabled = false;
      g.filter = `blur(${Math.max(2, scale * 1.2)}px)`; g.drawImage(mask, 0, 0, W, H); g.filter = `blur(${Math.max(6, scale * 4)}px)`; g.drawImage(mask, 0, 0, W, H); g.filter = 'none';
    }
    return (this.layers = { key, base, mask, glow, W, H, normMax });
  }

  drawGridFrame(now = performance.now()) {
    const cv = $('canvas', this.c2.frame), a = this.data.analysis;
    if (!cv || !a?.grid) return;
    const L = this.buildLayers();
    if (cv.width !== L.W || cv.height !== L.H) { cv.width = L.W; cv.height = L.H; }
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(L.base, 0, 0, L.W, L.H);
    if (this.s.view === 'used' && L.mask) {
      const p = 0.5 - 0.5 * Math.cos(2 * Math.PI * (((now - this.pulseStart) % PULSE_MS) / PULSE_MS));
      ctx.fillStyle = '#000'; ctx.globalAlpha = 0.45 * p; ctx.fillRect(0, 0, L.W, L.H);
      ctx.globalAlpha = p; ctx.drawImage(L.mask, 0, 0, L.W, L.H);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = p; ctx.drawImage(L.glow, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }
  paintGrid() {
    const a = this.data.analysis; if (!a?.grid || !$('canvas', this.c2.frame)) return;
    this.drawGridFrame();
    const L = this.layers;
    $('.bar', this.legend).style.background = cssGradient(this.s.gradient);
    $('.max', this.legend).textContent = `${fmtInt(L.normMax)} (${this.s.norm === 'max' ? 'теор. максимум' : 'максимум у фото'})`;
    cancelAnimationFrame(this.raf);
    const loop = (t) => { this.drawGridFrame(t); if (this.s.view === 'used' && this.layers?.mask && !document.hidden && this.el.isConnected) this.raf = requestAnimationFrame(loop); };
    if (this.s.view === 'used' && L.mask) this.raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- статистика
  statGroups() {
    const d = this.data, a = d.analysis; if (!a?.grid) return [];
    const enc = d.mode === 'encode', st = (enc ? d.enc?.stats : d.dec?.stats) || null, hs = histStats(a.histogram), groups = [];
    const chunks = [
      ['Розмір фото', `${a.width} × ${a.height} px`, `${fmtInt(a.width * a.height)} пікселів`],
      ['Розмір чанка', `${a.chunk_size} × ${a.chunk_size} px`, `макс. шум чанка: ${a.max_possible}`],
      ['Чанків у сітці', fmtInt(hs.total), `${a.cols} × ${a.rows}`], ['Чанків із шумом', fmtInt(hs.nonzero), fmtPct(hs.nonzero, hs.total)],
      ['Шум чанка: середній / макс.', `${fmtNum(hs.mean, 1)} / ${hs.max}`, `${fmtPct(hs.max, a.max_possible)} від теор. максимуму`]];
    if (st) chunks.push(['Чанків використано', fmtInt(st.chunks_used), fmtPct(st.chunks_used, st.chunks_total)]);
    groups.push(['Фото і чанки', chunks]);
    const noise = [['Шумних каналів — до', fmtInt(a.noise_channels), fmtPct(a.noise_channels, a.width * a.height * 3)], ['Індекс забрудненості — до', fmtIdx(a.pollution_index), 'ширина·висота·3 / шумні канали']];
    if (enc && st) {
      noise.splice(1, 0, ['Шумних каналів — після', fmtInt(st.noise_after), `${st.noise_after - a.noise_channels >= 0 ? '+' : ''}${fmtInt(st.noise_after - a.noise_channels)}`]);
      noise.push(['Індекс забрудненості — після', fmtIdx(st.pollution_after), st.pollution_after !== null && a.pollution_index !== null ? `${fmtNum(st.pollution_after - a.pollution_index, 3)} до кодування` : '']);
    }
    groups.push(['Шум і забрудненість', noise]);
    if (enc && st) groups.push(['Зміни після кодування', [
      ['Змінено значень каналів', fmtInt(st.changed_values), `${fmtPct(st.changed_values, st.total_values)} з ${fmtInt(st.total_values)}`],
      ['Змінено пікселів', fmtInt(st.changed_pixels), fmtPct(st.changed_pixels, st.width * st.height)], ['Макс. зміна значення', String(st.max_abs_change)],
      ['PSNR', st.psnr_db === null ? '∞ дБ' : `${fmtNum(st.psnr_db, 2)} дБ`, `MSE ${fmtNum(st.mse, 5)}`], ['Виправлено збігів маркерів', fmtInt(st.marker_fixes)],
      ['Час кодування', `${fmtNum(st.encode_seconds, 2)} с`]]]);
    if (!enc && d.mode === 'decode' && st) groups.push(['Декодування', [['Знайдений розмір чанка x', String(d.dec.chunk_size)], ['Ліміт y (із заголовка)', fmtInt(d.dec.y)],
      ['Розкодовано', `${fmtInt(d.dec.text_chars)} символів`, fmtBytes(d.dec.text_bytes)], ['Час декодування', `${fmtNum(st.decode_seconds, 2)} с`]]]);
    const capacity = st ? st.capacity_bytes ?? a.capacity_bytes : a.capacity_bytes;
    const cap = capacity != null ? [['Макс. вміщування', fmtBytes(capacity), 'байт корисних даних при поточних x, y']] : [];
    if (st && enc) {
      const packed = st.compression && st.compression !== 'без стиснення';
      cap.push(['Дані до архівації', fmtBytes(st.original_bytes)],
        ['Після архівації', fmtBytes(st.stored_bytes), packed ? `${st.compression}: ${fmtNum((st.stored_bytes / Math.max(1, st.original_bytes)) * 100, 1)} % від початкового` : 'без стиснення'],
        ['Використано всього', fmtBytes(st.used_bytes), 'дані + заголовок + маркери'], ['Обсяг прихованої інформації', fmtBytes(st.payload_bytes), capacity ? fmtPct(st.payload_bytes, capacity) + ' місткості' : ''],
        ['Службові: заголовок', fmtBytes(st.header_bytes)], ['Службові: маркери чанків', fmtBytes(st.marker_bytes), `${fmtInt(st.chunks_used)} чанків: №1 — ${st.marker_pixels_first || 2} піксел., решта — ${st.marker_pixels}`],
        ['Піксели маркера (M)', String(st.marker_pixels), st.version === 'ChunkyV1.1' ? `${st.marker_bpc} біт на канал; план M=${st.marker_pixels_safe}` : 'підібрано під кількість чанків']);
      if (st.lsb_changes != null) cap.push(['LSB matching (±1 за шумом)', fmtInt(st.lsb_changes), 'значень каналів змінено у бік меншого шуму'], ['Циклів перевірки', String(st.cycles), `усунено збігів: ${fmtInt(st.marker_fixes)}`]);
    }
    if (cap.length) groups.push(['Місткість і використання', cap]);
    return groups;
  }
  renderStats() {
    const groups = this.statGroups();
    if (!groups.length) { this.statsBox.replaceChildren(h('div', { class: 'lab-empty' }, 'Завантажте фото — тут з\'явиться вся статистика.')); return; }
    this.statsBox.replaceChildren(...groups.map(([title, rows]) => h('div', { class: 'stat-group' }, h('h4', {}, title),
      rows.map(([k, v, hint]) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v, hint ? h('small', {}, hint) : null))))));
  }

  // ------------------------------------------------------------- графік
  drawChart(hoverIdx = -1) {
    const W = this.chartWrap.clientWidth, H = this.chartWrap.clientHeight; if (!W || !H) return;
    const dpr = devicePixelRatio || 1, cv = this.cv; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.tip.hidden = true;
    const css = getComputedStyle(document.documentElement), muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim(), text = css.getPropertyValue('--text').trim();
    const U = uiScale();
    ctx.font = `${11 * U}px system-ui, sans-serif`;
    const a = this.data.analysis;
    if (!a?.grid) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('Завантажте фото, щоб побачити розподіл чанків', W / 2, H / 2); this.geo = null; this.chartCap.textContent = ''; return; }
    const hist = a.histogram, maxActual = hist.reduce((m, v, i) => (v > 0 ? i : m), 0);
    const range = this.s.chartRange === 'full' ? a.max_possible : Math.min(a.max_possible, Math.max(maxActual + 1, 6));
    const pad = { l: 66 * U, r: 16 * U, t: 14 * U, b: 40 * U }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b, n = Math.min(260, Math.max(60, Math.floor(pw / 3)));
    const afterH = this.data.mode === 'encode' && this.data.enc && this.data.enc.chunk_size === a.chunk_size ? this.data.enc.histogram_after : null;
    const ckey = `${this.analysisVer}|${range}|${n}|${afterH ? this.data.enc.enc_id : ''}`;
    if (!this.chartCache || this.chartCache.key !== ckey) this.chartCache = { key: ckey, before: smoothSeries(hist, range, n), after: afterH ? smoothSeries(afterH, range, n) : null };
    const { before, after } = this.chartCache, yMax = niceMax(Math.max(...before, ...(after || [0])) * 1.08);
    const X = (i) => pad.l + (i / (n - 1)) * pw, Y = (v) => pad.t + ph - (v / yMax) * ph;
    ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let t = 0; t <= 4; t++) { const v = (yMax / 4) * t, y = Math.round(Y(v)) + 0.5; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(fmtNum(v, v < 10 ? 1 : 0), pad.l - 8 * U, y); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let t = 0; t <= 6; t++) ctx.fillText(fmtInt((range / 6) * t), pad.l + (pw / 6) * t, pad.t + ph + 8 * U);
    ctx.fillText('Рівень забрудненості чанка (шумних каналів у чанку)', pad.l + pw / 2, H - 16 * U);
    ctx.save(); ctx.translate(12 * U, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('Чанків на рівень', 0, 0); ctx.restore();
    const lut = lutFor(this.s.gradient), normMax = this.s.norm === 'max' ? a.max_possible : Math.max(1, maxActual);
    let fill;
    if (this.s.chartColor === 'height') { fill = ctx.createLinearGradient(0, pad.t + ph, 0, pad.t); for (let s = 0; s <= 8; s++) fill.addColorStop(s / 8, lutColor(lut, Math.round((s / 8) * 255))); }
    else { fill = ctx.createLinearGradient(pad.l, 0, pad.l + pw, 0); for (let s = 0; s <= 16; s++) fill.addColorStop(s / 16, lutColor(lut, Math.min(255, Math.round(((s / 16) * range / normMax) * 255)))); }
    const pts = Array.from(before, (v, i) => [X(i), Y(v)]);
    ctx.beginPath(); traceCurve(ctx, pts); ctx.lineTo(X(n - 1), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath(); ctx.globalAlpha = 0.92; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); traceCurve(ctx, pts); ctx.strokeStyle = text; ctx.lineWidth = 2; ctx.stroke();
    if (after) { ctx.beginPath(); traceCurve(ctx, Array.from(after, (v, i) => [X(i), Y(v)])); ctx.setLineDash([6, 5]); ctx.strokeStyle = text; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]); }
    if (hoverIdx >= 0) {
      const x = X(hoverIdx); ctx.strokeStyle = text; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); ctx.globalAlpha = 1;
      this.tip.hidden = false; this.tip.textContent = `рівень ${fmtNum((hoverIdx / (n - 1)) * range, 0)} · ≈${fmtNum(before[hoverIdx], 1)} чанків${after ? ` (після: ≈${fmtNum(after[hoverIdx], 1)})` : ''}`;
      this.tip.style.left = `${Math.min(Math.max(x, 90), W - 90)}px`; this.tip.style.top = `${Y(before[hoverIdx])}px`;
    }
    this.geo = { pad, pw, n };
    const hs = histStats(hist);
    this.chartCap.textContent = `Чанків усього: ${fmtInt(hs.total)} · найбільший рівень у фото: ${hs.max} з ${a.max_possible}.` + (after ? ' Суцільна лінія — до кодування, пунктир — після.' : '');
  }

  destroy() { cancelAnimationFrame(this.raf); this.ro.disconnect(); }
}
