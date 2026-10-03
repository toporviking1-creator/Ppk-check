import type { Case, LabEntry, ViscoEntry, VitalsEntry } from './types';
import { DRUG_BY_ID } from './drugs';

export type Severity = 'none' | 'physiological' | 'pathological' | 'critical';

export const SEVERITY_LABEL: Record<Severity, string> = {
  none: 'Нет данных',
  physiological: 'Допустимая (физиологическая)',
  pathological: 'Патологическая',
  critical: 'Критическая (массивная)',
};

/** Объём циркулирующей крови, мл (раздел 2.5.1: 85–100 мл/кг в III триместре). */
export function bloodVolumeMl(weightKg?: number, coefMlKg = 90): number | undefined {
  if (!weightKg || weightKg <= 0) return undefined;
  return Math.round(weightKg * coefMlKg);
}

export function totalBloodLoss(c: Pick<Case, 'bloodLoss'>): number {
  return c.bloodLoss.reduce((s, e) => s + (Number.isFinite(e.ml) ? e.ml : 0), 0);
}

export function lossPercent(c: Case): number | undefined {
  const bv = bloodVolumeMl(c.patient.weightKg, c.patient.bvCoefMlKg);
  if (!bv) return undefined;
  return (totalBloodLoss(c) / bv) * 100;
}

/**
 * Классификация кровопотери по Приложению Б1:
 * допустимая — < 500 мл при родах / < 1000 мл при КС (< 10% ОЦК);
 * патологическая — ≥ 500 / ≥ 1000 мл (> 10% ОЦК);
 * критическая — > 25–30% ОЦК, > 1500–2000 мл.
 */
export function severity(c: Case): Severity {
  const loss = totalBloodLoss(c);
  if (loss <= 0 && c.bloodLoss.length === 0) return 'none';
  const pct = lossPercent(c);
  if (loss >= 1500 || (pct !== undefined && pct >= 25)) return 'critical';
  const threshold = c.patient.deliveryMode === 'cs' ? 1000 : 500;
  if (loss >= threshold || (pct !== undefined && pct > 10)) return 'pathological';
  return 'physiological';
}

/** Порог диагноза ПК (1.1): ≥ 500 мл при родах, ≥ 1000 мл при КС. */
export function pphThreshold(mode: Case['patient']['deliveryMode']): number {
  return mode === 'cs' ? 1000 : 500;
}

/** Шоковый индекс = ЧСС / САД (норма после родов 0,7–0,9; > 1,0 — шок). */
export function shockIndex(hr?: number, sbp?: number): number | undefined {
  if (!hr || !sbp) return undefined;
  return hr / sbp;
}

export function meanArterialPressure(sbp?: number, dbp?: number): number | undefined {
  if (!sbp || !dbp) return undefined;
  return (sbp + 2 * dbp) / 3;
}

export function lastVitals(c: Case): VitalsEntry | undefined {
  return [...c.vitals].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
}

export function lastLab(c: Case): LabEntry | undefined {
  return [...c.labs].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
}

/** Последнее известное значение конкретного показателя из всех анализов. */
export function latestLabValue<K extends keyof LabEntry>(c: Case, key: K): LabEntry[K] | undefined {
  const sorted = [...c.labs].sort((a, b) => b.at.localeCompare(a.at));
  for (const l of sorted) if (l[key] !== undefined && l[key] !== null) return l[key];
  return undefined;
}

/**
 * Расчёт количества единиц криопреципитата (3.1):
 * КП = (ФГж − ФГи) × МТ × 70 × (1 − Ht) / 250,
 * где ФГ — фибриноген (г/л), МТ — масса тела (кг), Ht — гематокрит (доля), 250 мг фибриногена в 1 ед.
 */
export function cryoUnits(targetFib: number, currentFib: number, weightKg: number, hct: number): number {
  const h = hct > 1 ? hct / 100 : hct;
  const units = ((targetFib - currentFib) * weightKg * 70 * (1 - h)) / 250;
  return Math.max(0, Math.ceil(units));
}

const INFUSION_DRUGS = new Set(['crystalloid', 'gelatin', 'albumin']);
const BLOOD_DRUGS = new Set(['rbc', 'ffp', 'cryo', 'platelets']);

export function infusionTotals(c: Case) {
  let crystalloidColloid = 0;
  let blood = 0;
  let gelatin = 0;
  for (const m of c.meds) {
    const v = m.volumeMl ?? 0;
    if (INFUSION_DRUGS.has(m.drug) || m.drug === 'oxytocin') crystalloidColloid += v;
    if (BLOOD_DRUGS.has(m.drug)) blood += v;
    if (m.drug === 'gelatin') gelatin += v;
  }
  return { crystalloidColloid, blood, gelatin, total: crystalloidColloid + blood };
}

