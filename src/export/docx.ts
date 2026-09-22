import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ISectionOptions,
} from 'docx';
import type { Case } from '../protocol/types';
import { CAUSES, GUIDELINE, RISK_FACTORS, RISK_LABEL, riskLevel } from '../protocol/data';
import { visibleSections } from '../protocol/case';
import {
  SEVERITY_LABEL,
  assessLabs,
  assessVisco,
  bloodVolumeMl,
  fmtDateTime,
  fmtTime,
  formatDuration,
  infusionTotals,
  lossPercent,
  meanArterialPressure,
  minutesBetween,
  severity,
  shockIndex,
  totalBloodLoss,
} from '../protocol/calc';
import { QUALITY_CRITERIA, QUALITY_LABEL, qualityScore, qualityValue } from '../protocol/quality';
import { isBleeding } from '../protocol/alerts';
import { buildDebrief } from '../training/debrief';

export interface ExportOptions {
  /** Пустой бланк для печати (без данных пациентки). */
  blank?: boolean;
  /** Включить хронологический журнал. */
  includeLog?: boolean;
  generatedAt?: Date;
}

const FONT = 'Times New Roman';
const SIZE = 22; // 11 pt
const SMALL = 18; // 9 pt
const ACCENT = 'B4232A';
const GRAY = 'F2F2F2';

const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function run(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) {
  return new TextRun({ text, font: FONT, size: opts.size ?? SIZE, bold: opts.bold, color: opts.color, italics: opts.italics });
}

function p(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string; italics?: boolean; after?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 60 },
    children: [run(text, opts)],
  });
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    keepNext: true,
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: ACCENT })],
  });
}

function cell(content: string | Paragraph[], opts: { bold?: boolean; shade?: string; width?: number; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string } = {}) {
  const children =
    typeof content === 'string'
      ? content.split('\n').map(
          (line) =>
            new Paragraph({
              alignment: opts.align,
              children: [run(line, { bold: opts.bold, size: opts.size ?? SMALL + 2, color: opts.color })],
            }),
        )
      : content;
  return new TableCell({
    children,
    verticalAlign: VerticalAlign.CENTER,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function table(headers: string[], rows: string[][], widths?: number[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, shade: GRAY, width: widths?.[i] })),
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: r.map((v, i) => cell(v, { width: widths?.[i] })),
          }),
      ),
    ],
  });
}

function kvTable(pairs: [string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: pairs.map(
      ([k, v]) =>
        new TableRow({
          cantSplit: true,
          children: [cell(k, { bold: true, shade: GRAY, width: 35 }), cell(v || ' ', { width: 65 })],
        }),
    ),
  });
}

const dash = (v?: string | number) => (v === undefined || v === '' ? '—' : String(v));

function checkMark(c: Case, id: string, blank: boolean): string {
  if (blank) return '☐';
  const s = c.checks[id];
  if (s?.done) return '☑ Да';
  if (s?.na) return 'Н/П';
  return '☐ Нет';
}

