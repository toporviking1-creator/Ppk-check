/** Период родов / ситуация, в которой оценивается КТГ. */
export type Stage = 'antenatal' | 'first' | 'second';

/** Амплитуда вариабельности: < 5, 5–25, > 25 уд/мин. */
export type VarBand = 'reduced' | 'normal' | 'increased';

/** Поведение базального ритма во времени. */
export type BaselineTrend = 'stable' | 'rising' | 'falling' | 'unstable';

export type Tri = 'present' | 'absent' | 'unknown';

/** Частота децелераций: нет / единичные / повторяющиеся (≥ 50 % схваток). */
export type DecelFreq = 'none' | 'occasional' | 'repetitive';

/**
 * Характер децелераций в физиологическом понимании:
 * - early — ранние (компрессия головки), зеркальны схватке;
 * - rapid — быстрое падение и быстрое восстановление (барорецепторные, «вариабельные», компрессия пуповины);
 * - gradual — постепенное падение и медленное восстановление после схватки (хеморецепторные, «поздние»);
 * - mixed — сочетание.
 */
export type DecelNature = 'early' | 'rapid' | 'gradual' | 'mixed';

/** Клинический контекст — то, что видно не на ленте, а у постели. */
export interface ClinicalContext {
  oxytocin: boolean;
  pushing: boolean;
  epidural: boolean;
  hypotension: boolean;
  supine: boolean;
  fever: boolean; // ≥ 38 °C или признаки хориоамнионита
  meconium: boolean;
  bleeding: boolean; // кровотечение / болезненная матка — подозрение на отслойку
  cordProlapse: boolean;
  scarPain: boolean; // рубец на матке + боль / изменение контура — подозрение на разрыв
  fgr: boolean; // ЗРП / маловодие
  postterm: boolean; // ≥ 41 нед
  drugs: boolean; // опиоиды, магния сульфат и др.
}

export const EMPTY_CONTEXT: ClinicalContext = {
  oxytocin: false,
  pushing: false,
  epidural: false,
  hypotension: false,
  supine: false,
  fever: false,
  meconium: false,
  bleeding: false,
  cordProlapse: false,
  scarPain: false,
  fgr: false,
  postterm: false,
  drugs: false,
};

/** Признаки КТГ, которые отмечает врач (или ключ ответа в тренажёре). */
export interface CtgFeatures {
  stage: Stage;
  gaWeeks?: number;
  /** Базальный ритм сейчас, уд/мин. */
  baseline?: number;
  /** Исходный базальный ритм («якорь»: при поступлении / в начале наблюдения). */
  anchorBaseline?: number;
  trend: BaselineTrend;
  variability: VarBand;
  /** Сколько минут держится текущая аномальная вариабельность. */
  variabilityMin?: number;
  zigzag: boolean; // амплитуда > 25 уд/мин 2–30 мин (часто во втором периоде)
  sinusoidal: boolean;
  cycling: Tri;
  accelerations: Tri;
  decels: DecelFreq;
  decelNature: DecelNature;
  /** Сколько минут продолжаются повторяющиеся децелерации. */
  decelsMin?: number;
  /** Децелерации углубляются / удлиняются. */
  decelsWorsening: boolean;
  /** Децелерации > 90 с, а стабильного ритма между ними < 30 с (плод больше времени в децелерации, чем на базальном ритме). */
  subacutePattern: boolean;
  /** Неглубокие (< 15 уд/мин) децелерации на фоне сниженной вариабельности. */
  shallowDecels: boolean;
  /** Идёт пролонгированная децелерация / брадикардия ≥ 3 мин. */
  prolonged: boolean;
  prolongedMin?: number;
  /** Вариабельность внутри пролонгированной децелерации сохранена (особенно в первые 3 мин). */
  prolongedVarPreserved: Tri;
  /** Схваток за 10 мин. */
  contractions?: number;
  hypertonus: boolean;
  context: ClinicalContext;
}

export const EMPTY_FEATURES: CtgFeatures = {
  stage: 'first',
  trend: 'stable',
  variability: 'normal',
  zigzag: false,
  sinusoidal: false,
  cycling: 'unknown',
  accelerations: 'unknown',
  decels: 'none',
  decelNature: 'rapid',
  decelsWorsening: false,
  subacutePattern: false,
  shallowDecels: false,
  prolonged: false,
  prolongedVarPreserved: 'unknown',
  hypertonus: false,
  context: EMPTY_CONTEXT,
};

/** Тип гипоксии по физиологической интерпретации. */
export type HypoxiaType = 'none' | 'acute' | 'subacute' | 'gradual' | 'chronic' | 'nonhypoxic';

/** Стадия ответа плода при постепенно развивающейся гипоксии. */
export type CompensationStage = 'compensated' | 'catecholamine' | 'decompensated' | 'terminal';

export type FigoCategory = 'normal' | 'suspicious' | 'pathological';

/** Физиологическая категория (International Physiological CTG Guideline). */
export type PhysioCategory = 'normal' | 'suspicious' | 'pathological' | 'urgent';

export type Urgency = 'routine' | 'attention' | 'urgent' | 'emergency';

/** Обобщённая тактика. */
export type Strategy = 'observe' | 'correct' | 'resuscitate' | 'cause' | 'deliver';

export interface ActionItem {
  id: string;
  text: string;
  /** Выполнить немедленно. */
  now?: boolean;
  /** Чего не делать (ловушки). */
  avoid?: boolean;
}

export interface Interpretation {
  hypoxia: HypoxiaType;
  stage?: CompensationStage;
  /** Негипоксические причины / дифференциальный ряд. */
  nonHypoxic: string[];
  physio: PhysioCategory;
  figo: FigoCategory;
  figoReasons: string[];
  /** Физиологическое обоснование: что делает плод. */
  findings: string[];
  actions: ActionItem[];
  urgency: Urgency;
  strategy: Strategy;
  /** Через сколько минут переоценить КТГ (0 — непрерывно, у постели). */
  reassessMin: number;
  /** Ориентир скорости снижения pH. */
  phRate?: string;
  /** Рост базального ритма от якоря, %. */
  baselineRisePct?: number;
  warnings: string[];
  headline: string;
}
