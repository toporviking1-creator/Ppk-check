import { describe, expect, it } from 'vitest';
import { advanceTraining, checkFalseStop, createTrainingCase, modelRate, setSpeed, simTime } from './engine';
import { buildDebrief } from './debrief';
import { SCENARIOS, SCENARIO_BY_ID } from './scenarios';
import { nextSteps } from '../protocol/steps';
import { ITEM_BY_ID, CAUSES } from '../protocol/data';
import { addBloodLoss, addMed, setCheck, stopBleeding, toggleCause } from '../state/actions';
import { newCase } from '../protocol/case';
import type { Case } from '../protocol/types';

const T0 = new Date('2026-09-22T10:00:00.000Z');
const at = (min: number) => new Date(T0.getTime() + min * 60000).toISOString();

describe('сценарии', () => {
  it('ссылаются на существующие пункты и причины', () => {
    for (const s of SCENARIOS) {
      expect(CAUSES.some((c) => c.id === s.cause)).toBe(true);
      const ids = [...Object.keys(s.factors), ...s.stopWhen.flat(), ...Object.keys(s.findings)];
      for (const id of ids) expect(ITEM_BY_ID[id], `${s.id}: ${id}`).toBeDefined();
    }
  });
});

describe('модельное время', () => {
  it('ускорение и пауза', () => {
    let c = createTrainingCase('atony', 5, T0);
    expect(simTime(c.training!, new Date(T0.getTime() + 60000)).toISOString()).toBe(at(5));
    c = setSpeed(c, 0, new Date(T0.getTime() + 60000));
    expect(simTime(c.training!, new Date(T0.getTime() + 600000)).toISOString()).toBe(at(5));
  });
});

describe('движок тренировки', () => {
  it('кровотечение нарастает и выдаются вводные', () => {
    let c = createTrainingCase('atony', 1, T0);
    for (let m = 1; m <= 10; m++) c = advanceTraining(c, at(m));
    const t = c.training!;
    expect(t.trueLoss).toBeCloseTo(400 + 60 * 10, 0);
    expect(t.messages.filter((m) => m.kind === 'bloodloss').length).toBeGreaterThanOrEqual(3);
    expect(t.messages.some((m) => m.kind === 'vitals')).toBe(true);
  });

  it('лечение замедляет и останавливает кровотечение', () => {
    let c = createTrainingCase('atony', 1, T0);
    const s = SCENARIO_BY_ID.atony;
    const r0 = modelRate(c, s);
    c = addMed(c, { at: at(1), drug: 'oxytocin', name: 'О', dose: 20, unit: 'МЕ', route: 'в/в', volumeMl: 500 }, at(1));
    expect(modelRate(c, s)).toBeLessThan(r0);
    c = setCheck(c, 'drug_balloon', true, at(2));
    expect(modelRate(c, s)).toBe(0);
    c = advanceTraining(c, at(3));
    expect(c.training!.stoppedAt).toBe(at(3));
    expect(c.training!.messages.some((m) => m.text.includes('Баллон установлен'))).toBe(true);
  });

  it('анализы приходят через 10 минут после взятия', () => {
    let c = createTrainingCase('accreta', 1, T0);
    c = setCheck(c, 'first_labs', true, at(1));
    c = advanceTraining(c, at(1));
    expect(c.training!.messages.some((m) => m.kind === 'lab')).toBe(false);
    for (let m = 2; m <= 12; m++) c = advanceTraining(c, at(m));
    const lab = c.training!.messages.find((m) => m.kind === 'lab');
    expect(lab?.lab?.fib).toBeLessThan(3.6);
  });

  it('преждевременная отметка остановки отменяется', () => {
    let c = createTrainingCase('trauma', 1, T0);
    c = stopBleeding(c, at(2));
    c = checkFalseStop(c, at(2));
    expect(c.bleedingStop).toBeUndefined();
    expect(c.training!.falseStops).toBe(1);
  });

  it('разбор тренировки', () => {
    let c = createTrainingCase('inversion', 1, T0);
    c = addMed(c, { at: at(1), drug: 'oxytocin', name: 'О', dose: 20, unit: 'МЕ', route: 'в/в' }, at(1));
    c = setCheck(c, 'alert_call', true, at(1));
    c = advanceTraining(c, at(4));
    const d = buildDebrief(c)!;
    expect(d.causeCorrect).toBe(false);
    expect(d.errors.some((e) => e.includes('до репозиции'))).toBe(true);
    expect(d.keyActions.find((k) => k.label.startsWith('Вызов помощи'))?.minutes).toBe(1);
    c = toggleCause(c, 'inversion', at(5));
    expect(buildDebrief(c)!.causeCorrect).toBe(true);
  });
});

describe('следующие шаги', () => {
  function bleeding(): Case {
    let c = newCase(T0);
    c = { ...c, patient: { ...c.patient, weightKg: 70 } };
    return addBloodLoss(c, 600, 'gravimetric', at(0));
  }

  it('начинаются с вызова помощи и доступа', () => {
    const ids = nextSteps(bleeding()).map((i) => i.id);
    expect(ids.slice(0, 3)).toEqual(['alert_call', 'alert_anesth', 'first_iv2']);
    expect(ids).not.toContain('mas_or');
  });

  it('выполненные пункты исчезают, при массивной — ветка Б5', () => {
    let c = bleeding();
    c = setCheck(c, 'alert_call', true, at(1));
    expect(nextSteps(c)[0].id).toBe('alert_anesth');
    c = addBloodLoss(c, 1200, 'gravimetric', at(2));
    expect(nextSteps(c).map((i) => i.id)).toContain('mas_decision20');
  });

  it('при вывороте матки — сначала прекратить утеротоники, без окситоцина', () => {
    const c = toggleCause(bleeding(), 'inversion', at(1));
    const ids = nextSteps(c).map((i) => i.id);
    expect(ids[0]).toBe('inv_stoputer');
    expect(ids).not.toContain('drug_oxytocin');
  });
});