export function drugTotal(c: Case, drugId: string): number {
  return c.meds.filter((m) => m.drug === drugId).reduce((s, m) => s + (m.dose || 0), 0);
}

export function drugGiven(c: Case, drugId: string): boolean {
  return c.meds.some((m) => m.drug === drugId);
}

export function drugName(id: string): string {
  return DRUG_BY_ID[id]?.name ?? id;
}

export interface Finding {
  level: 'danger' | 'warn' | 'ok';
  text: string;
  action?: string;
  ref?: string;
}

/** Оценка лабораторных показателей по целевым значениям (3.1). */
export function assessLabs(l: LabEntry, ongoingBleeding: boolean): Finding[] {
  const f: Finding[] = [];
  if (l.hb !== undefined) {
    if (l.hb < 70)
      f.push({ level: 'danger', text: `Hb ${l.hb} г/л < 70`, action: 'Абсолютное показание к трансфузии эритроцитов', ref: '3.1' });
    else f.push({ level: 'ok', text: `Hb ${l.hb} г/л (цель > 70)`, action: 'При признаках гемической гипоксии — трансфузия' });
  }
  if (l.plt !== undefined) {
    if (l.plt < 50)
      f.push({ level: 'danger', text: `Тромбоциты ${l.plt}×10⁹/л < 50`, action: 'Трансфузия тромбоцитов', ref: '3.1' });
    else if (l.plt < 80 && ongoingBleeding)
      f.push({ level: 'warn', text: `Тромбоциты ${l.plt}×10⁹/л < 80 на фоне кровотечения`, action: 'Трансфузия тромбоцитов', ref: '3.1' });
    else f.push({ level: 'ok', text: `Тромбоциты ${l.plt}×10⁹/л (цель > 50)` });
  }
  if (l.fib !== undefined) {
    if (l.fib < 2)
      f.push({ level: 'danger', text: `Фибриноген ${l.fib} г/л < 2`, action: 'Криопреципитат 1 доза/5 кг (даже при норме ПТВ/АЧТВ)', ref: '3.1' });
    else f.push({ level: 'ok', text: `Фибриноген ${l.fib} г/л (цель ≥ 2)` });
  }
  const pt = Math.max(l.ptRatio ?? 0, l.apttRatio ?? 0);
  if (l.ptRatio !== undefined || l.apttRatio !== undefined) {
    if (pt > 1.5 && ongoingBleeding)
      f.push({ level: 'danger', text: `ПТВ/АЧТВ ${pt.toFixed(2)}× нормы > 1,5`, action: 'СЗП 15–20 мл/кг', ref: '3.1' });
    else if (pt > 1.5) f.push({ level: 'warn', text: `ПТВ/АЧТВ ${pt.toFixed(2)}× нормы > 1,5`, action: 'Контроль, при кровотечении — СЗП' });
    else f.push({ level: 'ok', text: `ПТВ/АЧТВ ≤ 1,5× нормы` });
  }
  if (l.leeWhite !== undefined || l.leeWhiteLooseClot) {
    if ((l.leeWhite ?? 0) > 7 || l.leeWhiteLooseClot)
      f.push({ level: 'danger', text: `Ли-Уайт ${l.leeWhite ?? '—'} мин${l.leeWhiteLooseClot ? ', рыхлый сгусток' : ''}`, action: 'Подозрение на коагулопатию', ref: '2.3' });
    else f.push({ level: 'ok', text: `Ли-Уайт ${l.leeWhite} мин (≤ 7)` });
  }
  if (l.caIon !== undefined) {
    if (l.caIon < 0.9)
      f.push({ level: 'danger', text: `Ca²⁺ ${l.caIon} ммоль/л < 0,9`, action: 'Кальция хлорид', ref: '3.1' });
    else f.push({ level: 'ok', text: `Ca²⁺ ${l.caIon} ммоль/л` });
  }
  if (l.lactate !== undefined) {
    if (l.lactate >= 2) f.push({ level: 'warn', text: `Лактат ${l.lactate} ммоль/л ≥ 2`, action: 'Инфузионная терапия неадекватна', ref: '3.1' });
    else f.push({ level: 'ok', text: `Лактат ${l.lactate} ммоль/л (< 2)` });
  }
  if (l.ph !== undefined && l.ph < 7.2)
    f.push({ level: 'warn', text: `pH ${l.ph} < 7,2`, action: 'Снижает эффективность эптакога альфа' });
  return f;
}

