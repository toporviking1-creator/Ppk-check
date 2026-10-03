import type { Case, TrainingMessage, TrainingState } from '../protocol/types';
import { newCase, uid } from '../protocol/case';
import { bloodVolumeMl, drugGiven, drugTotal, minutesBetween } from '../protocol/calc';
import { isDone } from '../protocol/alerts';
import { SCENARIO_BY_ID, type Scenario } from './scenarios';

const REPORT_EVERY_MIN = 3;
const VITALS_EVERY_MIN = 5;
const LAB_DELAY_MIN = 10;
const LEEWHITE_DELAY_MIN = 7;
const VISCO_DELAY_MIN = 10;

const addMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60000).toISOString();

/** Модельное время тренировки. */
export function simTime(t: TrainingState, real: Date = new Date()): Date {
  const elapsed = real.getTime() - new Date(t.realAnchor).getTime();
  return new Date(new Date(t.simAnchor).getTime() + elapsed * t.speed);
}

export function setSpeed(c: Case, speed: number, real: Date = new Date()): Case {
  if (!c.training) return c;
  const sim = simTime(c.training, real).toISOString();
  return { ...c, training: { ...c.training, speed, realAnchor: real.toISOString(), simAnchor: sim } };
}

function msg(at: string, kind: TrainingMessage['kind'], text: string, extra: Partial<TrainingMessage> = {}): TrainingMessage {
  return { id: uid(), at, kind, text, ...extra };
}

/** Создаёт учебный случай по сценарию; кровотечение начинается сразу. */
export function createTrainingCase(scenarioId: string, speed = 1, real: Date = new Date()): Case {
  const s = SCENARIO_BY_ID[scenarioId];
  const iso = real.toISOString();
  const base = newCase(real);
  const t: TrainingState = {
    scenarioId,
    speed,
    realAnchor: iso,
    simAnchor: iso,
    lastTickSim: iso,
    trueLoss: s.initialLoss,
    carryMl: 0,
    lastReportSim: iso,
    lastVitalsSim: addMin(iso, -VITALS_EVERY_MIN),
    pending: [],
    handled: [],
    messages: [
      msg(iso, 'intro', s.intro),
      msg(iso, 'bloodloss', `Акушерка: кровопотеря по взвешиванию ${s.initialLoss} мл.`, { bloodLossMl: s.initialLoss }),
    ],
    falseStops: 0,
  };
  return {
    ...base,
    patient: {
      ...base.patient,
      ...s.patient,
      historyNo: 'УЧЕБНЫЙ',
      department: s.patient.deliveryMode === 'cs' ? 'операционная' : 'родильный зал',
      birthTime: addMin(iso, -15),
    },
    bleedingStart: iso,
    log: [{ id: uid(), at: iso, kind: 'event', text: `Тренировка: «${s.title}». Начало кровотечения` }],
    training: t,
  };
}

export function scenarioOf(c: Case): Scenario | undefined {
  return c.training ? SCENARIO_BY_ID[c.training.scenarioId] : undefined;
}

/** Остановлено ли кровотечение в модели. */
export function modelStopped(c: Case, s: Scenario): boolean {
  return s.stopWhen.some((set) => set.every((id) => isDone(c, id)));
}

function modelFib(c: Case, s: Scenario, pct: number): number {
  const drop = pct * (s.coagulopathy ? 0.06 : 0.03);
  const cryo = drugTotal(c, 'cryo') * 0.5; // 2 дозы ≈ +1 г/л
  const ffp = drugGiven(c, 'ffp') ? 0.3 : 0;
  return Math.max(0.4, +(s.baseline.fib - drop + cryo + ffp).toFixed(1));
}

/** Текущая скорость кровотечения в модели, мл/мин. */
export function modelRate(c: Case, s: Scenario): number {
  if (modelStopped(c, s)) return 0;
  let r = s.rate;
  for (const [id, f] of Object.entries(s.factors)) if (isDone(c, id)) r *= f;
  if (s.uterotonicsHarm && !isDone(c, 'inv_reposition') && (drugGiven(c, 'oxytocin') || drugGiven(c, 'miso'))) r *= 1.6;
  if (s.coagulopathy) {
    const t = c.training!;
    const pct = (t.trueLoss / (bloodVolumeMl(c.patient.weightKg, c.patient.bvCoefMlKg) ?? 6000)) * 100;
    if (modelFib(c, s, pct) < 2) r *= 1.3;
  }
  return r;
}

