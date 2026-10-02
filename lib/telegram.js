import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_SECONDS = 24 * 60 * 60;

// Проверка подписи initData по документации Telegram Mini Apps.
// Без неё ваш бесплатный ключ OpenRouter сможет расходовать кто угодно, кто найдёт адрес API.
export const isValidInitData = (initData, botToken) => {
  if (!initData || !botToken) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return false;

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  return expected.length === hash.length && timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
};
