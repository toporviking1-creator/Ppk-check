import { CtgSynth, DEFAULT_PARAMS, type SynthParams } from '../logic/synth';

export type LiveActionId =
  | 'help'
  | 've'
  | 'lateral'
  | 'stop_oxy'
  | 'tocolysis'
  | 'fluids'
  | 'stop_push'
  | 'elevate'
  | 'theatre'
  | 'deliver'
  | 'o2'
  | 'oxy_up';

export const LIVE_ACTIONS: { id: LiveActionId; label: string }[] = [
  { id: 'help', label: 'Позвать помощь (ответственный, анестезиолог)' },
  { id: 've', label: 'Влагалищное исследование' },
  { id: 'lateral', label: 'Повернуть на левый бок' },
  { id: 'stop_oxy', label: 'Остановить окситоцин' },
  { id: 'tocolysis', label: 'Острый токолиз' },
  { id: 'fluids', label: 'Инфузия + вазопрессор' },
  { id: 'stop_push', label: 'Прекратить потуги' },
  { id: 'elevate', label: 'Отжать предлежащую часть' },
  { id: 'theatre', label: 'Перевод в операционную' },
  { id: 'deliver', label: 'Решение: родоразрешение' },
  { id: 'o2', label: 'Кислород матери через маску' },
  { id: 'oxy_up', label: 'Увеличить окситоцин' },
];

export interface LiveScenario {
  id: string;
  title: string;
  intro: string;
  stage: 'first' | 'second';
  seed: number;
  base: Partial<SynthParams>;
  /** Через сколько секунд начинается событие. */
  onsetSec: number;
  kind: 'prolonged' | 'subacute';
  event: Partial<SynthParams>;
  /** Наборы действий, каждый из которых устраняет причину; null — причину у постели не устранить. */
  fixes: LiveActionId[][] | null;
  /** Частичное улучшение (например, отжать головку при выпадении пуповины). */
  partial?: { action: LiveActionId; event: Partial<SynthParams> };
  /** Параметры после устранения причины. */
  after?: Partial<SynthParams>;
  onsetMessage?: string;
  veFinding: string;
  oxytocin: boolean;
  pushing: boolean;
  recoverySec?: number;
  teach: string;
}

