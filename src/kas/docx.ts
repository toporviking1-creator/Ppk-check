// Выгрузка КАС в Word по образцу бланка: шапка организации, заголовок,
// таблица «раздел | содержание» (Times New Roman 12). Пустые строки пропускаются.

import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } from 'docx';
import { type KasDoc, filledRows } from './build';

const FONT = 'Times New Roman';
const SIZE = 24; // 12 pt
const LEFT = 2359;
const RIGHT = 7094;

const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line };

function para(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 0 },
    children: [new TextRun({ text, font: FONT, size: SIZE, bold: opts.bold })],
  });
}

function cell(paragraphs: Paragraph[], width: number) {
  return new TableCell({
    children: paragraphs.length ? paragraphs : [para('')],
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 100, right: 100 },
  });
}

/** Текст ячейки → абзацы; «# …» — жирный подзаголовок. */
function content(text: string): Paragraph[] {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .map((l) => (l.startsWith('# ') ? para(l.slice(2).trim(), { bold: true, align: AlignmentType.JUSTIFIED }) : para(l, { align: AlignmentType.JUSTIFIED })));
}

export function buildKasDocument(doc: KasDoc): Document {
  const rows: TableRow[] = [
    new TableRow({
      children: [
        cell([para('Эпикриз', { bold: true, align: AlignmentType.CENTER })], LEFT),
        cell([para(doc.title, { bold: true, align: AlignmentType.CENTER })], RIGHT),
      ],
    }),
    ...filledRows(doc).map(
      (r) =>
        new TableRow({
          children: [cell([para(r.label, { bold: true })], LEFT), cell(content(r.text), RIGHT)],
        }),
    ),
  ];

  return new Document({
    creator: 'ПК-чек-лист',
    title: 'Извещение о критическом акушерском состоянии (КАС)',
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 850, bottom: 1134, left: 1701 },
          },
        },
        children: [
          ...(doc.org ? [para(doc.org, { bold: true, align: AlignmentType.CENTER })] : []),
          para('Извещение о критическом акушерском состоянии (КАС)', { align: AlignmentType.CENTER, after: 240 }),
          new Table({ width: { size: LEFT + RIGHT, type: WidthType.DXA }, columnWidths: [LEFT, RIGHT], borders, rows }),
        ],
      },
    ],
  });
}

export function kasFileName(doc: KasDoc, date = new Date()): string {
  const fio = doc.rows.find((r) => r.id === 'fio')?.text.trim().split(/\s+/)[0] || 'пациентка';
  const d = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  return `КАС_${fio}_${d}.docx`.replace(/[\\/:*?"<>|]/g, '_');
}

export function kasToBlob(doc: KasDoc): Promise<Blob> {
  return Packer.toBlob(buildKasDocument(doc));
}
