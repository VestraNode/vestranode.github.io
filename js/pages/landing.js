// landing.js — головна сторінка (стиль Parsec): hero, макет редактора, приклади, пакселі, підвал
import { h, state, fmtInt } from '../core.js';
import { miniGraphSVG, PNG_SKY } from '../graphart.js';

const T = (n, t) => ({ name: n, type: t });

const EXAMPLES = [
  {
    badge: 'Приклад 1', title: 'Секретне повідомлення з подвійним шифруванням',
    text: 'Текст проходить шифр Цезаря й Base64, перетворюється на біти й ховається у фото з вашим ключем. Той самий проєкт працює й у зворотному напрямку — він сам розгортає ланцюг нод і повертає початковий текст.',
    steps: ['Імпорт тексту → Цезар → Base64', 'Текст → біти', 'Стего ChunkyV1.1 + ключ'],
    nodes: [
      { id: 'a', title: 'Імпорт тексту', cat: 'import', x: 10, y: 20, ins: [], outs: [T('текст', 'text')] },
      { id: 'b', title: 'Шифр Цезаря', cat: 'cipher', x: 190, y: 20, ins: [T('текст', 'text'), T('зсув', 'number')], outs: [T('текст', 'text')] },
      { id: 'c', title: 'Base64', cat: 'cipher', x: 370, y: 20, ins: [T('текст', 'text')], outs: [T('текст', 'text')] },
      { id: 'd', title: 'Текст → біти', cat: 'convert', x: 190, y: 150, ins: [T('текст', 'text')], outs: [T('біти', 'bits')] },
      { id: 'e', title: 'Стего', cat: 'stego', x: 560, y: 90, ins: [T('фото', 'image'), T('дані', 'bits'), T('ключ', 'text')], outs: [T('фото', 'image')] },
    ],
    edges: [['a', 'текст', 'b', 'текст'], ['b', 'текст', 'c', 'текст'], ['c', 'текст', 'd', 'текст'], ['d', 'біти', 'e', 'дані']],
    h: 270,
  },
  {
    badge: 'Приклад 2', title: 'Числовий ключ з арифметики',
    text: 'Ключ можна обчислювати прямо в графі: число з імпорту множиться, додається, перетворюється на текст і живить шифрувальник XOR. Змінили одне число — змінився весь результат.',
    steps: ['Арифметика: ×, +', 'Число → текст = ключ', 'XOR із ключем → біти → стего'],
    nodes: [
      { id: 'n1', title: 'Імпорт числа', cat: 'import', x: 10, y: 30, ins: [], outs: [T('число', 'number')] },
      { id: 'm', title: 'Помножити', cat: 'math', x: 190, y: 30, ins: [T('A', 'number'), T('B', 'number')], outs: [T('результат', 'number')] },
      { id: 'p', title: 'Додати', cat: 'math', x: 370, y: 30, ins: [T('A', 'number'), T('B', 'number')], outs: [T('результат', 'number')] },
      { id: 't', title: 'Число → текст', cat: 'convert', x: 550, y: 30, ins: [T('число', 'number')], outs: [T('текст', 'text')] },
      { id: 'x', title: 'XOR з ключем', cat: 'cipher', x: 550, y: 150, ins: [T('текст', 'text'), T('ключ', 'text')], outs: [T('текст', 'text')] },
    ],
    edges: [['n1', 'число', 'm', 'A'], ['m', 'результат', 'p', 'A'], ['p', 'результат', 't', 'число'], ['t', 'текст', 'x', 'ключ']],
    h: 270,
  },
  {
    badge: 'Приклад 3', title: 'Перевірка слідів: стегоаналіз результату',
    text: 'Після кодування сайт малює карти шуму, LSB-площини, χ²-атаку та різницю до/після, а ще повну статистику й графік розподілу чанків — щоб побачити, наскільки непомітно фото змінилось.',
    steps: ['Перегляд до / після', 'Карта шумності чанків', 'Статистика й графік'],
    nodes: [
      { id: 'i', title: 'Імпорт фото', cat: 'import', x: 10, y: 40, ins: [], outs: [T('фото', 'image')] },
      { id: 's', title: 'Стего', cat: 'stego', x: 260, y: 40, ins: [T('фото', 'image'), T('дані', 'bits'), T('ключ', 'text')], outs: [T('фото', 'image')] },
      { id: 'k', title: 'Імпорт ключа', cat: 'import', x: 10, y: 150, ins: [], outs: [T('текст', 'text')] },
      { id: 'b', title: 'Біти навпаки', cat: 'bits', x: 10, y: 215, ins: [T('біти', 'bits')], outs: [T('біти', 'bits')] },
    ],
    edges: [['i', 'фото', 's', 'фото'], ['k', 'текст', 's', 'ключ'], ['b', 'біти', 's', 'дані']],
    h: 300, photo: true,
  },
];

