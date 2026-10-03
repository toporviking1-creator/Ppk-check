import { Packer } from 'docx';
import type { Patient } from '../state/types';
import { buildDocument, exportFileName } from './docx';

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

export async function downloadDocx(p: Patient) {
  const blob = await Packer.toBlob(buildDocument(p));
  downloadBlob(blob, exportFileName(p));
}

export function downloadJson(data: unknown, fileName: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
}
