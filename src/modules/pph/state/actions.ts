import type {
  BloodLossEntry,
  BloodLossMethod,
  Case,
  LabEntry,
  LogEntry,
  MedEntry,
  Patient,
  Team,
  ViscoEntry,
  VitalsEntry,
} from '../protocol/types';
import { checklistItemForMed, describeMed, itemText, uid } from '../protocol/case';
import { lossPercent, severity, shockIndex, totalBloodLoss } from '../protocol/calc';
import { CAUSES } from '../protocol/data';

/** Все действия — чистые функции Case → Case; время передаётся явно для тестируемости. */

function touch(c: Case, at: string, log?: Omit<LogEntry, 'id' | 'at'> & { at?: string }): Case {
  const next = { ...c, updatedAt: at };
  if (log) next.log = [...c.log, { id: uid(), at: log.at ?? at, text: log.text, kind: log.kind }];
  return next;
}

export function setCheck(c: Case, id: string, done: boolean, at: string): Case {
  const prev = c.checks[id];
  const next = touch(c, at, { kind: done ? 'check' : 'uncheck', text: `${done ? '✓' : '✗ снято'}: ${itemText(id)}` });
  next.checks = { ...c.checks, [id]: { ...prev, done, na: false, at } };
  return next;
}

export function setNa(c: Case, id: string, na: boolean, at: string): Case {
  const prev = c.checks[id];
  const next = touch(c, at, { kind: 'event', text: `${na ? 'Не применимо' : 'Снята отметка «не применимо»'}: ${itemText(id)}` });
  next.checks = { ...c.checks, [id]: { ...prev, done: false, na, at } };
  return next;
}

export function setCheckTime(c: Case, id: string, at: string, now: string): Case {
  const prev = c.checks[id];
  if (!prev) return c;
  const next = touch(c, now);
  next.checks = { ...c.checks, [id]: { ...prev, at } };
  return next;
}

export function setCheckNote(c: Case, id: string, note: string, now: string): Case {
  const prev = c.checks[id] ?? { done: false, at: now };
  const next = touch(c, now);
  next.checks = { ...c.checks, [id]: { ...prev, note } };
  return next;
}

export function startBleeding(c: Case, at: string): Case {
  if (c.bleedingStart) return c;
  return { ...touch(c, at, { kind: 'event', text: 'Начало кровотечения — запуск алгоритма' }), bleedingStart: at, bleedingStop: undefined };
}

export function stopBleeding(c: Case, at: string): Case {
  return { ...touch(c, at, { kind: 'event', text: `Кровотечение остановлено. Суммарная кровопотеря ${totalBloodLoss(c)} мл` }), bleedingStop: at };
}

export function resumeBleeding(c: Case, at: string): Case {
  return { ...touch(c, at, { kind: 'event', text: 'Возобновление кровотечения' }), bleedingStop: undefined };
}

export function markMassive(c: Case, at: string, reason = 'клинически'): Case {
  if (c.massiveAt) return c;
  return { ...touch(c, at, { kind: 'event', text: `Диагностирована массивная кровопотеря (${reason}) — контроль 10/20/40 мин` }), massiveAt: at };
}

export function addBloodLoss(c: Case, ml: number, method: BloodLossMethod, at: string): Case {
  const entry: BloodLossEntry = { id: uid(), at, ml, method };
  const methodLabel = { gravimetric: 'гравиметрически', visual: 'визуально', cellsaver: 'аппарат реинфузии' }[method];
  let next: Case = { ...c, bloodLoss: [...c.bloodLoss, entry] };
  const total = totalBloodLoss(next);
  next = touch(next, at, { kind: 'bloodloss', text: `Кровопотеря +${ml} мл (${methodLabel}), всего ${total} мл` });
  if (!next.bleedingStart) next = startBleeding(next, at);
  if (!next.massiveAt && severity(next) === 'critical') {
    const pct = lossPercent(next);
    next = markMassive(next, at, pct !== undefined ? `${total} мл, ${pct.toFixed(0)}% ОЦК` : `${total} мл`);
  }
  return next;
}

export function setBloodLossTotal(c: Case, totalMl: number, method: BloodLossMethod, at: string): Case {
  const diff = totalMl - totalBloodLoss(c);
  if (diff === 0) return c;
  return addBloodLoss(c, diff, method, at);
}

export function addVitals(c: Case, v: Omit<VitalsEntry, 'id'>, now: string): Case {
  const entry: VitalsEntry = { ...v, id: uid() };
  const si = shockIndex(v.hr, v.sbp);
  const parts = [
    v.sbp !== undefined ? `АД ${v.sbp}/${v.dbp ?? '—'}` : '',
    v.hr !== undefined ? `ЧСС ${v.hr}` : '',
    si !== undefined ? `ШИ ${si.toFixed(2)}` : '',
    v.rr !== undefined ? `ЧД ${v.rr}` : '',
    v.spo2 !== undefined ? `SpO₂ ${v.spo2}%` : '',
    v.temp !== undefined ? `T ${v.temp}` : '',
    v.diuresis !== undefined ? `диурез ${v.diuresis} мл/ч` : '',
  ].filter(Boolean);
  let next = touch({ ...c, vitals: [...c.vitals, entry] }, now, { kind: 'vitals', at: v.at, text: `Витальные: ${parts.join(', ')}` });
  if (!next.massiveAt && si !== undefined && si >= 1 && next.bleedingStart && !next.bleedingStop)
    next = markMassive(next, v.at, `шоковый индекс ${si.toFixed(2)}`);
  return next;
}

