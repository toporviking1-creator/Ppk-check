import { action, type ActionId } from './actions';
import { DECEL_NATURE_LABEL, HYPOXIA_LABEL, STAGE_COMP_LABEL } from './labels';
import type {
  ActionItem,
  CompensationStage,
  CtgFeatures,
  FigoCategory,
  HypoxiaType,
  Interpretation,
  PhysioCategory,
  Strategy,
  Urgency,
} from './types';

/**
 * Ориентир верхней границы базального ритма для срока: с увеличением срока
 * парасимпатическая регуляция созревает и базальный ритм снижается.
 * Используется только как вспомогательный признак (хроническая гипоксия, инфекция).
 */
export function expectedBaselineMax(gaWeeks?: number): number {
  if (gaWeeks === undefined) return 160;
  if (gaWeeks >= 40) return 150;
  if (gaWeeks >= 37) return 155;
  return 160;
}

export function baselineRisePct(baseline?: number, anchor?: number): number | undefined {
  if (baseline === undefined || anchor === undefined || anchor <= 0) return undefined;
  return Math.round(((baseline - anchor) / anchor) * 100);
}

/** Классификация по FIGO 2015 (используется в КР РФ «Признаки внутриутробной гипоксии плода…», 2023). */
export function figoCategory(f: CtgFeatures): { category: FigoCategory; reasons: string[] } {
  const path: string[] = [];
  const susp: string[] = [];
  const b = f.baseline;
  const vMin = f.variabilityMin;

  if (b !== undefined) {
    if (b < 100) path.push(`базальный ритм ${b} < 100 уд/мин`);
    else if (b < 110) susp.push(`базальный ритм ${b} (100–109 уд/мин)`);
    else if (b > 160) susp.push(`тахикардия ${b} > 160 уд/мин`);
  }

  if (f.sinusoidal) path.push('синусоидальный ритм');
  if (f.variability === 'reduced') {
    if (vMin !== undefined && vMin >= 50) path.push(`сниженная вариабельность > 50 мин (${vMin} мин)`);
    else susp.push(vMin !== undefined ? `сниженная вариабельность ${vMin} мин (< 50 мин)` : 'сниженная вариабельность (уточните длительность: патология при > 50 мин)');
  }
  if (f.variability === 'increased' || f.zigzag) {
    if (vMin !== undefined && vMin >= 30) path.push(`повышенная (сальтаторная) вариабельность > 30 мин (${vMin} мин)`);
    else susp.push('повышенная вариабельность / ZigZag < 30 мин');
  }

  const lateLike = f.decelNature === 'gradual' || f.decelNature === 'mixed';
  // Ранние децелерации (компрессия головки) по FIGO не связаны с гипоксией.
  if (f.decels === 'repetitive' && f.decelNature !== 'early') {
    const limit = f.variability === 'reduced' ? 20 : 30;
    const dm = f.decelsMin;
    if (lateLike && dm !== undefined && dm > limit) {
      path.push(`повторяющиеся поздние децелерации > ${limit} мин (${dm} мин)`);
    } else if (f.subacutePattern && dm !== undefined && dm > limit) {
      path.push(`повторяющиеся длительные децелерации > ${limit} мин`);
    } else {
      susp.push(`повторяющиеся децелерации (${DECEL_NATURE_LABEL[f.decelNature].toLowerCase()})`);
    }
  }

  if (f.prolonged) {
    const pm = f.prolongedMin;
    if (pm !== undefined && pm > 5) path.push(`пролонгированная децелерация > 5 мин (${pm} мин)`);
    else susp.push('пролонгированная децелерация (3–5 мин)');
  }

  if (path.length) return { category: 'pathological', reasons: [...path, ...susp] };
  if (susp.length) return { category: 'suspicious', reasons: susp };
  return { category: 'normal', reasons: ['базальный ритм 110–160, вариабельность 5–25, нет повторяющихся децелераций'] };
}

function uniqActions(items: ActionItem[]): ActionItem[] {
  const seen = new Map<string, ActionItem>();
  for (const a of items) {
    const prev = seen.get(a.id);
    if (!prev) seen.set(a.id, a);
    else if (a.now && !prev.now) seen.set(a.id, { ...prev, now: true });
  }
  // «Сейчас» — наверх, «чего не делать» — вниз.
  const list = [...seen.values()];
  return [...list.filter((a) => a.now && !a.avoid), ...list.filter((a) => !a.now && !a.avoid), ...list.filter((a) => a.avoid)];
}

