import type { DeliveryMode } from '../protocol/types';

/**
 * Учебные сценарии. Модель упрощённая и служит только для отработки
 * последовательности действий и работы с приложением — не для прогноза.
 */
export interface Scenario {
  id: string;
  title: string;
  difficulty: 'Базовый' | 'Средний' | 'Сложный';
  summary: string;
  intro: string;
  /** Правильная причина (id из CAUSES). */
  cause: string;
  patient: {
    fullName: string;
    age: number;
    weightKg: number;
    deliveryMode: DeliveryMode;
    gestationWeeks: number;
    parity: number;
    initialHb: number;
    riskFactors: string[];
  };
  /** Кровопотеря к моменту начала сценария, мл. */
  initialLoss: number;
  /** Исходная скорость кровотечения, мл/мин. */
  rate: number;
  /** Множители скорости после выполнения пунктов чек-листа / введения препаратов. */
  factors: Record<string, number>;
  /** Кровотечение останавливается, если выполнены все пункты любого из наборов. */
  stopWhen: string[][];
  /** Коагулопатия: ускоренное падение фибриногена и усиление кровотечения при Фг < 2 без коррекции. */
  coagulopathy?: boolean;
  /** Утеротоники до репозиции ухудшают ситуацию (выворот матки). */
  uterotonicsHarm?: boolean;
  /** Результаты осмотров. */
  findings: Record<string, string>;
  baseline: { hr: number; sbp: number; hb: number; fib: number; plt: number };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'atony',
    title: 'Гипотония матки после родов',
    difficulty: 'Базовый',
    summary: 'Самая частая причина ПК. Отработка первой линии: помощь, 2 вены, окситоцин, транексамовая кислота, баллон.',
    intro:
      'Повторнородящая, 29 лет, 70 кг. Роды через естественные родовые пути 20 минут назад, родостимуляция окситоцином. Послед выделился, целый. Акушерка: «Обильные кровянистые выделения со сгустками, в лотке около 400 мл».',
    cause: 'tonus',
    patient: {
      fullName: 'Тренировка: гипотония матки',
      age: 29,
      weightKg: 70,
      deliveryMode: 'vaginal',
      gestationWeeks: 40,
      parity: 2,
      initialHb: 118,
      riskFactors: ['oxyInduction'],
    },
    initialLoss: 400,
    rate: 60,
    factors: { cause_bimanual: 0.75, first_massage: 0.9, drug_oxytocin: 0.55, drug_miso: 0.8, drug_txa: 0.9 },
    stopWhen: [['drug_balloon'], ['surg_compress'], ['surg_hyst']],
    findings: {
      cause_inspect: 'Осмотр в зеркалах: шейка матки и влагалище без разрывов.',
      cause_manual: 'Ручное обследование: остатков плаценты нет, стенки целы. Матка мягкая, дряблая, после массажа сокращается ненадолго.',
      first_massage: 'Наружный массаж: матка кратковременно сокращается и вновь расслабляется, дно выше пупка.',
      drug_balloon: 'Баллон установлен, 380 мл. Уровень в резервуаре стабилен, выделения скудные.',
    },
    baseline: { hr: 88, sbp: 118, hb: 118, fib: 4.2, plt: 230 },
  },
  {
    id: 'trauma',
    title: 'Разрыв шейки матки',
    difficulty: 'Базовый',
    summary: 'Матка сокращена, а кровотечение продолжается. Цель — вовремя осмотреть родовые пути и ушить разрыв.',
    intro:
      'Первородящая, 24 года, 62 кг. Стремительные роды 15 минут назад, крупный плод 4100 г. Послед целый. Акушерка: «Алая кровь струйкой, матка вроде плотная. Уже около 450 мл».',
    cause: 'trauma',
    patient: {
      fullName: 'Тренировка: разрыв шейки',
      age: 24,
      weightKg: 62,
      deliveryMode: 'vaginal',
      gestationWeeks: 39,
      parity: 1,
      initialHb: 124,
      riskFactors: [],
    },
    initialLoss: 450,
    rate: 45,
    factors: { drug_oxytocin: 0.95, cause_bimanual: 0.95, drug_txa: 0.9 },
    stopWhen: [['cause_suture'], ['surg_hyst']],
    findings: {
      cause_inspect: 'Осмотр в зеркалах: разрыв шейки матки слева длиной 3 см до свода, активно кровоточит.',
      cause_manual: 'Ручное обследование: полость матки пуста, стенки целы, матка плотная, хорошо сокращена.',
      first_massage: 'Матка плотная, дно на уровне пупка — тонус хороший.',
      cause_suture: 'Разрыв ушит, кровотечение остановлено.',
    },
    baseline: { hr: 84, sbp: 122, hb: 124, fib: 4.0, plt: 250 },
  },
  {
    id: 'accreta',
    title: 'Массивное кровотечение при кесаревом сечении',
    difficulty: 'Сложный',
    summary: 'Предлежание и врастание плаценты, быстро развивается коагулопатия. Протокол массивной трансфузии, решение о хирургии ≤ 20 мин.',
    intro:
      'Повторнородящая, 36 лет, 80 кг, 2 КС в анамнезе, полное предлежание плаценты. Плановое КС: после извлечения плода и отделения плаценты — массивное кровотечение из плацентарной площадки. Отсос и салфетки: около 1200 мл.',
    cause: 'tissue',
    patient: {
      fullName: 'Тренировка: КС, врастание плаценты',
      age: 36,
      weightKg: 80,
      deliveryMode: 'cs',
      gestationWeeks: 37,
      parity: 3,
      initialHb: 112,
      riskFactors: ['uterineSurgery', 'placentaPrevia'],
    },
    initialLoss: 1200,
    rate: 130,
    factors: {
      drug_oxytocin: 0.9,
      drug_txa: 0.85,
      drug_balloon: 0.6,
      surg_compress: 0.5,
      surg_devasc: 0.35,
      surg_embol: 0.5,
      mas_ffp: 0.9,
      mas_cryo: 0.85,
    },
    stopWhen: [['surg_hyst'], ['surg_compress', 'surg_devasc', 'drug_balloon']],
    coagulopathy: true,
    findings: {
      cause_inspect: 'Ревизия: плацентарная площадка в нижнем сегменте диффузно кровоточит, участки врастания.',
      surg_compress: 'Компрессионные швы наложены — кровотечение уменьшилось, но продолжается из нижнего сегмента.',
      surg_devasc: 'Маточные сосуды перевязаны — кровотечение заметно уменьшилось.',
      surg_hyst: 'Экстирпация матки выполнена, хирургический гемостаз достигнут.',
    },
    baseline: { hr: 92, sbp: 112, hb: 112, fib: 3.6, plt: 210 },
  },
  {
    id: 'inversion',
    title: 'Выворот матки',
    difficulty: 'Средний',
    summary: 'Редкое, но жизнеугрожающее состояние. Утеротоники — только после репозиции. Шок не соответствует кровопотере.',
    intro:
      'Первородящая, 31 год, 65 кг. Через 10 минут после рождения ребёнка при потягивании за пуповину — резкая боль, из половой щели выходит ярко-красное образование с плацентой. Через брюшную стенку матка не пальпируется. Пациентка бледная, АД 80/45, пульс 58.',
    cause: 'inversion',
    patient: {
      fullName: 'Тренировка: выворот матки',
      age: 31,
      weightKg: 65,
      deliveryMode: 'vaginal',
      gestationWeeks: 40,
      parity: 1,
      initialHb: 120,
      riskFactors: [],
    },
    initialLoss: 300,
    rate: 40,
    factors: { drug_txa: 0.9, inv_iv: 0.95 },
    stopWhen: [['inv_reposition', 'inv_uterotonic'], ['inv_reposition', 'drug_oxytocin']],
    uterotonicsHarm: true,
    findings: {
      cause_inspect: 'Осмотр: во влагалище и за половой щелью — вывернутое дно матки с приросшей плацентой.',
      inv_reposition: 'Под наркозом выполнена репозиция матки (маневр Джонсона). Матка в правильном положении, нужна утеротоническая терапия.',
    },
    baseline: { hr: 58, sbp: 80, hb: 120, fib: 4.0, plt: 240 },
  },
];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
