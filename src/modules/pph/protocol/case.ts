import type { Case, CheckState, MedEntry } from './types';
import { ITEM_BY_ID, CHECKLIST, type ChecklistSection, type ChecklistItem } from './data';
import { DRUG_BY_ID } from './drugs';
import { massiveBranch } from './alerts';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newCase(now = new Date()): Case {
  const iso = now.toISOString();
  return {
    id: uid(),
    createdAt: iso,
    updatedAt: iso,
    patient: {
      fullName: '',
      historyNo: '',
      deliveryMode: 'vaginal',
      department: '',
      bloodGroup: '',
      riskFactors: [],
      bvCoefMlKg: 90,
    },
    team: {
      obstetrician: '',
      obstetrician2: '',
      midwife1: '',
      midwife2: '',
      anesthesiologist: '',
      nurseAnesthetist: '',
      transfusiologist: '',
      surgeon: '',
    },
    timing: 'early',
    checks: {},
    bloodLoss: [],
    vitals: [],
    labs: [],
    visco: [],
    meds: [],
    log: [],
    qualityOverride: {},
    causes: [],
    outcome: '',
    notes: '',
  };
}

/** Применимость пункта к способу родоразрешения. */
export function itemApplies(c: Case, item: ChecklistItem): boolean {
  return !item.onlyFor || item.onlyFor === c.patient.deliveryMode;
}

export function sectionVisible(c: Case, s: ChecklistSection): boolean {
  if (s.condition === 'inversion') return c.causes.includes('inversion');
  if (s.condition === 'late') return c.timing === 'late';
  if (s.condition === 'massive') return massiveBranch(c);
  return true;
}

export function visibleSections(c: Case): ChecklistSection[] {
  return CHECKLIST.filter((s) => sectionVisible(c, s)).map((s) => ({
    ...s,
    items: s.items.filter((i) => itemApplies(c, i)),
  }));
}

export function sectionProgress(c: Case, s: ChecklistSection): { done: number; total: number } {
  const items = s.items.filter((i) => itemApplies(c, i));
  const done = items.filter((i) => c.checks[i.id]?.done || c.checks[i.id]?.na).length;
  return { done, total: items.length };
}

/** Пункт чек-листа, соответствующий введённому препарату, с учётом ситуации. */
export function checklistItemForMed(c: Case, drugId: string): string | undefined {
  if (drugId === 'oxytocin_prev' || drugId === 'carbetocin')
    return c.patient.deliveryMode === 'cs' ? 'prev_cs_oxy' : 'prev_oxy';
  if (drugId === 'txa') {
    if (!c.bleedingStart) return 'prev_txa';
    return c.checks['drug_txa']?.done ? 'surg_txa2' : 'drug_txa';
  }
  if (drugId === 'crystalloid' || drugId === 'gelatin' || drugId === 'albumin') return 'inf_crystalloid';
  return DRUG_BY_ID[drugId]?.checklistItem;
}

export function checkState(done: boolean, at: string, prev?: CheckState): CheckState {
  return { ...prev, done, na: false, at };
}

export function describeMed(m: MedEntry): string {
  const vol = m.volumeMl ? `, ${m.volumeMl} мл` : '';
  return `${m.name} ${m.dose ? `${m.dose} ${m.unit}` : ''} ${m.route}${vol}`.replace(/\s+/g, ' ').trim();
}

export function itemText(id: string): string {
  return ITEM_BY_ID[id]?.text ?? id;
}

/** Миграция/нормализация сохранённого случая (устойчивость к старым версиям данных). */
export function normalizeCase(raw: Partial<Case>): Case {
  const base = newCase(new Date(raw.createdAt ?? Date.now()));
  return {
    ...base,
    ...raw,
    patient: { ...base.patient, ...raw.patient },
    team: { ...base.team, ...raw.team },
    checks: raw.checks ?? {},
    bloodLoss: raw.bloodLoss ?? [],
    vitals: raw.vitals ?? [],
    labs: raw.labs ?? [],
    visco: raw.visco ?? [],
    meds: raw.meds ?? [],
    log: raw.log ?? [],
    qualityOverride: raw.qualityOverride ?? {},
    causes: raw.causes ?? [],
  } as Case;
}
