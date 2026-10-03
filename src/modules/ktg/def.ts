import type { ModuleDef } from '../../core/modules';
import { heading, kv, p, SMALL, table } from '../../core/docxkit';
import { ktgOf, type Labour, type Severity } from '../../core/record';
import { fmtDateTime, fmtTime } from '../../core/time';
import { ACTIONS, type ActionId } from './logic/actions';
import { DECEL_FREQ_LABEL, DECEL_NATURE_LABEL, FIGO_LABEL, PHYSIO_LABEL, STAGE_LABEL, URGENCY_LABEL, VAR_LABEL } from './logic/labels';
import { contextList, describeFeatures } from './logic/record';
import type { Urgency } from './logic/types';
import type { SavedAssessment } from './types-state';

export const URGENCY_SEVERITY: Record<Urgency, Severity> = { routine: 'ok', attention: 'warn', urgent: 'danger', emergency: 'danger' };

function sorted(l: Labour): SavedAssessment[] {
  return [...ktgOf(l).assessments].sort((a, b) => a.at.localeCompare(b.at));
}

/** Текст оценки для помощника и протокола. */
export function assessmentText(a: SavedAssessment): string {
  const lines = [`${fmtDateTime(a.at)} — ${a.result.headline} (физиологически: ${PHYSIO_LABEL[a.result.physio].toLowerCase()}; FIGO/КР: ${FIGO_LABEL[a.result.figo].toLowerCase()}; ${URGENCY_LABEL[a.result.urgency].toLowerCase()}).`];
  lines.push(...describeFeatures(a.features));
  const ctx = contextList(a.features.context);
  if (ctx.length) lines.push(`Клинически: ${ctx.join(', ').toLowerCase()}.`);
  if (a.result.findings.length) lines.push(`Обоснование: ${a.result.findings.join(' ')}`);
  if (a.done.length) lines.push(`Выполнено: ${a.done.map((id) => ACTIONS[id as ActionId] ?? id).join('; ')}.`);
  if (a.note) lines.push(`Примечание: ${a.note}`);
  return lines.join('\n');
}

export const ktgDef: ModuleDef = {
  id: 'ktg',
  title: 'КТГ-навигатор',
  short: 'КТГ',
  description: 'Физиологическая интерпретация КТГ, FIGO/КР, таймер 3-6-9-12-15, тренажёр',
  source: 'Chandraharan; КР «Признаки внутриутробной гипоксии плода» (2023); FIGO 2015',
  ready: true,
  active: (l) => ktgOf(l).assessments.length > 0 || ktgOf(l).anchorBaseline !== undefined,
  status(l) {
    const as = sorted(l);
    const last = as[as.length - 1];
    if (!last) return null;
    return { severity: URGENCY_SEVERITY[last.result.urgency], text: `${fmtTime(last.at)} · ${last.result.headline}` };
  },
  events(l) {
    return sorted(l).map((a) => ({
      id: `ktg-${a.id}`,
      at: a.at,
      module: 'ktg' as const,
      text: `Оценка КТГ: ${a.result.headline}${a.features.baseline ? ` (БЧСС ${a.features.baseline})` : ''}`,
      severity: URGENCY_SEVERITY[a.result.urgency],
    }));
  },
  docx(l) {
    const as = sorted(l);
    const out = [];
    out.push(kv([['Исходный базальный ритм', ktgOf(l).anchorBaseline ? `${ktgOf(l).anchorBaseline} уд/мин` : '']]));
    if (!as.length) return out;
    out.push(heading('Сводка оценок КТГ'));
    out.push(
      table(
        ['Время', 'Период', 'БЧСС', 'Вариаб.', 'Децелерации', 'Заключение', 'Физиол.', 'FIGO'],
        as.map((a) => [
          fmtTime(a.at),
          STAGE_LABEL[a.features.stage],
          a.features.baseline !== undefined ? String(a.features.baseline) : '—',
          VAR_LABEL[a.features.variability],
          a.features.prolonged
            ? `Пролонгированная${a.features.prolongedMin ? ` ${a.features.prolongedMin} мин` : ''}`
            : a.features.decels === 'none'
              ? 'Нет'
              : `${DECEL_FREQ_LABEL[a.features.decels]}, ${DECEL_NATURE_LABEL[a.features.decelNature].toLowerCase()}`,
          a.result.headline,
          PHYSIO_LABEL[a.result.physio],
          FIGO_LABEL[a.result.figo],
        ]),
        [8, 10, 7, 9, 18, 26, 11, 11],
      ),
    );
    out.push(heading('Оценки подробно'));
    for (const a of as) {
      out.push(p(`${fmtDateTime(a.at)} — ${a.result.headline}`, { bold: true }));
      for (const line of describeFeatures(a.features)) out.push(p(line, { size: SMALL + 2, after: 20 }));
      const ctx = contextList(a.features.context);
      if (ctx.length) out.push(p(`Клинически: ${ctx.join(', ').toLowerCase()}.`, { size: SMALL + 2, after: 20 }));
      out.push(p(`Физиологически: ${PHYSIO_LABEL[a.result.physio].toLowerCase()}. ${a.result.findings.join(' ')}`, { size: SMALL + 2, after: 20 }));
      out.push(p(`FIGO 2015 / КР РФ: ${FIGO_LABEL[a.result.figo].toLowerCase()} (${a.result.figoReasons.join('; ')}).`, { size: SMALL + 2, after: 20 }));
      if (a.result.actions.length) out.push(p(`План: ${a.result.actions.join('; ')}.`, { size: SMALL + 2, after: 20 }));
      if (a.done.length) out.push(p(`Выполнено: ${a.done.map((id) => ACTIONS[id as ActionId] ?? id).join('; ')}.`, { size: SMALL + 2, after: 20 }));
      if (a.note) out.push(p(`Примечание: ${a.note}`, { size: SMALL + 2, italics: true, after: 80 }));
    }
    return out;
  },
  assistantContext(l) {
    const k = ktgOf(l);
    const as = sorted(l);
    if (!as.length && k.anchorBaseline === undefined) return '';
    const parts = [`Исходный базальный ритм: ${k.anchorBaseline ?? 'не указан'}. Оценок КТГ: ${as.length}.`];
    const recent = as.slice(-3);
    for (const a of recent) parts.push(assessmentText(a));
    if (as.length > 3) parts.push(`Базальный ритм по всем оценкам: ${as.map((a) => `${fmtTime(a.at)} ${a.features.baseline ?? '—'}`).join(', ')}.`);
    return parts.join('\n\n');
  },
};
