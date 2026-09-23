// Формирование КАС (извещения о критическом акушерском состоянии) из разобранного
// эпикриза. Структура строк повторяет бланк КАС; строки без данных остаются
// пустыми и при выгрузке пропускаются.

import { type Epicrisis, type SectionKey, hasSection, joinText, normHeading, reflow, sectionLines } from './parse';
import { summarizeLabs } from './labs';

export interface KasRow {
  id: string;
  label: string;
  /** Текст ячейки; строки, начинающиеся с «# », — подзаголовки (жирным). */
  text: string;
}

export interface KasDoc {
  org: string;
  /** Название состояния в первой строке («Эпикриз | …»). */
  title: string;
  rows: KasRow[];
}

export interface KasOptions {
  org: string;
  /** Инструментальные исследования: только заключения или полностью. */
  instrMode?: 'conclusion' | 'full';
}

export const KAS_ROWS: { id: string; label: string }[] = [
  { id: 'fio', label: 'Ф.И.О.' },
  { id: 'org', label: 'Наименование медицинской организации и отделения' },
  { id: 'historyNo', label: 'Номер истории родов' },
  { id: 'patient', label: 'Сведения о пациенте' },
  { id: 'diagnosis', label: 'Диагноз клинический' },
  { id: 'complaints', label: 'Жалобы на момент передачи информации' },
  { id: 'history', label: 'Анамнез заболевания' },
  { id: 'life', label: 'Анамнез жизни' },
  { id: 'gyn', label: 'Гинекологический анамнез' },
  { id: 'obst', label: 'Акушерский анамнез' },
  { id: 'pregnancy', label: 'Течение настоящей беременности' },
  { id: 'labs', label: 'Лабораторные исследования' },
  { id: 'instr', label: 'Инструментальные исследования' },
  { id: 'operations', label: 'Протоколы операций' },
  { id: 'treatment', label: 'Проведенное лечение' },
  { id: 'status', label: 'Текущее состояние' },
  { id: 'conclusion', label: 'Заключение (план дальнейшего лечения, рекомендации)' },
];

const H = (s: string) => `# ${s}`;

