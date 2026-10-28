// simple.js — «Просте стего»: фото + текст (+ ключ) → фото з прихованою інформацією; і назад. Схоже на тестову лабораторію.
import { h, $, api, state, store, select, toast, setUser, fmtInt, fmtNum, debounce } from '../core.js';
import { Lab, Terminal } from '../lab.js';
import { photoDrop, uploadPhoto, dropServer, chargeAndDownload, triggerDownload, stepLabel } from '../parts.js';

const VERSIONS = [['chunky11', 'ChunkyV1.1'], ['schunky', 'SChunky'], ['basic1', 'BasicV1'], ['basic2', 'BasicV2'], ['basic3', 'BasicV3'], ['basic4', 'BasicV4']];
const isBasic = (v) => v.startsWith('basic');
const NEEDS_KEY = { basic2: true, basic4: true };

export default {
  mount(root) {
    const term = new Terminal();
    const lab = new Lab({ terminal: term, mode: 'encode' });
    const S = { mode: 'encode', photo: null, text: '', textFile: null, enc: null, dec: null, dirty: false, busy: 0, verify: null, seq: { an: 0 } };

    // ------------------------------------------------------------- поля
    const versionSel = select(VERSIONS, store.get('stego_version', 'chunky11'), (v) => { store.set('stego_version', v); touched(); reanalyze(); });
    const modeSeg = h('div', { class: 'seg' });
    const text = h('textarea', { class: 'textarea', placeholder: 'Впишіть текст або завантажте .txt…', rows: 5 });
    const textInfo = h('small', {});
    const textFile = h('input', { type: 'file', accept: '.txt,text/plain', hidden: true });
    const chip = h('span', { class: 'chip', hidden: true });
    const key = h('input', { class: 'input', placeholder: 'порожньо — без ключа', autocomplete: 'off' });
    const px = h('input', { class: 'input num', type: 'number', min: 6, max: 64, value: store.get('stego_x', 8) });
    const py = h('input', { class: 'input num', type: 'number', min: 1, value: store.get('stego_y', 40) });
    const pt = h('input', { class: 'input num', type: 'number', min: 0, max: 255, value: 8 });
    const compress = h('input', { type: 'checkbox', checked: true }), optimize = h('input', { type: 'checkbox' });
    const photo = photoDrop({ onFile: setPhoto, onClear: clearPhoto });

    const btnPreview = h('button', { class: 'btn', onclick: () => (S.mode === 'encode' ? runEncode() : runDecode()) }, 'Передперегляд');
    const btnCheck = h('button', { class: 'btn ghost', onclick: autoCheck }, 'Автоперевірка');
    const btnDownload = h('button', { class: 'btn ghost', onclick: download }, 'Завантажити');
    const verifyBox = h('div', { class: 'result-box', hidden: true });
    const priceLine = h('div', { class: 'price-line' });

    const encOnly = [], chunkOnly = [];
    const co = (el) => { chunkOnly.push(el); return el; };
    const eo = (el) => { encOnly.push(el); return el; };

    const side = h('aside', { class: 'tool-side' },
      h('div', { class: 'tool-scroll' },
        h('div', { class: 'tool-title' }, '🔐 Стего'),
        state.pub?.archive_days ? h('small', { class: 'archive-note' }, `Для безпеки сервісу результати кодування й декодування зберігаються ${state.pub.archive_days} днів.`) : null,
        h('div', {}, stepLabel(1, 'Версія кодера'), versionSel),
        h('div', {}, stepLabel(2, 'Режим'), modeSeg),
        h('div', {}, stepLabel(3, 'Фото'), photo.el),
        eo(h('div', {}, stepLabel(4, 'Текст'), text, h('div', { class: 'row-gap', style: { marginTop: '8px' } }, h('button', { class: 'btn ghost small', onclick: () => textFile.click() }, 'Завантажити .txt'), textFile, chip), textInfo)),
        h('div', {}, stepLabel(0, 'Параметри'), h('div', { class: 'params3' },
          h('label', {}, 'x (чанк, px)', px), eo(co(h('label', {}, 'y (пікс./чанк)', py))), h('label', {}, 'поріг аналізу', pt)),
          eo(co(h('div', { class: 'checks' },
            h('label', { class: 'check' }, compress, h('span', {}, 'Архівувати перед кодуванням', h('small', {}, 'zlib / bz2 / lzma'))),
            h('label', { class: 'check' }, optimize, h('span', {}, 'Максимальна оптимізація маркера', h('small', {}, 'мінімальний маркер, що проходить перевірку'))))))),
        h('div', {}, stepLabel(5, 'Ключ'), key)),
      h('div', { class: 'tool-buttons' }, priceLine, btnPreview, eo(btnCheck), btnDownload, verifyBox));

    const main = h('div', { class: 'tool-main' }, lab.el);
    root.append(h('div', { class: 'tool' }, side, main));

    // ------------------------------------------------------------- допоміжне
    const busy = (d) => { S.busy += d; side.classList.toggle('busy', S.busy > 0); render(); };
    const params = () => ({ x: +px.value || 8, y: +py.value || 40, threshold: +pt.value || 0, key: key.value.trim(), version: versionSel.value, compress: compress.checked, optimize: optimize.checked });
    const touched = () => { if (S.enc || S.dec) { S.dirty = true; lab.set({ stale: true }); } render(); };

    function render() {
      modeSeg.replaceChildren(...[['encode', 'Кодувати'], ['decode', 'Декодувати']].map(([id, l]) => h('button', { class: S.mode === id ? 'on' : '', onclick: () => setMode(id) }, l)));
      encOnly.forEach((el) => { el.hidden = S.mode === 'decode'; });
      chunkOnly.forEach((el) => { el.hidden = el.hidden || isBasic(versionSel.value); });
      key.placeholder = NEEDS_KEY[versionSel.value] ? 'обов’язковий (число або текст)' : versionSel.value === 'basic1' || versionSel.value === 'basic3' ? 'не потрібен для цієї версії' : 'порожньо — без ключа';
      const has = S.photo?.id, enc = S.mode === 'encode';
      btnPreview.textContent = enc ? 'Передперегляд' : 'Розкодувати';
      btnPreview.disabled = !has || S.busy > 0;
      btnCheck.disabled = !has || !S.text || S.busy > 0;
      btnDownload.disabled = S.busy > 0 || !has || (enc ? !S.text : false);
      const price = S.enc?.price?.price;
      btnDownload.textContent = enc ? (price ? `Завантажити фото · ${price} пакс.` : 'Завантажити фото') : 'Завантажити текст';
      priceLine.replaceChildren(...(enc && S.enc && !S.dirty ? [h('span', {}, 'Ціна завантаження'), h('b', {}, `${price} пакс.`)] : []));
      if (lab.data.hasText !== !!S.text) lab.set({ hasText: !!S.text });      // картка «після» залежить від того, чи є текст
      textInfo.textContent = S.text ? `${fmtInt([...S.text].length)} символів · ${fmtInt(new Blob([S.text]).size)} байт` : '';
      chip.hidden = !S.textFile; if (S.textFile) chip.replaceChildren(S.textFile.name, h('button', { class: 'icon-btn', style: { width: '22px', height: '22px' }, onclick: () => { text.value = ''; S.text = ''; S.textFile = null; touched(); } }, '✕'));
      verifyBox.hidden = !(enc && S.verify);
      if (enc && S.verify) {
        const v = S.verify; verifyBox.className = `result-box ${v.ok && v.match ? 'ok' : 'bad'}`;
        verifyBox.textContent = !v.ok ? `✖ Не вдалося декодувати: ${v.error}` : v.match ? `✔ Збігається: ${fmtInt(v.decoded_bytes)} байт, x = ${v.chunk_size}` : `✖ Не збігається (${v.decoded_bytes} із ${v.expected_bytes} байт)`;
      }
    }

    function setMode(m) {
      if (m === S.mode) return;
      S.mode = m; S.enc = S.dec = null; S.dirty = false; S.verify = null;
      lab.data.mode = m; lab.set({ mode: m, enc: null, dec: null, encError: null, decError: null, stale: false });
      render(); if (S.photo?.id) reanalyze();
    }

    // ------------------------------------------------------------- фото
    async function setPhoto(file) {
      clearPhoto(false);
      term.add('info', `Вибрано фото «${file.name}» (${fmtNum(file.size / 1024, 0)} КБ).`);
      busy(1);
      try {
        S.photo = await uploadPhoto(file); photo.set(S.photo);
        lab.set({ photo: S.photo }); await analyze();
        if (S.mode === 'decode') await runDecode();       // кодування — лише за кнопкою «Передперегляд»
        else if (S.text) term.add('info', 'Фото й текст готові. Натисніть «Передперегляд», щоб виконати кодування.', 'encode');
      } catch (e) { toast(e.message, 'error'); term.add('error', e.message, 'upload'); clearPhoto(false); } finally { busy(-1); }
    }
    function clearPhoto(rerender = true) {
      if (S.photo) { dropServer(S.photo.id); URL.revokeObjectURL(S.photo.url); }
      S.photo = S.enc = S.dec = null; S.verify = null; S.dirty = false; photo.set(null);
      lab.set({ photo: null, analysis: null, enc: null, dec: null, encError: null, decError: null, stale: false }); if (rerender) render();
    }
    async function analyze() {
      if (!S.photo?.id) return;
      const seq = ++S.seq.an;
      try {
        const p = params(), d = await api('/api/lab/analyze', { method: 'POST', json: { id: S.photo.id, ...p, key: p.key } });
        if (seq !== S.seq.an) return;
        term.ingest(d.logs); S.photo.width = d.width; S.photo.height = d.height; photo.set(S.photo);
        lab.set({ photo: S.photo, analysis: d, threshold: p.threshold });
      } catch (e) { term.add('error', e.message, 'analyze'); }
    }
    const reanalyze = debounce(() => analyze(), 400);

    // ------------------------------------------------------------- кодування / декодування
    async function runEncode() {
      if (!S.photo?.id) return toast('Потрібне фото.', 'error');
      if (!S.text) return toast('Потрібен текст.', 'error');
      busy(1);
      try {
        const p = params();
        const d = await api('/api/lab/encode', { method: 'POST', json: { id: S.photo.id, text: S.text, ...p }, silent: true });
        term.ingest(d.logs); if (S.enc) dropServer(S.enc.enc_id);
        S.enc = d; S.dirty = false; S.verify = null;
        lab.set({ enc: d, encError: null, stale: false, analysis: { ...(lab.data.analysis || {}), chunk_size: d.chunk_size, rows: d.rows, cols: d.cols, max_possible: d.max_possible, grid: d.grid, histogram: d.histogram, width: d.stats.width, height: d.stats.height, noise_channels: lab.data.analysis?.noise_channels, pollution_index: lab.data.analysis?.pollution_index, capacity_bytes: d.stats.capacity_bytes } });
      } catch (e) { S.enc = null; lab.set({ enc: null, encError: e.message, stale: false }); toast(e.message, 'error'); term.add('error', e.message, 'encode'); }
      finally { busy(-1); }
    }
    async function runDecode() {
      if (!S.photo?.id) return toast('Потрібне фото.', 'error');
      busy(1);
      try {
        const p = params();
        const d = await api('/api/lab/decode', { method: 'POST', json: { id: S.photo.id, key: p.key, version: p.version, threshold: p.threshold }, silent: true });
        term.ingest(d.logs); S.dec = d; S.dirty = false;
        px.value = d.chunk_size; await analyze();
        lab.set({ dec: d, decError: null, stale: false });
      } catch (e) { S.dec = null; term.ingest(e.data?.logs); lab.set({ dec: null, decError: e.message, stale: false }); toast(e.message, 'error'); }
      finally { busy(-1); }
    }
    async function autoCheck() {
      if (!S.enc || S.dirty) await runEncode();
      if (!S.enc) return;
      busy(1);
      try {
        const p = params();
        S.verify = await api('/api/lab/verify', { method: 'POST', json: { enc_id: S.enc.enc_id, text: S.text, key: p.key, threshold: p.threshold }, silent: true });
        term.ingest(S.verify.logs);
      } catch (e) { S.verify = { ok: false, match: false, error: e.message }; } finally { busy(-1); }
    }
    async function download() {
      const base = (S.photo?.name || 'result').replace(/\.[^.]+$/, '');
      if (S.mode === 'encode') {
        if (!S.enc || S.dirty) await runEncode();
        if (!S.enc) return;
        try { await chargeAndDownload(S.enc.enc_id, `${base}_stego.png`); } catch (e) { term.add('error', e.message, 'pay'); }
      } else {
        if (!S.dec || S.dirty) await runDecode();
        if (S.dec) triggerDownload(`/api/lab/text/${S.dec.text_id}`);
      }
    }

    // ------------------------------------------------------------- події
    text.addEventListener('input', () => { S.text = text.value; S.textFile = null; touched(); });
    textFile.onchange = async () => {
      const f = textFile.files[0]; textFile.value = ''; if (!f) return;
      const t = await f.text(); text.value = t; S.text = t; S.textFile = { name: f.name };
      term.add('info', `Текст із файлу «${f.name}»: ${fmtInt([...t].length)} символів.`);
      render();                                          // текст завантажено; кодування запускає лише кнопка «Передперегляд»
      if (S.mode === 'encode') term.add('info', S.photo?.id ? 'Текст завантажено. Натисніть «Передперегляд», щоб виконати кодування.' : 'Текст завантажено. Додайте фото й натисніть «Передперегляд».', 'encode');
    };
    [key].forEach((el) => el.addEventListener('input', () => { touched(); }));
    [px, py, pt, compress, optimize].forEach((el) => el.addEventListener('input', () => { store.set('stego_x', px.value); store.set('stego_y', py.value); touched(); reanalyze(); }));
    render();
    return () => { clearPhoto(false); lab.destroy(); term.destroy(); };
  },
};
