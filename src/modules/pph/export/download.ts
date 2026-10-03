import { Packer } from 'docx';
import { saveFile } from '../../../core/platform';
import type { Case } from '../protocol/types';
import { buildDocument, exportFileName, type ExportOptions } from './docx';

export { downloadJson } from '../../../core/download';

export async function downloadDocx(c: Case, opts: ExportOptions = {}) {
  const blob = await Packer.toBlob(buildDocument(c, opts));
  await saveFile(blob, exportFileName(c, opts.blank));
}
