// Разбор текста эпикриза (этапный / выписной / переводной) из МИС в структуру
// разделов. Текст приходит из PDF/DOCX/буфера обмена «как есть»: с переносами
// строк посреди фраз, колонтитулами «Стр. N из M» и таблицами анализов.

export interface Section {
  key: SectionKey;
  title: string;
  lines: string[];
}

export type SectionKey =
  | 'patient'
  | 'diagnosis'
  | 'diagnosisAdmission'
  | 'diagnosisDischarge'
  | 'complaints'
  | 'history'
  | 'life'
  | 'lifePregnant'
  | 'general'
  | 'habits'
  | 'risks'
  | 'heredity'
  | 'diseases'
  | 'allergy'
  | 'epid'
  | 'gyn'
  | 'obst'
  | 'pregnancy'
  | 'admissionState'
  | 'opbFindings'
  | 'instr'
  | 'labs'
  | 'meds'
  | 'transfusions'
  | 'operations'
  | 'consults'
  | 'diet'
  | 'status'
  | 'outcome'
  | 'conclusion'
  | 'recommendations'
  | 'workability'
  | 'doctors';

export interface Epicrisis {
  /** «ЭТАПНЫЙ ЭПИКРИЗ», «ВЫПИСНОЙ (ПЕРЕВОДНОЙ) ЭПИКРИЗ…» */
  docType?: string;
  fio?: string;
  historyNo?: string;
  birthDate?: string;
  age?: string;
  admission?: string;
  department?: string;
  sections: Section[];
}

/** Заголовки разделов верхнего уровня (в нормализованном виде). */
const TOP: Record<string, SectionKey> = {
  'сведения о пациенте': 'patient',
  'сведения о пациентке': 'patient',
  'данные о пациенте': 'patient',
  'данные о пациентке и времени ее пребывания в роддоме': 'patient',
  'данные о пациенте и времени его пребывания в стационаре': 'patient',
  'диагноз': 'diagnosis',
  'диагноз клинический': 'diagnosis',
  'клинический диагноз': 'diagnosis',
  'заключительный диагноз': 'diagnosis',
  'заключительный клинический диагноз': 'diagnosis',
  'диагноз при выписке': 'diagnosisDischarge',
  'диагноз при переводе': 'diagnosisDischarge',
  'диагноз при поступлении': 'diagnosisAdmission',
  'жалобы': 'complaints',
  'жалобы при поступлении': 'complaints',
  'жалобы на момент передачи информации': 'complaints',
  'анамнез заболевания': 'history',
  'анамнез настоящего заболевания': 'history',
  'анамнез болезни': 'history',
  'anamnesis morbi': 'history',
  'анамнез жизни': 'life',
  'анамнез жизни (беременные)': 'lifePregnant',
  'анамнез жизни (родильницы)': 'lifePregnant',
  'общий анамнез': 'general',
  'вредные привычки': 'habits',
  'вредности (факторы риска)': 'risks',
  'наследственный анамнез': 'heredity',
  'общие заболевания': 'diseases',
  'перенесенные заболевания': 'diseases',
  'аллергологический анамнез': 'allergy',
  'эпидемиологический анамнез': 'epid',
  'гинекологический анамнез': 'gyn',
  'гинекологический анамнез (беременные)': 'gyn',
  'гинекологический анамнез (родильницы)': 'gyn',
  'акушерский анамнез': 'obst',
  'акушерский анамнез (беременные)': 'obst',
  'акушерский анамнез (родильницы)': 'obst',
  'течение настоящей беременности': 'pregnancy',
  'течение беременности': 'pregnancy',
  'состояние при поступлении': 'admissionState',
  'в опб выявлены нарушения': 'opbFindings',
  'инструментальные исследования': 'instr',
  'лабораторные исследования': 'labs',
  'медикаментозное лечение': 'meds',
  'проведенное лечение': 'meds',
  'трансфузии': 'transfusions',
  'трансфузионная терапия': 'transfusions',
  'переливание компонентов крови': 'transfusions',
  'протоколы операций': 'operations',
  'протокол операции': 'operations',
  'операции': 'operations',
  'оперативные вмешательства': 'operations',
  'консультации': 'consults',
  'консультации специалистов': 'consults',
  'осмотры специалистов': 'consults',
  'диеты': 'diet',
  'диета': 'diet',
  'текущее состояние': 'status',
  'состояние на момент передачи информации': 'status',
  'состояние при выписке': 'status',
  'состояние при переводе': 'status',
  'исход и результат госпитализации': 'outcome',
  'заключение': 'conclusion',
  'план лечения': 'conclusion',
  'план дальнейшего лечения': 'conclusion',
  'рекомендации': 'recommendations',
  'данные о трудоспособности': 'workability',
  'сведения о лечащем враче и заведующем отделением': 'doctors',
};

/** Заголовки, которые внутри исследований/операций означают подраздел, а не новый раздел. */
const WEAK = new Set<SectionKey>(['conclusion', 'recommendations', 'diagnosis']);
const HOLDS_WEAK = new Set<SectionKey>(['instr', 'labs', 'operations', 'consults', 'meds', 'transfusions']);
/** В «Текущем состоянии» МИС повторяет анамнез — это не новые разделы. */
const ANAMNESIS = new Set<SectionKey>(['gyn', 'obst', 'life', 'lifePregnant', 'general', 'habits', 'risks', 'heredity', 'diseases', 'allergy', 'epid']);
const HOLDS_ANAMNESIS = new Set<SectionKey>(['status', 'admissionState']);

