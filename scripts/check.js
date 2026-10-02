// Диагностика связи с OpenRouter: npm run check
// Три запроса от простого к сложному. По тому, на каком шаге сломалось, видно, где причина.

const BASE = 'https://openrouter.ai/api/v1';
const key = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL || 'qwen/qwen3.8-27b:free';

const short = (text) => text.replace(/\s+/g, ' ').slice(0, 300);

const probe = async (title, url, init = {}) => {
  process.stdout.write(`\n${title}\n  `);
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const body = await response.text();
    console.log(`${response.status} ${short(body)}`);
    return response.status;
  } catch (error) {
    console.log(`нет связи: ${error?.cause?.code || error.message}`);
    return 0;
  }
};

const auth = { Authorization: `Bearer ${key}` };

const open = await probe('1. Список моделей, без ключа (проверка сети)', `${BASE}/models?category=roleplay`);
const keyInfo = await probe('2. Информация о ключе (проверка ключа)', `${BASE}/key`, { headers: auth });
const chat = await probe(`3. Запрос к ${model} (проверка модели)`, `${BASE}/chat/completions`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, max_tokens: 20, messages: [{ role: 'user', content: 'Скажи: привет' }] }),
});

console.log('\nИтог:');
if (open !== 200) console.log('  Не открывается даже публичный адрес. Запросы с этого компьютера режет сеть: блок по IP/стране, провайдер, антивирус или файрвол. Ключ и модель ни при чём.');
else if (keyInfo !== 200) console.log('  Сеть есть, но ключ не принят. Проверьте ключ на openrouter.ai/settings/keys.');
else if (chat !== 200) console.log('  Сеть и ключ в порядке, отказывает модель или её провайдер. Смотрите текст ответа на шаге 3.');
else console.log('  Всё работает.');
