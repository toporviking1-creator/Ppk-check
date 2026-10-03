import { describe, expect, it } from 'vitest';
import { newCase, checklistItemForMed, visibleSections } from './case';
import { assessLabs, assessVisco, bloodVolumeMl, cryoUnits, lossPercent, severity, shockIndex } from './calc';
import { computeAlerts, massiveBranch } from './alerts';
import { QUALITY_CRITERIA, qualityScore, qualityValue } from './quality';
import { riskLevel, ALL_ITEMS, CHECKLIST } from './data';
import { DRUG_BY_ID } from './drugs';
import {
  addBloodLoss,
  addLab,
  addMed,
  addVitals,
  setCheck,
  setNa,
  startBleeding,
  stopBleeding,
  toggleCause,
  updatePatient,
} from '../state/actions';
import type { Case } from './types';

const T0 = '2026-09-22T10:00:00.000Z';
const at = (min: number) => new Date(new Date(T0).getTime() + min * 60000).toISOString();

function patient(weight = 70, mode: 'vaginal' | 'cs' = 'vaginal'): Case {
  return updatePatient(newCase(new Date(T0)), { weightKg: weight, deliveryMode: mode, fullName: 'Иванова Мария Петровна', historyNo: '123/26' }, T0);
}

describe('расчёты', () => {
  it('ОЦК и % кровопотери', () => {
    expect(bloodVolumeMl(70, 90)).toBe(6300);
    expect(bloodVolumeMl(undefined)).toBeUndefined();
    const c = addBloodLoss(patient(70), 630, 'gravimetric', T0);
    expect(lossPercent(c)).toBeCloseTo(10, 5);
  });

  it('степень кровопотери по Приложению Б1', () => {
    expect(severity(patient())).toBe('none');
    expect(severity(addBloodLoss(patient(80), 400, 'gravimetric', T0))).toBe('physiological');
    expect(severity(addBloodLoss(patient(80), 500, 'gravimetric', T0))).toBe('pathological');
    // При КС порог 1000 мл
    expect(severity(addBloodLoss(patient(80, 'cs'), 700, 'gravimetric', T0))).toBe('physiological');
    expect(severity(addBloodLoss(patient(80, 'cs'), 1000, 'gravimetric', T0))).toBe('pathological');
    expect(severity(addBloodLoss(patient(80), 1500, 'gravimetric', T0))).toBe('critical');
    // 25% ОЦК у пациентки 50 кг (ОЦК 4500) = 1125 мл
    expect(severity(addBloodLoss(patient(50), 1130, 'gravimetric', T0))).toBe('critical');
  });

  it('шоковый индекс', () => {
    expect(shockIndex(120, 100)).toBeCloseTo(1.2);
    expect(shockIndex(undefined, 100)).toBeUndefined();
  });

  it('формула криопреципитата (КР 3.1)', () => {
    // (2 − 1) × 70 × 70 × (1 − 0,3) / 250 = 13,72 → 14
    expect(cryoUnits(2, 1, 70, 30)).toBe(14);
    expect(cryoUnits(2, 1, 70, 0.3)).toBe(14);
    expect(cryoUnits(2, 3, 70, 30)).toBe(0);
  });

  it('стратификация риска', () => {
    expect(riskLevel([])).toBe('low');
    expect(riskLevel(['multiple'])).toBe('medium');
    expect(riskLevel(['multiple', 'placentaPrevia'])).toBe('high');
  });

  it('дозы по массе тела', () => {
    expect(DRUG_BY_ID.txa.suggest(70).dose).toBe(1050);
    expect(DRUG_BY_ID.txa.suggest(undefined).dose).toBe(1000);
    expect(DRUG_BY_ID.ffp.suggest(70).dose).toBe(1050);
    expect(DRUG_BY_ID.cryo.suggest(72).dose).toBe(15);
    expect(DRUG_BY_ID.eptacog.suggest(70).dose).toBe(6300);
  });
});

