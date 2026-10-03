import type { Keyframe } from '../ktg/synth';
import { EMPTY_CONTEXT, EMPTY_FEATURES, type ClinicalContext, type CompensationStage, type CtgFeatures, type FigoCategory, type HypoxiaType, type Strategy } from '../ktg/types';

export interface TrainerCase {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  /** Клиническая вводная. */
  intro: string;
  minutes: number;
  seed: number;
  frames: Keyframe[];
  /** Отрезок (мин) для проверки базального ритма. */
  baselineWindow?: [number, number];
  /** Правильная разметка «на сейчас» (конец ленты). */
  features: CtgFeatures;
  answer: {
    hypoxia: HypoxiaType;
    stage?: CompensationStage;
    figo: FigoCategory;
    strategy: Strategy[];
  };
  /** Разбор: что происходит с плодом. */
  teach: string;
  keyPoints: string[];
}

const ctx = (p: Partial<ClinicalContext>): ClinicalContext => ({ ...EMPTY_CONTEXT, ...p });
const feat = (p: Partial<CtgFeatures>): CtgFeatures => ({ ...EMPTY_FEATURES, ...p, context: p.context ?? EMPTY_CONTEXT });

export const CASES: TrainerCase[] = [
  {
    id: 'normal',
    title: 'Активная фаза, всё спокойно',
    level: 1,
    intro: 'Повторнородящая, 39 нед. Самопроизвольные роды, открытие 5 см. Воды светлые, температура 36,7 °C. Окситоцина нет.',
    minutes: 40,
    seed: 11,
    frames: [
      { at: 0, p: { baseline: 135, variability: 13, cycling: true, accelPerHour: 10, ctxPer10: 3, ctxDur: 70, ctxAmp: 50, decel: 'none' }, quiet: false, forMin: 14 },
      { at: 14, p: {}, quiet: true, forMin: 13 },
      { at: 27, p: {}, quiet: false, forMin: 30 },
    ],
    features: feat({ stage: 'first', gaWeeks: 39, baseline: 135, anchorBaseline: 135, trend: 'stable', variability: 'normal', cycling: 'present', accelerations: 'present', decels: 'none', contractions: 3 }),
    answer: { hypoxia: 'none', figo: 'normal', strategy: ['observe'] },
    teach:
      'Стабильный базальный ритм 135, вариабельность 5–25, акцелерации. С 14-й по 27-ю минуту вариабельность меньше и нет акцелераций — это фаза спокойного сна, после неё возвращается активность. Цикличность — признак здоровой, не угнетённой ЦНС плода.',
    keyPoints: ['Цикличность (смена сна и активности) — один из самых надёжных признаков благополучия.', 'Отсутствие акцелераций во время сна — норма.'],
  },
  {
    id: 'early',
    title: 'Децелерации «зеркально» схваткам',
    level: 1,
    intro: 'Первородящая, 40 нед. Открытие 8–9 см, головка прижата ко входу/в узкой части. Окситоцина нет, температура нормальная.',
    minutes: 30,
    seed: 23,
    frames: [{ at: 0, p: { baseline: 130, variability: 12, cycling: false, accelPerHour: 4, ctxPer10: 4, ctxDur: 75, ctxAmp: 60, decel: 'early', decelDepth: 18, decelProb: 0.9 } }],
    features: feat({ stage: 'first', gaWeeks: 40, baseline: 130, anchorBaseline: 130, variability: 'normal', cycling: 'unknown', accelerations: 'present', decels: 'repetitive', decelNature: 'early', decelsMin: 25, contractions: 4 }),
    answer: { hypoxia: 'none', figo: 'normal', strategy: ['observe'] },
    teach:
      'Неглубокие децелерации начинаются и заканчиваются вместе со схваткой, их минимум совпадает с пиком схватки. Это рефлекторный ответ блуждающего нерва на сдавление головки — не гипоксия. Базальный ритм стабилен, вариабельность нормальная.',
    keyPoints: ['Ранние децелерации — компрессия головки, а не гипоксия.', 'Они ожидаемы в конце I и во II периоде.'],
  },
  {
    id: 'compensated',
    title: 'Повторяющиеся децелерации, плод справляется',
    level: 1,
    intro: 'Первородящая, 40 нед. Открытие 6 см, воды излились 3 ч назад, светлые. Окситоцина нет. Лежит на левом боку.',
    minutes: 40,
    seed: 37,
    frames: [{ at: 0, p: { baseline: 140, variability: 13, cycling: true, accelPerHour: 6, ctxPer10: 4, ctxDur: 70, ctxAmp: 55, decel: 'variable', decelDepth: 40, decelDur: 45, decelProb: 0.8, shoulders: true } }],
    features: feat({ stage: 'first', gaWeeks: 40, baseline: 140, anchorBaseline: 140, trend: 'stable', variability: 'normal', cycling: 'present', accelerations: 'present', decels: 'repetitive', decelNature: 'rapid', decelsMin: 35, contractions: 4 }),
    answer: { hypoxia: 'gradual', stage: 'compensated', figo: 'suspicious', strategy: ['correct', 'observe'] },
    teach:
      'Быстрые («вариабельные») децелерации с «плечиками» — барорецепторный рефлекс на сдавление пуповины. Между ними базальный ритм стабилен, вариабельность нормальна: плод испытывает гипоксический стресс, но полностью компенсирует его. Важно не число децелераций, а то, что происходит с базальным ритмом и вариабельностью дальше.',
    keyPoints: ['Децелерации — способ защитить миокард, а не признак повреждения.', 'Следите за базальным ритмом: его рост — следующая стадия.', '«Плечики» — признак здорового плода, а не угрозы.'],
  },
  {
    id: 'sleep',
    title: '«Плоская» лента без децелераций',
    level: 1,
    intro: 'Повторнородящая, 38 нед. Латентная/начало активной фазы. 20 минут назад были хорошие акцелерации. Лекарств не получала.',
    minutes: 40,
    seed: 41,
    frames: [
      { at: 0, p: { baseline: 138, variability: 14, cycling: true, accelPerHour: 12, ctxPer10: 2, ctxDur: 60, ctxAmp: 40 }, quiet: false, forMin: 15 },
      { at: 15, p: {}, quiet: true, forMin: 40 },
    ],
    baselineWindow: [15, 40],
    features: feat({ stage: 'first', gaWeeks: 38, baseline: 138, anchorBaseline: 138, variability: 'reduced', variabilityMin: 25, cycling: 'present', accelerations: 'absent', decels: 'none', contractions: 2 }),
    answer: { hypoxia: 'none', figo: 'suspicious', strategy: ['observe'] },
    teach:
      'Последние 25 минут вариабельность ниже 5 уд/мин и нет акцелераций, но базальный ритм тот же, что и в активной фазе, децелераций нет. Гипоксия не начинается с потери вариабельности — ей предшествуют децелерации и рост базального ритма. Это глубокий сон; по FIGO — «сомнительная» (вариабельность < 5 менее 50 мин), что требует продлить наблюдение, а не вмешиваться.',
    keyPoints: ['Сон плода длится обычно до 40–50 мин.', 'Сниженная вариабельность без децелераций и роста базального ритма — не гипоксия.'],
  },
  {
    id: 'tachysystole',
    title: 'Окситоцин и поздние децелерации',
    level: 2,
    intro: 'Первородящая, 41 нед. Родостимуляция окситоцином, скорость увеличивали каждые 30 мин. Открытие 5 см. АД 120/75.',
    minutes: 40,
    seed: 53,
    frames: [
      { at: 0, p: { baseline: 135, variability: 12, cycling: false, accelPerHour: 4, ctxPer10: 4, ctxDur: 70, ctxAmp: 55, decel: 'none' } },
      { at: 15, p: { ctxPer10: 6, ctxDur: 65, decel: 'late', decelDepth: 18, decelDur: 75, decelProb: 0.9, accelPerHour: 2 } },
    ],
    features: feat({ stage: 'first', gaWeeks: 41, baseline: 135, anchorBaseline: 135, trend: 'stable', variability: 'normal', cycling: 'unknown', accelerations: 'present', decels: 'repetitive', decelNature: 'gradual', decelsMin: 22, contractions: 6, context: ctx({ oxytocin: true, postterm: true }) }),
    answer: { hypoxia: 'gradual', stage: 'compensated', figo: 'suspicious', strategy: ['correct'] },
    teach:
      'После увеличения окситоцина схваток стало 6 за 10 мин, появились постепенные («поздние») децелерации — хеморецепторный ответ: матка не успевает расслабиться, межворсинчатый кровоток не восстанавливается. Базальный ритм и вариабельность пока стабильны — плод компенсирует. Это лучший момент, чтобы устранить причину: снизить/остановить окситоцин, при необходимости острый токолиз.',
    keyPoints: ['Тахисистолия — самая частая и самая обратимая причина гипоксии.', 'Не повышайте окситоцин, когда появились децелерации.'],
  },
  {
    id: 'catecholamine',
    title: 'Базальный ритм «ползёт» вверх',
    level: 2,
    intro: 'Первородящая, 40 нед. Окситоцин 3 ч. Открытие 7 см. Исходный базальный ритм при поступлении 135 уд/мин. Температура 36,9 °C.',
    minutes: 50,
    seed: 61,
    frames: [
      { at: 0, p: { baseline: 135, variability: 13, cycling: false, accelPerHour: 6, ctxPer10: 5, ctxDur: 70, ctxAmp: 55, decel: 'variable', decelDepth: 40, decelDur: 50, decelProb: 0.85, shoulders: true } },
      { at: 15, p: { baseline: 137, accelPerHour: 0 } },
      { at: 40, p: { baseline: 155, variability: 14, decelDepth: 50, decelDur: 60 } },
    ],
    baselineWindow: [42, 50],
    features: feat({ stage: 'first', gaWeeks: 40, baseline: 155, anchorBaseline: 135, trend: 'rising', variability: 'normal', cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'rapid', decelsMin: 50, decelsWorsening: true, contractions: 5, context: ctx({ oxytocin: true }) }),
    answer: { hypoxia: 'gradual', stage: 'catecholamine', figo: 'suspicious', strategy: ['correct'] },
    teach:
      'Децелерации уже не справляются: плод выбрасывает катехоламины — базальный ритм вырос со 135 до 155 (≈ 15 %), исчезли акцелерации. Формально по FIGO это всё ещё «сомнительная» КТГ (155 в пределах нормы), но физиологически плод компенсирует с напряжением. Остановите окситоцин; если причину не устранить — планируйте родоразрешение до наступления декомпенсации.',
    keyPoints: ['Сравнивайте базальный ритм с исходным, а не с «нормой 110–160».', 'Рост ≥ 10 % + децелерации = катехоламиновая стадия.'],
  },
  {
    id: 'subacute',
    title: 'Потуги на каждой схватке',
    level: 2,
    intro: 'Первородящая, 40 нед. II период 70 мин, потужной — 35 мин, тужится на каждой схватке. Окситоцин 8 мл/ч. Головка в узкой части.',
    minutes: 30,
    seed: 71,
    frames: [
      { at: 0, p: { baseline: 140, variability: 13, cycling: false, accelPerHour: 0, ctxPer10: 4, ctxDur: 70, ctxAmp: 65, decel: 'variable', decelDepth: 40, decelDur: 55, decelProb: 0.9, shoulders: false } },
      { at: 12, p: { baseline: 145, ctxPer10: 5, ctxDur: 80, decelDepth: 60, decelDur: 105, decelProb: 1, decelVar: 0.8 } },
    ],
    baselineWindow: [0, 12],
    features: feat({ stage: 'second', gaWeeks: 40, baseline: 145, anchorBaseline: 140, trend: 'stable', variability: 'normal', cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'rapid', decelsMin: 18, subacutePattern: true, contractions: 5, context: ctx({ oxytocin: true, pushing: true }) }),
    answer: { hypoxia: 'subacute', figo: 'suspicious', strategy: ['resuscitate'] },
    teach:
      'Последние 18 минут децелерации длятся 90–120 с, а стабильного ритма между ними не больше 20–30 с: плод больше времени проводит в децелерации, чем на базальном ритме. Это подострая гипоксия — pH падает примерно на 0,01 за 2–3 мин. Остановите потуги и окситоцин, при тахисистолии — острый токолиз. Если ритм не восстанавливается — быстрое родоразрешение.',
    keyPoints: ['Считайте не децелерации, а время на базальном ритме между ними.', 'Самая частая причина — потуги на каждой схватке + окситоцин.'],
  },
  {
    id: 'acute-epidural',
    title: 'Брадикардия после эпидуральной',
    level: 2,
    intro: 'Повторнородящая, 39 нед. 10 минут назад начата эпидуральная анальгезия. Окситоцин 4 мл/ч. АД сейчас 82/45. Лежит на спине. Децелерация началась 4 минуты назад.',
    minutes: 20,
    seed: 83,
    frames: [
      { at: 0, p: { baseline: 140, variability: 13, cycling: false, accelPerHour: 6, ctxPer10: 3, ctxDur: 70, ctxAmp: 50, brady: null } },
      { at: 15.6, p: { brady: 80, bradyVar: 0.75, accelPerHour: 0 } },
    ],
    baselineWindow: [0, 15],
    features: feat({ stage: 'first', gaWeeks: 39, baseline: 140, anchorBaseline: 140, variability: 'normal', cycling: 'unknown', accelerations: 'present', decels: 'occasional', decelNature: 'rapid', prolonged: true, prolongedMin: 4, prolongedVarPreserved: 'present', contractions: 3, context: ctx({ oxytocin: true, epidural: true, hypotension: true, supine: true }) }),
    answer: { hypoxia: 'acute', figo: 'suspicious', strategy: ['resuscitate'] },
    teach:
      'Пролонгированная децелерация до 80 уд/мин на фоне гипотонии после эпидуральной анальгезии и положения на спине. До события КТГ была нормальной, внутри децелерации вариабельность сохранена — шансы на восстановление высоки, если устранить причину: левый бок, инфузия, вазопрессор, остановить окситоцин. Параллельно — правило 3-6-9-12-15: к 6 мин операционная, к 9 мин нет восстановления — решение о родоразрешении.',
    keyPoints: ['Острая гипоксия: pH ≈ −0,01 в минуту.', 'Сохранённая вариабельность в первые 3 мин и нормальная КТГ до события — благоприятные признаки.', 'Лечите мать: плод страдает вторично.'],
  },
  {
    id: 'abruption',
    title: 'Боль, кровь и брадикардия',
    level: 3,
    intro: 'Повторнородящая, 37 нед, преэклампсия. Внезапная постоянная боль в животе, кровянистые выделения. Матка напряжена между схватками. Брадикардия 4-ю минуту.',
    minutes: 18,
    seed: 97,
    frames: [
      { at: 0, p: { baseline: 150, variability: 8, cycling: false, accelPerHour: 0, ctxPer10: 5, ctxDur: 55, ctxAmp: 30, tone: 18, decel: 'late', decelDepth: 12, decelDur: 70, decelProb: 0.7 } },
      { at: 11, p: { tone: 35, ctxPer10: 7, ctxAmp: 20 } },
      { at: 13.8, p: { brady: 70, bradyVar: 0.2, decel: 'none' } },
    ],
    baselineWindow: [0, 11],
    features: feat({ stage: 'first', gaWeeks: 37, baseline: 150, anchorBaseline: 150, variability: 'normal', cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'gradual', decelsMin: 13, prolonged: true, prolongedMin: 4, prolongedVarPreserved: 'absent', contractions: 7, hypertonus: true, context: ctx({ bleeding: true }) }),
    answer: { hypoxia: 'acute', figo: 'suspicious', strategy: ['deliver'] },
    teach:
      'Острое событие — отслойка плаценты: боль, кровотечение, гипертонус, частые слабые схватки, а затем пролонгированная брадикардия с утратой вариабельности. Причину нельзя устранить у постели, поэтому правило «ждём до 9 минут» не применяется: немедленное родоразрешение, вызов бригады, подготовка к кровотечению у матери и реанимации новорождённого.',
    keyPoints: ['Три «острых события» (отслойка, выпадение пуповины, разрыв матки) — восстановления не ждать.', 'Утрата вариабельности внутри брадикардии — плохой прогностический признак.'],
  },
  {
    id: 'chronic',
    title: 'Поступление: 41+3 нед, «плохо шевелится»',
    level: 3,
    intro: 'Первородящая, 41+3 нед. Жалобы на снижение шевелений сутки. По УЗИ — маловодие, предполагаемая масса 2900 г. Схваток нет, есть нерегулярные сокращения. Это первая КТГ.',
    minutes: 40,
    seed: 101,
    frames: [{ at: 0, p: { baseline: 158, variability: 3.2, cycling: false, accelPerHour: 0, ctxPer10: 2.5, ctxDur: 60, ctxAmp: 22, decel: 'late', decelDepth: 9, decelDur: 70, decelProb: 0.9, decelVar: 1 } }],
    features: feat({ stage: 'antenatal', gaWeeks: 41, baseline: 158, variability: 'reduced', variabilityMin: 40, cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'gradual', decelsMin: 40, shallowDecels: true, contractions: 2, context: ctx({ fgr: true, postterm: true }) }),
    answer: { hypoxia: 'chronic', figo: 'pathological', strategy: ['deliver'] },
    teach:
      'Для 41 недели базальный ритм 158 выше ожидаемого, вариабельность < 5, нет цикличности и акцелераций, на каждое сокращение — неглубокие поздние децелерации. «Неглубокие» не значит «безопасные»: у плода с исчерпанным резервом нет сил на глубокую децелерацию. Это хроническая гипоксия — схватки он не перенесёт. Не начинать родовозбуждение, обсудить кесарево сечение.',
    keyPoints: ['При поступлении сравнивайте базальный ритм со сроком.', 'Неглубокие децелерации + отсутствие вариабельности и цикличности — тревожная комбинация.'],
  },
  {
    id: 'chorio',
    title: 'Тахикардия без децелераций',
    level: 2,
    intro: 'Первородящая, 39 нед. Безводный промежуток 19 ч. Открытие 4 см. Температура только что 38,3 °C, ЧСС матери 108. Исходный базальный ритм 140.',
    minutes: 50,
    seed: 113,
    frames: [
      { at: 0, p: { baseline: 145, variability: 11, cycling: false, accelPerHour: 2, ctxPer10: 3, ctxDur: 65, ctxAmp: 45, decel: 'none' } },
      { at: 45, p: { baseline: 170, variability: 7 } },
    ],
    baselineWindow: [44, 50],
    features: feat({ stage: 'first', gaWeeks: 39, baseline: 170, anchorBaseline: 140, trend: 'rising', variability: 'normal', cycling: 'absent', accelerations: 'absent', decels: 'none', contractions: 3, context: ctx({ fever: true }) }),
    answer: { hypoxia: 'nonhypoxic', figo: 'suspicious', strategy: ['cause'] },
    teach:
      'Базальный ритм вырос на ≈ 20 % без единой децелерации. При гипоксии плод сначала отвечает децелерациями, и только потом растёт базальный ритм. Рост без децелераций — признак воспаления/инфекции (здесь — хориоамнионит). Отсутствие цикличности говорит о вовлечении ЦНС. Лечить инфекцию; жаропонижающие у матери не убирают воспаление у плода. Воспаление снижает переносимость гипоксии — порог для родоразрешения ниже.',
    keyPoints: ['Тахикардия без децелераций ≠ гипоксия.', 'Инфекция + гипоксия — сочетание с худшими исходами.'],
  },
  {
    id: 'sinus',
    title: 'Гладкая волна',
    level: 3,
    intro: 'Повторнородящая, 34 нед. Резус-отрицательная, антитела в высоком титре. Снижение шевелений. Схваток нет.',
    minutes: 35,
    seed: 127,
    frames: [{ at: 0, p: { baseline: 145, variability: 0, sinus: 11, cycling: false, accelPerHour: 0, ctxPer10: 0.8, ctxDur: 50, ctxAmp: 15, decel: 'none' } }],
    features: feat({ stage: 'antenatal', gaWeeks: 34, baseline: 145, variability: 'reduced', variabilityMin: 35, sinusoidal: true, cycling: 'absent', accelerations: 'absent', decels: 'none', contractions: 0 }),
    answer: { hypoxia: 'nonhypoxic', figo: 'pathological', strategy: ['cause', 'deliver'] },
    teach:
      'Правильная синусоида 3–4 цикла в минуту, амплитуда 5–15 уд/мин, нет вариабельности, нет акцелераций, всё держится более 30 мин. Классическая причина — анемия плода (изоиммунизация, фетоматеринская трансфузия, кровотечение из vasa praevia). Нужны срочное УЗИ с допплерометрией СМА и решение о родоразрешении/внутриутробной трансфузии.',
    keyPoints: ['Синусоидальный ритм — не гипоксический, но угрожающий паттерн.', 'Отличайте от псевдосинусоидального (после опиоидов, при сосании пальца): у того есть вариабельность и цикличность.'],
  },
  {
    id: 'zigzag',
    title: 'Скачет ЧСС во втором периоде',
    level: 3,
    intro: 'Первородящая, 40 нед. Потужной период 25 мин, тужится активно. Окситоцина нет. Головка на тазовом дне.',
    minutes: 30,
    seed: 131,
    frames: [
      { at: 0, p: { baseline: 140, variability: 13, cycling: false, accelPerHour: 0, ctxPer10: 4.5, ctxDur: 70, ctxAmp: 65, decel: 'variable', decelDepth: 35, decelDur: 50, decelProb: 0.8, shoulders: false } },
      { at: 21, p: { variability: 34 } },
    ],
    baselineWindow: [0, 20],
    features: feat({ stage: 'second', gaWeeks: 40, baseline: 140, anchorBaseline: 140, trend: 'stable', variability: 'increased', variabilityMin: 8, zigzag: true, cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'rapid', decelsMin: 25, contractions: 4, context: ctx({ pushing: true }) }),
    answer: { hypoxia: 'gradual', stage: 'catecholamine', figo: 'suspicious', strategy: ['correct', 'resuscitate'] },
    teach:
      'Амплитуда колебаний внезапно превысила 25 уд/мин — ZigZag. Это проявление нестабильной вегетативной регуляции при быстро нарастающей гипоксии (чаще всего — активные потуги). По FIGO это пока «сомнительная» (< 30 мин), но физиологически — повод немедленно действовать: прекратить потуги, при необходимости — ускорить рождение.',
    keyPoints: ['ZigZag во II периоде ассоциирован с ацидозом и низкой оценкой по Апгар.', 'Не путайте повышенную вариабельность с «очень хорошей» КТГ.'],
  },
  {
    id: 'decompensated',
    title: 'Высокий ритм, «плоско», поздние децелерации',
    level: 3,
    intro: 'Первородящая, 40 нед. Окситоцин 5 ч. Открытие 6 см. При поступлении базальный ритм был 135. Предыдущую КТГ описали как «тахикардия, децелерации».',
    minutes: 40,
    seed: 149,
    frames: [
      { at: 0, p: { baseline: 165, variability: 7, cycling: false, accelPerHour: 0, ctxPer10: 4, ctxDur: 70, ctxAmp: 55, decel: 'late', decelDepth: 22, decelDur: 80, decelProb: 0.95, decelVar: 1 } },
      { at: 10, p: { variability: 3 } },
    ],
    features: feat({ stage: 'first', gaWeeks: 40, baseline: 165, anchorBaseline: 135, trend: 'stable', variability: 'reduced', variabilityMin: 30, cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'gradual', decelsMin: 40, contractions: 4, context: ctx({ oxytocin: true }) }),
    answer: { hypoxia: 'gradual', stage: 'decompensated', figo: 'pathological', strategy: ['deliver'] },
    teach:
      'Путь пройден: децелерации → рост базального ритма (135 → 165) → теперь вариабельность упала ниже 5 уд/мин. Сниженная вариабельность при гипоксии означает, что гипоксия затронула ЦНС — декомпенсация. Остановить окситоцин, но это уже не решает проблему: ускоренное родоразрешение.',
    keyPoints: ['Потеря вариабельности на фоне децелераций и высокого ритма — декомпенсация.', 'Не задерживайте родоразрешение ради дополнительных методов.'],
  },
  {
    id: 'terminal',
    title: 'Ступеньки вниз',
    level: 3,
    intro: 'Первородящая, 41 нед. Несколько часов патологической КТГ, базальный ритм был 170. Открытие 7 см.',
    minutes: 30,
    seed: 157,
    frames: [
      { at: 0, p: { baseline: 165, variability: 3, cycling: false, accelPerHour: 0, ctxPer10: 4, ctxDur: 70, ctxAmp: 50, decel: 'late', decelDepth: 25, decelDur: 90, decelProb: 1, decelVar: 1 } },
      { at: 8, p: { baseline: 150 } },
      { at: 16, p: { baseline: 130 } },
      { at: 26, p: { baseline: 108 } },
    ],
    baselineWindow: [26, 30],
    features: feat({ stage: 'first', gaWeeks: 41, baseline: 108, anchorBaseline: 135, trend: 'falling', variability: 'reduced', variabilityMin: 60, cycling: 'absent', accelerations: 'absent', decels: 'repetitive', decelNature: 'gradual', decelsMin: 60, contractions: 4, context: ctx({ postterm: true }) }),
    answer: { hypoxia: 'gradual', stage: 'terminal', figo: 'pathological', strategy: ['deliver'] },
    teach:
      'После каждой децелерации ритм не возвращается к прежнему уровню — базальный ритм ступенчато падает («лестница к смерти»). Миокард исчерпал запасы гликогена. Формально базальный ритм «в норме» — 108–110, но это худшая точка пути. Немедленное родоразрешение, реанимационная бригада.',
    keyPoints: ['Снижение базального ритма после тахикардии — не улучшение, а истощение.', 'Нестабильный базальный ритм + отсутствие вариабельности = претерминальное состояние.'],
  },
];
