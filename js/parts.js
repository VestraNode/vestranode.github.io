// parts.js — спільні елементи форм для інструментів: зона завантаження фото, поле тексту з файлом, оплата завантаження
import { h, $, api, toast, setUser, fmtNum, authUrl } from './core.js';

/** Зона завантаження фото: перетягування/вибір, мініатюра, ✕ (видалити), ⟲ (замінити). */
export function photoDrop({ onFile, onClear }) {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const empty = h('div', { class: 'drop-empty', onclick: () => input.click() }, 'Перетягніть фото сюди або ', h('u', {}, 'оберіть файл'), h('small', { style: { display: 'block' } }, 'PNG, BMP, JPG…'));
  const thumb = h('img', { alt: '' }), name = h('b', { class: 'name' }), info = h('small', {});
  const filled = h('div', { class: 'drop-file', hidden: true }, thumb, h('div', { class: 'meta' }, name, info),
    h('button', { class: 'icon-btn', title: 'Замінити', onclick: () => input.click() }, '⟲'), h('button', { class: 'icon-btn danger', title: 'Видалити', onclick: () => onClear() }, '✕'));
  const el = h('div', { class: 'drop' }, empty, filled, input);
  input.onchange = () => { const f = input.files[0]; input.value = ''; if (f) onFile(f); };
  ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  return {
    el,
    set(photo) {
      empty.hidden = !!photo; filled.hidden = !photo;
      if (photo) { thumb.src = photo.url; name.textContent = photo.name; info.textContent = `${photo.width ? `${photo.width}×${photo.height} · ` : ''}${fmtNum(photo.size / 1024, 0)} КБ`; }
    },
  };
}

/** Завантаження фото на сервер: повертає {id,width,height,url,name,size}. */
export async function uploadPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error(`«${file.name}» — це не зображення.`);
  const d = await api('/api/lab/upload', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });
  return { ...d, url: URL.createObjectURL(file), name: file.name, size: file.size };
}

export const dropServer = (id) => { if (id) api('/api/lab/delete', { method: 'POST', json: { id }, silent: true }).catch(() => {}); };

export function triggerDownload(path) {
  const a = h('a', { href: authUrl(path), download: '' }); document.body.append(a); a.click(); a.remove();
}

/** Оплата (списання пакселів) і завантаження результату. Повертає true, якщо файл почав завантажуватись. */
export async function chargeAndDownload(resultId, name) {
  const res = await api('/api/lab/charge', { method: 'POST', json: { result_id: resultId } });
  setUser(res.user);
  triggerDownload(`/api/lab/download/${resultId}?name=${encodeURIComponent(name)}`);
  toast(res.price ? `Списано ${res.price} пакселів. Завантаження розпочато.` : 'Завантаження розпочато.', 'ok');
  return true;
}

export function stepLabel(n, text) { return h('div', { class: 'step-lbl' }, n ? h('i', {}, n) : null, text); }
