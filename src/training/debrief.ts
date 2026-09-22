import type { Case } from '../protocol/types';
import { CAUSES, ITEM_BY_ID } from '../protocol/data';
import { itemApplies, visibleSections } from '../protocol/case';
import { drugTotal, infusionTotals, minutesBetween, totalBloodLoss } from '../protocol/calc';
import { isDone } from '../protocol/alerts';
import { qualityScore } from '../protocol/quality';
import { SCENARIO_BY_ID } from './scenarios';
import { modelStopped } from './engine';

export interface DebriefRow {
  label: string;
  /** Минуты от начала кровотечения (или от диагностики массивной кровопотери). */
  minutes?: number;
  /** Срок по КР, если он установлен протоколом. */
  targetMin?: number;
  status: 'ok' | 'late' | 'missed' | 'info';
  note?: string;
}

export interface Debrief {
  scenarioTitle: string;
  durationMin: number;
  trueLoss: number;
  documentedLoss: number;
  stopped: boolean;
  causeCorrect: boolean;
  causeText: string;
  keyActions: DebriefRow[];
  protocolTimers: DebriefRow[];
  errors: string[];
  missedCritical: string[];
  quality: { yes: number; applicable: number };
  score: number;
}

/** Ключевые действия первой линии — время от начала кровотечения. */
const KEY_ACTIONS: [string, string][] = [
  ['alert_call', 'Вызов помощи (2-й врач, 2-я акушерка)'],
  ['alert_anesth', 'Вызов анестезиолога'],
  ['first_iv2', 'Второй венозный доступ 14–16G'],
  ['first_labs', 'Взятие анализов'],
  ['drug_oxytocin', 'Окситоцин (лечебная доза)'],
  ['drug_txa', 'Транексамовая кислота'],
  ['inf_crystalloid', 'Инфузия кристаллоидов'],
  ['first_bladder', 'Катетеризация мочевого пузыря'],
  ['first_gravimetric', 'Гравиметрическая оценка кровопотери'],
  ['cause_inspect', 'Осмотр родовых путей'],
];

