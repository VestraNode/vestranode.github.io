// config.js — налаштування фронтенду (його можна міняти без перезбірки: це звичайний файл).
//
// backends — список бекендів за пріоритетом: сайт звертається до ПЕРШОГО, що відповідає на /api/health.
//   url: ''  → бекенд на тому самому домені, що й сайт (локальний запуск `python run.py`).
//   Для продакшену (фронтенд на Vercel) вкажіть повні адреси, напр.:
//     { name: 'Основний (потужний ПК)', url: 'https://vestra-pc.example.com' },
//     { name: 'Запасний (безкоштовний хостинг)', url: 'https://vestranode.hf.space' }
// Перший бекенд = основний; другий = запасний (сайт покаже, що робота буде повільнішою).
window.VN_CONFIG = {
  // Посилання на програму в Microsoft Store (з'явиться кнопка на головній); поки порожнє — показується "Скоро в Microsoft Store".
  storeUrl: '',
  // Жовте попередження на головній сторінці (прибирається саме після until; порожній text = без попередження). Час київський.
  maintenance: { text: 'Технічні роботи 21 листопада з 03:00 до 04:00: сайт може бути тимчасово недоступний.', until: '2026-11-21T04:00:00+02:00' },
  backends: [
    { name: 'Основний (сервер)', url: 'https://apivn.raimex.space' },
    { name: 'Запасний (ПК)', url: 'https://vestranode-api.slime-kostia.workers.dev' },
    { name: 'Запасна адреса 2 (ПК)', url: 'https://desktop-4n86as9.tail1bac6.ts.net' },
  ],
  healthTimeoutMs: 4000,     // скільки чекати відповіді /api/health
  recheckSec: 30,            // як часто перевіряти бекенди
  // Дані для сторінок, що працюють без бекенда (головна, довідка). Коли бекенд доступний, з'являються його актуальні значення.
  links: { youtube_url: '', discord_url: '' },
  packs: [{ paxels: 100, price_uah: 1 }, { paxels: 200, price_uah: 2 }, { paxels: 500, price_uah: 3 }, { paxels: 1000, price_uah: 4 }],
  regen: { floor: 50, hours: 6 },
  pricing: { py_export: { stars_base: 1, stars_step_nodes: 20, stars_per_step: 1 } },
};
