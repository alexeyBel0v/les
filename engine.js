// Игровой движок. Хранит правду о мире; модель только предлагает, движок решает.
// Чистые функции без сети — работают и на сервере, и в браузере.

const MAX_CARRYING = 8;
const MAX_FACTS = 12;
const MAX_RECENT = 8;
const MAX_ITEM_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 280;
const MAX_DURATION = 600;
const WEATHER_STEP_MINUTES = 120;
const WEATHERS = ['Пасмурно', 'Дождь', 'Морось', 'Туман', 'Ясно', 'Ветер'];
const ACTIONS = ['move', 'look', 'take', 'drop', 'use', 'talk', 'wait', 'eat', 'attack', 'hide', 'other'];

export const createInitialState = () => ({
  version: 1,
  minutes: 7 * 60 + 42,
  weather: 'Пасмурно',
  location: 'Лесная дорога',
  alive: true,
  carrying: ['яблоко', 'телефон'],
  facts: [],
  recent: [],
});

export const OPENING_LINE = 'Вы в лесу.';

export const formatClock = (minutes) => {
  const dayMinutes = ((minutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(dayMinutes / 60)).padStart(2, '0');
  const mins = String(dayMinutes % 60).padStart(2, '0');
  return `${hours}:${mins}`;
};

const cleanText = (value, limit) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';

const cleanList = (value, limit) =>
  Array.isArray(value) ? value.map((item) => cleanText(item, MAX_ITEM_LENGTH)).filter(Boolean).slice(0, limit) : [];

const sameItem = (a, b) => a.toLowerCase() === b.toLowerCase();

// Состояние приходит от клиента, поэтому не доверяем ему: всё приводим к допустимой форме.
export const sanitizeState = (raw) => {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: 1,
    minutes: Number.isFinite(raw.minutes) ? Math.max(0, Math.floor(raw.minutes)) : base.minutes,
    weather: WEATHERS.includes(raw.weather) ? raw.weather : base.weather,
    location: cleanText(raw.location, MAX_ITEM_LENGTH) || base.location,
    alive: raw.alive !== false,
    carrying: cleanList(raw.carrying, MAX_CARRYING),
    facts: cleanList(raw.facts, MAX_FACTS).map((fact) => fact.slice(0, 120)),
    recent: Array.isArray(raw.recent)
      ? raw.recent
          .slice(-MAX_RECENT)
          .map((entry) => ({ input: cleanText(entry?.input, 120), result: cleanText(entry?.result, MAX_MESSAGE_LENGTH) }))
          .filter((entry) => entry.input && entry.result)
      : [],
  };
};

// Модели отдаём только то, что нужно для ответа, а не всё состояние.
export const buildAIContext = (state, input) => {
  const lines = [
    `Время: ${formatClock(state.minutes)}`,
    `Погода: ${state.weather}`,
    `Место: ${state.location}`,
    `При себе: ${state.carrying.length ? state.carrying.join(', ') : 'ничего'}`,
  ];
  if (state.facts.length) lines.push(`Известно: ${state.facts.join(' ')}`);
  if (state.recent.length) {
    lines.push('Последние ходы:');
    state.recent.forEach((entry) => lines.push(`> ${entry.input}\n${entry.result}`));
  }
  lines.push('', `Игрок пишет: «${input}»`);
  return lines.join('\n');
};

// Модель иногда оборачивает JSON в текст или markdown — вытаскиваем первый объект.
export const parseAIReply = (text) => {
  if (typeof text !== 'string') throw new Error('Пустой ответ модели');
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const start = withoutThinking.indexOf('{');
  const end = withoutThinking.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('В ответе модели нет JSON');
  return JSON.parse(withoutThinking.slice(start, end + 1));
};

const nextWeather = (current, seed) => {
  const others = WEATHERS.filter((weather) => weather !== current);
  return others[Math.abs(seed) % others.length];
};

export const applyTurn = (rawState, input, reply, random = Math.random) => {
  const state = sanitizeState(rawState);
  const playerInput = cleanText(input, 120);
  const log = { intent: {}, validation: [], changes: [] };

  if (!state.alive) {
    log.validation.push('player.alive = false → ход отклонён');
    return { state, message: 'Вы мертвы.', options: [], log };
  }

  const action = ACTIONS.includes(reply?.action) ? reply.action : 'other';
  const message = cleanText(reply?.message, MAX_MESSAGE_LENGTH) || 'Ничего не происходит.';
  const duration = Math.min(MAX_DURATION, Math.max(0, Math.round(Number(reply?.duration_minutes) || 1)));
  log.intent = { action, duration_minutes: duration };

  const dropped = cleanList(reply?.dropped, MAX_CARRYING);
  dropped.forEach((item) => {
    const owned = state.carrying.some((own) => sameItem(own, item));
    log.validation.push(`dropped "${item}": ${owned ? 'есть при себе' : 'нет при себе → пропущено'}`);
    if (!owned) return;
    state.carrying = state.carrying.filter((own) => !sameItem(own, item));
    log.changes.push(`carrying − ${item}`);
  });

  cleanList(reply?.took, 3).forEach((item) => {
    if (state.carrying.some((own) => sameItem(own, item))) return;
    if (state.carrying.length >= MAX_CARRYING) {
      log.validation.push(`took "${item}": руки заняты → пропущено`);
      return;
    }
    state.carrying.push(item);
    log.changes.push(`carrying + ${item}`);
  });

  const location = cleanText(reply?.location, MAX_ITEM_LENGTH);
  if (location && location !== state.location) {
    log.changes.push(`location: ${state.location} → ${location}`);
    state.location = location;
  }

  const fact = cleanText(reply?.fact, 120);
  if (fact) {
    state.facts = [...state.facts, fact].slice(-MAX_FACTS);
    log.changes.push(`fact + ${fact}`);
  }

  const before = state.minutes;
  state.minutes += duration;
  if (Math.floor(state.minutes / WEATHER_STEP_MINUTES) > Math.floor(before / WEATHER_STEP_MINUTES)) {
    const weather = nextWeather(state.weather, Math.floor(random() * 1000));
    log.changes.push(`weather: ${state.weather} → ${weather}`);
    state.weather = weather;
  }
  log.changes.push(`time: ${formatClock(before)} → ${formatClock(state.minutes)}`);

  if (reply?.dead === true) {
    state.alive = false;
    log.changes.push('player.alive = false');
  }

  state.recent = [...state.recent, { input: playerInput, result: message }].slice(-MAX_RECENT);
  const options = state.alive ? cleanList(reply?.options, 2) : [];

  return { state, message, options, log };
};
