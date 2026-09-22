/** Модель одного клинического случая послеродового кровотечения (ПК). */

export type DeliveryMode = 'vaginal' | 'cs';
export type PphTiming = 'early' | 'late';
export type BloodLossMethod = 'gravimetric' | 'visual' | 'cellsaver';

export interface Patient {
  fullName: string;
  historyNo: string;
  age?: number;
  weightKg?: number;
  heightCm?: number;
  gestationWeeks?: number;
  deliveryMode: DeliveryMode;
  /** Дата/время рождения плода (ISO) — для отнесения к раннему/позднему ПК. */
  birthTime?: string;
  parity?: number;
  department: string;
  bloodGroup: string;
  /** Идентификаторы факторов риска из RISK_FACTORS. */
  riskFactors: string[];
  initialHb?: number;
  /** мл/кг для расчёта ОЦК (в III триместре 85–100 мл/кг, при ожирении ниже). */
  bvCoefMlKg: number;
}

export interface CheckState {
  done: boolean;
  /** Отметка «не применимо / противопоказано». */
  na?: boolean;
  at: string;
  note?: string;
}

export interface BloodLossEntry {
  id: string;
  at: string;
  /** Прирост кровопотери, мл. */
  ml: number;
  method: BloodLossMethod;
}

export interface VitalsEntry {
  id: string;
  at: string;
  hr?: number;
  sbp?: number;
  dbp?: number;
  rr?: number;
  spo2?: number;
  temp?: number;
  /** Диурез, мл/ч. */
  diuresis?: number;
  consciousness?: string;
  capRefillSec?: number;
}

export interface LabEntry {
  id: string;
  at: string;
  hb?: number;
  hct?: number;
  plt?: number;
  fib?: number;
  /** ПТВ, кратность к норме. */
  ptRatio?: number;
  /** АЧТВ, кратность к норме. */
  apttRatio?: number;
  inr?: number;
  /** Время свёртывания по Ли-Уайту, мин. */
  leeWhite?: number;
  leeWhiteLooseClot?: boolean;
  caIon?: number;
  lactate?: number;
  ph?: number;
  potassium?: number;
}

export interface ViscoEntry {
  id: string;
  at: string;
  device: 'rotem' | 'teg';
  fibtemA5?: number;
  extemCt?: number;
  extemMcf?: number;
  extemMl?: number;
  /** ТЭГ */
  ffMa?: number;
  tegR?: number;
  tegMa?: number;
  tegLy30?: number;
}

export interface MedEntry {
  id: string;
  at: string;
  /** Идентификатор из DRUGS или 'custom'. */
  drug: string;
  name: string;
  dose: number;
  unit: string;
  route: string;
  /** Объём, мл (для инфузий/трансфузий — учитывается в балансе). */
  volumeMl?: number;
  note?: string;
}

export interface LogEntry {
  id: string;
  at: string;
  text: string;
  kind: 'check' | 'uncheck' | 'bloodloss' | 'vitals' | 'lab' | 'visco' | 'med' | 'event' | 'note';
}

export interface Team {
  obstetrician: string;
  obstetrician2: string;
  midwife1: string;
  midwife2: string;
  anesthesiologist: string;
  nurseAnesthetist: string;
  transfusiologist: string;
  surgeon: string;
}

export interface Case {
  id: string;
  createdAt: string;
  updatedAt: string;
  patient: Patient;
  team: Team;
  timing: PphTiming;
  /** Начало кровотечения (старт таймера). */
  bleedingStart?: string;
  /** Момент диагностики массивной кровопотери (для контроля 20/40 мин). */
  massiveAt?: string;
  bleedingStop?: string;
  checks: Record<string, CheckState>;
  bloodLoss: BloodLossEntry[];
  vitals: VitalsEntry[];
  labs: LabEntry[];
  visco: ViscoEntry[];
  meds: MedEntry[];
  log: LogEntry[];
  /** Ручные отметки по критериям качества (перекрывают автоматические). */
  qualityOverride: Record<string, boolean | undefined>;
  causes: string[];
  outcome: string;
  notes: string;
}
