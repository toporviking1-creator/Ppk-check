/**
 * Синтезатор КТГ: пошаговая модель ЧСС плода и токограммы.
 *
 * Модель не физиологическая — это генератор узнаваемых паттернов для обучения:
 * базальный ритм, вариабельность (смесь медленно «плывущих» колебаний), циклы
 * сна/активности, акцелерации, схватки и привязанные к ним децелерации,
 * пролонгированная децелерация (уровень ЧСС «тянется» к целевому значению),
 * синусоидальный ритм.
 */

export type DecelShape = 'none' | 'early' | 'variable' | 'late';

export interface SynthParams {
  baseline: number;
  /** Размах вариабельности, уд/мин (peak-to-peak). */
  variability: number;
  /** Циклы сна/активности. */
  cycling: boolean;
  /** Акцелераций в час в активной фазе. */
  accelPerHour: number;
  /** Схваток за 10 мин (0 — нет). */
  ctxPer10: number;
  ctxDur: number;
  ctxAmp: number;
  tone: number;
  decel: DecelShape;
  decelDepth: number;
  /** Доля схваток с децелерацией. */
  decelProb: number;
  /** Длительность децелерации, с. */
  decelDur: number;
  /** Множитель вариабельности внутри децелераций. */
  decelVar: number;
  /** «Плечики» у вариабельных децелераций. */
  shoulders: boolean;
  /** Целевая ЧСС пролонгированной децелерации; null — нет. */
  brady: number | null;
  /** Множитель вариабельности во время брадикардии. */
  bradyVar: number;
  /** Амплитуда синусоидального ритма (peak-to-peak); 0 — нет. */
  sinus: number;
}

export const DEFAULT_PARAMS: SynthParams = {
  baseline: 135,
  variability: 12,
  cycling: true,
  accelPerHour: 8,
  ctxPer10: 3,
  ctxDur: 70,
  ctxAmp: 50,
  tone: 12,
  decel: 'none',
  decelDepth: 30,
  decelProb: 0,
  decelDur: 60,
  decelVar: 1,
  shoulders: true,
  brady: null,
  bradyVar: 1,
  sinus: 0,
};

/** Детерминированный ГПСЧ (mulberry32) — одинаковые ленты для одинакового seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const bell = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

interface Contraction {
  start: number;
  dur: number;
  amp: number;
}

interface Decel {
  start: number;
  dur: number;
  depth: number;
  shape: DecelShape;
  varFactor: number;
  shoulders: boolean;
}

interface Accel {
  start: number;
  dur: number;
  amp: number;
}

export interface Sample {
  t: number;
  fhr: number;
  toco: number;
}

/** Профиль децелерации (0…1) по времени от её начала. */
function decelProfile(d: Decel, tau: number): number {
  const x = tau / d.dur;
  if (x <= 0 || x >= 1) return 0;
  switch (d.shape) {
    case 'early':
      return bell(x);
    case 'late': {
      // постепенное падение (≈ 45 %) и медленное восстановление
      return x < 0.45 ? smooth(x / 0.45) : 1 - smooth((x - 0.45) / 0.55);
    }
    case 'variable': {
      const fall = Math.min(12, d.dur * 0.2);
      const rise = Math.min(12, d.dur * 0.2);
      if (tau < fall) return smooth(tau / fall);
      if (tau > d.dur - rise) return smooth((d.dur - tau) / rise);
      return 1 - 0.08 * Math.sin((Math.PI * (tau - fall)) / (d.dur - fall - rise));
    }
    default:
      return 0;
  }
}

export class CtgSynth {
  readonly dt: number;
  t = 0;
  private r: () => number;
  private level: number;
  private ph1: number;
  private ph2: number;
  private f1: number;
  private f2: number;
  private mod = 1;
  private sinPh = 0;
  private quiet = false;
  private nextCycleSwitch: number;
  private nextCtx: number;
  private nextAccel: number;
  private ctx: Contraction[] = [];
  private decels: Decel[] = [];
  private accels: Accel[] = [];
  private tocoNoise = 0;

  constructor(seed = 1, init: Partial<SynthParams> = {}, dt = 0.5) {
    this.dt = dt;
    this.r = rng(seed);
    this.level = init.baseline ?? DEFAULT_PARAMS.baseline;
    this.ph1 = this.r() * Math.PI * 2;
    this.ph2 = this.r() * Math.PI * 2;
    this.f1 = 3 / 60;
    this.f2 = 5 / 60;
    this.nextCycleSwitch = (25 + this.r() * 20) * 60;
    this.nextCtx = 20 + this.r() * 120;
    this.nextAccel = 60 + this.r() * 300;
  }

  /** Переключить фазу сна/активности (для сценариев). */
  setQuiet(q: boolean, forSec?: number) {
    this.quiet = q;
    if (forSec !== undefined) this.nextCycleSwitch = this.t + forSec;
  }