export const LIVE_SCENARIOS: LiveScenario[] = [
  {
    id: 'hyper',
    title: 'Окситоцин, схватки «одна за другой»',
    intro: 'Первородящая, 40 нед, открытие 6 см. Окситоцин 12 мл/ч, скорость повышали час назад. Эпидуральной нет. АД 118/72.',
    stage: 'first',
    seed: 201,
    base: { baseline: 140, variability: 12, cycling: false, accelPerHour: 4, ctxPer10: 6, ctxDur: 70, ctxAmp: 60, tone: 16 },
    onsetSec: 150,
    kind: 'prolonged',
    event: { brady: 78, bradyVar: 0.8, ctxPer10: 7, tone: 24, accelPerHour: 0 },
    fixes: [['tocolysis'], ['stop_oxy', 'lateral']],
    after: { ctxPer10: 3, tone: 12, baseline: 145 },
    veFinding: 'Открытие 6 см, головка прижата, пуповина не определяется. Матка между схватками почти не расслабляется.',
    oxytocin: true,
    pushing: false,
    teach:
      'Причина — гиперстимуляция окситоцином: матка не расслабляется, межворсинчатое пространство не наполняется. Остановка окситоцина работает за минуты (период полувыведения ≈ 3–5 мин), поэтому при брадикардии её дополняют острым токолизом — он снимает тахисистолию быстрее всего.',
  },
  {
    id: 'hypotension',
    title: 'Сразу после эпидуральной',
    intro: 'Повторнородящая, 39 нед, открытие 5 см. 10 минут назад введена эпидуральная анальгезия. Лежит на спине. Окситоцина нет.',
    stage: 'first',
    seed: 211,
    base: { baseline: 135, variability: 13, cycling: false, accelPerHour: 6, ctxPer10: 3, ctxDur: 65, ctxAmp: 50, tone: 12 },
    onsetSec: 120,
    kind: 'prolonged',
    event: { brady: 85, bradyVar: 0.85, accelPerHour: 0 },
    fixes: [['lateral', 'fluids']],
    after: { baseline: 140 },
    onsetMessage: 'Анестезиолог: АД 78/40.',
    veFinding: 'Открытие 5 см, плодный пузырь цел, пуповина не определяется.',
    oxytocin: false,
    pushing: false,
    teach:
      'Гипотония после эпидуральной + аортокавальная компрессия на спине. Плод страдает вторично — лечите мать: левый бок, инфузия, вазопрессор. До события КТГ была нормальной, вариабельность сохранена — спонтанное восстановление весьма вероятно.',
  },
  {
    id: 'aortocaval',
    title: 'Легла на спину',
    intro: 'Первородящая, 38 нед, открытие 4 см. Только что легла на спину для осмотра. Окситоцина и эпидуральной нет. АД 108/66.',
    stage: 'first',
    seed: 223,
    base: { baseline: 130, variability: 12, cycling: false, accelPerHour: 6, ctxPer10: 3, ctxDur: 65, ctxAmp: 50, tone: 11 },
    onsetSec: 100,
    kind: 'prolonged',
    event: { brady: 90, bradyVar: 0.9, accelPerHour: 0 },
    fixes: [['lateral']],
    recoverySec: 50,
    veFinding: 'Открытие 4 см, плодный пузырь цел, пуповина не определяется.',
    oxytocin: false,
    pushing: false,
    teach: 'Самая простая причина и самая простая помощь: поворот на левый бок снимает сдавление нижней полой вены и аорты. Сначала посмотрите, как лежит женщина.',
  },
  {
    id: 'prolapse',
    title: 'После излития вод',
    intro: 'Повторнородящая, 39 нед, открытие 7 см, головка над входом в таз. Три минуты назад излились воды. Окситоцин 6 мл/ч.',
    stage: 'first',
    seed: 233,
    base: { baseline: 140, variability: 12, cycling: false, accelPerHour: 4, ctxPer10: 3.5, ctxDur: 70, ctxAmp: 55, tone: 12 },
    onsetSec: 90,
    kind: 'prolonged',
    event: { brady: 68, bradyVar: 0.6, accelPerHour: 0 },
    fixes: null,
    partial: { action: 'elevate', event: { brady: 95, bradyVar: 0.7 } },
    veFinding: 'Во влагалище пульсирующая петля пуповины!',
    oxytocin: true,
    pushing: false,
    teach:
      'Выпадение пуповины — одно из трёх острых событий: причина не устраняется у постели, ждать восстановления нельзя. Влагалищное исследование при брадикардии обязательно. Отжать предлежащую часть, коленно-локтевое положение / наполнить мочевой пузырь, остановить окситоцин, экстренное КС.',
  },
  {
    id: 'abruption',
    title: 'Преэклампсия, внезапная боль',
    intro: 'Первородящая, 36 нед, преэклампсия, открытие 4 см. Окситоцина нет. АД 155/100.',
    stage: 'first',
    seed: 241,
    base: { baseline: 145, variability: 10, cycling: false, accelPerHour: 2, ctxPer10: 4, ctxDur: 60, ctxAmp: 45, tone: 14 },
    onsetSec: 110,
    kind: 'prolonged',
    event: { brady: 70, bradyVar: 0.3, tone: 38, ctxPer10: 8, ctxAmp: 18, accelPerHour: 0 },
    fixes: null,
    onsetMessage: 'Акушерка: «Жалуется на сильную постоянную боль, появились кровянистые выделения».',
    veFinding: 'Открытие 4 см, плодный пузырь напряжён, из влагалища тёмная кровь со сгустками. Матка напряжена, болезненна.',
    oxytocin: false,
    pushing: false,
    teach:
      'Отслойка плаценты: боль, кровотечение, гипертонус, частые слабые сокращения, брадикардия с утратой вариабельности. Причина необратима — немедленное родоразрешение, параллельно подготовка к кровотечению у матери (кровь, коагулограмма).',
  },
  {
    id: 'subacute',
    title: 'Тужится на каждой схватке',
    intro: 'Первородящая, 40 нед, II период 60 мин, тужится 30 мин на каждой схватке. Окситоцин 8 мл/ч. Головка в узкой части полости таза.',
    stage: 'second',
    seed: 251,
    base: { baseline: 140, variability: 12, cycling: false, accelPerHour: 0, ctxPer10: 4.5, ctxDur: 70, ctxAmp: 65, tone: 14, decel: 'variable', decelDepth: 40, decelDur: 55, decelProb: 0.9, shoulders: false },
    onsetSec: 120,
    kind: 'subacute',
    event: { baseline: 148, ctxPer10: 5.5, ctxDur: 80, decelDepth: 60, decelDur: 110, decelProb: 1, decelVar: 0.8 },
    fixes: [['stop_push', 'stop_oxy'], ['stop_push', 'tocolysis']],
    after: { baseline: 145, ctxPer10: 3.5, decelDepth: 30, decelDur: 45, decelProb: 0.6 },
    recoverySec: 90,
    veFinding: 'Полное раскрытие, головка в узкой части полости малого таза, стреловидный шов в прямом размере.',
    oxytocin: true,
    pushing: true,
    teach:
      'Подострая гипоксия: децелерации > 90 с, между ними < 30 с стабильного ритма — плод не успевает восстановиться. pH снижается ≈ 0,01 за 2–3 мин. Прекратить потуги и окситоцин (при тахисистолии — токолиз). Если ритм не восстанавливается или головка низко и нет времени ждать — оперативные влагалищные роды.',
  },
  {
    id: 'rupture',
    title: 'Роды с рубцом на матке',
    intro: 'Повторнородящая, 39 нед, рубец после КС. Открытие 8 см. Окситоцина нет. Эпидуральная анальгезия.',
    stage: 'first',
    seed: 263,
    base: { baseline: 135, variability: 12, cycling: false, accelPerHour: 4, ctxPer10: 4, ctxDur: 70, ctxAmp: 55, tone: 12 },
    onsetSec: 130,
    kind: 'prolonged',
    event: { brady: 72, bradyVar: 0.4, ctxPer10: 1, ctxAmp: 15, accelPerHour: 0 },
    fixes: null,
    onsetMessage: 'Роженица: «Резкая боль внизу живота, даже сквозь эпидуральную». Схватки ослабли.',
    veFinding: 'Головка, ранее прижатая, отошла вверх. Скудные кровянистые выделения.',
    oxytocin: false,
    pushing: false,
    teach:
      'Разрыв матки по рубцу: боль, «пропавшие» схватки, отхождение предлежащей части вверх, брадикардия. Острое событие — немедленная лапаротомия. Брадикардия часто — первый признак разрыва.',
  },
];

