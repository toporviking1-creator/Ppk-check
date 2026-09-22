import type { Case } from './types';
import {
  assessLabs,
  drugGiven,
  drugTotal,
  infusionTotals,
  lastVitals,
  latestLabValue,
  lossPercent,
  meanArterialPressure,
  minutesBetween,
  pphThreshold,
  severity,
  shockIndex,
  totalBloodLoss,
} from './calc';
import { DRUG_BY_ID } from './drugs';

export interface Alert {
  id: string;
  level: 'danger' | 'warn' | 'info';
  text: string;
  ref?: string;
  /** Обратный отсчёт до срока, мин (отрицательный — просрочено). */
  dueInMin?: number;
}

export function isDone(c: Case, id: string): boolean {
  return !!c.checks[id]?.done;
}

export function isClosed(c: Case, id: string): boolean {
  return !!c.checks[id]?.done || !!c.checks[id]?.na;
}

export function isBleeding(c: Case): boolean {
  return !!c.bleedingStart && !c.bleedingStop;
}

/** «Массивная» ветка алгоритма: ≥ 1000 мл и продолжается / шок / ≥ 25% ОЦК. */
export function massiveBranch(c: Case): boolean {
  if (c.massiveAt) return true;
  const loss = totalBloodLoss(c);
  const v = lastVitals(c);
  const si = shockIndex(v?.hr, v?.sbp);
  return severity(c) === 'critical' || (loss >= 1000 && isBleeding(c)) || (si !== undefined && si >= 1 && isBleeding(c));
}

/** Использованы препараты, требующие контроля коагулограммы через 6 ч и НМГ через 12 ч. */
export function procoagulantsUsed(c: Case): boolean {
  return drugGiven(c, 'ffp') || drugGiven(c, 'pcc') || drugGiven(c, 'eptacog');
}

