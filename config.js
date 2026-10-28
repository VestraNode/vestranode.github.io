// config.js — налаштування фронтенду (його можна міняти без перезбірки: це звичайний файл).
//
// backends — список бекендів за пріоритетом: сайт звертається до ПЕРШОГО, що відповідає на /api/health.
//   url: ''  → бекенд на тому самому домені, що й сайт (локальний запуск `python run.py`).
//   Для продакшену (фронтенд на Vercel) вкажіть повні адреси, напр.:
//     { name: 'Основний (потужний ПК)', url: 'https://vestra-pc.example.com' },
//     { name: 'Запасний (безкоштовний хостинг)', url: 'https://vestranode.hf.space' }
// Перший бекенд = основний; другий = запасний (сайт покаже, що робота буде повільнішою).
window.VN_CONFIG = {
  backends: [
    { name: 'Основний (ПК)', url: 'https://desktop-4n86as9.tail1bac6.ts.net' },
  ],
  healthTimeoutMs: 4000,     // скільки чекати відповіді /api/health
  recheckSec: 30,            // як часто перевіряти бекенди
  // Дані для сторінок, що працюють без бекенда (головна, довідка). Коли бекенд доступний, з'являються його актуальні значення.
  links: { youtube_url: '', discord_url: '' },
  packs: [{ paxels: 100, price_uah: 49 }, { paxels: 200, price_uah: 89 }, { paxels: 500, price_uah: 199 }, { paxels: 1000, price_uah: 349 }],
  regen: { floor: 50, hours: 6 },
  pricing: { py_export: { base_uah: 100, per_node_uah: 10 } },
};
