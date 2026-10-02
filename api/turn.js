// Vercel Serverless Function: POST /api/turn
// Клиент присылает состояние и текст игрока, сервер спрашивает модель, движок применяет ответ.

import { applyTurn, buildAIContext, parseAIReply, sanitizeState } from '../lib/engine.js';
import { askGameMaster, AIUnavailableError } from '../lib/openrouter.js';
import { isValidInitData } from '../lib/telegram.js';

const MAX_INPUT_LENGTH = 120;

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Только POST' });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && !isValidInitData(req.headers['x-telegram-init-data'], botToken)) {
    res.status(401).json({ error: 'Откройте игру через Telegram.' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.status(400).json({ error: 'Не удалось прочитать запрос.' });
    return;
  }

  const input = typeof body.input === 'string' ? body.input.trim().slice(0, MAX_INPUT_LENGTH) : '';
  if (!input) {
    res.status(400).json({ error: 'Напишите, что вы делаете.' });
    return;
  }

  const state = sanitizeState(body.state);
  if (!state.alive) {
    res.status(200).json(applyTurn(state, input, null));
    return;
  }

  try {
    const turn = applyTurn(state, input, await askForReply(buildAIContext(state, input)));
    res.status(200).json(body.debug ? turn : { ...turn, log: undefined });
  } catch (error) {
    const reason = error instanceof AIUnavailableError ? error.message : `Модель ответила не по формату: ${error.message}`;
    console.error('[turn]', reason);
    res.status(502).json({ error: 'Лес молчит. Попробуйте ещё раз.', ...(body.debug && { detail: reason }) });
  }
}

// Бесплатные модели иногда пишут текст вместо JSON. Одна повторная попытка обычно это лечит.
const ATTEMPTS = 2;

const askForReply = async (context) => {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const raw = await askGameMaster(context);
    try {
      return parseAIReply(raw);
    } catch (error) {
      lastError = error;
      console.warn(`[turn] попытка ${attempt}: не JSON →`, raw.slice(0, 160).replace(/\s+/g, ' '));
    }
  }
  throw lastError;
};