export type MsgKind = 'info' | 'alarm' | 'find' | 'good';

export interface LiveMsg {
  t: number;
  text: string;
  kind: MsgKind;
}

export const MAX_MIN = 30;

/** Пошаговый симулятор «живой ленты». Без React — легко тестировать. */
export class LiveSim {
  readonly sc: LiveScenario;
  readonly hz = 2;
  readonly fhr: Float32Array;
  readonly toco: Float32Array;
  n = 0;
  t = 0;
  ph = 7.3;
  done = new Map<LiveActionId, number>();
  resolveAt: number | null = null;
  recoveredAt: number | null = null;
  decisionAt: number | null = null;
  deliveryEta: number | null = null;
  deliveredAt: number | null = null;
  finished = false;
  msgs: LiveMsg[] = [];
  private synth: CtgSynth;
  private announced = new Set<string>();

  constructor(sc: LiveScenario) {
    this.sc = sc;
    const len = MAX_MIN * 60 * this.hz;
    this.fhr = new Float32Array(len);
    this.toco = new Float32Array(len);
    this.synth = new CtgSynth(sc.seed, { ...DEFAULT_PARAMS, ...sc.base }, 1 / this.hz);
    this.msg(0, sc.intro, 'info');
  }

  get started() {
    return this.t >= this.sc.onsetSec;
  }

  /** Секунд от начала события. */
  get sinceOnset() {
    return Math.max(0, this.t - this.sc.onsetSec);
  }

  get lastFhr() {
    return this.n ? this.fhr[this.n - 1] : this.sc.base.baseline ?? 140;
  }