/** Список активных подсказок/тревог для текущего состояния случая. */
export function computeAlerts(c: Case, now: Date = new Date()): Alert[] {
  const a: Alert[] = [];
  const loss = totalBloodLoss(c);
  const pct = lossPercent(c);
  const bleeding = isBleeding(c);
  const v = lastVitals(c);
  const si = shockIndex(v?.hr, v?.sbp);
  const w = c.patient.weightKg;

  if (!w) a.push({ id: 'noweight', level: 'warn', text: 'Не указана масса тела — дозы и % ОЦК не рассчитываются' });

  if (bleeding && loss >= pphThreshold(c.patient.deliveryMode))
    a.push({ id: 'pph', level: 'warn', text: `Кровопотеря ${loss} мл — критерий послеродового кровотечения (≥ ${pphThreshold(c.patient.deliveryMode)} мл)`, ref: '1.1' });

  if (bleeding && loss >= 1000 && !isDone(c, 'mas_or'))
    a.push({ id: 'or', level: 'danger', text: 'Кровопотеря ≥ 1000 мл и продолжается — быстрая инфузия кристаллоидов и перевод в операционную', ref: '3.1, Б5' });

  if (pct !== undefined && pct >= 25)
    a.push({ id: 'massive', level: 'danger', text: `Кровопотеря ${pct.toFixed(0)}% ОЦК — массивная: протокол массивной трансфузии, решение о хирургии ≤ 20 мин`, ref: '3.1, Б1' });

  if (si !== undefined) {
    if (si >= 1) a.push({ id: 'si', level: 'danger', text: `Шоковый индекс ${si.toFixed(2)} ≥ 1,0 — геморрагический шок, вероятна потребность в трансфузии`, ref: '2.5.1' });
    else if (si > 0.9) a.push({ id: 'si', level: 'warn', text: `Шоковый индекс ${si.toFixed(2)} > 0,9 (норма 0,7–0,9)`, ref: '2.5.1' });
  }
  const mapV = meanArterialPressure(v?.sbp, v?.dbp);
  if ((v?.sbp !== undefined && v.sbp < 90) || (mapV !== undefined && mapV < 65))
    a.push({ id: 'hypo', level: 'danger', text: `Гипотония (САД ${v?.sbp ?? '—'}, САДср ${mapV?.toFixed(0) ?? '—'}) — при отсутствии эффекта от 30–40 мл/кг за 1 ч — вазопрессоры`, ref: '3.1' });
  if (v?.diuresis !== undefined && v.diuresis < 30)
    a.push({ id: 'diur', level: 'warn', text: `Диурез ${v.diuresis} мл/ч < 30 — ИТТ неадекватна`, ref: '3.1' });
  if (v?.temp !== undefined && v.temp < 36)
    a.push({ id: 'hypoth', level: 'warn', text: `Гипотермия ${v.temp} °C — согревание пациентки и растворов (35–40 °C)`, ref: '3.1' });
  if (v?.spo2 !== undefined && v.spo2 < 90)
    a.push({ id: 'spo2', level: 'danger', text: `SpO₂ ${v.spo2}% < 90 — оценить показания к ИВЛ`, ref: '3.3' });

  // Таймеры массивной кровопотери
  const massiveStart = c.massiveAt;
  if (massiveStart && bleeding) {
    const t = minutesBetween(massiveStart, now);
    if (!isDone(c, 'mas_decision20'))
      a.push({ id: 't20', level: t > 20 ? 'danger' : 'warn', text: 'Решение о хирургическом вмешательстве', dueInMin: 20 - t, ref: '3.1' });
    if (!drugGiven(c, 'rbc') && !isClosed(c, 'mas_rbc40'))
      a.push({ id: 't40', level: t > 40 ? 'danger' : 'warn', text: 'Начало трансфузии эритроцитов (при показаниях)', dueInMin: 40 - t, ref: '3.1' });
    if (!isDone(c, 'mas_10min'))
      a.push({ id: 't10', level: t > 10 ? 'danger' : 'warn', text: 'Анестезиолог: доступ, пробы, мониторинг, диурез', dueInMin: 10 - t, ref: '3.1' });
  }

  // Повтор коагулограммы каждые 30 мин при продолжающемся кровотечении
  if (bleeding && c.bleedingStart && loss >= pphThreshold(c.patient.deliveryMode)) {
    const lastLabAt = [...c.labs].map((l) => l.at).sort().at(-1) ?? c.bleedingStart;
    const t = minutesBetween(lastLabAt, now);
    a.push({ id: 'coag30', level: t > 30 ? 'danger' : 'info', text: c.labs.length ? 'Повторная коагулограмма (каждые 30 мин)' : 'Первая коагулограмма / ОАК', dueInMin: 30 - t, ref: '2.3' });
  }

  // Лабораторные триггеры
  const lastLab = [...c.labs].sort((x, y) => x.at.localeCompare(y.at)).at(-1);
  if (lastLab)
    for (const f of assessLabs(lastLab, bleeding))
      if (f.level !== 'ok') a.push({ id: `lab_${f.text}`, level: f.level, text: `${f.text} → ${f.action ?? ''}`, ref: f.ref });

  // Утеротоники
  if (bleeding && c.bleedingStart && !isClosed(c, 'drug_oxytocin') && !c.causes.includes('inversion'))
    a.push({ id: 'oxy', level: 'danger', text: 'Утеротоническая терапия начинается с инфузии окситоцина', ref: '3.1' });
  const oxy = drugTotal(c, 'oxytocin') + drugTotal(c, 'oxytocin_prev');
  if (oxy > 60) a.push({ id: 'oxymax', level: 'danger', text: `Окситоцин ${oxy} МЕ — превышена максимальная суточная доза 60 МЕ`, ref: 'А3.1' });
  if (c.causes.includes('inversion') && (drugGiven(c, 'oxytocin') || drugGiven(c, 'miso')) && !isDone(c, 'inv_reposition'))
    a.push({ id: 'inv', level: 'danger', text: 'Выворот матки: прекратить утеротоники до репозиции', ref: 'Б6' });
  if (drugGiven(c, 'miso'))
    a.push({ id: 'miso', level: 'info', text: '#Мизопростол: оформить решение врачебной комиссии (off-label)', ref: '3.1' });

  // Транексамовая кислота
  if (bleeding && c.bleedingStart && !drugGiven(c, 'txa') && loss >= pphThreshold(c.patient.deliveryMode))
    a.push({ id: 'txa', level: 'danger', text: `Транексамовая кислота 15 мг/кг${w ? ` (${Math.round((w * 15) / 50) * 50} мг)` : ''} в/в за 10 мин`, ref: '3.1' });
  const txa = drugTotal(c, 'txa');
  if (txa > 4000) a.push({ id: 'txamax', level: 'danger', text: `Транексамовая кислота суммарно ${txa} мг > 4000 мг`, ref: '3.1' });

  // Инфузия
  const inf = infusionTotals(c);
  if (loss > 0 && inf.crystalloidColloid > loss * 1.5 && inf.crystalloidColloid > 1000)
    a.push({ id: 'ratio', level: 'warn', text: `Кристаллоиды/коллоиды ${inf.crystalloidColloid} мл при кровопотере ${loss} мл — превышение 1:1 грозит дилюционной коагулопатией`, ref: '3.1' });
  if (w && inf.crystalloidColloid > w * 40)
    a.push({ id: 'inf40', level: 'warn', text: `Инфузия ${inf.crystalloidColloid} мл > 40 мл/кг — при нестабильности — вазопрессоры, СЗП`, ref: '3.1' });
  if (inf.gelatin > 1000) a.push({ id: 'gel', level: 'warn', text: `Желатин ${inf.gelatin} мл > 1000 мл`, ref: '3.1' });

  // Эптаког: условия эффективности
  if (drugGiven(c, 'eptacog')) {
    const ph = latestLabValue(c, 'ph');
    const plt = latestLabValue(c, 'plt');
    const fib = latestLabValue(c, 'fib');
    const temp = v?.temp;
    const bad: string[] = [];
    if (temp !== undefined && temp < 34) bad.push(`T ${temp} °C`);
    if (ph !== undefined && ph < 7.2) bad.push(`pH ${ph}`);
    if (plt !== undefined && plt < 50) bad.push(`тромбоциты ${plt}`);
    if (fib !== undefined && fib < 0.5) bad.push(`фибриноген ${fib}`);
    if (bad.length) a.push({ id: 'epta', level: 'warn', text: `Эффективность эптакога снижена: ${bad.join(', ')}`, ref: '3.1' });
  }

  // После остановки
  if (c.bleedingStop) {
    const t = minutesBetween(c.bleedingStop, now);
    if (procoagulantsUsed(c) && !isClosed(c, 'after_coag6'))
      a.push({ id: 'coag6', level: t > 360 ? 'danger' : 'info', text: 'Контроль коагулограммы через 6 ч (использованы СЗП/ПКК/эптаког)', dueInMin: 360 - t, ref: '3.1' });
    if ((procoagulantsUsed(c) || massiveBranch(c) || drugGiven(c, 'rbc')) && !isClosed(c, 'after_vte'))
      a.push({ id: 'vte', level: t > 720 ? 'danger' : 'info', text: 'Профилактика ВТЭО (НМГ) через 12 ч после остановки кровотечения', dueInMin: 720 - t, ref: '3.1' });
  }

  // Критические невыполненные пункты при активном кровотечении
  if (bleeding) {
    const missing: string[] = [];
    if (!isClosed(c, 'first_iv2')) missing.push('2 вены');
    if (!isClosed(c, 'first_bladder')) missing.push('катетер мочевого пузыря');
    if (!isClosed(c, 'first_labs')) missing.push('анализы');
    if (!isClosed(c, 'alert_call')) missing.push('вызов помощи');
    if (!isClosed(c, 'first_gravimetric')) missing.push('гравиметрия');
    if (missing.length) a.push({ id: 'basic', level: 'warn', text: `Не отмечено: ${missing.join(', ')}`, ref: '3.1' });
  }

  for (const m of c.meds) {
    const d = DRUG_BY_ID[m.drug];
    if (m.drug === 'rbc' && !isDone(c, 'mas_order'))
      a.push({ id: 'bio', level: 'info', text: `${d?.name ?? m.name}: подтвердите пробы на совместимость и биологическую пробу`, ref: '3.1' });
  }

  const order = { danger: 0, warn: 1, info: 2 } as const;
  const seen = new Set<string>();
  return a
    .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
    .sort((x, y) => order[x.level] - order[y.level]);
}