export function addLab(c: Case, l: Omit<LabEntry, 'id'>, now: string): Case {
  const entry: LabEntry = { ...l, id: uid() };
  const labels: [keyof Omit<LabEntry, 'id'>, string][] = [
    ['hb', 'Hb'], ['hct', 'Ht'], ['plt', 'Tr'], ['fib', 'Фг'], ['ptRatio', 'ПТВ×N'], ['apttRatio', 'АЧТВ×N'],
    ['inr', 'МНО'], ['leeWhite', 'Ли-Уайт'], ['caIon', 'Ca²⁺'], ['lactate', 'лактат'], ['ph', 'pH'], ['potassium', 'K⁺'],
  ];
  const parts = labels.filter(([k]) => l[k] !== undefined).map(([k, n]) => `${n} ${l[k]}`);
  if (l.leeWhiteLooseClot) parts.push('рыхлый сгусток');
  return touch({ ...c, labs: [...c.labs, entry] }, now, { kind: 'lab', at: l.at, text: `Анализы: ${parts.join(', ')}` });
}

export function addVisco(c: Case, v: Omit<ViscoEntry, 'id'>, now: string): Case {
  const entry: ViscoEntry = { ...v, id: uid() };
  const parts =
    v.device === 'rotem'
      ? [['FIBTEM A5', v.fibtemA5], ['EXTEM CT', v.extemCt], ['EXTEM MCF', v.extemMcf], ['EXTEM ML', v.extemMl]]
      : [['FF MA', v.ffMa], ['R', v.tegR], ['MA', v.tegMa], ['LY30', v.tegLy30]];
  const txt = parts.filter(([, x]) => x !== undefined).map(([n, x]) => `${n} ${x}`).join(', ');
  let next = touch({ ...c, visco: [...c.visco, entry] }, now, { kind: 'visco', at: v.at, text: `${v.device === 'rotem' ? 'РОТЭМ' : 'ТЭГ'}: ${txt}` });
  if (!next.checks['first_visco']?.done) next = { ...next, checks: { ...next.checks, first_visco: { done: true, at: v.at } } };
  return next;
}

export function addMed(c: Case, m: Omit<MedEntry, 'id'>, now: string): Case {
  const entry: MedEntry = { ...m, id: uid() };
  let next = touch({ ...c, meds: [...c.meds, entry] }, now, { kind: 'med', at: m.at, text: `Введено: ${describeMed(entry)}` });
  const item = checklistItemForMed(c, m.drug);
  if (item && !next.checks[item]?.done) next = { ...next, checks: { ...next.checks, [item]: { done: true, at: m.at } } };
  return next;
}

type ListKey = 'bloodLoss' | 'vitals' | 'labs' | 'visco' | 'meds' | 'log';

export function removeEntry(c: Case, key: ListKey, id: string, now: string): Case {
  const list = c[key] as { id: string }[];
  const next = { ...c, [key]: list.filter((e) => e.id !== id) } as Case;
  return touch(next, now, key === 'log' ? undefined : { kind: 'event', text: `Удалена запись (${{ bloodLoss: 'кровопотеря', vitals: 'витальные', labs: 'анализы', visco: 'ТЭГ/РОТЭМ', meds: 'препарат', log: '' }[key]})` });
}

export function updatePatient(c: Case, p: Partial<Patient>, now: string): Case {
  return { ...touch(c, now), patient: { ...c.patient, ...p } };
}

export function updateTeam(c: Case, t: Partial<Team>, now: string): Case {
  return { ...touch(c, now), team: { ...c.team, ...t } };
}

export function toggleCause(c: Case, id: string, now: string): Case {
  const on = !c.causes.includes(id);
  const title = CAUSES.find((x) => x.id === id)?.title ?? id;
  return {
    ...touch(c, now, { kind: 'event', text: `${on ? 'Причина' : 'Исключена причина'}: ${title}` }),
    causes: on ? [...c.causes, id] : c.causes.filter((x) => x !== id),
  };
}

export function addNote(c: Case, text: string, at: string): Case {
  return touch(c, at, { kind: 'note', text });
}

export function setField<K extends 'timing' | 'outcome' | 'notes'>(c: Case, k: K, v: Case[K], now: string): Case {
  return { ...touch(c, now), [k]: v };
}

export function setQualityOverride(c: Case, id: string, v: boolean | undefined, now: string): Case {
  return { ...touch(c, now), qualityOverride: { ...c.qualityOverride, [id]: v } };
}