export function modelVitals(c: Case, s: Scenario) {
  const t = c.training!;
  const bv = bloodVolumeMl(c.patient.weightKg, c.patient.bvCoefMlKg) ?? 6000;
  const pct = (t.trueLoss / bv) * 100;
  const shock = s.id === 'inversion' && !isDone(c, 'inv_reposition');
  const infusionBonus = isDone(c, 'inf_crystalloid') ? 6 : 0;
  const hr = shock ? Math.round(s.baseline.hr + pct * 0.4) : Math.min(160, Math.round(s.baseline.hr + Math.max(0, pct - 8) * 2.1 - infusionBonus / 2));
  const sbp = Math.max(55, Math.round(s.baseline.sbp - Math.max(0, pct - 12) * 1.7 + infusionBonus));
  const dbp = Math.round(sbp * 0.6);
  const spo2 = Math.min(100, Math.round(98 - Math.max(0, pct - 30) * 0.3 + (isDone(c, 'first_o2') ? 2 : 0)));
  const warmed = isDone(c, 'inf_warm') || isDone(c, 'first_position');
  const temp = +(36.6 - pct * (warmed ? 0.005 : 0.025)).toFixed(1);
  const diuresis = isDone(c, 'first_bladder') ? Math.max(5, Math.round(60 - pct * 1.4)) : undefined;
  return { hr, sbp, dbp, spo2, temp, diuresis, rr: Math.round(16 + Math.max(0, pct - 15) * 0.3) };
}

export function modelLabs(c: Case, s: Scenario) {
  const t = c.training!;
  const bv = bloodVolumeMl(c.patient.weightKg, c.patient.bvCoefMlKg) ?? 6000;
  const pct = (t.trueLoss / bv) * 100;
  const rbc = drugTotal(c, 'rbc');
  const hb = Math.round(s.baseline.hb - pct * 1.3 + rbc * 8);
  const fib = modelFib(c, s, pct);
  const plt = Math.max(25, Math.round(s.baseline.plt - pct * (s.coagulopathy ? 4 : 2.5) + drugTotal(c, 'platelets') * 20));
  const ptRatio = +(1 + Math.max(0, pct - (s.coagulopathy ? 20 : 35)) * 0.025 - (drugGiven(c, 'ffp') ? 0.3 : 0)).toFixed(2);
  return {
    hb,
    hct: Math.round(hb * 0.3),
    plt,
    fib,
    ptRatio: Math.max(1, ptRatio),
    apttRatio: Math.max(1, +(ptRatio * 0.95).toFixed(2)),
    lactate: +(1 + Math.max(0, pct - 15) * 0.12).toFixed(1),
    caIon: +(1.15 - rbc * 0.04).toFixed(2),
    ph: +(7.4 - Math.max(0, pct - 20) * 0.006).toFixed(2),
  };
}

function labText(l: ReturnType<typeof modelLabs>): string {
  return `Лаборатория: Hb ${l.hb} г/л, Ht ${l.hct}%, тромбоциты ${l.plt}×10⁹/л, фибриноген ${l.fib} г/л, ПТВ ${l.ptRatio}× N, АЧТВ ${l.apttRatio}× N, лактат ${l.lactate}, Ca²⁺ ${l.caIon}, pH ${l.ph}.`;
}

const LAB_TRIGGERS = ['first_labs', 'mas_coag30', 'mas_abg', 'mas_10min', 'after_coag6'];

/**
 * Продвигает модель до момента `simNowIso`: накапливает кровопотерю, выдаёт вводные
 * (кровопотеря, монитор, результаты анализов, находки осмотров).
 */