const FEATURES = [
  ['🧩', 'Візуальні ноди', 'Імпорт, конвертації, шифрувальники, арифметика, логіка — сполучайте порти кольорових типів.'],
  ['🔐', '18+ шифрувальників', 'Base64/32/85, Цезар, Віженер, XOR, Атбаш, ROT, Морзе, потоковий SHA-256 та інші.'],
  ['🖼', 'Шість версій стего', 'SChunky та ChunkyV1.1 (чанки, підлаштування під шум) і прості BasicV1–V4 — докладно в довідці.'],
  ['↩', 'Декодування саме', 'Проєкт інвертує свій ланцюг нод: від фото до початкового тексту, без окремих налаштувань.'],
  ['🐍', 'Експорт у Python', 'Самодостатній .py: бібліотека й командний рядок з усім вбудованим.'],
  ['📊', 'Стегоаналіз', 'Шум, LSB-площини, χ²-атака, різниця до/після та повна статистика з графіком.'],
];

function editorMock() {
  const nodes = [
    { id: 'a', title: 'Імпорт тексту', cat: 'import', x: 20, y: 24, ins: [], outs: [T('текст', 'text')] },
    { id: 'b', title: 'Текст → біти', cat: 'convert', x: 210, y: 24, ins: [T('текст', 'text')], outs: [T('біти', 'bits')] },
    { id: 'c', title: 'Імпорт фото', cat: 'import', x: 20, y: 150, ins: [], outs: [T('фото', 'image')] },
    { id: 'd', title: 'Стего', cat: 'stego', x: 400, y: 80, ins: [T('фото', 'image'), T('дані', 'bits'), T('ключ', 'text')], outs: [T('фото', 'image')] },
  ];
  const edges = [['a', 'текст', 'b', 'текст'], ['b', 'біти', 'd', 'дані'], ['c', 'фото', 'd', 'фото']];
  return miniGraphSVG(nodes, edges, { width: 580, height: 270, uid: 'mock' });
}

function photoPair() {
  const sky = `data:image/svg+xml;utf8,${encodeURIComponent(PNG_SKY)}`;
  return h('div', { class: 'mock-photos' },
    h('div', { class: 'ph' }, h('img', { src: sky, alt: '' }), h('span', {}, 'до')),
    h('div', { class: 'ph' }, h('img', { src: sky, alt: '' }), h('div', { class: 'grid-overlay' }), h('span', {}, 'після')));
}