  private msg(t: number, text: string, kind: MsgKind) {
    this.msgs.push({ t, text, kind });
  }

  private once(key: string, fn: () => void) {
    if (this.announced.has(key)) return;
    this.announced.add(key);
    fn();
  }

  private fixed(): boolean {
    if (!this.sc.fixes) return false;
    return this.sc.fixes.some((set) => set.every((a) => this.done.has(a)));
  }

  params(): SynthParams {
    const sc = this.sc;
    let p: SynthParams = { ...DEFAULT_PARAMS, ...sc.base };
    const inEvent = this.started && this.recoveredAt === null;
    if (this.recoveredAt !== null) p = { ...p, ...sc.after };
    else if (inEvent) {
      p = { ...p, ...sc.event };
      if (sc.partial && this.done.has(sc.partial.action)) p = { ...p, ...sc.partial.event };
      if (sc.kind === 'prolonged') {
        const since = this.sinceOnset;
        if (since > 360) p.bradyVar = Math.max(0.2, p.bradyVar - (since - 360) / 500);
      }
    }
    // Эффекты действий на матку.
    if (sc.oxytocin && this.done.has('stop_oxy')) {
      const since = this.t - (this.done.get('stop_oxy') ?? this.t);
      const k = Math.min(1, since / 300);
      p.ctxPer10 = p.ctxPer10 - (p.ctxPer10 - Math.min(p.ctxPer10, 3.5)) * k;
      p.tone = p.tone - (p.tone - Math.min(p.tone, 13)) * k;
    }
    if (this.done.has('tocolysis')) {
      const since = this.t - (this.done.get('tocolysis') ?? this.t);
      if (since < 900) {
        p.ctxPer10 = Math.min(p.ctxPer10, 1.5);
        p.tone = Math.min(p.tone, 11);
      }
    }
    if (this.done.has('oxy_up') && sc.oxytocin && !this.done.has('stop_oxy')) {
      p.ctxPer10 = Math.max(p.ctxPer10, 6.5);
    }
    if (this.deliveredAt !== null) p.ctxPer10 = 0;
    return p;
  }

  act(id: LiveActionId) {
    if (this.finished || this.done.has(id)) return;
    const t = this.t;
    this.done.set(id, t);
    const sc = this.sc;
    switch (id) {
      case 'help':
        this.msg(t, 'Пришли ответственный врач и анестезиолог.', 'info');
        break;
      case 've':
        this.msg(t, `ВИ: ${sc.veFinding}`, 'find');
        break;
      case 'lateral':
        this.msg(t, 'Роженица повёрнута на левый бок.', 'info');
        break;
      case 'stop_oxy':
        this.msg(t, sc.oxytocin ? 'Окситоцин остановлен.' : 'Окситоцин не вводился.', 'info');
        break;
      case 'tocolysis':
        this.msg(t, 'Введён острый токолиз.', 'info');
        break;
      case 'fluids':
        this.msg(t, 'Струйная инфузия, анестезиолог ввёл вазопрессор.', 'info');
        break;
      case 'stop_push':
        this.msg(t, sc.pushing ? 'Потуги прекращены.' : 'Роженица не тужится.', 'info');
        break;
      case 'elevate':
        this.msg(t, sc.partial?.action === 'elevate' ? 'Предлежащая часть отжата рукой, коленно-локтевое положение.' : 'Отжимать нечего — предлежащая часть прижата, пуповины нет.', 'info');
        break;
      case 'theatre':
        this.msg(t, 'Операционная развёрнута, бригада на месте.', 'info');
        break;
      case 'deliver': {
        this.decisionAt = t;
        const dur = sc.stage === 'second' ? 240 : this.done.has('theatre') ? 300 : 600;
        this.deliveryEta = t + dur;
        this.msg(t, `Решение о родоразрешении. Ориентировочное время до извлечения ≈ ${Math.round(dur / 60)} мин${sc.stage === 'second' ? ' (вакуум-экстракция)' : this.done.has('theatre') ? ' (КС, операционная готова)' : ' (КС, нужен перевод)'}.`, 'alarm');
        break;
      }
      case 'o2':
        this.msg(t, 'Кислород через маску. ЧСС плода не изменилась.', 'info');
        break;
      case 'oxy_up':
        this.msg(t, sc.oxytocin ? 'Скорость окситоцина увеличена.' : 'Окситоцин начат.', 'alarm');
        break;
    }
    if (this.started && this.resolveAt === null && this.recoveredAt === null && this.fixed()) {
      this.resolveAt = t + (sc.recoverySec ?? 75);
    }
  }

