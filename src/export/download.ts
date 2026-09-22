import { Packer } from 'docx';
import type { Case } from '../protocol/types';
import { buildDocument, exportFileName, type ExportOptions } from './docx';

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadDocx(c: Case, opts: ExportOptions = {}) {
  const blob = await Packer.toBlob(buildDocument(c, opts));
  downloadBlob(blob, exportFileName(c, opts.blank));
}

export function downloadJson(data: unknown, fileName: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
}