export function buildDocument(c: Case, opts: ExportOptions = {}): Document {
  const blank = !!opts.blank;
  const now = opts.generatedAt ?? new Date();
  const pt = c.patient;
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'ЧЕК-ЛИСТ ОКАЗАНИЯ МЕДИЦИНСКОЙ ПОМОЩИ', font: FONT, size: 30, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'ПРИ ПОСЛЕРОДОВОМ КРОВОТЕЧЕНИИ', font: FONT, size: 30, bold: true, color: ACCENT })],
    }),
    ...(c.training && !blank
      ? [p('УЧЕБНЫЙ СЛУЧАЙ (ТРЕНИРОВКА) — НЕ МЕДИЦИНСКИЙ ДОКУМЕНТ', { align: AlignmentType.CENTER, bold: true, color: ACCENT })]
      : []),
    p(`Клинические рекомендации «${GUIDELINE.title}» (${GUIDELINE.year}). МКБ-10: ${GUIDELINE.icd}`, {
      align: AlignmentType.CENTER,
      size: SMALL,
      italics: true,
      after: 200,
    }),
  );

  // 1. Пациентка
  children.push(heading('1. Сведения о пациентке'));
  const bv = bloodVolumeMl(pt.weightKg, pt.bvCoefMlKg);
  const risk = riskLevel(pt.riskFactors);
  const riskText = RISK_FACTORS.filter((f) => pt.riskFactors.includes(f.id)).map((f) => f.text).join('; ');
  children.push(
    kvTable(
      blank
        ? [
            ['ФИО', ''],
            ['№ истории родов', ''],
            ['Возраст / масса тела / рост', ''],
            ['Срок гестации, паритет', ''],
            ['Родоразрешение', '☐ через естественные родовые пути   ☐ кесарево сечение'],
            ['Дата и время рождения плода', ''],
            ['Группа крови, Rh', ''],
            ['Отделение', ''],
            ['Степень риска ПК', '☐ низкий   ☐ средний   ☐ высокий'],
            ['Факторы риска', ''],
          ]
        : [
            ['ФИО', pt.fullName],
            ['№ истории родов', pt.historyNo],
            ['Возраст / масса тела / рост', `${dash(pt.age)} лет / ${dash(pt.weightKg)} кг / ${dash(pt.heightCm)} см`],
            ['Срок гестации, паритет', `${pt.gestationWeeks ? `${pt.gestationWeeks} нед.` : '—'}; ${pt.parity ? `роды ${pt.parity}-е` : 'паритет —'}`],
            ['Родоразрешение', pt.deliveryMode === 'cs' ? 'Кесарево сечение' : 'Через естественные родовые пути'],
            ['Дата и время рождения плода', fmtDateTime(pt.birthTime)],
            ['Группа крови, Rh', pt.bloodGroup],
            ['Отделение', pt.department],
            ['Исходный Hb', pt.initialHb ? `${pt.initialHb} г/л` : '—'],
            ['ОЦК (расчётный)', bv ? `${bv} мл (${pt.bvCoefMlKg} мл/кг)` : '—'],
            ['Степень риска ПК', RISK_LABEL[risk]],
            ['Факторы риска', riskText || 'не выявлены'],
          ],
    ),
  );

  // 2. Сводка
  children.push(heading('2. Сводка'));
  if (blank) {
    children.push(
      kvTable([
        ['Начало кровотечения (время)', ''],
        ['Остановка кровотечения (время)', ''],
        ['Кровопотеря суммарно, мл / % ОЦК', ''],
        ['Метод оценки', '☐ гравиметрический   ☐ визуальный'],
        ['Раннее / позднее ПК', '☐ раннее (< 24 ч)   ☐ позднее (24 ч – 42 дня)'],
        ['Причина (4Т)', '☐ тонус   ☐ ткань   ☐ травма   ☐ выворот матки   ☐ тромбин (коагулопатия)'],
        ['Шоковый индекс максимальный', ''],
        ['Массивная кровопотеря диагностирована (время)', ''],
      ]),
    );
  } else {
    const loss = totalBloodLoss(c);
    const pct = lossPercent(c);
    const maxSi = Math.max(0, ...c.vitals.map((v) => shockIndex(v.hr, v.sbp) ?? 0));
    const end = c.bleedingStop ?? (isBleeding(c) ? undefined : c.updatedAt);
    const duration = c.bleedingStart && end ? formatDuration(minutesBetween(c.bleedingStart, end)) : c.bleedingStart ? 'продолжается' : '—';
    const methods = [...new Set(c.bloodLoss.map((b) => ({ gravimetric: 'гравиметрический', visual: 'визуальный', cellsaver: 'по аппарату реинфузии' })[b.method]))].join(', ');
    const inf = infusionTotals(c);
    children.push(
      kvTable([
        ['Начало кровотечения', fmtDateTime(c.bleedingStart)],
        ['Остановка кровотечения', c.bleedingStop ? fmtDateTime(c.bleedingStop) : isBleeding(c) ? 'не остановлено' : '—'],
        ['Длительность', duration],
        ['Кровопотеря суммарно', `${loss} мл${pct !== undefined ? ` (${pct.toFixed(1)}% ОЦК)` : ''}`],
        ['Степень кровопотери (Прил. Б1)', SEVERITY_LABEL[severity(c)]],
        ['Метод оценки', methods || '—'],
        ['Раннее / позднее ПК', c.timing === 'late' ? 'Позднее (вторичное)' : 'Раннее (первичное)'],
        ['Причина (4Т)', CAUSES.filter((x) => c.causes.includes(x.id)).map((x) => `${x.t}: ${x.title}`).join('; ') || 'не указана'],
        ['Шоковый индекс максимальный', maxSi ? maxSi.toFixed(2) : '—'],
        ['Массивная кровопотеря диагностирована', fmtDateTime(c.massiveAt)],
        ['Инфузия кристаллоидов/коллоидов', `${inf.crystalloidColloid} мл`],
        ['Компоненты крови (объём)', `${inf.blood} мл`],
      ]),
    );
  }

  const d = !blank ? buildDebrief(c) : undefined;
  if (d) {
    children.push(heading('Разбор тренировки'));
    children.push(
      kvTable([
        ['Сценарий', d.scenarioTitle],
        ['Итоговая оценка', `${d.score} из 100`],
        ['Кровотечение', d.stopped ? 'остановлено' : 'не остановлено'],
        ['Кровопотеря фактическая / внесённая', `${d.trueLoss} / ${d.documentedLoss} мл`],
        ['Причина', `${d.causeText} — ${d.causeCorrect ? 'определена верно' : 'не определена'}`],
      ]),
    );
    const rows = [
      ...d.protocolTimers.map((r) => [r.label, r.minutes === undefined ? 'не выполнено' : `${Math.round(r.minutes)} мин`, r.targetMin ? `≤ ${r.targetMin} мин` : '', r.status === 'ok' ? 'в срок' : r.status === 'late' ? 'поздно' : 'нет']),
      ...d.keyActions.map((r) => [r.label, r.minutes === undefined ? 'не выполнено' : `${Math.round(r.minutes)} мин`, '', '']),
    ];
    children.push(table(['Действие', 'Время', 'Срок КР', 'Итог'], rows, [50, 18, 16, 16]));
    for (const e of [...d.errors, ...d.missedCritical.map((m) => `Пропущено: ${m}`)]) children.push(p(`• ${e}`, { size: SMALL + 2 }));
  }

  // 3. Бригада
  children.push(heading('3. Бригада'));
  const t = c.team;
  children.push(
    kvTable([
      ['Врач акушер-гинеколог', blank ? '' : t.obstetrician],
      ['2-й врач акушер-гинеколог', blank ? '' : t.obstetrician2],
      ['1-я акушерка', blank ? '' : t.midwife1],
      ['2-я акушерка', blank ? '' : t.midwife2],
      ['Анестезиолог-реаниматолог', blank ? '' : t.anesthesiologist],
      ['Медсестра-анестезист', blank ? '' : t.nurseAnesthetist],
      ['Трансфузиолог', blank ? '' : t.transfusiologist],
      ['Хирург (перевязка сосудов / гистерэктомия)', blank ? '' : t.surgeon],
    ]),
  );

  // 4. Чек-лист
  children.push(heading('4. Чек-лист мероприятий'));
  const sections = blank
    ? visibleSections({ ...c, causes: ['inversion'], timing: 'late', patient: { ...c.patient, deliveryMode: 'vaginal' } }).map((s) => {
        const full = visibleSections({ ...c, causes: ['inversion'], timing: 'late', patient: { ...c.patient, deliveryMode: 'cs' } }).find((x) => x.id === s.id);
        const ids = new Set(s.items.map((i) => i.id));
        return { ...s, items: [...s.items, ...(full?.items.filter((i) => !ids.has(i.id)) ?? [])] };
      })
    : visibleSections(c);
  let n = 0;
  for (const s of sections) {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        keepNext: true,
        children: [run(s.title, { bold: true }), ...(s.subtitle ? [run(`  —  ${s.subtitle}`, { size: SMALL, italics: true })] : [])],
      }),
    );
    children.push(
      table(
        ['№', 'Мероприятие', 'Отв.', 'УУР/УДД', 'Выполнено', 'Время', 'Примечание'],
        s.items.map((i) => {
          n++;
          const st = c.checks[i.id];
          const text = i.onlyFor && blank ? `${i.text} (${i.onlyFor === 'cs' ? 'при КС' : 'при родах'})` : i.text;
          return [
            String(n),
            text,
            i.role ?? '',
            i.grade ?? '',
            checkMark(c, i.id, blank),
            blank ? '' : st && (st.done || st.na) ? fmtTime(st.at) : '',
            blank ? '' : (st?.note ?? ''),
          ];
        }),
        [5, 44, 10, 8, 10, 8, 15],
      ),
    );
  }

  if (!blank) {
    // 5. Кровопотеря
    children.push(heading('5. Динамика кровопотери'));
    let acc = 0;
    children.push(
      c.bloodLoss.length
        ? table(
            ['Время', 'Прирост, мл', 'Нарастающий итог, мл', '% ОЦК', 'Метод'],
            [...c.bloodLoss]
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((b) => {
                acc += b.ml;
                return [
                  fmtTime(b.at),
                  String(b.ml),
                  String(acc),
                  bv ? ((acc / bv) * 100).toFixed(1) : '—',
                  { gravimetric: 'гравиметрический', visual: 'визуальный', cellsaver: 'аппарат реинфузии' }[b.method],
                ];
              }),
          )
        : p('Нет записей.'),
    );

    // 6. Витальные
    children.push(heading('6. Мониторинг витальных функций'));
    children.push(
      c.vitals.length
        ? table(
            ['Время', 'АД, мм рт. ст.', 'САДср', 'ЧСС', 'ШИ', 'ЧД', 'SpO₂, %', 'T, °C', 'Диурез, мл/ч', 'Сознание'],
            [...c.vitals]
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((v) => {
                const si = shockIndex(v.hr, v.sbp);
                const m = meanArterialPressure(v.sbp, v.dbp);
                return [
                  fmtTime(v.at),
                  v.sbp !== undefined ? `${v.sbp}/${dash(v.dbp)}` : '—',
                  m ? m.toFixed(0) : '—',
                  dash(v.hr),
                  si ? si.toFixed(2) : '—',
                  dash(v.rr),
                  dash(v.spo2),
                  dash(v.temp),
                  dash(v.diuresis),
                  dash(v.consciousness),
                ];
              }),
          )
        : p('Нет записей.'),
    );

    // 7. Лаборатория
    children.push(heading('7. Лабораторный контроль'));
    if (c.labs.length) {
      children.push(
        table(
          ['Время', 'Hb', 'Ht', 'Tr', 'Фг', 'ПТВ×N', 'АЧТВ×N', 'МНО', 'Ли-Уайт', 'Ca²⁺', 'Лактат', 'pH'],
          [...c.labs]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((l) => [
              fmtTime(l.at),
              dash(l.hb),
              dash(l.hct),
              dash(l.plt),
              dash(l.fib),
              dash(l.ptRatio),
              dash(l.apttRatio),
              dash(l.inr),
              l.leeWhite !== undefined || l.leeWhiteLooseClot ? `${dash(l.leeWhite)}${l.leeWhiteLooseClot ? ' рыхл.' : ''}` : '—',
              dash(l.caIon),
              dash(l.lactate),
              dash(l.ph),
            ]),
        ),
      );
      const last = [...c.labs].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
      const findings = assessLabs(last, isBleeding(c)).filter((f) => f.level !== 'ok');
      if (findings.length) {
        children.push(p(`Отклонения от целевых значений (последний анализ ${fmtTime(last.at)}):`, { bold: true, size: SMALL + 2 }));
        for (const f of findings) children.push(p(`• ${f.text}${f.action ? ` → ${f.action}` : ''}`, { size: SMALL + 2 }));
      }
    } else children.push(p('Нет записей.'));
    children.push(p('Целевые показатели: Hb > 70 г/л; тромбоциты > 50×10⁹/л; ПТВ и АЧТВ < 1,5 нормы; фибриноген > 2 г/л (КР, раздел 3.1).', { size: SMALL, italics: true }));

    if (c.visco.length) {
      children.push(heading('8. ТЭГ / РОТЭМ'));
      children.push(
        table(
          ['Время', 'Метод', 'Показатели', 'Интерпретация (Прил. А3.3)'],
          [...c.visco]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((v) => [
              fmtTime(v.at),
              v.device === 'rotem' ? 'РОТЭМ' : 'ТЭГ',
              v.device === 'rotem'
                ? `FIBTEM A5 ${dash(v.fibtemA5)}; EXTEM CT ${dash(v.extemCt)}; MCF ${dash(v.extemMcf)}; ML ${dash(v.extemMl)}`
                : `FF MA ${dash(v.ffMa)}; R ${dash(v.tegR)}; MA ${dash(v.tegMa)}; LY30 ${dash(v.tegLy30)}`,
              assessVisco(v, pt.weightKg)
                .filter((f) => f.level !== 'ok')
                .map((f) => `${f.text}${f.action ? ` → ${f.action}` : ''}`)
                .join('\n') || 'без отклонений',
            ]),
          [10, 10, 35, 45],
        ),
      );
    }

    // 9. Препараты
    children.push(heading('9. Лекарственные препараты и компоненты крови'));
    children.push(
      c.meds.length
        ? table(
            ['Время', 'Препарат', 'Доза', 'Путь', 'Объём, мл', 'Примечание'],
            [...c.meds]
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((m) => [fmtTime(m.at), m.name, m.dose ? `${m.dose} ${m.unit}` : '—', m.route, m.volumeMl ? String(m.volumeMl) : '—', m.note ?? '']),
            [10, 28, 14, 14, 10, 24],
          )
        : p('Нет записей.'),
    );
  }

  // 10. Качество
  children.push(heading(blank ? '5. Критерии оценки качества медицинской помощи' : '10. Критерии оценки качества медицинской помощи'));
  children.push(
    table(
      ['№', 'Критерий качества', 'Оценка выполнения'],
      QUALITY_CRITERIA.map((q) => [String(q.n), q.text, blank ? '☐ Да   ☐ Нет' : QUALITY_LABEL[qualityValue(c, q)]]),
      [6, 74, 20],
    ),
  );
  if (!blank) {
    const sc = qualityScore(c);
    children.push(p(`Выполнено критериев: ${sc.yes} из ${sc.applicable} применимых.`, { bold: true }));
  }

  if (!blank && opts.includeLog !== false && c.log.length) {
    children.push(heading('11. Хронологический журнал'));
    children.push(
      table(
        ['Время', 'Событие'],
        [...c.log].sort((a, b) => a.at.localeCompare(b.at)).map((l) => [fmtTime(l.at), l.text]),
        [12, 88],
      ),
    );
  }

  children.push(heading(blank ? '6. Исход и примечания' : '12. Исход и примечания'));
  children.push(p(blank ? '\n\n' : c.outcome || '—'));
  if (!blank && c.notes) children.push(p(c.notes));

  children.push(new Paragraph({ spacing: { before: 400 }, children: [] }));
  for (const role of ['Врач акушер-гинеколог', 'Анестезиолог-реаниматолог', 'Акушерка']) {
    children.push(p(`${role}: ______________________ / ______________________ /     Подпись: __________`, { after: 200 }));
  }
  children.push(
    p(
      `Сформировано: ${fmtDateTime(now.toISOString())}. Документ сформирован приложением «ПК-чек-лист» на основе клинических рекомендаций и не заменяет клиническое решение врача.`,
      { size: SMALL - 2, italics: true, color: '666666' },
    ),
  );

  const headerText = blank ? 'Послеродовое кровотечение — чек-лист' : `${pt.fullName || 'Пациентка'}${pt.historyNo ? `, И/Р № ${pt.historyNo}` : ''}`;

  const section: ISectionOptions = {
    properties: {
      page: {
        size: { orientation: PageOrientation.PORTRAIT },
        margin: { top: 1000, bottom: 1000, left: 1000, right: 850 },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [run(headerText, { size: SMALL - 2, color: '666666' })],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: ['Стр. ', PageNumber.CURRENT, ' из ', PageNumber.TOTAL_PAGES], font: FONT, size: SMALL - 2, color: '666666' }),
            ],
          }),
        ],
      }),
    },
    children,
  };

  return new Document({
    creator: 'ПК-чек-лист',
    title: 'Чек-лист: послеродовое кровотечение',
    description: 'Отчёт по клиническим рекомендациям «Послеродовое кровотечение» (2025)',
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [section],
  });
}

export function exportFileName(c: Case, blank = false): string {
  if (blank) return 'Чек-лист_ПК_бланк.docx';
  const name = (c.patient.fullName || 'пациентка').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  const d = new Date(c.bleedingStart ?? c.createdAt);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `ПК_${name}_${stamp}.docx`;
}