/** Физиологическая интерпретация КТГ: тип гипоксии, ответ плода, тактика. */
export function interpret(f: CtgFeatures): Interpretation {
  const c = f.context;
  const findings: string[] = [];
  const warnings: string[] = [];
  const nonHypoxic: string[] = [];
  const acts: ActionItem[] = [];
  const add = (id: ActionId, now = false) => acts.push(action(id, { now }));

  const rise = baselineRisePct(f.baseline, f.anchorBaseline);
  const rising = f.trend === 'rising' || (rise !== undefined && rise >= 10);
  const unstable = f.trend === 'unstable' || f.trend === 'falling';
  const hasDecels = f.decels !== 'none';
  const tachysystole = (f.contractions ?? 0) > 5 || f.hypertonus;
  const accident = c.bleeding || c.cordProlapse || c.scarPain;
  const expMax = expectedBaselineMax(f.gaWeeks);
  const highForGa = f.baseline !== undefined && f.baseline > expMax;
  const bradycardia = f.baseline !== undefined && f.baseline < 100;
  const second = f.stage === 'second';

  let hypoxia: HypoxiaType = 'none';
  let stage: CompensationStage | undefined;
  let physio: PhysioCategory = 'normal';
  let urgency: Urgency = 'routine';
  let strategy: Strategy = 'observe';
  let phRate: string | undefined;

  if (rise !== undefined && rise >= 10) {
    findings.push(`Базальный ритм вырос на ${rise}% от исходного (${f.anchorBaseline} → ${f.baseline}) — признак выброса катехоламинов или воспаления.`);
  }
  if (tachysystole) {
    warnings.push(
      f.hypertonus
        ? 'Гипертонус матки — межворсинчатый кровоток не восстанавливается между схватками.'
        : `Тахисистолия (${f.contractions} схваток за 10 мин) — частая и обратимая причина гипоксии.`,
    );
  }
  if (f.baseline !== undefined && f.baseline < 110 && !f.prolonged) {
    warnings.push('Низкий базальный ритм: убедитесь, что регистрируется ЧСС плода, а не пульс матери.');
  }

  // ---------- 1. Острая гипоксия: пролонгированная децелерация / брадикардия ----------
  if (f.prolonged || bradycardia) {
    hypoxia = 'acute';
    physio = 'urgent';
    phRate = '≈ 0,01 в минуту';
    const pm = f.prolongedMin;
    findings.push(
      `${f.prolonged ? 'Пролонгированная децелерация' : 'Брадикардия'}${pm !== undefined ? ` ${pm} мин` : ''}: внезапное прекращение оксигенации — острая гипоксия, pH снижается примерно на 0,01 в минуту.`,
    );
    if (f.prolongedVarPreserved === 'present') {
      findings.push('Вариабельность внутри децелерации сохранена — хороший признак: при устранении причины ритм часто восстанавливается к 6–9 мин.');
    } else if (f.prolongedVarPreserved === 'absent') {
      findings.push('Вариабельность внутри децелерации утрачена — меньше шансов на спонтанное восстановление, готовьтесь к родоразрешению.');
    }
    if (accident) {
      findings.push('Подозрение на острое событие (отслойка, выпадение пуповины, разрыв матки) — восстановления не ждать.');
      urgency = 'emergency';
      strategy = 'deliver';
    } else if ((pm ?? 0) >= 9) {
      findings.push('9 минут без восстановления — время принять решение о родоразрешении (извлечение к 12–15 мин).');
      urgency = 'emergency';
      strategy = 'deliver';
    } else {
      urgency = f.prolongedVarPreserved === 'absent' ? 'emergency' : 'urgent';
      strategy = 'resuscitate';
    }
    add('call_team', true);
    add('rule3', true);
    add('exclude_accidents', true);
    add('ve', true);
    if (c.cordProlapse) add('elevate', true);
    add('left_lateral', true);
    if (c.oxytocin) add('stop_oxy', true);
    if (tachysystole) add('tocolysis', true);
    if (c.pushing || second) add('stop_pushing', true);
    if (c.hypotension || c.epidural) {
      add('fluids', true);
      add('vasopressor', true);
    }
    add('maternal_hr');
    add('theatre', strategy === 'deliver');
    if (strategy === 'deliver') add('deliver_now', true);
    add('neonatal');
    add('avoid_wait9');
    add('avoid_o2');
    add('avoid_fbs');
  }
  // ---------- 2. Подострая гипоксия ----------
  else if (f.subacutePattern) {
    hypoxia = 'subacute';
    physio = 'urgent';
    urgency = 'urgent';
    strategy = 'resuscitate';
    phRate = '≈ 0,01 за 2–3 минуты';
    findings.push('Децелерации длиннее 90 с, а стабильного ритма между ними меньше 30 с: плод больше времени проводит в децелерации, чем на базальном ритме — подострая гипоксия.');
    findings.push(
      second || c.pushing
        ? 'Типичная причина — активные потуги на каждой схватке и тахисистолия во втором периоде.'
        : 'Типичная причина — тахисистолия / гиперстимуляция окситоцином.',
    );
    if (f.variability === 'reduced') findings.push('Вариабельность уже снижена — резерв исчерпывается, родоразрешение ускорить.');
    add('call_senior', true);
    if (c.pushing || second) add('stop_pushing', true);
    if (c.oxytocin) add('stop_oxy', true);
    if (tachysystole || c.oxytocin) add('tocolysis', true);
    add('left_lateral');
    add('expedite', f.variability === 'reduced');
    add('neonatal');
    add('avoid_oxy_up');
  }
  // ---------- 3. Претерминальное состояние: «лестница» ----------
  else if (hasDecels && unstable && f.variability === 'reduced') {
    hypoxia = 'gradual';
    stage = 'terminal';
    physio = 'urgent';
    urgency = 'emergency';
    strategy = 'deliver';
    phRate = 'быстрое снижение — миокард исчерпал резерв';
    findings.push('Нестабильный, ступенчато снижающийся базальный ритм при утраченной вариабельности и децелерациях — истощение миокарда («лестница к смерти»).');
    add('call_team', true);
    add('deliver_now', true);
    add('neonatal', true);
    add('avoid_fbs');
  }
  // ---------- 4. Хроническая гипоксия (до родов / с начала записи) ----------
  else if (
    f.variability === 'reduced' &&
    f.cycling !== 'present' &&
    (f.shallowDecels || highForGa) &&
    (f.stage === 'antenatal' || rise === undefined || rise < 10)
  ) {
    hypoxia = 'chronic';
    physio = 'pathological';
    urgency = 'urgent';
    strategy = 'deliver';
    findings.push('Базальный ритм выше ожидаемого для срока, сниженная вариабельность, нет цикличности' + (f.shallowDecels ? ', неглубокие децелерации' : '') + ' — признаки существовавшей до родов (хронической) гипоксии с малым резервом.');
    if (c.fgr || c.postterm || c.meconium) {
      findings.push('Клинический фон (ЗРП, перенашивание, меконий) подтверждает снижение плацентарного резерва.');
    }
    add('call_senior', true);
    add('chronic_plan', true);
    if (c.oxytocin) add('stop_oxy', true);
    add('infection');
    add('neonatal');
    add('avoid_oxy_up');
  }
  // ---------- 5. Постепенно развивающаяся гипоксия ----------
  else if (hasDecels) {
    const earlyOnly = f.decelNature === 'early';
    hypoxia = 'gradual';
    if (f.variability === 'reduced' || unstable) {
      stage = 'decompensated';
      physio = 'urgent';
      urgency = 'urgent';
      strategy = 'deliver';
      phRate = 'ускоряется — компенсаторные механизмы исчерпаны';
      findings.push('Децелерации + сниженная вариабельность' + (unstable ? ' и нестабильный базальный ритм' : '') + ': центральная нервная система плода уже испытывает гипоксию — декомпенсация.');
      add('call_team', true);
      if (c.oxytocin) add('stop_oxy', true);
      if (c.pushing) add('stop_pushing', true);
      add('expedite', true);
      add('theatre');
      add('neonatal');
      add('extra_tests');
      add('avoid_fbs');
    } else if (rising || f.variability === 'increased' || f.zigzag || (f.accelerations === 'absent' && f.cycling === 'absent')) {
      stage = 'catecholamine';
      physio = 'pathological';
      urgency = f.zigzag || f.variability === 'increased' ? 'urgent' : 'attention';
      strategy = 'correct';
      if (rising) findings.push('Децелерации + рост базального ритма: плод выбрасывает катехоламины, чтобы увеличить сердечный выброс — компенсирует, но с напряжением.');
      if (f.accelerations === 'absent' && f.cycling === 'absent') findings.push('Исчезли акцелерации и цикличность — плод экономит энергию, отключая «необязательную» активность.');
      if (f.zigzag || f.variability === 'increased') {
        findings.push('ZigZag / повышенная вариабельность — признак быстро нарастающей гипоксии (часто при активных потугах): нестабильная вегетативная регуляция.');
      }
      add('call_senior', true);
      if (c.oxytocin) add('stop_oxy', true);
      if (c.pushing || second) add('stop_pushing', true);
      if (tachysystole) add('tocolysis', true);
      if (c.supine) add('left_lateral', true);
      if (c.hypotension) add('fluids', true);
      if (c.fever) add('infection');
      add('expedite');
      add('avoid_oxy_up');
    } else if (earlyOnly) {
      hypoxia = 'none';
      physio = 'normal';
      findings.push('Ранние децелерации — рефлекс на компрессию головки (обычно конец I и II период), не признак гипоксии.');
      add('observe');
    } else {
      stage = 'compensated';
      const repetitive = f.decels === 'repetitive';
      physio = repetitive ? 'suspicious' : 'normal';
      urgency = repetitive ? 'attention' : 'routine';
      strategy = repetitive ? 'correct' : 'observe';
      findings.push(
        `${repetitive ? 'Повторяющиеся' : 'Единичные'} децелерации при стабильном базальном ритме и нормальной вариабельности: плод испытывает гипоксический стресс, но полностью компенсирует его.`,
      );
      if (f.decelsWorsening) {
        findings.push('Децелерации углубляются / удлиняются — стресс нарастает: ищите причину до того, как поднимется базальный ритм.');
        urgency = 'attention';
        strategy = 'correct';
        if (physio === 'normal') physio = 'suspicious';
      }
      if (c.oxytocin) add('reduce_oxy');
      if (c.supine) add('left_lateral');
      if (c.hypotension) add('fluids');
      if (tachysystole) add('tocolysis');
      add('observe');
      add('avoid_count');
      add('avoid_oxy_up');
    }
  }
  // ---------- 6. Без децелераций ----------
  else if (f.sinusoidal) {
    hypoxia = 'nonhypoxic';
    physio = 'pathological';
    urgency = 'urgent';
    strategy = 'cause';
    nonHypoxic.push('Анемия плода: кровотечение из сосудов пуповины (vasa praevia), фетоматеринская трансфузия, изоиммунизация, инфекция (парвовирус)');
    findings.push('Синусоидальный ритм — гладкая волна 2–5 циклов в минуту без вариабельности: характерен для анемии плода.');
    add('call_team', true);
    add('anemia', true);
    add('expedite');
    add('neonatal');
  } else if (rising || (f.baseline !== undefined && f.baseline > 160)) {
    hypoxia = 'nonhypoxic';
    const tachyNoDecels = 'Рост базального ритма без предшествующих децелераций — не гипоксия: подумайте о воспалении/инфекции.';
    findings.push(tachyNoDecels);
    nonHypoxic.push(c.fever ? 'Хориоамнионит / внутриамниотическая инфекция (лихорадка у матери)' : 'Субклиническая инфекция / воспаление (температура матери может быть нормальной)');
    if (c.meconium) nonHypoxic.push('Меконий: рост базального ритма ≥ 10 % — повод заподозрить воспаление');
    nonHypoxic.push('Лихорадка/обезвоживание матери, β-миметики, тиреотоксикоз, тахиаритмия плода');
    const bad = f.variability === 'reduced' || f.cycling === 'absent';
    if (bad) findings.push('Сниженная вариабельность / нет цикличности при тахикардии — воспаление затрагивает ЦНС плода.');
    physio = bad ? 'pathological' : 'suspicious';
    urgency = bad ? 'urgent' : 'attention';
    strategy = 'cause';
    add('call_senior', bad);
    add('infection', true);
    if (c.meconium) add('meconium');
    if (c.oxytocin) add('reduce_oxy');
    add('avoid_antipyretic');
    add('avoid_oxy_up');
    if (bad) add('expedite');
  } else if (f.variability === 'reduced') {
    const vm = f.variabilityMin;
    if (f.cycling === 'present' || (vm !== undefined && vm < 50)) {
      hypoxia = 'none';
      physio = 'normal';
      findings.push('Сниженная вариабельность без децелераций и без роста базального ритма менее 50 мин — вероятнее всего фаза глубокого сна плода.');
      add('wait_cycle');
    } else {
      hypoxia = 'nonhypoxic';
      physio = 'pathological';
      urgency = 'attention';
      strategy = 'cause';
      findings.push('Длительно сниженная вариабельность без децелераций: гипоксия не объясняет картину — ищите другую причину угнетения ЦНС.');
      nonHypoxic.push('Лекарства (опиоиды, магния сульфат, седация)');
      nonHypoxic.push('Инфекция / воспаление');
      nonHypoxic.push('Существовавшее ранее повреждение мозга, пороки развития');
      nonHypoxic.push('Хроническая гипоксия (оцените базальный ритм для срока и цикличность)');
      add('call_senior');
      if (c.drugs) add('drugs_review');
      add('infection');
      add('extra_tests');
    }
  } else if (f.variability === 'increased' || f.zigzag) {
    hypoxia = 'gradual';
    stage = 'catecholamine';
    physio = 'pathological';
    urgency = 'urgent';
    strategy = 'correct';
    findings.push('ZigZag / сальтаторный ритм — нестабильность вегетативной регуляции при быстро нарастающей гипоксии (часто активные потуги во II периоде).');
    add('call_senior', true);
    if (c.pushing || second) add('stop_pushing', true);
    if (c.oxytocin) add('stop_oxy', true);
    add('expedite');
  } else if (f.cycling === 'absent') {
    hypoxia = 'none';
    physio = 'suspicious';
    urgency = 'attention';
    findings.push('Нет цикличности при нормальных остальных параметрах: продлите наблюдение; длительное отсутствие (> 90 мин) — повод искать инфекцию или неврологическую причину.');
    add('observe');
    add('infection');
  } else {
    findings.push('Стабильный базальный ритм, нормальная вариабельность' + (f.cycling === 'present' ? ', есть цикличность' : '') + ', нет децелераций — плод не испытывает гипоксического стресса.');
    add('observe');
  }

  // ---------- Общие поправки ----------
  if (hypoxia !== 'none' && hypoxia !== 'acute' && hypoxia !== 'subacute') {
    if (tachysystole && !acts.some((a) => a.id === 'tocolysis')) add('tocolysis');
    if (tachysystole && c.oxytocin && !acts.some((a) => a.id === 'stop_oxy' || a.id === 'reduce_oxy')) add('stop_oxy', true);
    if (c.supine && !acts.some((a) => a.id === 'left_lateral')) add('left_lateral');
  }
  if (c.drugs && !acts.some((a) => a.id === 'drugs_review') && physio !== 'normal') add('drugs_review');
  if (f.zigzag && second && hypoxia !== 'acute') warnings.push('ZigZag во II периоде ассоциирован с ацидозом при рождении — не затягивайте потужной период.');
  if (c.meconium && hypoxia !== 'none') warnings.push('Меконий: при гипоксии плода — готовность неонатолога.');
  if (physio !== 'normal' && !acts.some((a) => a.id === 'call_senior' || a.id === 'call_team')) add('call_senior');
  add('document');

  const { category: figo, reasons: figoReasons } = figoCategory(f);

  let reassessMin: number;
  if (urgency === 'urgent' || urgency === 'emergency') reassessMin = 0;
  else if (urgency === 'attention') reassessMin = 15;
  else reassessMin = second ? 15 : 30;

  let headline = HYPOXIA_LABEL[hypoxia];
  if (stage) headline += ` — ${STAGE_COMP_LABEL[stage].toLowerCase()}`;
  if (hypoxia === 'acute' && f.prolongedMin !== undefined) headline += ` (${f.prolongedMin} мин)`;

  return {
    hypoxia,
    stage,
    nonHypoxic,
    physio,
    figo,
    figoReasons,
    findings,
    actions: uniqActions(acts),
    urgency,
    strategy,
    reassessMin,
    phRate,
    baselineRisePct: rise,
    warnings,
    headline,
  };
}
