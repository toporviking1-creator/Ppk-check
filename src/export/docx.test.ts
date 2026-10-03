import JSZip from 'jszip';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { interpret } from '../ktg/interpret';
import { CASES } from '../training/cases';
import { newPatient } from '../state/store';
import { buildDocument, exportFileName } from './docx';
import type { SavedAssessment } from '../state/types';

function saved(id: string, at: string): SavedAssessment {
  const c = CASES.find((x) => x.id === id)!;
  const r = interpret(c.features);
  return {
    id,
    at,
    features: c.features,
    result: { ...r, actions: r.actions.map((a) => a.text) },
    done: ['stop_oxy'],
    note: 'ВИ: открытие 7 см',
  };
}

describe('выгрузка в Word', () => {
  it('формирует документ с оценками и хронологией', async () => {
    const p = {
      ...newPatient(),
      label: 'Иванова А. А.',
      gaWeeks: 40,
      anchorBaseline: 135,
      assessments: [saved('compensated', '2026-10-03T08:00:00Z'), saved('catecholamine', '2026-10-03T09:00:00Z')],
      events: [{ id: 'e1', at: '2026-10-03T09:05:00Z', kind: 'note' as const, text: 'Окситоцин остановлен' }],
    };
    const buf = await Packer.toBuffer(buildDocument(p));
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Иванова А. А.');
    expect(xml).toContain('Сводка оценок');
    expect(xml).toContain('катехоламины');
    expect(xml).toContain('Окситоцин остановлен');
    expect(exportFileName(p, new Date('2026-10-03T10:00:00Z'))).toBe('KTG_Ivanova_A_A_2026-10-03.docx');
  });

  it('пустая карта тоже выгружается', async () => {
    const buf = await Packer.toBuffer(buildDocument(newPatient()));
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});
