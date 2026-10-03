import type { SavedAssessment } from '../modules/ktg/types-state';
import type { Case as PphCase } from '../modules/pph/protocol/types';

export type ModuleId = 'ktg' | 'pph' | 'second' | 'ovr' | 'pe';

export type Severity = 'info' | 'warn' | 'danger' | 'ok';

/** Событие общей хронологии родов. */
export interface TimelineEvent {
  id: string;
  at: string;
  module: ModuleId | 'core';
  text: string;
  severity?: Severity;
}

export interface LabourPatient {
  label: string;
  age?: number;
  gaWeeks?: number;
  gaDays?: number;
  parity: string;
  weightKg?: number;
  background: string;
  doctor: string;
}

export interface KtgData {
  anchorBaseline?: number;
  assessments: SavedAssessment[];
}

/** Одна запись «Роды»: пациентка, хронология и данные модулей. */
export interface Labour {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Учебная запись (тренировка). */
  training?: boolean;
  patient: LabourPatient;
  /** Ручные записи и события таймеров. */
  events: TimelineEvent[];
  modules: {
    ktg?: KtgData;
    pph?: PphCase;
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newLabour(init: Partial<LabourPatient> = {}): Labour {
  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    patient: { label: '', parity: '', background: '', doctor: '', ...init },
    events: [],
    modules: {},
  };
}

export function normalizeLabour(raw: Partial<Labour>): Labour {
  const base = newLabour();
  return {
    ...base,
    ...raw,
    id: raw.id ?? base.id,
    patient: { ...base.patient, ...raw.patient },
    events: Array.isArray(raw.events) ? raw.events : [],
    modules: { ...raw.modules },
  };
}

export function ktgOf(l: Labour): KtgData {
  return l.modules.ktg ?? { assessments: [] };
}

export function gaText(p: LabourPatient): string {
  if (!p.gaWeeks) return '';
  return `${p.gaWeeks}${p.gaDays ? `+${p.gaDays}` : ''} нед`;
}

export function addEvent(l: Labour, e: Omit<TimelineEvent, 'id'>): Labour {
  return { ...l, events: [...l.events, { ...e, id: uid() }] };
}

// ---------- Перенос данных из отдельных приложений ----------

/** Карта пациентки из КТГ-навигатора (до ядра). */
interface LegacyKtgPatient {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  gaWeeks?: number;
  gaDays?: number;
  parity: string;
  anchorBaseline?: number;
  background: string;
  doctor: string;
  assessments: SavedAssessment[];
  events: { id: string; at: string; kind: string; text: string }[];
}

export function fromLegacyKtg(p: LegacyKtgPatient): Labour {
  return normalizeLabour({
    id: `ktg-${p.id}`,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    patient: { label: p.label, gaWeeks: p.gaWeeks, gaDays: p.gaDays, parity: p.parity, background: p.background, doctor: p.doctor },
    events: (p.events ?? []).map((e) => ({ id: e.id, at: e.at, module: e.kind === 'timer' ? 'ktg' : 'core', text: e.text })),
    modules: { ktg: { anchorBaseline: p.anchorBaseline, assessments: p.assessments ?? [] } },
  });
}

/** Случай из ПК-чек-листа → запись «Роды». */
export function fromPphCase(c: PphCase): Labour {
  const pt = c.patient;
  const label = [pt.fullName, pt.historyNo ? `ИР № ${pt.historyNo}` : ''].filter(Boolean).join(', ');
  return normalizeLabour({
    id: `pph-${c.id}`,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    training: !!c.training,
    patient: { label, age: pt.age, gaWeeks: pt.gestationWeeks, weightKg: pt.weightKg, parity: pt.parity !== undefined ? `Р${pt.parity}` : '', background: '', doctor: '' },
    modules: { pph: c },
  });
}
