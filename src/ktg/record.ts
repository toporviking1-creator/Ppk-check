import { ACTIONS, type ActionId } from './actions';
import { interpret } from './interpret';
import {
  CONTEXT_LABEL,
  DECEL_FREQ_LABEL,
  DECEL_NATURE_LABEL,
  FIGO_LABEL,
  PHYSIO_LABEL,
  STAGE_LABEL,
  TREND_LABEL,
  TRI_LABEL,
  VAR_LABEL,
} from './labels';
import type { ClinicalContext, CtgFeatures, Interpretation } from './types';

export function fmtTime(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function contextList(c: ClinicalContext): string[] {
  return (Object.keys(c) as (keyof ClinicalContext)[]).filter((k) => c[k]).map((k) => CONTEXT_LABEL[k]);
}

/** Строки описания ленты (признаки). */
export function describeFeatures(f: CtgFeatures): string[] {
  const out: string[] = [];
  const b = f.baseline !== undefined ? `${f.baseline} уд/мин` : 'не указан';
  const anchor = f.anchorBaseline !== undefined ? ` (исходный ${f.anchorBaseline})` : '';
  out.push(`Базальный ритм: ${b}${anchor}, ${TREND_LABEL[f.trend].toLowerCase()}.`);
  let v = `Вариабельность: ${VAR_LABEL[f.variability]}`;
  if (f.variabilityMin !== undefined && f.variability !== 'normal') v += ` в течение ${f.variabilityMin} мин`;
  if (f.zigzag) v += ', ZigZag';
  if (f.sinusoidal) v += ', синусоидальный ритм';
  out.push(v + '.');
  out.push(`Цикличность: ${TRI_LABEL[f.cycling].toLowerCase()}; акцелерации: ${TRI_LABEL[f.accelerations].toLowerCase()}.`);
  if (f.decels === 'none') out.push('Децелераций нет.');
  else {
    let d = `Децелерации: ${DECEL_FREQ_LABEL[f.decels].toLowerCase()}, ${DECEL_NATURE_LABEL[f.decelNature].toLowerCase()}`;
    if (f.decelsMin !== undefined) d += `, в течение ${f.decelsMin} мин`;
    if (f.decelsWorsening) d += ', углубляются/удлиняются';
    if (f.subacutePattern) d += ', > 90 с со стабильным ритмом между ними < 30 с';
    if (f.shallowDecels) d += ', неглубокие';
    out.push(d + '.');
  }
  if (f.prolonged) {
    out.push(
      `Пролонгированная децелерация${f.prolongedMin !== undefined ? ` ${f.prolongedMin} мин` : ''}; вариабельность внутри: ${TRI_LABEL[f.prolongedVarPreserved].toLowerCase()}.`,
    );
  }
  if (f.contractions !== undefined || f.hypertonus) {
    out.push(`Схватки: ${f.contractions ?? '—'} за 10 мин${f.hypertonus ? ', гипертонус' : ''}.`);
  }
  return out;
}

/** Текст для вставки в историю родов. */
export function recordText(f: CtgFeatures, r: Interpretation = interpret(f), at: Date = new Date(), done: string[] = []): string {
  const lines: string[] = [];
  lines.push(`${fmtDateTime(at)}. Оценка КТГ (${STAGE_LABEL[f.stage]}${f.gaWeeks ? `, ${f.gaWeeks} нед` : ''}).`);
  lines.push(...describeFeatures(f));
  const ctx = contextList(f.context);
  if (ctx.length) lines.push(`Клинически: ${ctx.join(', ').toLowerCase()}.`);
  lines.push(`Заключение (физиологическая интерпретация): ${r.headline}. Категория: ${PHYSIO_LABEL[r.physio].toLowerCase()}.`);
  if (r.findings.length) lines.push(r.findings.join(' '));
  if (r.nonHypoxic.length) lines.push(`Дифференциальный ряд: ${r.nonHypoxic.join('; ')}.`);
  lines.push(`По FIGO 2015 / КР РФ 2023: ${FIGO_LABEL[r.figo].toLowerCase()} КТГ (${r.figoReasons.join('; ')}).`);
  const plan = r.actions.filter((a) => !a.avoid).map((a) => a.text);
  if (plan.length) lines.push(`План: ${plan.join('; ')}.`);
  if (done.length) lines.push(`Выполнено: ${done.map((id) => ACTIONS[id as ActionId] ?? id).join('; ')}.`);
  lines.push(r.reassessMin > 0 ? `Переоценка КТГ через ${r.reassessMin} мин.` : 'Непрерывное наблюдение у постели, повторная оценка после мер.');
  return lines.join('\n');
}