  get isQuiet() {
    return this.quiet;
  }

  /** Принудительно начать схватку сейчас (для живых сценариев). */
  forceContraction(p: SynthParams) {
    this.startContraction(p);
  }

  private startContraction(p: SynthParams) {
    const r = this.r;
    const dur = p.ctxDur * (0.85 + r() * 0.3);
    const c: Contraction = { start: this.t, dur, amp: p.ctxAmp * (0.8 + r() * 0.35) };
    this.ctx.push(c);
    if (p.decel !== 'none' && r() < p.decelProb) {
      const depth = p.decelDepth * (0.8 + r() * 0.4);
      let start = this.t;
      let ddur = p.decelDur * (0.85 + r() * 0.3);
      if (p.decel === 'early') {
        ddur = dur;
      } else if (p.decel === 'variable') {
        start = this.t + dur * (0.1 + r() * 0.15);
      } else if (p.decel === 'late') {
        start = this.t + dur * (0.45 + r() * 0.1);
      }
      this.decels.push({ start, dur: ddur, depth, shape: p.decel, varFactor: p.decelVar, shoulders: p.shoulders });
    }
  }

  step(p: SynthParams): Sample {
    const dt = this.dt;
    const r = this.r;
    this.t += dt;
    const t = this.t;

    // --- циклы сна / активности ---
    if (p.cycling && t >= this.nextCycleSwitch) {
      this.quiet = !this.quiet;
      this.nextCycleSwitch = t + (this.quiet ? 15 + r() * 15 : 25 + r() * 25) * 60;
    }
    if (!p.cycling && this.quiet && t >= this.nextCycleSwitch) this.quiet = false;
    const quiet = p.cycling && this.quiet;

    // --- схватки ---
    if (p.ctxPer10 > 0 && t >= this.nextCtx) {
      this.startContraction(p);
      const period = 600 / p.ctxPer10;
      this.nextCtx = t + period * (0.9 + r() * 0.2);
    } else if (p.ctxPer10 <= 0) {
      this.nextCtx = Math.max(this.nextCtx, t + 60);
    }

    // --- акцелерации ---
    if (t >= this.nextAccel) {
      if (!quiet && p.accelPerHour > 0 && p.brady === null && p.sinus === 0) {
        this.accels.push({ start: t, dur: 18 + r() * 25, amp: 15 + r() * 10 });
      }
      const rate = Math.max(p.accelPerHour, 0.5);
      this.nextAccel = t + (3600 / rate) * (0.5 + r());
    }

    // --- уровень (базальный / пролонгированная децелерация) ---
    const target = p.brady ?? p.baseline;
    const diff = target - this.level;
    const tau = Math.abs(diff) > 8 ? (p.brady !== null ? 14 : 20) : 6;
    this.level += (diff * dt) / tau;

    // --- вариабельность ---
    this.f1 = Math.min(6 / 60, Math.max(2 / 60, this.f1 + (r() - 0.5) * 0.004));
    this.f2 = Math.min(9 / 60, Math.max(4 / 60, this.f2 + (r() - 0.5) * 0.006));
    this.ph1 += 2 * Math.PI * this.f1 * dt;
    this.ph2 += 2 * Math.PI * this.f2 * dt;
    this.mod += ((0.75 + r() * 0.5 - this.mod) * dt) / 20;

    let varFactor = quiet ? 0.42 : 1;
    let decelDrop = 0;
    for (const d of this.decels) {
      const v = decelProfile(d, t - d.start);
      if (v > 0) {
        decelDrop += v * d.depth;
        varFactor *= 1 - v * (1 - d.varFactor);
      }
    }
    if (p.brady !== null || this.level < p.baseline - 15) {
      const depthFrac = Math.min(1, Math.max(0, (p.baseline - this.level) / 30));
      varFactor *= 1 - depthFrac * (1 - p.bradyVar);
    }

    let osc: number;
    if (p.sinus > 0) {
      this.sinPh += 2 * Math.PI * (3.5 / 60) * dt;
      osc = (p.sinus / 2) * Math.sin(this.sinPh) + (r() - 0.5) * 0.6;
    } else {
      const amp = (p.variability / 2) * varFactor * this.mod;
      osc = amp * (0.62 * Math.sin(this.ph1) + 0.38 * Math.sin(this.ph2)) + (r() - 0.5) * Math.min(1.6, 0.25 + amp * 0.15);
    }

    // --- акцелерации ---
    let accel = 0;
    for (const a of this.accels) accel += bell((t - a.start) / a.dur) * a.amp;
    // «плечики» — короткие подъёмы до и после вариабельной децелерации
    for (const d of this.decels) {
      if (d.shape !== 'variable' || !d.shoulders) continue;
      const before = bell((t - (d.start - 14)) / 14);
      const after = bell((t - (d.start + d.dur)) / 16);
      accel += (before + after) * 9;
    }

    // --- токограмма ---
    let toco = p.tone;
    for (const c of this.ctx) toco += bell((t - c.start) / c.dur) * c.amp;
    this.tocoNoise += ((r() - 0.5) * 2 - this.tocoNoise) * 0.2;
    toco += this.tocoNoise * 1.2;

    // очистка завершившихся событий
    if (this.ctx.length > 8) this.ctx = this.ctx.filter((c) => t - c.start < c.dur + 5);
    if (this.decels.length > 8) this.decels = this.decels.filter((d) => t - d.start < d.dur + 40);
    if (this.accels.length > 8) this.accels = this.accels.filter((a) => t - a.start < a.dur + 5);

    const fhr = Math.max(50, Math.min(210, this.level + osc + accel - decelDrop));
    return { t, fhr, toco: Math.max(0, Math.min(100, toco)) };
  }
}