export default {
  mount(root) {
    const words = ['приховувачі', 'шифрувальники', 'конвеєри', 'стего-пакети'];
    const word = h('span', { class: 'grad-word' }, words[0]);
    let wi = 0;
    const timer = setInterval(() => {
      word.classList.add('out');
      setTimeout(() => { wi = (wi + 1) % words.length; word.textContent = words[wi]; word.classList.remove('out'); }, 320);
    }, 2800);

    const authed = !!state.user;
    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-glow a' }), h('div', { class: 'hero-glow b' }), h('div', { class: 'hero-grain' }),
      h('div', { class: 'hero-inner' },
        h('h1', {}, 'Створюй свої', h('br'), word, h('br'), 'з нодів'),
        h('p', { class: 'lead' }, 'VestraNode — редактор, у якому ви збираєте власні шифрувальники й стего-конвеєри з нодів, а потім ховаєте дані у фото й експортуєте все це в Python. Без коду, з перевіркою типів і стегоаналізом.'),
        h('div', { class: 'product-by' }, 'Продукт ', h('b', {}, 'Raimex Team')),
        h('div', { class: 'cta' },
          h('a', { class: 'btn pill cta-main', href: '#/projects' }, 'Відкрити проєкти →'),
          h('a', { class: 'btn pill outline', href: '#/stego' }, 'Стего'),
          h('a', { class: 'btn pill outline', href: '#/analysis' }, 'Стегоаналіз')),
        !authed && h('div', { class: 'hint' }, 'Новий акаунт отримує ', h('b', {}, '100 пакселів'), ' — вистачить на кілька зображень.'),
      ),
      h('div', { class: 'mock-wrap' }, h('div', { class: 'mock' },
        h('div', { class: 'mock-bar' }, h('i'), h('i'), h('i'), h('span', {}, 'secret-message.vn  ·  режим редагування')),
        h('div', { class: 'mock-body' }, h('div', { class: 'mock-editor' }, editorMock()), h('div', { class: 'mock-split' }), photoPair()),
        h('div', { class: 'mock-tag' }, 'OTHERS')),
      ),
    );
    hero.querySelector('.mock-tag').remove();

    const examples = h('section', { class: 'section', id: 'examples' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Приклади робіт'), h('p', {}, 'Так виглядає процес: збираєте ноди, натискаєте «передперегляд» — і бачите результат.')),
      EXAMPLES.map((ex, i) => h('article', { class: `example${i % 2 ? ' flip' : ''}` },
        h('div', { class: 'example-art' }, miniGraphSVG(ex.nodes, ex.edges, { width: 740, height: ex.h, uid: `ex${i}` }), ex.photo && photoPair()),
        h('div', { class: 'example-text' }, h('span', { class: 'badge' }, ex.badge), h('h3', {}, ex.title), h('p', {}, ex.text),
          h('ol', {}, ex.steps.map((s) => h('li', {}, s))), h('a', { class: 'btn ghost', href: '#/projects' }, 'Створити такий проєкт →')))));

    const features = h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Усе, що потрібно для приховування'), h('p', {}, 'Один сайт: від першої ноди до готового Python-файлу.')),
      h('div', { class: 'features' }, FEATURES.map(([ico, t, d]) => h('div', { class: 'feature' }, h('div', { class: 'ico' }, ico), h('h4', {}, t), h('p', {}, d)))));

    const maint = !!state.pub?.pay_maintenance, starsOf = Object.fromEntries((state.pub?.stars_packs || []).map((p) => [p.paxels, p.stars]));
    const packs = state.pub?.packs || [];
    const pricing = h('section', { class: 'section', id: 'pricing' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Пакселі'), h('p', {}, `Валюта сайту. Новому акаунту — 100 пакселів; якщо баланс менший за ${state.pub?.regen?.floor || 50}, він відновлюється до цього рівня кожні ${state.pub?.regen?.hours || 6} год. Пакселі списуються лише за завантаження результату.`)),
      h('div', { class: 'packs' }, packs.map((p, i) => h('div', { class: `pack${i === 2 ? ' best' : ''}` },
        h('div', { class: 'amount' }, fmtInt(p.paxels), h('small', {}, ' пакс.')), h('div', { class: 'price' }, maint && starsOf[p.paxels] ? `${starsOf[p.paxels]} ⭐` : `${p.price_uah} ₴`),
        h('a', { class: 'btn ghost block', href: '#/profile' }, 'Поповнити')))),
      h('p', { class: 'fine' }, 'Генерація Python-бібліотеки проєкту — окрема послуга: ',
        `${state.pub?.pricing?.py_export?.stars_base ?? 1} ⭐ до ${state.pub?.pricing?.py_export?.stars_step_nodes ?? 20} нод, понад ${state.pub?.pricing?.py_export?.stars_step_nodes ?? 20} — ${(state.pub?.pricing?.py_export?.stars_base ?? 1) + (state.pub?.pricing?.py_export?.stars_per_step ?? 1)} ⭐, далі +${state.pub?.pricing?.py_export?.stars_per_step ?? 1} ⭐ за кожні наступні ${state.pub?.pricing?.py_export?.stars_step_nodes ?? 20} нод (для преміум-акаунтів може бути безкоштовною).`));

    const band = h('section', { class: 'band' }, h('h2', {}, 'Готові приховати щось цікаве?'),
      h('a', { class: 'btn pill cta-main', href: authed ? '#/projects' : '#/login' }, authed ? 'До проєктів →' : 'Увійти й спробувати →'));

    const links = state.pub?.links || {};
    const footer = h('footer', { class: 'footer' },
      h('div', { class: 'footer-grid' },
        h('div', {}, h('div', { class: 'logo' }, 'VESTRANODE'), h('p', { class: 'fine' }, 'Нодовий приховувач даних на базі стего та криптографії.'), h('p', { class: 'fine' }, 'Продукт Raimex Team')),
        h('div', {}, h('h5', {}, 'Продукт'), h('a', { href: '#/projects' }, 'Проєкти'), h('a', { href: '#/stego' }, 'Стего'), h('a', { href: '#/analysis' }, 'Стегоаналіз'), h('a', { href: '#/help' }, 'Довідка')),
        h('div', {}, h('h5', {}, 'Акаунт'), h('a', { href: '#/profile' }, 'Профіль'), h('a', { href: '#/settings' }, 'Налаштування')),
        h('div', {}, h('h5', {}, 'Спільнота'), h('a', { href: links.youtube_url || '#', target: '_blank', rel: 'noopener' }, 'YouTube'),
          h('a', { href: links.discord_url || '#', target: '_blank', rel: 'noopener' }, 'Discord'))),
      h('div', { class: 'footer-bottom' }, `© ${new Date().getFullYear()} Raimex Team · VestraNode`));

    root.append(hero, examples, features, pricing, band, footer);
    return () => clearInterval(timer);
  },
};
