// settings.js — налаштування сайту: тема, допоміжний (акцентний) колір, анімації, редактор
import { h, store, setTheme, setAccent, setScale, DEFAULT_SCALE, toast, confirmDialog, applyAppearance } from '../core.js';

const SWATCHES = ['#7c9cff', '#5fd68a', '#ffb454', '#ff6b9a', '#b48cff', '#4dd0e1', '#ff7a59', '#e8e8e8'];

export const getPrefs = () => ({ snap: true, autosave: true, anim: true, hints: true, autoscale: true, ...store.get('prefs', {}) });
export function setPref(key, value) { store.set('prefs', { ...getPrefs(), [key]: value }); document.documentElement.classList.toggle('no-anim', !getPrefs().anim); }

function row(title, desc, control) { return h('div', { class: 'setting' }, h('div', {}, h('h4', {}, title), desc && h('p', {}, desc)), control); }
function sw(key, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!getPrefs()[key] });
  input.onchange = () => { setPref(key, input.checked); onChange && onChange(input.checked); };
  return h('label', { class: 'switch' }, input, h('i'));
}

export default {
  mount(root) {
    const accent = store.get('accent', '#7c9cff');
    const custom = h('input', { type: 'color', class: 'round', value: accent, title: 'Власний колір' });
    const swatches = h('div', { class: 'swatch-row' });
    const paint = () => {
      const cur = store.get('accent', '#7c9cff');
      swatches.replaceChildren(...SWATCHES.map((c) => h('button', { class: `swatch${c === cur ? ' on' : ''}`, style: { background: c }, title: c, onclick: () => { setAccent(c); custom.value = c; paint(); } })), custom);
    };
    custom.oninput = () => { setAccent(custom.value); paint(); };
    paint();

    const theme = h('div', { class: 'seg' });
    const paintTheme = () => theme.replaceChildren(
      ...[['dark', '🌙 Темна'], ['light', '☀ Світла']].map(([id, label]) => h('button', { class: store.get('theme', 'dark') === id ? 'on' : '', onclick: () => { setTheme(id); paintTheme(); } }, label)));
    paintTheme();

    const scaleVal = h('b', { style: { minWidth: '48px', textAlign: 'right' } });
    const scale = h('input', { type: 'range', min: 60, max: 130, step: 1, value: Math.round(store.get('scale', DEFAULT_SCALE) * 100), style: { width: '220px', accentColor: 'var(--accent)' } });
    const paintScale = () => { scaleVal.textContent = scale.value + ' %'; };
    scale.oninput = () => { setScale(scale.value / 100); paintScale(); };
    paintScale();
    const scaleCtl = h('div', { class: 'row-gap' }, scale, scaleVal, h('button', { class: 'btn ghost small', onclick: () => { setScale(DEFAULT_SCALE); scale.value = Math.round(DEFAULT_SCALE * 100); paintScale(); } }, 'Типовий'));

    root.append(h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Налаштування'), h('div', { class: 'sub' }, 'Усе зберігається в браузері й діє на всіх сторінках'))),
      h('div', { class: 'settings' },
        h('div', { class: 'card' },
          row('Тема', 'За замовчуванням темна. Перемикати можна й у меню аватара.', theme),
          row('Допоміжний колір', 'Колір кнопок, виділень і акцентів у всьому інтерфейсі.', swatches),
          row('Масштаб інтерфейсу', 'Розмір усього сайту (типово 71 %, тобто менший у 1,4 раза за 100 %).', scaleCtl),
          row('Автомасштаб під екран', 'На великих екранах (2K, 4K, ultrawide) інтерфейс сам збільшується пропорційно розміру вікна, щоб не виглядав крихітним.', sw('autoscale', () => applyAppearance()))),
        h('div', { class: 'card' },
          row('Анімації', 'Рухомі фони, пульсація чанків, плавні переходи.', sw('anim', (v) => document.documentElement.classList.toggle('no-anim', !v))),
          row('Автозбереження проєкту', 'Редактор нод зберігає зміни на сервері сам, ~1,5 с після правки.', sw('autosave')),
          row('Прив\'язка нод до сітки', 'Ноди при перетягуванні «прилипають» до сітки 20 px.', sw('snap')),
          row('Підказки', 'Показувати підказки з типом даних на портах і зв\'язках.', sw('hints'))),
        h('div', { class: 'card' },
          row('Скинути налаштування', 'Повертає тему, колір і всі перемикачі до заводських (акаунт і проєкти не змінюються).',
            h('button', { class: 'btn danger', onclick: async () => {
              if (await confirmDialog('Скинути налаштування?', 'Тема, колір і перемикачі повернуться до заводських.', 'Скинути', true)) {
                store.del('theme'); store.del('accent'); store.del('prefs'); store.del('scale'); applyAppearance(); toast('Налаштування скинуто.', 'ok'); location.reload();
              }
            } }, 'Скинути'))))));
  },
};