  /** Продвинуть симуляцию на `sec` секунд. */
  advance(sec: number) {
    const dt = 1 / this.hz;
    const steps = Math.round(sec * this.hz);
    for (let i = 0; i < steps && !this.finished; i++) this.step(dt);
  }

  private step(dt: number) {
    const sc = this.sc;
    if (this.n >= this.fhr.length) {
      this.finish('Время сценария истекло.');
      return;
    }
    const p = this.params();
    const s = this.synth.step(p);
    this.fhr[this.n] = s.fhr;
    this.toco[this.n] = s.toco;
    this.n++;
    this.t += dt;
    const t = this.t;

    if (this.started) {
      this.once('onset', () => {
        if (sc.onsetMessage) this.msg(t, sc.onsetMessage, 'find');
      });
    }
    const since = this.sinceOnset;
    const inEvent = this.started && this.recoveredAt === null && this.deliveredAt === null;
    if (inEvent && sc.kind === 'prolonged') {
      if (since >= 60) this.once('alarm', () => this.msg(t, 'Монитор: тревога — ЧСС плода < 100 уд/мин.', 'alarm'));
      for (const m of [3, 6, 9, 12, 15]) if (since >= m * 60) this.once(`m${m}`, () => this.msg(t, `${m} минут от начала децелерации.`, 'alarm'));
    }

    // pH
    if (inEvent) {
      let rate = sc.kind === 'prolonged' ? 0.01 / 60 : 0.01 / 150;
      if (sc.partial && this.done.has(sc.partial.action)) rate *= 0.5;
      this.ph -= rate * dt;
    } else if (this.recoveredAt !== null) {
      this.ph = Math.min(7.3, this.ph + (0.002 / 60) * dt);
    }

    if (this.started && this.resolveAt === null && this.recoveredAt === null && this.deliveredAt === null && this.fixed()) {
      this.resolveAt = t + (sc.recoverySec ?? 75);
    }
    if (this.resolveAt !== null && this.recoveredAt === null && t >= this.resolveAt) {
      this.recoveredAt = t;
      this.msg(t, 'ЧСС плода возвращается к базальному уровню.', 'good');
    }
    if (this.recoveredAt !== null && this.decisionAt === null && t - this.recoveredAt >= 240) {
      this.finish('Ритм восстановился и стабилен 4 мин.');
    }
    if (this.deliveryEta !== null && t >= this.deliveryEta && this.deliveredAt === null) {
      this.deliveredAt = t;
      this.finish(`Ребёнок извлечён. pH артерии пуповины ≈ ${this.ph.toFixed(2)}.`);
    }
  }

  finish(text: string) {
    if (this.finished) return;
    this.finished = true;
    this.msg(this.t, text, this.ph < 7.1 ? 'alarm' : 'good');
  }
}

export interface DebriefRow {
  label: string;
  target: string;
  actual: string;
  ok: boolean | null;
}

