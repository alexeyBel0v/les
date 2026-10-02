import { SYSTEM_PROMPT } from './systemPrompt.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'qwen/qwen3.8-27b:free';
const TIMEOUT_MS = 45_000;
const MAX_DETAIL_LENGTH = 200;

export class AIUnavailableError extends Error {}

// Необязательно: OPENROUTER_PROVIDER=modelrun/fp4 — слать запросы только этому провайдеру.
// Без fallback OpenRouter вернёт настоящую ошибку провайдера, а не уйдёт к другому.
const pinnedProvider = () => {
  const provider = process.env.OPENROUTER_PROVIDER?.trim();
  return provider ? { provider: { only: [provider], allow_fallbacks: false } } : {};
};

// Без стриминга: ответ короткий, а целиком его проще разобрать как JSON.
const buildBody = (context) => ({
  model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  ...pinnedProvider(),
  temperature: 1,
  // Штраф за повторы: без него бесплатные модели скатываются в «Вы идёте по лесу» каждый ход.
  frequency_penalty: 0.4,
  presence_penalty: 0.3,
  // Qwen умеет «думать» перед ответом. Для фразы в одно предложение это лишняя задержка, выключаем.
  reasoning: { enabled: false },
  // С запасом: если модель всё же начнёт рассуждать, ответ не обрежется до пустого.
  max_tokens: 1500,
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: context },
  ],
});

// Текст ошибки OpenRouter помогает понять причину (нет модели, лимит, регион). Ключа в нём нет.
// Бывает, что вместо JSON приходит HTML-страница блокировки — тогда показываем её текст.
const readErrorDetail = async (response) => {
  const text = await response.text().catch(() => '');
  try {
    const message = JSON.parse(text)?.error?.message;
    if (message) return String(message).slice(0, MAX_DETAIL_LENGTH);
  } catch {
    // не JSON — разбираем как текст ниже
  }
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, MAX_DETAIL_LENGTH) || '(пустой ответ)';
};

const send = async (body) => {
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'LES',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? `нет ответа за ${TIMEOUT_MS / 1000} с` : error?.cause?.code || error?.message;
    throw new AIUnavailableError(`Нет связи с OpenRouter: ${reason}`);
  }
};

// Единственное место, которое знает про OpenRouter. Чтобы сменить модель или провайдера, правьте только этот файл.
export const askGameMaster = async (context) => {
  if (!process.env.OPENROUTER_API_KEY) throw new AIUnavailableError('OPENROUTER_API_KEY не задан');

  const response = await send(buildBody(context));

  if (!response.ok) {
    throw new AIUnavailableError(`OpenRouter ответил ${response.status}: ${await readErrorDetail(response)}`);
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    throw new AIUnavailableError(`Модель ${data?.model ?? ''} вернула пустой ответ (finish_reason: ${choice?.finish_reason ?? '—'})`);
  }
  return content;
};
