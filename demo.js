// Демо-ответы без сети: чтобы открыть index.html локально или на GitHub Pages и посмотреть, как это ощущается.
// Настоящая игра идёт через /api/turn.

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const RULES = [
  {
    test: /яблок/,
    reply: (state) => state.carrying.includes('яблоко')
      ? { action: 'use', message: 'Волк лизнул вас в коленку и ушёл гулять с белками.', duration_minutes: 1, dropped: ['яблоко'], fact: 'Волк ушёл с белками.' }
      : { action: 'use', message: 'Яблока у вас нет. Вы показываете волку пустую руку.', duration_minutes: 1 },
  },
  { test: /ветк|палк/, reply: () => ({ action: 'use', message: 'Вас съел волк.', duration_minutes: 1, dead: true }) },
  { test: /смотр|осмат|огляд/, reply: () => ({ action: 'look', message: pick(['Деревья. Справа тоже деревья.', 'Вы видите лес. Лес видит вас.', 'Ёлка. Ещё ёлка. Пень.']), duration_minutes: 2 }) },
  { test: /звон|телефон/, reply: () => ({ action: 'use', message: 'Связь одна палка. Вам звонят из банка.', duration_minutes: 3 }) },
  { test: /жд|сплю|спать/, reply: () => ({ action: 'wait', message: 'Прошёл час. Вы постарели на час.', duration_minutes: 60 }) },
  { test: /дерев|лез/, reply: () => ({ action: 'move', message: 'Вы на дереве. Отсюда видно другие деревья.', duration_minutes: 5, location: 'На дереве' }) },
  { test: /гриб|ем |съе/, reply: () => ({ action: 'eat', message: 'Гриб был обычный. Вы съели обычный гриб.', duration_minutes: 2 }) },
];

const WALKS = [
  { message: 'Вы идёте по лесу.', duration_minutes: 10 },
  { message: 'Вы идёте по лесу. Лес продолжается.', duration_minutes: 12 },
  { message: 'Вы встретили волка. Дать ему яблоко или ветку?', duration_minutes: 7, location: 'Поляна', options: ['дать яблоко', 'дать ветку'], fact: 'На поляне волк.' },
  { message: 'Вы нашли ветку.', duration_minutes: 4, took: ['ветка'] },
  { message: 'Мимо прошёл лось. Он не поздоровался.', duration_minutes: 6 },
];

let walks = 0;

export const demoReply = (state, input) => {
  const text = input.toLowerCase();
  const rule = RULES.find((candidate) => candidate.test.test(text));
  if (rule) return { action: 'other', ...rule.reply(state) };
  if (/ид|шаг|впер|налев|направ|дальш|бег/.test(text)) {
    // Первые три прогулки по сценарию (до волка), дальше вразнобой.
    const walk = walks < 3 ? WALKS[walks] : pick(WALKS);
    walks += 1;
    return { action: 'move', ...walk };
  }
  return { action: 'other', message: `Вы делаете «${input}». Лес не реагирует.`, duration_minutes: 1 };
};
