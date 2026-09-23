// Краткая сводка лабораторных исследований для КАС: ключевые показатели по датам
// с отметкой отклонений от референса, группа крови/резус, антитела, инфекции.

interface LabGroup {
  title: string;
  date: string;
  time?: string;
  body: string;
}

const HEAD = /^(.+?)\.\s+(\d{2}\.\d{2}\.\d{4})(?:\s+(\d{1,2}:\d{2}))?\s*$/;

export function parseLabGroups(lines: string[]): LabGroup[] {
  const groups: LabGroup[] = [];
  let body: string[] = [];
  const flush = () => {
    if (groups.length) groups.at(-1)!.body = body.join(' ').replace(/\s+/g, ' ').trim();
    body = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEAD);
    if (m && !m[1].includes(':')) {
      flush();
      let time = m[3];
      if (!time && /^\d{1,2}:\d{2}$/.test(lines[i + 1] ?? '')) time = lines[++i];
      groups.push({ title: m[1].trim(), date: m[2], time, body: '' });
    } else body.push(lines[i]);
  }
  flush();
  return groups;
}

type Scope = 'blood' | 'urine' | 'any';

interface NumTest {
  label: string;
  name: string;
  scope: Scope;
}

const NUM_TESTS: NumTest[] = [
  { label: 'Гемоглобин', name: 'Гемоглобин(?: общий)?|HGB|Hb', scope: 'blood' },
  { label: 'Эритроциты', name: 'Количество эритроцитов|Эритроциты|RBC', scope: 'blood' },
  { label: 'Гематокрит', name: 'Гематокрит|HCT|Ht', scope: 'blood' },
  { label: 'Тромбоциты', name: 'Количество тромбоцитов|Тромбоциты|PLT', scope: 'blood' },
  { label: 'Лейкоциты', name: 'Количество лейкоцитов|Лейкоциты|WBC', scope: 'blood' },
  { label: 'Общий белок', name: 'Общий белок|Белок общий', scope: 'blood' },
  { label: 'Альбумин', name: 'Альбумин', scope: 'blood' },
  { label: 'АЛТ', name: 'АЛТ|Аланинаминотрансфераза', scope: 'blood' },
  { label: 'АСТ', name: 'АСТ|Аспартатаминотрансфераза', scope: 'blood' },
  { label: 'ЛДГ', name: 'ЛДГ|Лактатдегидрогеназа', scope: 'blood' },
  { label: 'Билирубин общий', name: 'Билирубин общий', scope: 'blood' },
  { label: 'Мочевина', name: 'Мочевина', scope: 'blood' },
  { label: 'Креатинин', name: 'Креатинин', scope: 'blood' },
  { label: 'Глюкоза', name: 'Глюкоза', scope: 'blood' },
  { label: 'Калий', name: 'Калий', scope: 'blood' },
  { label: 'Натрий', name: 'Натрий', scope: 'blood' },
  { label: 'СРБ', name: 'С-реактивный белок|СРБ', scope: 'blood' },
  { label: 'Прокальцитонин', name: 'Прокальцитонин', scope: 'blood' },
  { label: 'Лактат', name: 'Лактат', scope: 'blood' },
  { label: 'Ферритин', name: 'Ферритин', scope: 'blood' },
  { label: 'АЧТВ', name: '\\(АЧТВ\\)|АЧТВ', scope: 'blood' },
  { label: 'МНО', name: 'МНО', scope: 'blood' },
  { label: 'Протромбин по Квику', name: 'Концентрация протромбина|Протромбин по Квику|ПТИ', scope: 'blood' },
  { label: 'Фибриноген', name: 'Концентрация фибриногена|Фибриноген', scope: 'blood' },
  { label: 'D-димер', name: 'D-димер|Д-димер', scope: 'blood' },
  { label: 'Антитромбин III', name: 'Антитромбин III', scope: 'blood' },
  { label: 'Белок в моче', name: 'Белок количественно|Белок', scope: 'urine' },
];

const NUM = '([<>≤≥]?\\d+(?:[.,]\\d+)?)';
const UNIT = '(10\\^\\d+\\/л|[^\\s\\d-][^\\s]*)?';
const REF = '(?:\\s+(\\d+(?:[.,]\\d+)?)\\s*-\\s*(\\d+(?:[.,]\\d+)?))?';

const num = (s: string) => Number(s.replace(',', '.').replace(/[<>≤≥]/, ''));

function scopeOf(title: string): Scope {
  if (/мочи|моча/i.test(title)) return 'urine';
  if (/отделяем|мазок|посев|микроскоп.*влагал/i.test(title)) return 'any';
  return 'blood';
}

interface Found {
  label: string;
  value: string;
  unit: string;
  flag: '' | '↑' | '↓';
}

function findNumeric(g: LabGroup): Found[] {
  const scope = scopeOf(g.title);
  if (scope === 'any') return [];
  const out: Found[] = [];
  for (const t of NUM_TESTS) {
    if (t.scope !== scope) continue;
    const re = new RegExp(`(?:^|[\\s)])(?:${t.name})\\s+${NUM}(?:\\s+${UNIT})?${REF}(?=\\s|$)`);
    const m = g.body.match(re);
    if (!m) continue;
    const [, value, unit = '', lo, hi] = m;
    let flag: Found['flag'] = '';
    if (lo !== undefined && hi !== undefined && Number.isFinite(num(value))) {
      if (num(value) < num(lo)) flag = '↓';
      else if (num(value) > num(hi)) flag = '↑';
    }
    // «0,74 1» — безразмерные величины: единица «1» не нужна.
    out.push({ label: t.label, value, unit: unit === '1' ? '' : unit, flag });
  }
  return out;
}

