// Прогон набора свободных команд через настоящую модель: npm run try
// Нужен .env с OPENROUTER_API_KEY. Печатает ход за ходом, чтобы оценить тон ответов.

import { applyTurn, buildAIContext, createInitialState, formatClock, parseAIReply } from '../lib/engine.js';
import { askGameMaster } from '../lib/openrouter.js';

const COMMANDS = [
  'иду направо', 'идём дальше', 'осматриваюсь', 'даю волку яблоко', 'беру палку',
  'лезу на дерево', 'кричу', 'звоню в полицию', 'жду час', 'ем гриб',
  'прячусь за деревом', 'иду на север', 'стучу в дверь', 'пою песню', 'ложусь спать',
  'ищу воду', 'разговариваю с белкой', 'бросаю палку', 'танцую', 'ыыы',
];

let state = createInitialState();
for (const input of COMMANDS) {
  if (!state.alive) {
    console.log('\n— игрок мёртв, начинаем заново —');
    state = createInitialState();
  }
  try {
    const turn = applyTurn(state, input, parseAIReply(await askGameMaster(buildAIContext(state, input))));
    state = turn.state;
    const options = turn.options.length ? `  [${turn.options.join(' | ')}]` : '';
    console.log(`\n${formatClock(state.minutes)}  > ${input}\n${turn.message}${options}`);
  } catch (error) {
    console.log(`\n> ${input}\n!! ${error.message}`);
  }
}
