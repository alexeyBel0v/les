import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTurn, createInitialState, formatClock, parseAIReply, sanitizeState } from '../lib/engine.js';

const reply = (overrides = {}) => ({
  action: 'move', message: 'Вы идёте по лесу.', duration_minutes: 10,
  location: null, took: [], dropped: [], fact: null, options: [], dead: false, ...overrides,
});

test('время идёт по движку и ограничено', () => {
  const { state } = applyTurn(createInitialState(), 'жду', reply({ duration_minutes: 99999 }));
  assert.equal(state.minutes, 7 * 60 + 42 + 600);
});

test('нельзя отдать то, чего нет при себе', () => {
  const { state, log } = applyTurn(createInitialState(), 'даю ветку', reply({ dropped: ['ветка'] }));
  assert.deepEqual(state.carrying, ['яблоко', 'телефон']);
  assert.match(log.validation[0], /нет при себе/);
});

test('отдать яблоко убирает его', () => {
  const { state } = applyTurn(createInitialState(), 'даю яблоко', reply({ dropped: ['Яблоко'] }));
  assert.deepEqual(state.carrying, ['телефон']);
});

test('смерть — обычное состояние, после неё ходы не идут', () => {
  const dead = applyTurn(createInitialState(), 'даю ветку', reply({ message: 'Вас съел волк.', dead: true, ending: 'съеден волком' }));
  assert.equal(dead.state.alive, false);
  assert.equal(dead.state.ending, 'съеден волком');
  assert.deepEqual(dead.options, []);
  const after = applyTurn(dead.state, 'встаю', reply({ duration_minutes: 30 }));
  assert.equal(after.state.minutes, dead.state.minutes);
  assert.equal(after.message, 'Вы мертвы.');
});

test('варианты не больше двух', () => {
  const { options } = applyTurn(createInitialState(), 'иду', reply({ options: ['а', 'б', 'в'] }));
  assert.deepEqual(options, ['а', 'б']);
});

test('ответ модели в markdown и с <think> разбирается', () => {
  const parsed = parseAIReply('<think>хм</think>```json\n{"action":"look","message":"Деревья."}\n```');
  assert.equal(parsed.message, 'Деревья.');
});

test('мусорное состояние от клиента приводится в порядок', () => {
  const state = sanitizeState({ minutes: 'x', weather: 'Метеоритный дождь', carrying: [1, '', 'нож'], alive: 'да' });
  assert.equal(state.weather, 'Пасмурно');
  assert.deepEqual(state.carrying, ['нож']);
  assert.equal(state.alive, true);
});

test('часы переходят через полночь', () => {
  assert.equal(formatClock(1440 + 5), '00:05');
});

test('финал без смерти тоже заканчивает игру', () => {
  const { state, options } = applyTurn(createInitialState(), 'выхожу из леса', reply({ ending: 'пошли на работу', options: ['а', 'б'] }));
  assert.equal(state.alive, true);
  assert.equal(state.over, true);
  assert.deepEqual(options, []);
  assert.equal(applyTurn(state, 'иду', reply()).message, 'Игра окончена.');
});

test('состояния добавляются и снимаются без дублей', () => {
  const first = applyTurn(createInitialState(), 'ем ягоду', reply({ condition_add: ['отравлены', 'отравлены', 'мокрый'] }));
  assert.deepEqual(first.state.condition, ['отравлены', 'мокрый']);
  const second = applyTurn(first.state, 'сушусь', reply({ condition_remove: ['Мокрый'] }));
  assert.deepEqual(second.state.condition, ['отравлены']);
});
