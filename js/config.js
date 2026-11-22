// Адрес твоего прокси на Cloudflare Workers (см. worker/README.md).
// Пример: 'https://ottenok-dnya-ai.твой-аккаунт.workers.dev'
// Пусто — сайт работает без ИИ, на встроенном алгоритме.
export const AI_URL = 'https://ottenok-dnya-ai.tryfx.workers.dev';
// Демо-сборка для жюри (node build-demo.mjs): без ИИ и без озвучки, день собирается встроенным алгоритмом.
/* global __DEMO__ */
export const DEMO = typeof __DEMO__ !== 'undefined' && __DEMO__ === true;