/** Интерпретация РОТЭМ/ТЭГ по Приложению А3.3. */
export function assessVisco(v: ViscoEntry, weightKg?: number): Finding[] {
  const f: Finding[] = [];
  const w = weightKg;
  const kg = (per: number) => (w ? ` (${Math.round(per * w)})` : '');
  if (v.device === 'rotem') {
    if (v.fibtemA5 !== undefined) {
      if (v.fibtemA5 < 12)
        f.push({ level: 'danger', text: `FIBTEM A5 ${v.fibtemA5} мм < 12 — дефицит фибриногена`, action: 'Криопреципитат до целевого A5 16 мм (≈5 доз/80 кг = +2 мм)', ref: 'А3.3' });
      else f.push({ level: 'ok', text: `FIBTEM A5 ${v.fibtemA5} мм ≥ 12 — коррекция фибриногена не требуется` });
    }
    if (v.extemCt !== undefined) {
      const fibOk = v.fibtemA5 === undefined || v.fibtemA5 > 12;
      if (v.extemCt > 100)
        f.push({ level: 'danger', text: `EXTEM CT ${v.extemCt} с > 100 — выраженный дефицит факторов`, action: `ПКК 20 МЕ/кг${kg(20)} или СЗП 20–30 мл/кг; рассмотреть эптаког альфа 90–110 мкг/кг${fibOk ? '' : ' (сначала скорректировать фибриноген)'}`, ref: 'А3.3' });
      else if (v.extemCt > 80)
        f.push({ level: 'warn', text: `EXTEM CT ${v.extemCt} с > 80 — дефицит факторов`, action: `ПКК 10–15 МЕ/кг${kg(15)} или СЗП 12–15 мл/кг${fibOk ? '' : ' (верифицировать при FIBTEM A5 > 12)'}`, ref: 'А3.3' });
      else f.push({ level: 'ok', text: `EXTEM CT ${v.extemCt} с` });
    }
    if (v.extemMcf !== undefined && v.extemMcf < 45 && (v.fibtemA5 ?? 99) > 12)
      f.push({ level: 'danger', text: `EXTEM MCF ${v.extemMcf} мм < 45 при FIBTEM A5 > 12 — тромбоцитарный дефект`, action: 'Концентрат тромбоцитов 1 доза/10 кг', ref: 'А3.3' });
    if (v.extemMl !== undefined && v.extemMl > 15)
      f.push({ level: 'danger', text: `EXTEM ML ${v.extemMl}% > 15 — гиперфибринолиз`, action: `Транексамовая кислота 15 мг/кг${kg(15)} за 10 мин`, ref: 'А3.3' });
  } else {
    if (v.ffMa !== undefined && v.ffMa < 15)
      f.push({ level: 'danger', text: `FF MA ${v.ffMa} мм < 15 — дефицит фибриногена`, action: 'Криопреципитат', ref: 'А3.3' });
    if (v.tegR !== undefined) {
      if (v.tegR > 10)
        f.push({ level: 'danger', text: `R ${v.tegR} мин > 10 — выраженный дефицит факторов`, action: `ПКК 20 МЕ/кг${kg(20)} или СЗП 20–30 мл/кг`, ref: 'А3.3' });
      else if (v.tegR > 8)
        f.push({ level: 'warn', text: `R ${v.tegR} мин > 8 — дефицит факторов`, action: `ПКК 10–15 МЕ/кг${kg(15)} или СЗП 12–15 мл/кг`, ref: 'А3.3' });
    }
    if (v.tegMa !== undefined && v.tegMa < 45 && (v.ffMa ?? 99) >= 15)
      f.push({ level: 'danger', text: `MA ${v.tegMa} мм < 45 при FF MA ≥ 15 — тромбоцитарный дефект`, action: 'Концентрат тромбоцитов 1 доза/10 кг', ref: 'А3.3' });
    if (v.tegLy30 !== undefined && v.tegLy30 > 15)
      f.push({ level: 'danger', text: `Лизис ${v.tegLy30}% — гиперфибринолиз`, action: 'Транексамовая кислота 15 мг/кг за 10 мин', ref: 'А3.3' });
  }
  if (f.length) f.push({ level: 'ok', text: 'После коррекции — повторный ТЭГ/РОТЭМ' });
  return f;
}

export function minutesBetween(a: string, b: string | Date): number {
  const tb = typeof b === 'string' ? new Date(b).getTime() : b.getTime();
  return (tb - new Date(a).getTime()) / 60000;
}

export function formatDuration(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? '−' : '';
  const s = Math.floor(Math.abs(totalMinutes) * 60);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(sec)}` : `${sign}${pad(m)}:${pad(sec)}`;
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

export function fmtNum(v: number | undefined, digits = 0): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
