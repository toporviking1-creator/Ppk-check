// Извлечение текста эпикриза из файла: PDF (текстовый, из МИС), DOCX, TXT.
// Всё выполняется в браузере — файл никуда не отправляется.

import JSZip from 'jszip';

export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

/** Собирает строки страницы из текстовых элементов pdf.js. */
export function pdfItemsToText(pages: PdfTextItem[][]): string {
  let out = '';
  for (const items of pages) {
    let lastY: number | undefined;
    for (const it of items) {
      const y = it.transform?.[5];
      // Новый визуальный ряд без явного конца строки (разные колонки таблицы и т.п.).
      if (y !== undefined && lastY !== undefined && Math.abs(y - lastY) > 6 && !out.endsWith('\n')) out += '\n';
      out += it.str;
      if (it.hasEOL) out += '\n';
      if (y !== undefined) lastY = y;
    }
    if (!out.endsWith('\n')) out += '\n';
  }
  return out;
}

export async function pdfToText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Обработчик pdf.js запускается в основном потоке: так работает и сборка «одним файлом», и file://.
  const g = globalThis as { pdfjsWorker?: unknown };
  if (!g.pdfjsWorker) g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const doc = await task.promise;
    const pages: PdfTextItem[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.flatMap((x) => ('str' in x ? [x] : [])));
    }
    return pdfItemsToText(pages);
  } finally {
    await task.destroy();
  }
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

/** Текст документа Word: абзацы (в том числе в таблицах) — отдельными строками. */
export function docxXmlToText(xml: string): string {
  const body = xml.split(/<w:body>/)[1] ?? xml;
  const paras = body.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? [];
  return paras
    .map((p) =>
      decodeXml(
        (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? [])
          .map((t) => (t === '<w:tab/>' ? ' ' : t === '<w:br/>' ? '\n' : t.replace(/<[^>]+>/g, '')))
          .join(''),
      ),
    )
    .join('\n');
}

export async function docxToText(data: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('В файле нет word/document.xml');
  return docxXmlToText(xml);
}

export async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return pdfToText(buf);
  if (name.endsWith('.docx')) return docxToText(buf);
  if (name.endsWith('.doc')) throw new Error('Формат .doc не поддерживается — сохраните файл как .docx или PDF.');
  return new TextDecoder('utf-8').decode(buf);
}
