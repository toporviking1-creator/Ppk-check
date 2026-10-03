import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { buildLabourDocument } from './docxkit';
import { fromLegacyKtg, fromPphCase, newLabour, type Labour } from './record';
import { combinedTimeline } from './timeline';
import { instructionTurn, labourContext } from './assistant/prompt';
import { MODULES, READY_MODULES } from '../modules/registry';
import { CASES } from '../modules/ktg/training/cases';
import { interpret } from '../modules/ktg/logic/interpret';
import { newCase } from '../modules/pph/protocol/case';
import { addBloodLoss, startBleeding } from '../modules/pph/state/actions';
import type { SavedAssessment } from '../modules/ktg/types-state';

function assessment(id: string, at: string): SavedAssessment {
  const c = CASES.find((x) => x.id === id)!;
  const r = interpret(c.features);
  return { id, at, features: c.features, result: { ...r, actions: r.actions.map((a) => a.text) }, done: [], note: '' };
}

function sample(): Labour {
  const l = newLabour({ label: 'Петрова Анна, ИР № 77', gaWeeks: 40, weightKg: 70, parity: 'Б1', background: 'ГСД' });
  let pph = newCase(new Date('2026-10-03T10:00:00Z'));
  pph.patient.fullName = 'Петрова Анна';
  pph.patient.weightKg = 70;
  pph = startBleeding(pph, '2026-10-03T10:00:00Z');
  pph = addBloodLoss(pph, 800, 'gravimetric', '2026-10-03T10:05:00Z');
  return {
    ...l,
    events: [{ id: 'n1', at: '2026-10-03T08:30:00Z', module: 'core', text: 'ВИ: открытие 6 см' }],
    modules: {
      ktg: { anchorBaseline: 135, assessments: [assessment('compensated', '2026-10-03T08:00:00Z'), assessment('catecholamine', '2026-10-03T09:00:00Z')] },
      pph,
    },
  };
}

describe('ядро', () => {
  it('общая хронология собирает события всех модулей по времени', () => {
    const tl = combinedTimeline(sample(), MODULES);
    const mods = new Set(tl.map((e) => e.module));
    expect(mods.has('ktg') && mods.has('pph') && mods.has('core')).toBe(true);
    const times = tl.map((e) => e.at);
    expect([...times].sort()).toEqual(times);
  });

  it('статусы модулей на главной', () => {
    const l = sample();
    const now = new Date('2026-10-03T10:10:00Z');
    expect(MODULES.find((m) => m.id === 'ktg')!.status(l, now)?.severity).toBe('warn');
    expect(MODULES.find((m) => m.id === 'pph')!.status(l, now)?.text).toMatch(/800 мл/);
  });

  it('единый протокол содержит пациентку, хронологию и разделы КТГ и ПК', async () => {
    const buf = await Packer.toBuffer(buildLabourDocument(sample(), MODULES, new Date('2026-10-03T11:00:00Z')));
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    for (const s of ['ПРОТОКОЛ ВЕДЕНИЯ РОДОВ', 'Петрова Анна', 'Общая хронология', 'КТГ-навигатор', 'Сводка оценок КТГ', 'Послеродовое кровотечение', 'ВИ: открытие 6 см']) {
      expect(xml).toContain(s);
    }
  });

  it('помощник получает данные родов без ФИО и номера истории', () => {
    const l = sample();
    const ctx = labourContext(l, READY_MODULES, new Date('2026-10-03T10:10:00Z'));
    expect(ctx).not.toContain('Петрова');
    expect(ctx).not.toContain('77');
    expect(ctx).toContain('40 нед');
    expect(ctx).toContain('Оценок КТГ: 2');
    expect(ctx).toMatch(/Кровопотеря 800 мл/);
    const full = instructionTurn(l, READY_MODULES, new Date());
    expect(full).toContain('3-6-9-12-15');
    expect(full).toContain('Послеродовое кровотечение');
    expect(full.length).toBeLessThan(200_000);
  });

  it('перенос из КТГ-навигатора и ПК-чек-листа', () => {
    const k = fromLegacyKtg({ id: 'a', createdAt: 'x', updatedAt: 'x', label: 'Иванова', parity: '', background: '', doctor: '', anchorBaseline: 140, assessments: [assessment('normal', '2026-10-03T08:00:00Z')], events: [] });
    expect(k.modules.ktg?.anchorBaseline).toBe(140);
    expect(k.patient.label).toBe('Иванова');
    const c = newCase();
    c.patient.fullName = 'Смирнова';
    c.patient.historyNo = '12';
    const p = fromPphCase(c);
    expect(p.patient.label).toBe('Смирнова, ИР № 12');
    expect(p.modules.pph?.id).toBe(c.id);
  });
});
