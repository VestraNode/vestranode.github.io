// analysis.js — «Стегоаналіз»: завантажити фото, переглянути його в різних режимах, статистика й графік
import { h, api, toast, fmtNum, debounce } from '../core.js';
import { Lab, Terminal } from '../lab.js';
import { photoDrop, uploadPhoto, dropServer, stepLabel } from '../parts.js';

export default {
  mount(root) {
    const term = new Terminal();
    const lab = new Lab({ terminal: term, mode: 'analysis' });
    let photo = null, seq = 0;
    const px = h('input', { class: 'input num', type: 'number', min: 4, max: 64, value: 8 });
    const pt = h('input', { class: 'input num', type: 'number', min: 0, max: 255, value: 8 });
    const drop = photoDrop({ onFile: setPhoto, onClear: clear });

    const side = h('aside', { class: 'tool-side' }, h('div', { class: 'tool-scroll' },
      h('div', { class: 'tool-title' }, '📊 Стегоаналіз'),
      h('p', { style: { margin: 0, color: 'var(--muted)', fontSize: '14px' } }, 'Завантажте фото й перегляньте його в різних режимах: відхилення від сусідів, бітові площини, ентропія LSB, χ²-атака, залишок. Праворуч — карта шумності чанків і повна статистика.'),
      h('div', {}, stepLabel(1, 'Фото'), drop.el),
      h('div', {}, stepLabel(2, 'Параметри аналізу'), h('div', { class: 'params3', style: { gridTemplateColumns: '1fr 1fr' } }, h('label', {}, 'x (чанк, px)', px), h('label', {}, 'поріг шуму', pt)))));
    root.append(h('div', { class: 'tool' }, side, h('div', { class: 'tool-main' }, lab.el)));

    async function setPhoto(file) {
      clear(false); term.add('info', `Вибрано фото «${file.name}» (${fmtNum(file.size / 1024, 0)} КБ).`);
      try { photo = await uploadPhoto(file); drop.set(photo); lab.set({ photo }); await analyze(); } catch (e) { toast(e.message, 'error'); clear(false); }
    }
    function clear(rerender = true) { if (photo) { dropServer(photo.id); URL.revokeObjectURL(photo.url); } photo = null; drop.set(null); lab.set({ photo: null, analysis: null }); }
    async function analyze() {
      if (!photo) return;
      const s = ++seq, p = { x: Math.min(64, Math.max(4, +px.value || 8)), threshold: +pt.value || 0 };
      try {
        const d = await api('/api/lab/analyze', { method: 'POST', json: { id: photo.id, x: p.x, y: 40, threshold: p.threshold } });
        if (s !== seq) return; term.ingest(d.logs); photo.width = d.width; photo.height = d.height; drop.set(photo);
        lab.set({ photo, analysis: d, threshold: p.threshold });
      } catch (e) { term.add('error', e.message, 'analyze'); }
    }
    const re = debounce(analyze, 400);
    [px, pt].forEach((el) => el.addEventListener('input', re));
    return () => { clear(false); lab.destroy(); term.destroy(); };
  },
};
