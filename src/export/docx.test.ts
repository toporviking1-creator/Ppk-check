import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { buildDocument, exportFileName } from './docx';
import { newCase } from '../protocol/case';
import { addBloodLoss, addLab, addMed, addVitals, setCheck, startBleeding, stopBleeding, updatePatient } from '../state/actions';

const T0 = '2026-09-22T10:00:00.000Z';
const at = (m: number) => new Date(new Date(T0).getTime() + m * 60000).toISOString();

async function documentXml(doc: ReturnType<typeof buildDocument>): Promise<string> {
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml')!.async('string');
}

describe('выгрузка в Word', () => {
  it('формирует отчёт по случаю', async () => {
    let c = updatePatient(newCase(new Date(T0)), { fullName: 'Петрова Анна', historyNo: '77/26', weightKg: 68, riskFactors: ['pphHistory'] }, T0);
    c = startBleeding(c, T0);
    c = setCheck(c, 'first_iv2', true, at(1));
    c = addBloodLoss(c, 800, 'gravimetric', at(2));
    c = addVitals(c, { at: at(3), hr: 110, sbp: 100, dbp: 60, spo2: 97 }, at(3));
    c = addLab(c, { at: at(4), hb: 88, fib: 1.8, plt: 140 }, at(4));
    c = addMed(c, { at: at(5), drug: 'txa', name: 'Транексамовая кислота', dose: 1000, unit: 'мг', route: 'в/в' }, at(5));
    c = stopBleeding(c, at(40));
    const xml = await documentXml(buildDocument(c, { generatedAt: new Date(at(60)) }));
    expect(xml).toContain('Петрова Анна');
    expect(xml).toContain('ПОСЛЕРОДОВОМ КРОВОТЕЧЕНИИ');
    expect(xml).toContain('Катетеризация 2 периферических вен');
    expect(xml).toContain('Критерии оценки качества');
    expect(xml).toContain('Транексамовая кислота');
    expect(xml).toContain('800');
    expect(xml).toContain('Высокий');
    expect(xml).toContain('Фибриноген 1.8');
    expect(exportFileName(c)).toBe('ПК_Петрова_Анна_2026-09-22.docx');
  });

  it('формирует пустой бланк', async () => {
    const xml = await documentXml(buildDocument(newCase(), { blank: true }));
    expect(xml).toContain('ЧЕК-ЛИСТ');
    expect(xml).toContain('Выворот матки');
    expect(xml).toContain('при КС');
    expect(xml).not.toContain('Хронологический журнал');
  });
});