function fmtUnit(u: string): string {
  if (!u) return '';
  const pretty = u.replace(/^10\^(\d+)\//, (_, p) => `×10^${p}/`);
  return pretty === '%' ? '%' : ` ${pretty}`;
}

function firstResult(body: string): string | undefined {
  const m = body.match(/(ПОЛОЖИТЕЛЬН\s*АЯ|ОТРИЦАТЕЛЬН\s*АЯ|положительн[а-я]*|отрицательн[а-я]*|не обнаружен[а-я]*|обнаружен[а-я]*)/i);
  return m?.[1].replace(/\s+/g, '').toLowerCase();
}

export function summarizeLabs(lines: string[]): string[] {
  const groups = parseLabGroups(lines);
  if (!groups.length) return lines.length ? [lines.join(' ')] : [];

  // Числовые показатели по дням.
  const byDay = new Map<string, Map<string, Found[]>>();
  for (const g of groups) {
    const found = findNumeric(g);
    if (!found.length) continue;
    const day = byDay.get(g.date) ?? new Map<string, Found[]>();
    byDay.set(g.date, day);
    for (const f of found) day.set(f.label, [...(day.get(f.label) ?? []), f]);
  }
  const out: string[] = [];
  for (const [date, tests] of byDay) {
    const order = NUM_TESTS.map((t) => t.label).filter((l) => tests.has(l));
    const parts = order.map((label) => {
      const vals = tests.get(label)!;
      const unit = fmtUnit(vals.at(-1)!.unit);
      const flags = vals.length === 1 ? (vals[0].flag ? ` ${vals[0].flag}` : '') : '';
      const values = vals.map((v) => (vals.length > 1 && v.flag ? `${v.value} ${v.flag}` : v.value)).join(' → ');
      return `${label} – ${values}${unit}${flags}`;
    });
    out.push(`${date}: ${parts.join('; ')}.`);
  }

  // Иммуногематология.
  const blood: string[] = [];
  let abo: string | undefined;
  let rh: string | undefined;
  let kell: string | undefined;
  for (const g of groups) {
    const all = `${g.title} ${g.body}`;
    if (/групп\S* крови|AB0|АВ0/i.test(g.title)) {
      const m = g.body.match(/(?:^|\s)(AB|АВ|A|А|B|В|0|O|О)\s*\((IV|III|II|I)\)(?:\s+(первая|вторая|третья|четвертая|четвёртая))?/);
      if (m) abo = `${m[1]}(${m[2]})${m[3] ? ` ${m[3]}` : ''}`;
    } else if (/резус/i.test(g.title) || /^Rh\b/.test(g.title)) {
      const m = all.match(/Rh\s*([+\-−])|(положительн|отрицательн)/i);
      if (m) rh = m[1] ? (m[1] === '+' ? 'Rh+ (положительный)' : 'Rh− (отрицательный)') : /полож/i.test(m[2]) ? 'Rh+ (положительный)' : 'Rh− (отрицательный)';
    } else if (/Kell/i.test(g.title)) {
      const m = g.body.match(/(K\+|K-|K−|отрицательн[а-я]*|положительн[а-я]*)/i);
      if (m) kell = /\+|полож/i.test(m[1]) ? 'положительный' : 'отрицательный';
    } else if (/антиэритроцитарн|Кумбс|антител[а-я]* к антиген/i.test(g.title)) {
      const r = firstResult(g.body);
      if (r) blood.push(`Антиэритроцитарные антитела (непрямая проба Кумбса) от ${g.date}: ${r}`);
    }
  }
  const typing = [abo && `Группа крови: ${abo}`, rh && `резус-фактор: ${rh}`, kell && `Kell: ${kell}`].filter(Boolean).join(', ');
  if (typing) out.push(`${typing}.`);
  if (blood.length) out.push(...blood.map((b) => `${b}.`));

  // Инфекции.
  const INF: { label: string; re: RegExp }[] = [
    { label: 'ВИЧ', re: /HIV|ВИЧ/i },
    { label: 'HBsAg', re: /HBs/i },
    { label: 'HCV', re: /HCV|Hepatitis C|гепатит[а-я]* C/i },
    { label: 'сифилис', re: /Treponema|сифилис|RPR|RW\b|микрореакц/i },
  ];
  const inf = new Map<string, string>();
  for (const g of groups) {
    const t = INF.find((x) => x.re.test(g.title));
    const r = t && firstResult(g.body);
    if (t && r) inf.set(t.label, r);
  }
  if (inf.size) {
    const found = INF.filter((x) => inf.has(x.label)).map((x) => [x.label, inf.get(x.label)!] as const);
    const neg = found.every(([, r]) => /^отриц|^не обнаруж/.test(r));
    out.push(neg ? `${found.map(([k]) => k).join(', ')} – отрицательно.` : `${found.map(([k, r]) => `${k} – ${r}`).join('; ')}.`);
  }
  return out;
}