describe('интерпретация анализов', () => {
  it('целевые показатели', () => {
    const f = assessLabs({ id: '', at: T0, hb: 65, plt: 70, fib: 1.5, ptRatio: 1.6, caIon: 0.8 }, true);
    const danger = f.filter((x) => x.level === 'danger').map((x) => x.text);
    expect(danger.some((t) => t.startsWith('Hb'))).toBe(true);
    expect(danger.some((t) => t.startsWith('Фибриноген'))).toBe(true);
    expect(danger.some((t) => t.startsWith('ПТВ'))).toBe(true);
    expect(danger.some((t) => t.startsWith('Ca'))).toBe(true);
    // Тромбоциты 70 при кровотечении — предупреждение (< 80)
    expect(f.find((x) => x.text.startsWith('Тромбоциты'))?.level).toBe('warn');
    expect(assessLabs({ id: '', at: T0, plt: 70 }, false).find((x) => x.text.startsWith('Тромбоциты'))?.level).toBe('ok');
  });

  it('РОТЭМ по Приложению А3.3', () => {
    const f = assessVisco({ id: '', at: T0, device: 'rotem', fibtemA5: 8, extemCt: 110, extemMl: 20 }, 70);
    expect(f.some((x) => x.text.includes('FIBTEM') && x.level === 'danger')).toBe(true);
    expect(f.some((x) => x.text.includes('EXTEM CT') && x.action?.includes('20 МЕ/кг'))).toBe(true);
    expect(f.some((x) => x.text.includes('гиперфибринолиз'))).toBe(true);
    const ok = assessVisco({ id: '', at: T0, device: 'rotem', fibtemA5: 14, extemCt: 60 }, 70);
    expect(ok.every((x) => x.level === 'ok')).toBe(true);
  });
});