export interface Debrief {
  score: number;
  rows: DebriefRow[];
  notes: string[];
  ph: number;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function liveDebrief(sim: LiveSim): Debrief {
  const sc = sim.sc;
  const on = sc.onsetSec;
  const at = (id: LiveActionId) => {
    const v = sim.done.get(id);
    return v === undefined ? null : v - on;
  };
  const rows: DebriefRow[] = [];
  const notes: string[] = [];
  let score = 100;

  const firstAction = Math.min(...[...sim.done.values()].filter((v) => v >= on).map((v) => v - on), Infinity);
  const reacted = Number.isFinite(firstAction);
  const reactLimit = sc.kind === 'prolonged' ? 180 : 300;
  rows.push({ label: 'Первое действие после начала события', target: sc.kind === 'prolonged' ? '≤ 3 мин' : '≤ 5 мин', actual: reacted ? mmss(firstAction) : 'нет', ok: reacted && firstAction <= reactLimit });
  if (!reacted) score -= 40;
  else if (firstAction > reactLimit) score -= 15;

  const help = at('help');
  rows.push({ label: 'Позвать помощь', target: '≤ 3 мин', actual: help === null ? 'нет' : help < 0 ? 'заранее' : mmss(help), ok: help !== null && help <= 180 });
  if (help === null) score -= 10;

  const ve = at('ve');
  if (sc.kind === 'prolonged') {
    rows.push({ label: 'Влагалищное исследование', target: '≤ 3 мин', actual: ve === null ? 'нет' : mmss(Math.max(0, ve)), ok: ve !== null && ve <= 180 });
    if (ve === null) score -= sc.id === 'prolapse' ? 25 : 10;
  }

  if (sc.fixes) {
    const fixSet = sc.fixes.find((set) => set.every((a) => sim.done.has(a)));
    const fixTime = fixSet ? Math.max(...fixSet.map((a) => (sim.done.get(a) ?? 0) - on)) : null;
    rows.push({ label: 'Причина устранена', target: sc.kind === 'prolonged' ? '≤ 3–6 мин' : '≤ 5 мин', actual: fixTime === null ? 'нет' : mmss(Math.max(0, fixTime)), ok: fixTime !== null && fixTime <= 360 });
    if (fixTime === null) score -= 30;
    else if (fixTime > 360) score -= 10;
  }

  const recovered = sim.recoveredAt !== null ? sim.recoveredAt - on : null;
  const theatre = at('theatre');
  const decision = sim.decisionAt !== null ? sim.decisionAt - on : null;
  const needDelivery = !sc.fixes || recovered === null || (recovered !== null && decision !== null && decision < recovered);

  if (sc.kind === 'prolonged') {
    const needTheatre = recovered === null || recovered > 360;
    if (needTheatre) {
      rows.push({ label: 'Операционная', target: '≤ 6 мин', actual: theatre === null ? 'нет' : mmss(Math.max(0, theatre)), ok: theatre !== null && theatre <= 360 });
      if (theatre === null || theatre > 360) score -= 10;
    }
    if (!sc.fixes || recovered === null || recovered > 540) {
      const limit = sc.fixes ? 540 : 180;
      rows.push({ label: 'Решение о родоразрешении', target: sc.fixes ? '≤ 9 мин' : 'сразу (острое событие)', actual: decision === null ? 'нет' : mmss(Math.max(0, decision)), ok: decision !== null && decision <= limit });
      if (decision === null) score -= 30;
      else if (decision > limit) score -= 15;
    }
    if (sim.deliveredAt !== null) {
      const d = sim.deliveredAt - on;
      rows.push({ label: 'Рождение', target: '≤ 15 мин', actual: mmss(d), ok: d <= 900 });
      if (d > 900) score -= 10;
    }
  } else if (needDelivery && recovered === null) {
    rows.push({ label: 'Решение о родоразрешении при сохраняющейся подострой гипоксии', target: 'без промедления', actual: decision === null ? 'нет' : mmss(Math.max(0, decision)), ok: decision !== null });
    if (decision === null) score -= 25;
  }

  if (sc.fixes && recovered !== null && decision !== null && decision >= recovered) {
    notes.push('Родоразрешение после восстановления ритма — без показаний со стороны плода.');
    score -= 15;
  }
  if (sim.done.has('oxy_up')) {
    notes.push('Увеличение окситоцина при децелерации усугубляет гипоксию.');
    score -= 20;
  }
  if (sim.done.has('o2')) notes.push('Кислород матери с нормальной сатурацией не улучшает состояние плода — время лучше потратить на устранение причины.');
  if (sc.oxytocin && !sim.done.has('stop_oxy') && sim.started) {
    notes.push('Окситоцин не был остановлен.');
    score -= 5;
  }
  if (sc.id === 'prolapse' && !sim.done.has('elevate')) notes.push('При выпадении пуповины до извлечения нужно отжимать предлежащую часть.');

  return { score: Math.max(0, Math.min(100, Math.round(score))), rows, notes, ph: sim.ph };
}
