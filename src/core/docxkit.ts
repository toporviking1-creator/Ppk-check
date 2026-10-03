import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import type { ModuleDef } from './modules';
import { gaText, type Labour } from './record';
import { fmtDateTime } from './time';
import { combinedTimeline, MODULE_SHORT } from './timeline';

export const FONT = 'Times New Roman';
export const SIZE = 22;
export const SMALL = 18;
export const ACCENT = '0D6B70';
export const GRAY = 'F2F2F2';

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

export function run(text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
  return new TextRun({ text, font: FONT, size: o.size ?? SIZE, bold: o.bold, color: o.color, italics: o.italics });
}

export function p(text: string, o: { bold?: boolean; size?: number; align?: Align; italics?: boolean; after?: number; color?: string } = {}) {
  return new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 60 }, children: [run(text, o)] });
}

export function heading(text: string, level: 1 | 2 = 2) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: level === 1 ? 360 : 240, after: 120 },
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: level === 1 ? 28 : 26, bold: true, color: ACCENT })],
  });
}

export function cell(text: string, o: { bold?: boolean; shade?: string; width?: number } = {}) {
  return new TableCell({
    children: text.split('\n').map((line) => new Paragraph({ children: [run(line, { bold: o.bold, size: SMALL + 2 })] })),
    verticalAlign: VerticalAlign.CENTER,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

export function table(headers: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bold: true, shade: GRAY, width: widths?.[i] })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, { width: widths?.[i] })) })),
    ],
  });
}

export function kv(pairs: [string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: pairs.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, { bold: true, shade: GRAY, width: 32 }), cell(v || '—', { width: 68 })] })),
  });
}

export function footer(text: string) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [run(`${text} · стр. `, { size: 16, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '777777' })],
      }),
    ],
  });
}

/** Единый протокол родов: пациентка, общая хронология и разделы всех модулей. */
export function buildLabourDocument(l: Labour, defs: ModuleDef[], now = new Date()): Document {
  const pt = l.patient;
  const children: (Paragraph | Table)[] = [];
  children.push(p('ПРОТОКОЛ ВЕДЕНИЯ РОДОВ', { bold: true, size: 30, align: AlignmentType.CENTER, after: 60 }));
  if (l.training) children.push(p('УЧЕБНЫЙ СЛУЧАЙ — НЕ МЕДИЦИНСКИЙ ДОКУМЕНТ', { bold: true, color: ACCENT, align: AlignmentType.CENTER }));
  const used = defs.filter((d) => d.ready && d.active(l));
  children.push(p(used.map((d) => d.title).join(' · ') || 'Модули не использовались', { italics: true, size: SMALL + 2, align: AlignmentType.CENTER, after: 200 }));

  children.push(heading('Пациентка'));
  children.push(
    kv([
      ['ФИО / № истории', pt.label],
      ['Возраст', pt.age ? `${pt.age} лет` : ''],
      ['Срок', gaText(pt)],
      ['Паритет', pt.parity],
      ['Масса тела', pt.weightKg ? `${pt.weightKg} кг` : ''],
      ['Анамнез / факторы риска', pt.background],
      ['Врач', pt.doctor],
      ['Документ сформирован', fmtDateTime(now)],
    ]),
  );

  const tl = combinedTimeline(l, defs);
  if (tl.length) {
    children.push(heading('Общая хронология'));
    children.push(table(['Время', 'Раздел', 'Событие'], tl.map((e) => [fmtDateTime(e.at), MODULE_SHORT[e.module] ?? '', e.text]), [20, 14, 66]));
  }

  for (const d of used) {
    const sec = d.docx?.(l, now);
    if (!sec?.length) continue;
    children.push(heading(d.title, 1));
    children.push(...sec);
  }

  children.push(p('', { after: 300 }));
  children.push(p('Врач ____________________ / ____________________ /', { after: 120 }));
  children.push(p('Дата, время ____________________'));

  return new Document({
    creator: 'Родзал',
    title: 'Протокол ведения родов',
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 900 } } },
        footers: { default: footer('Родзал · средство поддержки решений, не заменяет клиническое суждение') },
        children,
      },
    ],
  });
}
