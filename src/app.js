import { applyTurn, createInitialState, formatClock, OPENING_LINE, sanitizeState } from '../lib/engine.js';
import { demoReply } from './demo.js';

const STORAGE_KEY = 'les:v1';
// Вне Telegram SDK всё равно загружается и сыплет предупреждениями — используем его только внутри Telegram.
const tg = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
// Лог хода виден с ?debug и всегда при локальном запуске.
const debug = new URLSearchParams(location.search).has('debug') || ['localhost', '127.0.0.1'].includes(location.hostname);

const $ = (id) => document.getElementById(id);
const ui = {
  app: $('app'), clock: $('clock'), location: $('location'), weather: $('weather'),
  log: $('log'), options: $('options'), prompt: $('prompt'), input: $('input'), send: $('send'),
  condition: $('condition'), death: $('death'), deathCause: $('death-cause'), again: $('again'), devlog: $('devlog'),
};

let game = load() ?? fresh();
let busy = false;
let demo = false;

function fresh() {
  const state = createInitialState();
  return { state, turns: [{ you: null, text: OPENING_LINE, time: state.minutes }], options: [] };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Старые сохранения могут не знать о новых полях — прогоняем через движок.
    return saved?.state && Array.isArray(saved.turns) ? { ...saved, state: sanitizeState(saved.state) } : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...game, turns: game.turns.slice(-60) }));
  } catch {
    // Хранилище недоступно (приватный режим) — игра продолжается без сохранения.
  }
}

function renderTurn({ you, text, time, kind }, isNew = false) {
  const turn = document.createElement('article');
  turn.className = ['turn', isNew && 'is-new', kind && `is-${kind}`].filter(Boolean).join(' ');
  if (you) {
    const line = document.createElement('p');
    line.className = 'turn__you';
    line.textContent = you;
    turn.append(line);
  }
  const forest = document.createElement('div');
  forest.className = 'turn__forest';
  const stamp = document.createElement('time');
  stamp.className = 'turn__time';
  stamp.textContent = time == null ? '' : formatClock(time);
  const body = document.createElement('p');
  body.className = 'turn__text';
  body.textContent = text;
  forest.append(stamp, body);
  turn.append(forest);
  ui.log.append(turn);
  ui.log.scrollTop = ui.log.scrollHeight;
  return turn;
}

function renderStatus(animateClock) {
  const { state } = game;
  const clock = formatClock(state.minutes);
  if (ui.clock.textContent !== clock) {
    ui.clock.textContent = clock;
    if (animateClock) {
      ui.clock.classList.remove('is-ticking');
      void ui.clock.offsetWidth;
      ui.clock.classList.add('is-ticking');
    }
  }
  ui.location.textContent = state.location;
  ui.weather.textContent = state.weather;
  ui.condition.textContent = state.condition.join(', ');
  ui.condition.hidden = state.condition.length === 0;

  ui.options.replaceChildren(...game.options.map((label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option';
    button.textContent = label;
    button.addEventListener('click', () => act(label));
    return button;
  }));

  const over = state.over;
  ui.app.classList.toggle('is-dead', over);
  ui.prompt.hidden = over;
  ui.death.hidden = !over;
  if (over) {
    const ending = state.ending || (state.alive ? 'Конец' : 'Смерть');
    ui.deathCause.textContent = `${ending[0].toUpperCase()}${ending.slice(1)} в ${clock}.`;
  }
  // Панели внизу меняют высоту журнала — докручиваем до последнего хода.
  ui.log.scrollTop = ui.log.scrollHeight;
}

function renderAll() {
  ui.log.replaceChildren();
  game.turns.forEach((turn) => renderTurn(turn));
  renderStatus(false);
}

async function requestTurn(input) {
  if (demo) return applyTurn(game.state, input, demoReply(game.state, input));
  try {
    const response = await fetch('api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg?.initData ?? '' },
      body: JSON.stringify({ state: game.state, input, debug }),
    });
    // Нет нашего API (статический хостинг отдаёт 404/405/501 или HTML) — уходим в демо.
    const isJson = response.headers.get('content-type')?.includes('application/json');
    if (!isJson) throw new TypeError('no api');
    const data = await response.json();
    if (!response.ok) {
      const message = data.error || 'Лес молчит. Попробуйте ещё раз.';
      throw new Error(debug && data.detail ? `${message}\n${data.detail}` : message);
    }
    return data;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // API нет (файл открыт локально или на GitHub Pages) — переключаемся на демо-ответы.
    demo = true;
    console.info('[лес] /api/turn недоступен, демо-режим');
    return applyTurn(game.state, input, demoReply(game.state, input));
  }
}

function writeDevlog(input, turn) {
  if (!debug || !turn.log) return;
  ui.devlog.hidden = false;
  const { intent, validation, changes } = turn.log;
  ui.devlog.textContent = [
    `INPUT: "${input}"${demo ? '   [demo]' : ''}`,
    `INTENT: ${JSON.stringify(intent)}`,
    `VALIDATION:\n  ${validation.join('\n  ') || '—'}`,
    `STATE:\n  ${changes.join('\n  ') || '—'}`,
    `RESULT: "${turn.message}"`,
  ].join('\n');
}

async function act(rawInput) {
  const input = rawInput.trim();
  if (!input || busy || game.state.over) return;
  busy = true;
  ui.send.disabled = true;
  ui.input.value = '';
  game.options = [];
  renderStatus(false);
  tg?.HapticFeedback?.impactOccurred('light');

  const pending = renderTurn({ you: input, text: '', time: null, kind: 'waiting' });

  try {
    const turn = await requestTurn(input);
    pending.remove();
    game.state = turn.state;
    game.options = turn.options ?? [];
    const kind = turn.state.over ? 'death' : null;
    const entry = { you: input, text: turn.message, time: turn.state.minutes, kind };
    game.turns.push(entry);
    renderTurn(entry, true);
    renderStatus(true);
    writeDevlog(input, turn);
    save();
    if (kind === 'death') tg?.HapticFeedback?.notificationOccurred(turn.state.alive ? 'warning' : 'error');
  } catch (error) {
    pending.remove();
    renderTurn({ you: input, text: error.message, time: null, kind: 'error' }, true);
    ui.input.value = input;
  } finally {
    busy = false;
    ui.send.disabled = false;
    if (!game.state.over) ui.input.focus({ preventScroll: true });
  }
}

ui.prompt.addEventListener('submit', (event) => {
  event.preventDefault();
  act(ui.input.value);
});

ui.again.addEventListener('click', () => {
  game = fresh();
  save();
  renderAll();
  ui.input.focus();
});

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#15221a');
  tg.setBackgroundColor?.('#1b2a21');
  tg.setBottomBarColor?.('#15221a');
  tg.disableVerticalSwipes?.();
}

renderAll();