export function advanceTraining(c: Case, simNowIso: string): Case {
  const t0 = c.training;
  if (!t0 || t0.finishedAt) return c;
  const s = SCENARIO_BY_ID[t0.scenarioId];
  if (!s) return c;
  const dt = minutesBetween(t0.lastTickSim, simNowIso);
  if (dt <= 0) return c;

  const t: TrainingState = { ...t0, messages: [...t0.messages], pending: [...t0.pending], handled: [...t0.handled] };
  const tmp: Case = { ...c, training: t };
  const out = (m: TrainingMessage) => t.messages.push(m);

  // Кровопотеря
  const rate = modelRate(tmp, s);
  const lost = rate * dt;
  t.trueLoss += lost;
  t.carryMl += lost;
  if (rate === 0 && !t.stoppedAt) {
    t.stoppedAt = simNowIso;
    out(msg(simNowIso, 'event', 'Кровотечение остановилось: выделения скудные, гемодинамика стабилизируется. Отметьте остановку.'));
  }
  if (rate > 0 && t.stoppedAt) t.stoppedAt = undefined;

  if (minutesBetween(t.lastReportSim, simNowIso) >= REPORT_EVERY_MIN) {
    const ml = Math.round(t.carryMl / 10) * 10;
    if (ml >= 20) {
      out(msg(simNowIso, 'bloodloss', `Акушерка: по взвешиванию ещё +${ml} мл${rate > 90 ? ' — кровит струёй!' : ''}.`, { bloodLossMl: ml }));
      t.carryMl -= ml;
    }
    t.lastReportSim = simNowIso;
  }

  if (minutesBetween(t.lastVitalsSim, simNowIso) >= VITALS_EVERY_MIN) {
    const v = modelVitals(tmp, s);
    out(
      msg(
        simNowIso,
        'vitals',
        `Монитор: АД ${v.sbp}/${v.dbp}, ЧСС ${v.hr}, ЧД ${v.rr}, SpO₂ ${v.spo2}%, T ${v.temp} °C${v.diuresis !== undefined ? `, диурез ${v.diuresis} мл/ч` : ''}.`,
        { vitals: v },
      ),
    );
    t.lastVitalsSim = simNowIso;
  }

  // Находки осмотров и запросы анализов — по отмеченным пунктам
  for (const [id, text] of Object.entries(s.findings)) {
    if (isDone(c, id) && !t.handled.includes(id)) {
      t.handled.push(id);
      out(msg(simNowIso, 'finding', text));
    }
  }
  for (const id of LAB_TRIGGERS) {
    const st = c.checks[id];
    const key = `${id}@${st?.at}`;
    if (st?.done && !t.handled.includes(key)) {
      t.handled.push(key);
      t.pending.push({ dueAt: addMin(simNowIso, LAB_DELAY_MIN), kind: 'lab', source: id });
      out(msg(simNowIso, 'event', `Кровь отправлена в лабораторию — результат через ~${LAB_DELAY_MIN} мин.`));
    }
  }
  if (isDone(c, 'first_leewhite') && !t.handled.includes('first_leewhite')) {
    t.handled.push('first_leewhite');
    t.pending.push({ dueAt: addMin(simNowIso, LEEWHITE_DELAY_MIN), kind: 'leeWhite', source: 'first_leewhite' });
  }
  if (isDone(c, 'first_visco') && !t.handled.includes('first_visco')) {
    t.handled.push('first_visco');
    t.pending.push({ dueAt: addMin(simNowIso, VISCO_DELAY_MIN), kind: 'visco', source: 'first_visco' });
  }

  const due = t.pending.filter((p) => p.dueAt <= simNowIso);
  t.pending = t.pending.filter((p) => p.dueAt > simNowIso);
  for (const p of due) {
    const l = modelLabs(tmp, s);
    if (p.kind === 'lab') out(msg(simNowIso, 'lab', labText(l), { lab: l }));
    else if (p.kind === 'leeWhite') {
      const coag = l.fib < 2;
      out(msg(simNowIso, 'lab', `Ли-Уайт: ${coag ? '11 мин, сгусток рыхлый' : '6 мин, сгусток плотный'}.`, { lab: { leeWhite: coag ? 11 : 6, leeWhiteLooseClot: coag || undefined } }));
    } else {
      const a5 = Math.max(4, Math.round(l.fib * 5.5));
      out(msg(simNowIso, 'lab', `РОТЭМ: FIBTEM A5 ${a5} мм, EXTEM CT ${Math.round(60 + (l.ptRatio - 1) * 120)} с, EXTEM ML ${s.coagulopathy ? 8 : 3}%. Внесите на вкладке «Анализы».`));
    }
  }

  // Предупреждения модели
  if (s.uterotonicsHarm && !isDone(c, 'inv_reposition') && (drugGiven(c, 'oxytocin') || drugGiven(c, 'miso')) && !t.handled.includes('harm')) {
    t.handled.push('harm');
    out(msg(simNowIso, 'warning', 'Матка сокращается в вывернутом положении — репозиция затруднена, кровотечение усилилось.'));
  }

  t.lastTickSim = simNowIso;
  return { ...c, training: t };
}

/** Отметка «остановлено» при продолжающемся в модели кровотечении — модель возобновляет его. */
export function checkFalseStop(c: Case, simNowIso: string): Case {
  const s = scenarioOf(c);
  if (!s || !c.training || !c.bleedingStop || modelStopped(c, s)) return c;
  const t = c.training;
  return {
    ...c,
    bleedingStop: undefined,
    log: [...c.log, { id: uid(), at: simNowIso, kind: 'event', text: 'Тренировка: кровотечение продолжается — остановка не подтверждена' }],
    training: {
      ...t,
      falseStops: t.falseStops + 1,
      messages: [...t.messages, msg(simNowIso, 'warning', 'Акушерка: «Кровотечение продолжается!» Остановка отмечена преждевременно.')],
    },
  };
}

export function markApplied(c: Case, messageId: string): Case {
  if (!c.training) return c;
  return { ...c, training: { ...c.training, messages: c.training.messages.map((m) => (m.id === messageId ? { ...m, applied: true } : m)) } };
}

export function finishTraining(c: Case, simNowIso: string, real: Date = new Date()): Case {
  if (!c.training) return c;
  const paused = setSpeed(c, 0, real);
  return { ...paused, training: { ...paused.training!, finishedAt: simNowIso } };
}