export function buildDebrief(c: Case): Debrief | undefined {
  const t = c.training;
  if (!t || !c.bleedingStart) return undefined;
  const s = SCENARIO_BY_ID[t.scenarioId];
  const start = c.bleedingStart;
  const end = t.finishedAt ?? t.lastTickSim;
  const sinceStart = (id: string) => {
    const st = c.checks[id];
    return st?.done ? Math.max(0, minutesBetween(start, st.at)) : undefined;
  };

  const keyActions: DebriefRow[] = KEY_ACTIONS.filter(([id]) => ITEM_BY_ID[id] && itemApplies(c, ITEM_BY_ID[id]))
    .filter(([id]) => !(s.id === 'inversion' && id === 'drug_oxytocin'))
    .map(([id, label]) => {
      const m = sinceStart(id);
      return m === undefined ? { label, status: 'missed' as const } : { label, minutes: m, status: 'info' as const };
    });

  const protocolTimers: DebriefRow[] = [];
  if (c.massiveAt) {
    const since = (id: string) => (c.checks[id]?.done ? minutesBetween(c.massiveAt!, c.checks[id].at) : undefined);
    const row = (id: string, label: string, target: number): DebriefRow => {
      const m = since(id);
      if (m === undefined) return { label, targetMin: target, status: 'missed' };
      return { label, minutes: Math.max(0, m), targetMin: target, status: m <= target ? 'ok' : 'late' };
    };
    protocolTimers.push(row('mas_10min', 'Анестезиолог: доступ, пробы, мониторинг', 10));
    protocolTimers.push(row('mas_decision20', 'Решение о хирургическом вмешательстве', 20));
    const rbc = c.meds.filter((m) => m.drug === 'rbc').map((m) => m.at).sort()[0];
    protocolTimers.push(
      rbc
        ? { label: 'Трансфузия эритроцитов', minutes: Math.max(0, minutesBetween(c.massiveAt, rbc)), targetMin: 40, status: minutesBetween(c.massiveAt, rbc) <= 40 ? 'ok' : 'late' }
        : { label: 'Трансфузия эритроцитов', targetMin: 40, status: 'missed' },
    );
  }
  // Интервалы коагулограммы ≤ 30 мин
  const labTimes = [start, ...c.labs.map((l) => l.at).sort(), end].filter((x, i, a) => i === 0 || x >= a[i - 1]);
  const maxGap = labTimes.slice(1).reduce((m, x, i) => Math.max(m, minutesBetween(labTimes[i], x)), 0);
  if (minutesBetween(start, end) > 30)
    protocolTimers.push({ label: 'Максимальный интервал между анализами', minutes: maxGap, targetMin: 30, status: maxGap <= 30 ? 'ok' : 'late', note: `внесено анализов: ${c.labs.length}` });

  const errors: string[] = [];
  const causeCorrect = c.causes.includes(s.cause);
  const wrong = c.causes.filter((x) => x !== s.cause);
  if (!causeCorrect) errors.push(`Причина не установлена: правильный ответ — ${CAUSES.find((x) => x.id === s.cause)?.title}.`);
  if (wrong.length) errors.push(`Отмечены неверные причины: ${wrong.map((w) => CAUSES.find((x) => x.id === w)?.title).join(', ')}.`);
  if (s.uterotonicsHarm) {
    const reposAt = c.checks['inv_reposition']?.at;
    const early = c.meds.find((m) => (m.drug === 'oxytocin' || m.drug === 'miso') && (!reposAt || m.at < reposAt));
    if (early) errors.push('Утеротоник введён до репозиции вывернутой матки.');
  }
  if (t.falseStops) errors.push(`Остановка кровотечения отмечена преждевременно (${t.falseStops} раз).`);
  const oxy = drugTotal(c, 'oxytocin') + drugTotal(c, 'oxytocin_prev');
  if (oxy > 60) errors.push(`Превышена суточная доза окситоцина: ${oxy} МЕ > 60 МЕ.`);
  if (drugTotal(c, 'txa') > 4000) errors.push(`Транексамовая кислота ${drugTotal(c, 'txa')} мг > 4000 мг.`);
  const inf = infusionTotals(c);
  const documented = totalBloodLoss(c);
  if (documented > 0 && inf.crystalloidColloid > documented * 1.5 && inf.crystalloidColloid > 1000)
    errors.push(`Избыточная инфузия кристаллоидов/коллоидов: ${inf.crystalloidColloid} мл при кровопотере ${documented} мл (цель 1:1).`);
  const trueLoss = Math.round(t.trueLoss);
  if (trueLoss - documented > 300) errors.push(`В карту внесено ${documented} мл из ${trueLoss} мл фактической кровопотери — вносите вводные акушерки сразу.`);
  const unapplied = t.messages.filter((m) => (m.bloodLossMl || m.vitals || m.lab) && !m.applied).length;
  if (unapplied > 2) errors.push(`Не внесено вводных с данными: ${unapplied}.`);

  const missedCritical = visibleSections(c)
    .flatMap((sec) => sec.items)
    .filter((i) => i.critical && !c.checks[i.id]?.done && !c.checks[i.id]?.na)
    .filter((i) => !(i.id.startsWith('mas_') && !c.massiveAt))
    .filter((i) => !(s.id === 'inversion' && i.id === 'drug_oxytocin'))
    .map((i) => i.text);

  const stopped = modelStopped(c, s);
  const quality = qualityScore(c);
  const critTotal = missedCritical.length + visibleSections(c).flatMap((x) => x.items).filter((i) => i.critical && isDone(c, i.id)).length;
  const critPart = critTotal ? 1 - missedCritical.length / critTotal : 1;
  const timerPart = protocolTimers.length ? protocolTimers.filter((r) => r.status === 'ok').length / protocolTimers.length : 1;
  let score = 100 * (0.45 * critPart + 0.2 * timerPart + 0.15 * (quality.applicable ? quality.yes / quality.applicable : 1)) + (causeCorrect ? 10 : 0) + (stopped ? 10 : 0);
  score -= Math.min(20, errors.length * 4);

  return {
    scenarioTitle: s.title,
    durationMin: minutesBetween(start, end),
    trueLoss,
    documentedLoss: documented,
    stopped,
    causeCorrect,
    causeText: CAUSES.find((x) => x.id === s.cause)?.title ?? s.cause,
    keyActions,
    protocolTimers,
    errors,
    missedCritical,
    quality,
    score: Math.max(0, Math.min(100, Math.round(score))),
  };
}