/** Вставляет перенос строки перед каждым из ключей «Ключ:». */
function splitBeforeKeys(text: string, keys: string[]): string[] {
  let t = text;
  for (const k of keys) t = t.replace(new RegExp(`\\s+(?=${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g'), '\n');
  return t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function tidy(s: string): string {
  return s
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\.\s*\.+/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Диагноз ──────────────────────────────────────────────────────────────

export interface Diagnosis {
  kind: 'main' | 'complication' | 'concomitant' | 'other';
  items: { code?: string; text: string }[];
}

const DX_LABELS: { re: RegExp; kind: Diagnosis['kind'] }[] = [
  { re: /^(?:Клинический\s+)?Основной(?:\s+диагноз|\s+клинический)?\s*:?\s*/i, kind: 'main' },
  { re: /^(?:Клинический\s+)?Осложнени[ея](?:\s+основного(?:\s+заболевания|\s+диагноза)?)?(?:\s*:\s*|\s*$)/i, kind: 'complication' },
  { re: /^(?:Клинический\s+)?Сопутствующ(?:ие|ий)(?:\s+заболевания|\s+диагноз)?(?:\s*:\s*|\s*$)/i, kind: 'concomitant' },
  { re: /^Внешняя причина\s*:\s*/i, kind: 'other' },
];

const ICD = /^([A-ZА-Я]\d{2}(?:\.\d{1,2})?)\s+(.*)$/;
/** Код МКБ в конце: «… сегменте. (O82.1)». */
const ICD_TAIL = /^(.*?)\s*\(([A-ZА-Я]\d{2}(?:\.\d{1,2})?)\)\.?$/;

export function parseDiagnoses(lines: string[]): Diagnosis[] {
  const groups: Diagnosis[] = [];
  let cur: Diagnosis | undefined;
  const add = (text: string) => {
    if (!cur) groups.push((cur = { kind: 'main', items: [] }));
    const m = text.match(ICD);
    const tail = text.match(ICD_TAIL);
    if (m) cur.items.push({ code: m[1].replace(/^О/, 'O'), text: m[2].trim() });
    else if (tail) cur.items.push({ code: tail[2].replace(/^О/, 'O'), text: tail[1].trim() });
    else cur.items.push({ text: text.trim() });
  };
  for (const raw of reflow(lines)) {
    const line = raw.replace(/\s*Дата постановки диагноза:?\s*\d{2}\.\d{2}\.\d{4}\.?/gi, '').trim();
    if (!line) continue;
    const label = DX_LABELS.find((l) => l.re.test(line));
    if (label) {
      cur = groups.find((g) => g.kind === label.kind);
      if (!cur) groups.push((cur = { kind: label.kind, items: [] }));
      const rest = line.replace(label.re, '').trim();
      if (rest) add(rest);
    } else if (ICD.test(line) || !cur || !cur.items.length || ICD_TAIL.test(cur.items.at(-1)!.text)) add(line);
    else cur.items[cur.items.length - 1].text += ` ${line}`;
  }
  return groups.filter((g) => g.items.length);
}

const DX_TITLE: Record<Diagnosis['kind'], string> = {
  main: 'Основной',
  complication: 'Осложнение основного',
  concomitant: 'Сопутствующие',
  other: 'Прочее',
};

function fmtDx(d: { code?: string; text: string }): string {
  const t = tidy(d.text);
  return d.code ? `${t} (${d.code})` : t;
}

/** Состояния, относящиеся к критическим акушерским (для названия КАС). */
const CRITICAL =
  /отслойк|кровотечен|кровопотер|преэклампс|эклампс|HELLP|сепси|септическ|шок|эмболи|тромбоэмбол|разрыв\s+матки|выворот|врастан|приращен|accreta|increta|percreta|ДВС|коагулопат|гистерэктом|экстирпац|перитонит|острая\s+(почечная|печеночная|печёночная|дыхательная|сердечная)|отек\s+легких|отёк\s+лёгких|кардиомиопат|инсульт|кома|анафилак|жировой\s+гепатоз|разрыв\s+(шейки|промежности)\s*(III|IV|3|4)|гематом|массивн/i;

export function suggestTitle(dx: Diagnosis[]): string {
  const order: Diagnosis['kind'][] = ['complication', 'main', 'concomitant', 'other'];
  for (const kind of order) {
    for (const g of dx.filter((x) => x.kind === kind)) {
      for (const it of g.items) {
        if (!CRITICAL.test(it.text)) continue;
        // Из составного диагноза берём фразу с критическим состоянием.
        const phrase = it.text
          .split(/\.\s+/)
          .find((s) => CRITICAL.test(s));
        return tidy(phrase ?? it.text).replace(/\.$/, '');
      }
    }
  }
  return '';
}

// ─── Инструментальные исследования ─────────────────────────────────────────

const STUDY_HEAD = /^(.+?)\.?\s+(\d{2}\.\d{2}\.\d{4})(?:\s*г?\.?\s+(\d{1,2}:\d{2}))?\s*$/;
const DISCLAIMER = /Данное заключение не является диагнозом.*$/i;

interface Study {
  title: string;
  date: string;
  body: string[];
}

export function parseStudies(lines: string[]): Study[] {
  const out: Study[] = [];
  for (const line of lines) {
    const m = line.match(STUDY_HEAD);
    if (m && m[1].length < 120 && !/:/.test(m[1]) && /^[А-ЯЁA-Z]/.test(m[1])) {
      out.push({ title: m[1].replace(/\.$/, ''), date: m[3] ? `${m[2]} ${m[3]}` : m[2], body: [] });
    } else if (out.length) out.at(-1)!.body.push(line);
  }
  return out;
}

function studyBody(body: string[]): string[] {
  const out: string[] = [];
  for (const l of body) {
    if (/^Рекомендац/i.test(l)) break; // рекомендации УЗ-врача в КАС не нужны
    out.push(l);
  }
  return reflow(out)
    .map((l) => l.replace(DISCLAIMER, '').replace(/^:\s*/, '').trim())
    .filter((l) => l && !/^(Описание|Протокол описания|Заключение|\.+)$/i.test(l) && !/^врачом\.*\s*\.?$/i.test(l));
}

function studyConclusion(body: string[]): string | undefined {
  const text = joinText(body.filter((l) => !/^Рекомендац/i.test(l)));
  const cut = text.split(/Рекомендации\b|Рекомендация консультации/i)[0].replace(DISCLAIMER, '');
  const idx = cut.lastIndexOf('Заключение:');
  if (idx >= 0) return tidy(cut.slice(idx + 'Заключение:'.length)).replace(/^[.\s]+/, '') || undefined;
  const at = body.findIndex((l) => /^Заключение\.?$/i.test(l));
  if (at >= 0) return tidy(joinText(body.slice(at + 1)).replace(DISCLAIMER, '')) || undefined;
  return undefined;
}

export function formatStudies(lines: string[], mode: 'conclusion' | 'full'): string {
  const studies = parseStudies(lines);
  if (!studies.length) return formatBody(lines);
  const out: string[] = [];
  for (const s of studies) {
    const concl = studyConclusion(s.body);
    const body = studyBody(s.body);
    if (mode === 'full' && body.length) out.push(H(`${s.title} ${s.date}`), ...body.map(tidy));
    else if (concl) out.push(H(`${s.title} ${s.date}`), `Заключение: ${concl}`);
    else if (body.length) out.push(H(`${s.title} ${s.date}`), ...body.map(tidy));
  }
  return out.join('\n');
}

// ─── Лечение ─────────────────────────────────────────────────────────────

export function formatMeds(lines: string[]): string[] {
  const text = joinText(lines);
  if (!text) return [];
  const entries = text
    .split(/(?<=Дата начала:\s*\d{2}\.\d{2}\.\d{4}\s*(?:\(\d+\s*[а-я]+\))?\s*;|Дата окончания:\s*\d{2}\.\d{2}\.\d{4}\s*;?)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return entries.map((e) => {
    const start = e.match(/Дата начала:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1];
    const end = e.match(/Дата окончания:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1];
    const ind = e.match(/Показания к применению:\s*(.+?)(?=,?\s*(?:Дата начала|Примечание):|;?$)/)?.[1];
    const note = e.match(/Примечание:\s*(.+?)(?=,?\s*(?:Дата начала|Показания к применению):|;?$)/)?.[1];
    const drug = e
      .split(/\s*(?:Примечание:|Показания к применению:|,?\s*Дата начала:)/)[0]
      .replace(/[,;.\s]+$/, '')
      .trim();
    const when = start ? `${start}${end && end !== start ? `–${end}` : ''}: ` : '';
    const extra = [note && `(${note.replace(/[,;.\s]+$/, '')})`, ind && `— ${ind.replace(/[,;.\s]+$/, '').replace(/^./, (c) => c.toLowerCase())}`]
      .filter(Boolean)
      .join(' ');
    return tidy(`${when}${drug}${extra ? ` ${extra}` : ''}`);
  });
}

// ─── Текущее состояние и прочие разделы с подзаголовками ───────────────────

const SUBHEADINGS = new Set(
  [
    'Общие сведения',
    'Данные о родах',
    'Состояние кожных покровов, видимых слизистых, лимфатических узлов',
    'Молочные железы',
    'Состояние органов дыхания',
    'Состояние сердечно-сосудистой системы',
    'Состояние органов желудочно-кишечного тракта',
    'Состояние мочеполовой системы',
    'Состояние органов зрения',
    'Неврологический статус',
    'Наружное акушерское исследование',
    'Влагалищное исследование',
    'Матка',
    'Описание плода',
    'Околоплодные воды',
    'НПО и швы',
    'Выделения',
    'Послеоперационная рана',
    'Лохии',
    'Дополнительные сведения',
  ].map(normHeading),
);

function isSubheading(line: string): boolean {
  if (SUBHEADINGS.has(normHeading(line))) return true;
  return (
    /^[А-ЯЁA-Z]/.test(line) &&
    !line.includes(':') &&
    !/[.;,]$/.test(line) &&
    line.length <= 80 &&
    !/\d{2}\.\d{2}\.\d{4}/.test(line) &&
    line.split(' ').length <= 10
  );
}

const SKIP_STATUS = /^(Объективный статус.*|Тип пациентки:.*|Тип пациента:.*)$/i;
const ANAMNESIS_IN_STATUS = /^(Гинекологический|Акушерский) анамнез/i;

/** Текст с подзаголовками: подзаголовки помечаются «# », повторы убираются. */
export function formatBody(lines: string[], opts: { status?: boolean } = {}): string {
  const out: string[] = [];
  let skipping = false;
  for (const l of reflow(lines)) {
    if (opts.status && SKIP_STATUS.test(l)) continue;
    if (opts.status && ANAMNESIS_IN_STATUS.test(l)) {
      skipping = true; // в «Текущем состоянии» МИС дублирует анамнез — пропускаем
      continue;
    }
    if (isSubheading(l)) {
      skipping = false;
      const h = H(l.replace(/[.:]$/, ''));
      if (out.at(-1) !== h) out.push(h);
      continue;
    }
    if (skipping) continue;
    out.push(tidy(l));
  }
  // Подзаголовки без содержимого не нужны.
  return out.filter((l, i) => !(l.startsWith('# ') && (i === out.length - 1 || out[i + 1].startsWith('# ')))).join('\n');
}

// ─── Анамнез ──────────────────────────────────────────────────────────────

function lifeAnamnesis(epi: Epicrisis): string {
  const out: string[] = [];
  const diseases = joinText(sectionLines(epi, 'diseases'));
  if (diseases) {
    out.push(H('Общие заболевания'));
    out.push(
      ...splitBeforeKeys(diseases, [
        'Перенесенные общие заболевания',
        'Хронические заболевания',
        'Детские инфекции',
        'Перенесенные операции',
        'Травмы',
        'Переливания крови',
        'Аллергологический анамнез',
      ]).map(tidy),
    );
  }
  const lifeText = joinText(sectionLines(epi, 'life', 'lifePregnant', 'general', 'risks', 'heredity', 'epid'));
  const allergy = joinText(sectionLines(epi, 'allergy'));
  const allergyInline = [lifeText, diseases].join(' ').match(/Аллерг[^.]*(?:\.|$)/i)?.[0];
  const reaction = lifeText.match(/Реакция на:\s*([^.]+)\./)?.[1];
  if (/аллерг/i.test(diseases)) {
    /* уже в перечне общих заболеваний */
  } else if (allergy) out.push(`Аллергологический анамнез: ${tidy(allergy)}`);
  else if (allergyInline) out.push(tidy(allergyInline));
  else if (reaction) out.push(`Аллергологический анамнез: реакция на — ${reaction.trim()}.`);

  const habits = sectionLines(epi, 'habits');
  if (habits.length) {
    // Берём сведения о матери (первая строка с перечнем привычек).
    const mother = reflow(habits).find((l) => /Курение|Алкоголь|Наркотич/i.test(l));
    if (mother) {
      const values = [...mother.matchAll(/:\s*([^.;]+)/g)].map((m) => m[1].trim().toLowerCase());
      out.push(values.every((v) => v === 'нет' || v === 'отрицает') ? 'Вредные привычки: нет.' : `Вредные привычки: ${tidy(mother)}`);
    }
  }
  const general = joinText(sectionLines(epi, 'general'));
  if (general) out.push(tidy(general));
  const heredity = sectionLines(epi, 'heredity');
  const hered = reflow(heredity).find((l) => /заболевания:\s*(?!нет)/i.test(l));
  if (hered) out.push(`Наследственный анамнез: ${tidy(hered)}`);
  return out.join('\n');
}

// ─── Сборка ───────────────────────────────────────────────────────────────

function pick(epi: Epicrisis, ...keys: SectionKey[]): string[] {
  for (const k of keys) if (hasSection(epi, k)) return sectionLines(epi, k);
  return [];
}

export function buildKas(epi: Epicrisis, opts: KasOptions): KasDoc {
  const dx = parseDiagnoses(pick(epi, 'diagnosisDischarge', 'diagnosis', 'diagnosisAdmission'));
  const text: Record<string, string> = {};

  text.fio = epi.fio ?? '';
  text.org = [opts.org.trim(), epi.department].filter(Boolean).join(', ');
  text.historyNo = epi.historyNo ?? '';
  text.patient = [
    epi.birthDate && `Дата рождения: ${epi.birthDate}${epi.age ? ` (${epi.age})` : ''}`,
    epi.admission && `Дата поступления в стационар: ${epi.admission}`,
  ]
    .filter(Boolean)
    .join('\n');
  text.diagnosis = dx.flatMap((g) => [H(DX_TITLE[g.kind]), ...g.items.map(fmtDx)]).join('\n');
  text.complaints = tidy(joinText(sectionLines(epi, 'complaints')));
  text.history = reflow(sectionLines(epi, 'history')).map(tidy).join('\n');
  text.life = lifeAnamnesis(epi);

  const gyn = joinText(sectionLines(epi, 'gyn'));
  text.gyn = splitBeforeKeys(gyn, ['Дата последней менструации', 'Начало половой жизни', 'Гинекологические заболевания']).map(tidy).join('\n');
  const obst = joinText(sectionLines(epi, 'obst'));
  text.obst = splitBeforeKeys(obst, ['Беременности: \\d', '№ беременности']).map(tidy).join('\n');
  text.pregnancy = formatBody(sectionLines(epi, 'pregnancy'));

  text.labs = summarizeLabs(sectionLines(epi, 'labs')).join('\n');
  text.instr = formatStudies(sectionLines(epi, 'instr'), opts.instrMode ?? 'conclusion');
  text.operations = formatBody(sectionLines(epi, 'operations'));

  const meds = formatMeds(sectionLines(epi, 'meds'));
  const transf = reflow(sectionLines(epi, 'transfusions')).map(tidy);
  text.treatment = [...(meds.length && transf.length ? [H('Медикаментозное лечение')] : []), ...meds, ...(transf.length ? [H('Трансфузии'), ...transf] : [])].join('\n');

  text.status = formatBody(pick(epi, 'status', 'admissionState'), { status: true });

  const concl = reflow(sectionLines(epi, 'conclusion'))
    .filter((l) => !/^\(?план дальнейшего лечения/i.test(l))
    .map(tidy);
  const recs = reflow(sectionLines(epi, 'recommendations'))
    .map((l) => l.replace(/\s*Данные о трудоспособности.*$/i, ''))
    .map(tidy)
    .filter(Boolean);
  text.conclusion = [...concl, ...(recs.length ? [H('Рекомендации'), ...recs] : [])].join('\n');

  return {
    org: opts.org.trim(),
    title: suggestTitle(dx),
    rows: KAS_ROWS.map((r) => ({ ...r, text: (text[r.id] ?? '').trim() })),
  };
}

/** Строки с данными (пустые строки бланка пропускаются). */
export function filledRows(doc: KasDoc): KasRow[] {
  return doc.rows.filter((r) => r.text.replace(/^#\s.*$/gm, '').trim());
}

export function kasToPlainText(doc: KasDoc): string {
  const parts = [doc.org, 'Извещение о критическом акушерском состоянии (КАС)', '', `Эпикриз: ${doc.title}`.trim()];
  for (const r of filledRows(doc)) {
    parts.push('', r.label.toUpperCase(), ...r.text.split('\n').map((l) => l.replace(/^#\s+/, '')));
  }
  return parts.filter((p, i) => i > 0 || p).join('\n');
}