/** Ключевой кадр сценария: с минуты `at` параметры плавно меняются к указанным. */
export interface Keyframe {
  at: number;
  p: Partial<SynthParams>;
  /** Принудительно включить фазу сна (true) / активности (false) на `forMin` минут. */
  quiet?: boolean;
  forMin?: number;
}

const NUMERIC: (keyof SynthParams)[] = [
  'baseline',
  'variability',
  'accelPerHour',
  'ctxPer10',
  'ctxDur',
  'ctxAmp',
  'tone',
  'decelDepth',
  'decelProb',
  'decelDur',
  'decelVar',
  'bradyVar',
  'sinus',
];

/** Параметры в момент `min` с линейной интерполяцией числовых полей между ключевыми кадрами. */
export function paramsAt(frames: Keyframe[], min: number): SynthParams {
  const sorted = [...frames].sort((a, b) => a.at - b.at);
  // Накопленные (ступенчатые) параметры до каждого кадра.
  const states: SynthParams[] = [];
  let acc: SynthParams = { ...DEFAULT_PARAMS };
  for (const f of sorted) {
    acc = { ...acc, ...f.p };
    states.push(acc);
  }
  let i = -1;
  for (let k = 0; k < sorted.length; k++) if (sorted[k].at <= min) i = k;
  if (i === -1) return states[0] ?? { ...DEFAULT_PARAMS };
  const cur = states[i];
  const next = sorted[i + 1];
  if (!next) return cur;
  const nextState = states[i + 1];
  const x = (min - sorted[i].at) / (next.at - sorted[i].at);
  const out: SynthParams = { ...cur };
  for (const k of NUMERIC) {
    if (next.p[k] === undefined) continue;
    const a = cur[k] as number;
    const b = nextState[k] as number;
    (out as unknown as Record<string, number>)[k] = a + (b - a) * x;
  }
  // brady: включается ступенчато в момент кадра
  return out;
}

export interface Trace {
  hz: number;
  fhr: Float32Array;
  toco: Float32Array;
  minutes: number;
}

/** Сгенерировать ленту длиной `minutes` по ключевым кадрам. */
export function generateTrace(frames: Keyframe[], minutes: number, seed: number, hz = 2): Trace {
  const dt = 1 / hz;
  const n = Math.round(minutes * 60 * hz);
  const synth = new CtgSynth(seed, paramsAt(frames, 0), dt);
  const fhr = new Float32Array(n);
  const toco = new Float32Array(n);
  const sorted = [...frames].sort((a, b) => a.at - b.at);
  let fi = 0;
  for (let i = 0; i < n; i++) {
    const min = (i * dt) / 60;
    while (fi < sorted.length && sorted[fi].at <= min) {
      const f = sorted[fi];
      if (f.quiet !== undefined) synth.setQuiet(f.quiet, f.forMin !== undefined ? f.forMin * 60 : undefined);
      fi++;
    }
    const s = synth.step(paramsAt(frames, min));
    fhr[i] = s.fhr;
    toco[i] = s.toco;
  }
  return { hz, fhr, toco, minutes };
}

/** Оценка базального ритма на отрезке: медиана после отбрасывания эпизодов вне ±10 уд/мин от моды. */
export function estimateBaseline(fhr: ArrayLike<number>, from = 0, to = fhr.length): number {
  const hist = new Map<number, number>();
  for (let i = from; i < to; i++) {
    const b = Math.round(fhr[i] / 5) * 5;
    hist.set(b, (hist.get(b) ?? 0) + 1);
  }
  let mode = 0;
  let best = -1;
  for (const [k, v] of hist) if (v > best) [mode, best] = [k, v];
  const vals: number[] = [];
  for (let i = from; i < to; i++) if (Math.abs(fhr[i] - mode) <= 10) vals.push(fhr[i]);
  vals.sort((a, b) => a - b);
  return vals.length ? Math.round(vals[Math.floor(vals.length / 2)]) : mode;
}
