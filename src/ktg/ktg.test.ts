import { describe, expect, it } from 'vitest';
import { CASES } from '../training/cases';
import { figoCategory, interpret } from './interpret';
import { estimateBaseline, generateTrace, paramsAt } from './synth';
import { EMPTY_CONTEXT, EMPTY_FEATURES, type CtgFeatures } from './types';

const f = (p: Partial<CtgFeatures>): CtgFeatures => ({ ...EMPTY_FEATURES, ...p, context: { ...EMPTY_CONTEXT, ...p.context } });

describe('интерпретатор согласован с ключами тренажёра', () => {
  for (const c of CASES) {
    it(c.id, () => {
      const r = interpret(c.features);
      expect(r.hypoxia).toBe(c.answer.hypoxia);
      if (c.answer.stage) expect(r.stage).toBe(c.answer.stage);
      expect(r.figo).toBe(c.answer.figo);
      expect(c.answer.strategy).toContain(r.strategy);
    });
  }
});

describe('физиологическая интерпретация', () => {
  it('норма', () => {
    const r = interpret(f({ baseline: 135, cycling: 'present', accelerations: 'present' }));
    expect(r.hypoxia).toBe('none');
    expect(r.physio).toBe('normal');
    expect(r.figo).toBe('normal');
    expect(r.reassessMin).toBe(30);
  });

  it('пролонгированная децелерация ≥ 9 мин — решение о родоразрешении', () => {
    const r = interpret(f({ baseline: 140, prolonged: true, prolongedMin: 10 }));
    expect(r.hypoxia).toBe('acute');
    expect(r.strategy).toBe('deliver');
    expect(r.figo).toBe('pathological');
    expect(r.actions.some((a) => a.id === 'deliver_now')).toBe(true);
  });

  it('выпадение пуповины — немедленное родоразрешение без ожидания', () => {
    const r = interpret(f({ baseline: 140, prolonged: true, prolongedMin: 2, context: { ...EMPTY_CONTEXT, cordProlapse: true } }));
    expect(r.urgency).toBe('emergency');
    expect(r.strategy).toBe('deliver');
    expect(r.actions[0].now).toBe(true);
    expect(r.actions.some((a) => a.id === 'elevate')).toBe(true);
  });

  it('рост базального ритма ≥ 10 % с децелерациями — катехоламиновая стадия', () => {
    const r = interpret(f({ baseline: 152, anchorBaseline: 135, decels: 'repetitive', decelNature: 'rapid' }));
    expect(r.baselineRisePct).toBe(13);
    expect(r.stage).toBe('catecholamine');
  });

  it('рост базального ритма без децелераций — негипоксическая причина', () => {
    const r = interpret(f({ baseline: 150, anchorBaseline: 130 }));
    expect(r.hypoxia).toBe('nonhypoxic');
    expect(r.strategy).toBe('cause');
  });

  it('сниженная вариабельность > 50 мин без децелераций — искать причину', () => {
    const r = interpret(f({ baseline: 135, variability: 'reduced', variabilityMin: 70, cycling: 'absent' }));
    expect(r.hypoxia).toBe('nonhypoxic');
    expect(r.figo).toBe('pathological');
  });

  it('тахисистолия добавляет токолиз и остановку окситоцина', () => {
    const r = interpret(
      f({ baseline: 140, anchorBaseline: 140, decels: 'repetitive', decelNature: 'gradual', contractions: 6, context: { ...EMPTY_CONTEXT, oxytocin: true } }),
    );
    const ids = r.actions.map((a) => a.id);
    expect(ids).toContain('tocolysis');
    expect(ids.some((i) => i === 'reduce_oxy' || i === 'stop_oxy')).toBe(true);
  });

  it('действия «чего не делать» идут в конце списка', () => {
    const r = interpret(f({ baseline: 140, prolonged: true, prolongedMin: 4 }));
    const firstAvoid = r.actions.findIndex((a) => a.avoid);
    expect(firstAvoid).toBeGreaterThan(0);
    expect(r.actions.slice(firstAvoid).every((a) => a.avoid)).toBe(true);
  });
});

describe('FIGO 2015', () => {
  it('базальный ритм < 100 — патологическая', () => {
    expect(figoCategory(f({ baseline: 95 })).category).toBe('pathological');
  });
  it('повторяющиеся поздние > 30 мин — патологическая', () => {
    expect(figoCategory(f({ baseline: 140, decels: 'repetitive', decelNature: 'gradual', decelsMin: 35 })).category).toBe('pathological');
  });
  it('при сниженной вариабельности порог — 20 мин', () => {
    expect(figoCategory(f({ baseline: 140, variability: 'reduced', variabilityMin: 20, decels: 'repetitive', decelNature: 'gradual', decelsMin: 25 })).category).toBe('pathological');
  });
  it('повторяющиеся вариабельные — сомнительная', () => {
    expect(figoCategory(f({ baseline: 140, decels: 'repetitive', decelNature: 'rapid', decelsMin: 60 })).category).toBe('suspicious');
  });
  it('ранние децелерации не меняют категорию', () => {
    expect(figoCategory(f({ baseline: 130, decels: 'repetitive', decelNature: 'early', decelsMin: 60 })).category).toBe('normal');
  });
  it('пролонгированная > 5 мин — патологическая', () => {
    expect(figoCategory(f({ baseline: 140, prolonged: true, prolongedMin: 6 })).category).toBe('pathological');
  });
});

describe('синтезатор', () => {
  it('детерминирован по seed', () => {
    const a = generateTrace([{ at: 0, p: { baseline: 140 } }], 5, 7);
    const b = generateTrace([{ at: 0, p: { baseline: 140 } }], 5, 7);
    expect(Array.from(a.fhr)).toEqual(Array.from(b.fhr));
  });

  it('интерполирует ключевые кадры', () => {
    const p = paramsAt([{ at: 0, p: { baseline: 130 } }, { at: 10, p: { baseline: 150 } }], 5);
    expect(p.baseline).toBeCloseTo(140);
  });

  for (const c of CASES) {
    it(`базальный ритм ленты «${c.id}» соответствует ключу`, () => {
      const t = generateTrace(c.frames, c.minutes, c.seed);
      const [a, b] = c.baselineWindow ?? [Math.max(0, c.minutes - 10), c.minutes];
      const est = estimateBaseline(t.fhr, Math.round(a * 60 * t.hz), Math.round(b * 60 * t.hz));
      const key = c.features.baseline!;
      expect(Math.abs(est - key)).toBeLessThanOrEqual(6);
    });
  }

  it('пролонгированная децелерация опускает ЧСС к цели', () => {
    const t = generateTrace([{ at: 0, p: { baseline: 140, ctxPer10: 0 } }, { at: 2, p: { brady: 80 } }], 6, 3);
    const last = Array.from(t.fhr.slice(-60));
    const mean = last.reduce((s, v) => s + v, 0) / last.length;
    expect(mean).toBeGreaterThan(70);
    expect(mean).toBeLessThan(90);
  });
});