function startsSection(cur: Section | undefined, key: SectionKey | undefined): key is SectionKey {
  if (!key) return false;
  if (!cur || key === cur.key) return true;
  if (HOLDS_WEAK.has(cur.key) && WEAK.has(key)) return false;
  if (HOLDS_ANAMNESIS.has(cur.key) && ANAMNESIS.has(key)) return false;
  return true;
}

export function normHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+new\.?\s*$/, '')
    .replace(/[\s.:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Очистка сырого текста: колонтитулы, пустые строки, мусорные символы. */
export function cleanLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u0B80-\u0BFF\u200b-\u200d\ufeff]/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^Стр\.\s*\d+\s*из\s*\d+$/i.test(l) && !/^Страница\s+\d+(\s+из\s+\d+)?$/i.test(l));
}

function isContinuation(prev: string, next: string): boolean {
  if (/^[a-zа-яё(«"]/.test(next)) return true;
  if (/^[/;,.:%)\]°]/.test(next)) return true; // «88\n/мин;»
  if (/[,\-–(]$/.test(prev)) return true;
  if (/^\d/.test(next) && !/[.;]$/.test(prev) && !/^\d{1,2}:\d{2}$/.test(next)) return true;
  return false;
}

/** Склеивает строки, разорванные переносом при вёрстке PDF. */
export function reflow(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (prev !== undefined && isContinuation(prev, line)) {
      out[out.length - 1] = /[A-Za-zА-Яа-яЁё]-$/.test(prev) && /^[a-zа-яё]/.test(line) ? prev + line : `${prev} ${line}`;
    } else out.push(line);
  }
  return out;
}

/** Одна строка из раздела: склеенный текст с нормализованными пробелами. */
export function joinText(lines: string[]): string {
  return reflow(lines).join(' ').replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (w.trim() && w !== '-' ? w[0].toUpperCase() + w.slice(1) : w))
    .join('');
}

export function parseEpicrisis(raw: string): Epicrisis {
  const lines = cleanLines(raw);
  const epi: Epicrisis = { sections: [] };

  // Шапка: «ФАМИЛИЯ ИМЯ ОТЧЕСТВО № МК 123456-26-С», затем вид документа.
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const m = lines[i].match(/^(.+?)\s+№\s*(?:МК|ИР|И\/Р|ИБ|ИР №)?\s*([0-9A-Za-zА-Яа-я][\w\-/А-Яа-я]*)\s*$/);
    if (m && /^[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z\- ]+$/.test(m[1])) {
      epi.fio = titleCase(m[1]);
      epi.historyNo = m[2];
      start = i + 1;
      break;
    }
  }
  for (let i = start; i < Math.min(lines.length, start + 3); i++) {
    if (/ЭПИКРИЗ|ВЫПИСКА|ИЗВЕЩЕНИЕ/i.test(lines[i]) && !TOP[normHeading(lines[i])]) {
      epi.docType = lines[i].replace(/^\d{2}\.\d{2}\.\d{4}\s+\d{1,2}:\d{2}\s+/, '');
      start = i + 1;
      break;
    }
  }

  let cur: Section | undefined;
  for (const line of lines.slice(start)) {
    const key = TOP[normHeading(line)];
    if (startsSection(cur, key)) {
      if (cur && cur.key === key) continue; // «Медикаментозное лечение» → «Проведенное лечение»
      cur = { key, title: line.replace(/\s+new\.?$/i, '').replace(/[.:]$/, ''), lines: [] };
      epi.sections.push(cur);
      continue;
    }
    if (!cur) {
      cur = { key: 'patient', title: 'Сведения о пациенте', lines: [] };
      epi.sections.push(cur);
    }
    cur.lines.push(line);
  }

  const all = lines.join('\n');
  const birth = all.match(/Дата рождения:?\s*(\d{2}\.\s?\d{2}\.\d{4})\s*г?\.?\s*,?\s*\(?(\d{1,3}\s*(?:года|год|лет))?/i);
  if (birth) {
    epi.birthDate = birth[1].replace(/\s/g, '');
    epi.age = birth[2]?.replace(/\s+/g, ' ');
  }
  const adm = all.match(/Дата (?:и время )?поступления(?: в стационар)?:?\s*(\d{2}\.\d{2}\.\d{4}(?:\s*г?\.?\s+\d{1,2}:\d{2})?)/i);
  if (adm) epi.admission = adm[1].replace(/\s*г\.?\s+/, ' ');
  const stays = [...all.matchAll(/^с \d{2}\.\d{2}\.\d{4}.*?-\s*([^\n]*отделени[^\n]*)$/gim)];
  if (stays.length) epi.department = stays.at(-1)![1].trim();
  else {
    const dep = all.match(/^Отделение:\s*(.+)$/im);
    if (dep) epi.department = dep[1].trim();
  }
  return epi;
}

export function sectionLines(epi: Epicrisis, ...keys: SectionKey[]): string[] {
  return epi.sections.filter((s) => keys.includes(s.key)).flatMap((s) => s.lines);
}

export function hasSection(epi: Epicrisis, key: SectionKey): boolean {
  return epi.sections.some((s) => s.key === key && s.lines.length > 0);
}
