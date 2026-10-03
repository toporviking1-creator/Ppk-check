import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import { ACTIONS, type ActionId } from '../ktg/actions';
import { DECEL_FREQ_LABEL, DECEL_NATURE_LABEL, FIGO_LABEL, PHYSIO_LABEL, STAGE_LABEL, VAR_LABEL } from '../ktg/labels';
import { contextList, describeFeatures, fmtDateTime, fmtTime } from '../ktg/record';
import type { Patient } from '../state/types';

const FONT = 'Times New Roman';
const SIZE = 22;
const SMALL = 18;
const ACCENT = '0D6B70';
const GRAY = 'F2F2F2';

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function run(text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
  return new TextRun({ text, font: FONT, size: o.size ?? SIZE, bold: o.bold, color: o.color, italics: o.italics });
}

function p(text: string, o: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; italics?: boolean; after?: number; color?: string } = {}) {
  return new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 60 }, children: [run(text, o)] });
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: ACCENT })],
  });
}

function cell(text: string, o: { bold?: boolean; shade?: string; width?: number } = {}) {
  return new TableCell({
    children: text.split('\n').map((line) => new Paragraph({ children: [run(line, { bold: o.bold, size: SMALL + 2 })] })),
    verticalAlign: VerticalAlign.CENTER,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function table(headers: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bold: true, shade: GRAY, width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, { width: widths?.[i] })) })),
    ],
  });
}

function kv(pairs: [string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: pairs.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, { bold: true, shade: GRAY, width: 32 }), cell(v || '—', { width: 68 })] })),
  });
}

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Латиница в имени файла: некоторые браузеры отбрасывают кириллические имена загрузок. */
export function translit(s: string): string {
  return [...s]
    .map((ch) => {
      const low = ch.toLowerCase();
      const t = TR[low];
      if (t === undefined) return ch;
      return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join('');
}

export function exportFileName(pt: Patient, now = new Date()): string {
  const name = translit(pt.label || 'patient')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const d = now.toISOString().slice(0, 10);
  return `KTG_${name || 'patient'}_${d}.docx`;
}

export function buildDocument(pt: Patient, now = new Date()): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(p('ПРОТОКОЛ НАБЛЮДЕНИЯ ЗА СОСТОЯНИЕМ ПЛОДА (КТГ)', { bold: true, size: 28, align: AlignmentType.CENTER, after: 80 }));
  children.push(p('Физиологическая интерпретация КТГ и классификация FIGO 2015 / КР РФ 2023', { italics: true, align: AlignmentType.CENTER, size: SMALL + 2, after: 200 }));

  children.push(heading('Пациентка'));
  children.push(
    kv([
      ['ФИО / № истории', pt.label],
      ['Срок', pt.gaWeeks ? `${pt.gaWeeks}${pt.gaDays ? `+${pt.gaDays}` : ''} нед` : ''],
      ['Паритет', pt.parity],
      ['Исходный базальный ритм', pt.anchorBaseline ? `${pt.anchorBaseline} уд/мин` : ''],
      ['Анамнез / факторы риска', pt.background],
      ['Врач', pt.doctor],
      ['Документ сформирован', fmtDateTime(now)],
    ]),
  );

  const as = [...pt.assessments].sort((a, b) => a.at.localeCompare(b.at));
  if (as.length) {
    children.push(heading('Сводка оценок'));
    children.push(
      table(
        ['Время', 'Период', 'БЧСС', 'Вариаб.', 'Децелерации', 'Заключение', 'Физиол.', 'FIGO'],
        as.map((a) => [
          fmtTime(a.at),
          STAGE_LABEL[a.features.stage],
          a.features.baseline !== undefined ? String(a.features.baseline) : '—',
          VAR_LABEL[a.features.variability],
          a.features.prolonged
            ? `Пролонгированная${a.features.prolongedMin ? ` ${a.features.prolongedMin} мин` : ''}`
            : a.features.decels === 'none'
              ? 'Нет'
              : `${DECEL_FREQ_LABEL[a.features.decels]}, ${DECEL_NATURE_LABEL[a.features.decelNature].toLowerCase()}`,
          a.result.headline,
          PHYSIO_LABEL[a.result.physio],
          FIGO_LABEL[a.result.figo],
        ]),
        [8, 10, 7, 9, 18, 26, 11, 11],
      ),
    );

    children.push(heading('Оценки подробно'));
    for (const a of as) {
      children.push(p(`${fmtDateTime(a.at)} — ${a.result.headline}`, { bold: true, after: 60 }));
      for (const l of describeFeatures(a.features)) children.push(p(l, { size: SMALL + 2, after: 20 }));
      const ctx = contextList(a.features.context);
      if (ctx.length) children.push(p(`Клинически: ${ctx.join(', ').toLowerCase()}.`, { size: SMALL + 2, after: 20 }));
      children.push(p(`Физиологически: ${PHYSIO_LABEL[a.result.physio].toLowerCase()}. ${a.result.findings.join(' ')}`, { size: SMALL + 2, after: 20 }));
      children.push(p(`FIGO 2015 / КР РФ: ${FIGO_LABEL[a.result.figo].toLowerCase()} (${a.result.figoReasons.join('; ')}).`, { size: SMALL + 2, after: 20 }));
      if (a.result.actions.length) children.push(p(`План: ${a.result.actions.join('; ')}.`, { size: SMALL + 2, after: 20 }));
      if (a.done.length) children.push(p(`Выполнено: ${a.done.map((id) => ACTIONS[id as ActionId] ?? id).join('; ')}.`, { size: SMALL + 2, after: 20 }));
      if (a.note) children.push(p(`Примечание: ${a.note}`, { size: SMALL + 2, italics: true, after: 20 }));
      children.push(p('', { after: 80 }));
    }
  }

  const ev = [...pt.events].sort((a, b) => a.at.localeCompare(b.at));
  if (ev.length) {
    children.push(heading('Хронология событий'));
    children.push(table(['Время', 'Событие'], ev.map((e) => [fmtDateTime(e.at), e.text]), [22, 78]));
  }

  children.push(p('', { after: 300 }));
  children.push(p('Врач ____________________ / ____________________ /', { after: 120 }));
  children.push(p('Дата, время ____________________'));

  return new Document({
    creator: 'КТГ-навигатор',
    title: 'Протокол КТГ',
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 900 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run('КТГ-навигатор · средство поддержки решений, не заменяет клиническое суждение · стр. ', { size: 16, color: '777777' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '777777' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}