describe('чек-лист', () => {
  it('идентификаторы уникальны', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('пункты зависят от способа родоразрешения и ситуации', () => {
    const vag = visibleSections(patient()).flatMap((s) => s.items.map((i) => i.id));
    const cs = visibleSections(patient(70, 'cs')).flatMap((s) => s.items.map((i) => i.id));
    expect(vag).toContain('cause_manual');
    expect(cs).not.toContain('cause_manual');
    expect(cs).toContain('prev_cs_oxy');
    expect(vag).not.toContain('inv_stoputer');
    const inv = toggleCause(patient(), 'inversion', T0);
    expect(visibleSections(inv).some((s) => s.id === 'inversion')).toBe(true);
    expect(CHECKLIST.length).toBeGreaterThan(8);
  });

  it('введение препарата отмечает пункт', () => {
    let c = patient();
    expect(checklistItemForMed(c, 'txa')).toBe('prev_txa');
    c = startBleeding(c, T0);
    expect(checklistItemForMed(c, 'txa')).toBe('drug_txa');
    c = addMed(c, { at: at(3), drug: 'oxytocin', name: 'Окситоцин', dose: 20, unit: 'МЕ', route: 'в/в', volumeMl: 500 }, at(3));
    expect(c.checks.drug_oxytocin?.done).toBe(true);
    expect(c.checks.drug_oxytocin?.at).toBe(at(3));
    c = addMed(c, { at: at(4), drug: 'txa', name: 'ТК', dose: 1000, unit: 'мг', route: 'в/в' }, at(4));
    expect(c.checks.drug_txa?.done).toBe(true);
    expect(checklistItemForMed(c, 'txa')).toBe('surg_txa2');
  });
});

describe('подсказки и таймеры', () => {
  it('≥ 1000 мл и продолжается — в операционную; таймеры массивной кровопотери', () => {
    let c = startBleeding(patient(60), T0);
    c = addBloodLoss(c, 1000, 'gravimetric', at(5));
    let alerts = computeAlerts(c, new Date(at(6)));
    expect(alerts.some((a) => a.id === 'or')).toBe(true);
    expect(alerts.some((a) => a.id === 'txa')).toBe(true);
    expect(alerts.some((a) => a.id === 'oxy')).toBe(true);
    expect(massiveBranch(c)).toBe(true);
    // 60 кг → ОЦК 5400, 25% = 1350 — массивная автоматически при +400
    c = addBloodLoss(c, 400, 'gravimetric', at(10));
    expect(c.massiveAt).toBe(at(10));
    alerts = computeAlerts(c, new Date(at(35)));
    const t20 = alerts.find((a) => a.id === 't20');
    expect(t20?.level).toBe('danger');
    expect(t20?.dueInMin).toBeCloseTo(-5);
    const t40 = alerts.find((a) => a.id === 't40');
    expect(t40?.dueInMin).toBeCloseTo(15);
    c = setCheck(c, 'mas_decision20', true, at(36));
    expect(computeAlerts(c, new Date(at(37))).some((a) => a.id === 't20')).toBe(false);
  });

  it('коагулограмма каждые 30 минут', () => {
    let c = startBleeding(patient(), T0);
    c = addBloodLoss(c, 700, 'gravimetric', at(1));
    c = addLab(c, { at: at(2), fib: 2.5 }, at(2));
    expect(computeAlerts(c, new Date(at(20))).find((a) => a.id === 'coag30')?.level).toBe('info');
    expect(computeAlerts(c, new Date(at(40))).find((a) => a.id === 'coag30')?.level).toBe('danger');
  });

  it('шоковый индекс ≥ 1 запускает массивную ветку', () => {
    let c = startBleeding(patient(), T0);
    c = addVitals(c, { at: at(2), hr: 125, sbp: 95, dbp: 55 }, at(2));
    expect(c.massiveAt).toBe(at(2));
    expect(computeAlerts(c, new Date(at(3))).some((a) => a.id === 'si' && a.level === 'danger')).toBe(true);
  });

  it('превышение доз', () => {
    let c = startBleeding(patient(), T0);
    for (let i = 0; i < 4; i++) c = addMed(c, { at: at(i), drug: 'oxytocin', name: 'О', dose: 20, unit: 'МЕ', route: 'в/в' }, at(i));
    for (let i = 0; i < 5; i++) c = addMed(c, { at: at(i), drug: 'txa', name: 'ТК', dose: 1000, unit: 'мг', route: 'в/в' }, at(i));
    const ids = computeAlerts(c, new Date(at(10))).map((a) => a.id);
    expect(ids).toContain('oxymax');
    expect(ids).toContain('txamax');
  });

  it('после СЗП — контроль через 6 ч и НМГ через 12 ч', () => {
    let c = startBleeding(patient(), T0);
    c = addMed(c, { at: at(10), drug: 'ffp', name: 'СЗП', dose: 1000, unit: 'мл', route: 'в/в', volumeMl: 1000 }, at(10));
    c = stopBleeding(c, at(60));
    const alerts = computeAlerts(c, new Date(at(60 + 400)));
    expect(alerts.find((a) => a.id === 'coag6')?.level).toBe('danger');
    expect(alerts.find((a) => a.id === 'vte')?.level).toBe('info');
  });
});

describe('критерии качества', () => {
  it('автоматическая оценка', () => {
    let c = startBleeding(patient(), T0);
    expect(qualityValue(c, QUALITY_CRITERIA[7])).toBe('na'); // q8 без СЗП/ПКК/эптакога
    c = setCheck(c, 'prev_oxy', true, at(0));
    c = setCheck(c, 'first_iv2', true, at(1));
    c = addMed(c, { at: at(2), drug: 'oxytocin', name: 'О', dose: 20, unit: 'МЕ', route: 'в/в', volumeMl: 500 }, at(2));
    c = addMed(c, { at: at(3), drug: 'txa', name: 'ТК', dose: 1000, unit: 'мг', route: 'в/в' }, at(3));
    c = setNa(c, 'drug_miso', true, at(4));
    const v = Object.fromEntries(QUALITY_CRITERIA.map((q) => [q.id, qualityValue(c, q)]));
    expect(v.q1).toBe('yes');
    expect(v.q3).toBe('yes');
    expect(v.q4).toBe('yes');
    expect(v.q5).toBe('na');
    expect(v.q6).toBe('no'); // кристаллоиды не записаны
    expect(v.q9).toBe('yes');
    expect(qualityScore(c).applicable).toBe(7);
  });
});
