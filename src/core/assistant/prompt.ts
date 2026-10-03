import type { ModuleDef } from '../modules';
import { gaText, type Labour } from '../record';
import { knowledgeBase } from './knowledge';

export const RULES = `Ты — клинический помощник врача акушера-гинеколога в приложении «Родзал» (родильный зал). Отвечай по-русски.

Правила:
1. Опирайся на БАЗУ ЗНАНИЙ ниже (клинические рекомендации РФ, физиологическая интерпретация КТГ по Chandraharan) и на ДАННЫЕ ТЕКУЩИХ РОДОВ. Когда опираешься на базу, ставь короткую ссылку в квадратных скобках: [КР ПК 2025, 5], [КТГ-навигатор: 3-6-9-12-15], [Chandraharan, гл. …].
2. Если ответа в базе нет — скажи об этом прямо и пометь ответ как «общее знание, сверьте с КР». Не выдумывай ссылки, номера разделов и главы.
3. Дозы препаратов называй только из базы знаний или данных приложения. Если дозы в базе нет — не называй её, отправь к инструкции/протоколу учреждения.
4. При угрожающей ситуации сначала дай действия (что сделать сейчас, по пунктам), потом объяснение.
5. Пиши кратко и структурно: короткие абзацы, списки, без вступлений и повторов вопроса. Без таблиц, если не просят.
6. Ты — средство поддержки решений. Окончательное решение принимает врач у постели. Если данных не хватает для вывода — назови, что нужно уточнить.
7. Не спрашивай и не повторяй персональные данные пациентки.`;

/** Данные записи для помощника — без ФИО и номера истории. */
export function labourContext(l: Labour | undefined, defs: ModuleDef[], now: Date): string {
  if (!l) return 'Активной записи родов нет — вопрос общий.';
  const p = l.patient;
  const head = [
    l.training ? 'УЧЕБНЫЙ СЛУЧАЙ (тренировка).' : '',
    `Пациентка: ${[p.age ? `${p.age} лет` : '', gaText(p), p.parity, p.weightKg ? `${p.weightKg} кг` : ''].filter(Boolean).join(', ') || 'данные не заполнены'}.`,
    p.background ? `Анамнез / факторы риска: ${p.background}` : '',
    `Текущее время: ${now.toLocaleString('ru-RU')}.`,
  ].filter(Boolean);
  const mods = defs
    .filter((d) => d.ready && d.active(l))
    .map((d) => {
      const ctx = d.assistantContext?.(l, now);
      return ctx ? `## ${d.title}\n${ctx}` : '';
    })
    .filter(Boolean);
  const notes = l.events.slice(-12).map((e) => `- ${new Date(e.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ${e.text}`);
  return [...head, ...mods, notes.length ? `## Записи в хронологии\n${notes.join('\n')}` : ''].filter(Boolean).join('\n\n');
}

/** Первая (постоянная) реплика: правила + база знаний + данные родов. */
export function instructionTurn(l: Labour | undefined, defs: ModuleDef[], now: Date): string {
  const active = l ? defs.filter((d) => d.ready && d.active(l)).map((d) => d.id) : [];
  const kb = knowledgeBase({ modules: active.length ? active : ['ktg', 'pph'], weightKg: l?.patient.weightKg ?? l?.modules.pph?.patient.weightKg });
  return `${RULES}\n\n=== БАЗА ЗНАНИЙ ===\n${kb}\n\n=== ДАННЫЕ ТЕКУЩИХ РОДОВ ===\n${labourContext(l, defs, now)}\n\n=== КОНЕЦ ДАННЫХ ===\nДальше — вопросы врача.`;
}
