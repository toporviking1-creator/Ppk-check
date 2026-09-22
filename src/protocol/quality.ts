import type { Case } from './types';
import { isClosed, isDone, procoagulantsUsed } from './alerts';
import { drugGiven, drugTotal } from './calc';

export type QualityValue = 'yes' | 'no' | 'na';

export interface QualityCriterion {
  id: string;
  n: number;
  text: string;
  auto: (c: Case) => QualityValue;
}

/** Критерии оценки качества медицинской помощи (КР, с. 37–38). */
export const QUALITY_CRITERIA: QualityCriterion[] = [
  {
    id: 'q1',
    n: 1,
    text: 'Выполнена профилактика кровотечения утеротоническими средствами (в III периоде родов или интраоперационно при КС)',
    auto: (c) =>
      isDone(c, 'prev_oxy') || isDone(c, 'prev_cs_oxy') || drugGiven(c, 'oxytocin_prev') || drugGiven(c, 'carbetocin') ? 'yes' : 'no',
  },
  {
    id: 'q2',
    n: 2,
    text: 'Выполнено ручное обследование стенок полости матки, удаление остатков плацентарной ткани и сгустков, массаж матки, зашивание разрывов мягких тканей родовых путей',
    auto: (c) =>
      (isClosed(c, 'cause_manual') || c.patient.deliveryMode === 'cs') &&
      isClosed(c, 'cause_bimanual') &&
      isClosed(c, 'cause_suture')
        ? 'yes'
        : 'no',
  },
  {
    id: 'q3',
    n: 3,
    text: 'Выполнена катетеризация 2 периферических вен (катетерами не более 16G)',
    auto: (c) => (isDone(c, 'first_iv2') || isDone(c, 'mas_10min') ? 'yes' : 'no'),
  },
  {
    id: 'q4',
    n: 4,
    text: 'Выполнена утеротоническая терапия послеродового кровотечения окситоцином',
    auto: (c) => (isDone(c, 'drug_oxytocin') || drugGiven(c, 'oxytocin') ? 'yes' : 'no'),
  },
  {
    id: 'q5',
    n: 5,
    text: 'Выполнено при отсутствии эффекта от утеротонической терапии окситоцином введение #мизопростола 800 мкг',
    auto: (c) => (isDone(c, 'drug_miso') || drugGiven(c, 'miso') ? 'yes' : c.checks['drug_miso']?.na ? 'na' : 'no'),
  },
  {
    id: 'q6',
    n: 6,
    text: 'Выполнено незамедлительное начало инфузионной терапии сбалансированными кристаллоидными растворами',
    auto: (c) => (isDone(c, 'inf_crystalloid') || drugGiven(c, 'crystalloid') ? 'yes' : 'no'),
  },
  {
    id: 'q7',
    n: 7,
    text: 'Обеспечено взятие лабораторных проб, мониторинг витальных функций (АД, ЧСС, ЭКГ, ЧДД, SpO₂, температура тела), оценка диуреза',
    auto: (c) =>
      (isDone(c, 'first_labs') || c.labs.length > 0) &&
      (isDone(c, 'first_monitor') || c.vitals.length > 0) &&
      (isDone(c, 'first_bladder') || c.vitals.some((v) => v.diuresis !== undefined))
        ? 'yes'
        : 'no',
  },
  {
    id: 'q8',
    n: 8,
    text: 'Выполнен контроль коагулограммы (фибриноген, АЧТВ, МНО, ПТВ, ПДФ) через 6 часов и профилактика ВТЭО антикоагулянтами через 12 часов после остановки кровотечения при применении ПКК, #эптакога альфа, СЗП',
    auto: (c) => {
      if (!procoagulantsUsed(c)) return 'na';
      return isDone(c, 'after_coag6') && (isDone(c, 'after_vte') || drugGiven(c, 'lmwh')) ? 'yes' : 'no';
    },
  },
  {
    id: 'q9',
    n: 9,
    text: 'Выполнено введение #транексамовой кислоты в составе комплексной терапии послеродового кровотечения 1,0 г',
    auto: (c) => (isDone(c, 'drug_txa') || drugTotal(c, 'txa') >= 1000 ? 'yes' : 'no'),
  },
];

export function qualityValue(c: Case, q: QualityCriterion): QualityValue {
  const o = c.qualityOverride[q.id];
  if (o === true) return 'yes';
  if (o === false) return 'no';
  return q.auto(c);
}

export const QUALITY_LABEL: Record<QualityValue, string> = { yes: 'Да', no: 'Нет', na: 'Не применимо' };

export function qualityScore(c: Case): { yes: number; applicable: number } {
  let yes = 0;
  let applicable = 0;
  for (const q of QUALITY_CRITERIA) {
    const v = qualityValue(c, q);
    if (v !== 'na') applicable++;
    if (v === 'yes') yes++;
  }
  return { yes, applicable };
}
