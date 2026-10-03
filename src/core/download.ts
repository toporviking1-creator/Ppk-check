import { saveFile } from './platform';

/** Латиница в имени файла: некоторые браузеры отбрасывают кириллические имена загрузок. */
const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

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

/** Безопасное имя файла: `prefix_Imya_2026-10-03.ext` латиницей. */
export function safeFileName(prefix: string, label: string, date: Date, ext: string): string {
  const name = translit(label || 'patient')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `${prefix}_${name || 'patient'}_${date.toISOString().slice(0, 10)}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  return saveFile(blob, fileName);
}

export function downloadJson(data: unknown, fileName: string) {
  return saveFile(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
}
