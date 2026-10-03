import { useEffect, useMemo, useRef, useState } from 'react';
import { STRATEGY_LABEL } from '../logic/actions';
import { interpret } from '../logic/interpret';
import { FIGO_LABEL, HYPOXIA_LABEL, STAGE_COMP_LABEL, VAR_LABEL } from '../logic/labels';
import { describeFeatures } from '../logic/record';
import { generateTrace } from '../logic/synth';
import type { CompensationStage, FigoCategory, HypoxiaType, Strategy, VarBand } from '../logic/types';
import { alertAll, unlockAudio } from '../../../core/voice';
import { CASES, type TrainerCase } from '../training/cases';
import { LIVE_ACTIONS, LIVE_SCENARIOS, LiveSim, liveDebrief, MAX_MIN, type LiveScenario } from '../training/live';
import { CtgCanvas } from './CtgCanvas';
import { ResultPanel } from './ResultPanel';
import { StaticStrip, useWidth } from './Strip';
import { fmtClock, NumInput, Seg } from '../../../core/ui';

type DecelAns = 'none' | 'early' | 'rapid' | 'gradual' | 'prolonged';

const DECEL_OPTS: { value: DecelAns; label: string }[] = [
  { value: 'none', label: 'Нет децелераций' },
  { value: 'early', label: 'Ранние (зеркальны схватке)' },
  { value: 'rapid', label: 'Быстрые — «вариабельные»' },
  { value: 'gradual', label: 'Постепенные — «поздние»' },
  { value: 'prolonged', label: 'Пролонгированная децелерация / брадикардия' },
];

function decelKey(c: TrainerCase): DecelAns[] {
  const f = c.features;
  if (f.prolonged) return ['prolonged'];
  if (f.decels === 'none') return ['none'];
  if (f.decelNature === 'mixed') return ['rapid', 'gradual'];
  return [f.decelNature];
}

interface Answers {
  baseline?: number;
  variability?: VarBand;
  decels?: DecelAns;
  hypoxia?: HypoxiaType;
  stage?: CompensationStage;
  figo?: FigoCategory;
  strategy?: Strategy;
}

interface Graded {
  key: keyof Answers;
  title: string;
  ok: boolean;
  weight: number;
  right: string;
}

function grade(c: TrainerCase, a: Answers, showFigo: boolean): { items: Graded[]; score: number } {
  const items: Graded[] = [];
  const b = c.features.baseline!;
  items.push({ key: 'baseline', title: 'Базальный ритм', ok: a.baseline !== undefined && Math.abs(a.baseline - b) <= 5, weight: 1, right: `${b} ± 5 уд/мин` });
  items.push({ key: 'variability', title: 'Вариабельность', ok: a.variability === c.features.variability, weight: 1, right: VAR_LABEL[c.features.variability] });
  const dk = decelKey(c);
  items.push({ key: 'decels', title: 'Децелерации', ok: !!a.decels && dk.includes(a.decels), weight: 1, right: dk.map((k) => DECEL_OPTS.find((o) => o.value === k)!.label).join(' / ') });
  items.push({ key: 'hypoxia', title: 'Тип гипоксии', ok: a.hypoxia === c.answer.hypoxia, weight: 2, right: HYPOXIA_LABEL[c.answer.hypoxia] });
  if (c.answer.hypoxia === 'gradual' && c.answer.stage) {
    items.push({ key: 'stage', title: 'Стадия', ok: a.stage === c.answer.stage, weight: 1, right: STAGE_COMP_LABEL[c.answer.stage] });
  }
  if (showFigo) items.push({ key: 'figo', title: 'Категория FIGO / КР', ok: a.figo === c.answer.figo, weight: 1, right: FIGO_LABEL[c.answer.figo] });
  items.push({ key: 'strategy', title: 'Тактика', ok: !!a.strategy && c.answer.strategy.includes(a.strategy), weight: 2, right: c.answer.strategy.map((s) => STRATEGY_LABEL[s]).join(' / ') });
  const total = items.reduce((s, i) => s + i.weight, 0);
  const got = items.reduce((s, i) => s + (i.ok ? i.weight : 0), 0);
  return { items, score: Math.round((got / total) * 100) };
}

function Options<T extends string>(props: { value?: T; options: { value: T; label: string }[]; onChange: (v: T) => void; checked: boolean; right?: T[] }) {
  return (
    <div>
      {props.options.map((o) => {
        let cls = props.value === o.value ? 'sel' : '';
        if (props.checked) {
          if (props.right?.includes(o.value)) cls = 'right';
          else if (props.value === o.value) cls = 'wrong';
        }
        return (
          <button key={o.value} type="button" className={`opt ${cls}`} disabled={props.checked} onClick={() => props.onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CaseQuiz(props: { c: TrainerCase; pxPerMin: number; setPxPerMin: (v: number) => void; showFigo: boolean; onFinish: (score: number) => void; onBack: () => void; onNext?: () => void }) {
  const { c } = props;
  const trace = useMemo(() => generateTrace(c.frames, c.minutes, c.seed), [c]);
  const [a, setA] = useState<Answers>({});
  const [checked, setChecked] = useState(false);
  const res = useMemo(() => grade(c, a, props.showFigo), [c, a, props.showFigo]);
  const engine = useMemo(() => interpret(c.features), [c]);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setA({});
    setChecked(false);
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [c]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((x) => ({ ...x, [k]: v }));
  const answeredAll =
    a.baseline !== undefined && !!a.variability && !!a.decels && !!a.hypoxia && !!a.strategy && (!props.showFigo || !!a.figo) && (a.hypoxia !== 'gradual' || !!a.stage);

  const markers = c.features.prolonged ? [{ min: c.minutes - (c.features.prolongedMin ?? 0), label: 'начало', color: '#c62828' }] : undefined;

  return (
    <div className="content" ref={topRef}>
      <div className="row between">
        <button type="button" className="btn small" onClick={props.onBack}>
          ← Все случаи
        </button>
        <span className={`lvl lvl-${c.level}`}>Уровень {c.level}</span>
      </div>
      <div className="card">
        <h3>{c.title}</h3>
        <p>{c.intro}</p>
        <p className="small muted" style={{ marginTop: 6 }}>
          Лента {c.minutes} мин. Правый край — «сейчас». Отвечайте о состоянии на конец ленты.
        </p>
      </div>
      <div className="card">
        <StaticStrip fhr={trace.fhr} toco={trace.toco} hz={trace.hz} minutes={c.minutes} pxPerMin={props.pxPerMin} setPxPerMin={props.setPxPerMin} scrollToEnd markers={checked ? markers : undefined} />
      </div>

      <div className="card">
        <div className="quiz-q">
          <strong>1. Базальный ритм сейчас (уд/мин)</strong>
          <NumInput value={a.baseline} onChange={(v) => set('baseline', v)} placeholder="напр. 140" ariaLabel="Базальный ритм" />
          {checked && <p className={`small ${res.items[0].ok ? 'ok-text' : 'danger-text'}`}>Ответ: {res.items[0].right}</p>}
        </div>
        <div className="quiz-q">
          <strong>2. Вариабельность сейчас</strong>
          <Options value={a.variability} checked={checked} right={[c.features.variability]} onChange={(v) => set('variability', v)} options={(['reduced', 'normal', 'increased'] as const).map((k) => ({ value: k, label: VAR_LABEL[k] }))} />
        </div>
        <div className="quiz-q">
          <strong>3. Децелерации</strong>
          <Options value={a.decels} checked={checked} right={decelKey(c)} onChange={(v) => set('decels', v)} options={DECEL_OPTS} />
        </div>
        <div className="quiz-q">
          <strong>4. Тип гипоксии (физиологически)</strong>
          <Options
            value={a.hypoxia}
            checked={checked}
            right={[c.answer.hypoxia]}
            onChange={(v) => set('hypoxia', v)}
            options={(['none', 'acute', 'subacute', 'gradual', 'chronic', 'nonhypoxic'] as const).map((k) => ({ value: k, label: HYPOXIA_LABEL[k] }))}
          />
        </div>
        {a.hypoxia === 'gradual' && (
          <div className="quiz-q">
            <strong>4а. Стадия ответа плода</strong>
            <Options
              value={a.stage}
              checked={checked}
              right={c.answer.stage ? [c.answer.stage] : []}
              onChange={(v) => set('stage', v)}
              options={(['compensated', 'catecholamine', 'decompensated', 'terminal'] as const).map((k) => ({ value: k, label: STAGE_COMP_LABEL[k] }))}
            />
          </div>
        )}
        {props.showFigo && (
          <div className="quiz-q">
            <strong>5. Категория по FIGO 2015 / КР РФ</strong>
            <Options value={a.figo} checked={checked} right={[c.answer.figo]} onChange={(v) => set('figo', v)} options={(['normal', 'suspicious', 'pathological'] as const).map((k) => ({ value: k, label: FIGO_LABEL[k] }))} />
          </div>
        )}
        <div className="quiz-q">
          <strong>6. Тактика</strong>
          <Options value={a.strategy} checked={checked} right={c.answer.strategy} onChange={(v) => set('strategy', v)} options={(['observe', 'correct', 'resuscitate', 'cause', 'deliver'] as const).map((k) => ({ value: k, label: STRATEGY_LABEL[k] }))} />
        </div>
        {!checked ? (
          <button
            type="button"
            className="btn primary big full"
            disabled={!answeredAll}
            onClick={() => {
              setChecked(true);
              props.onFinish(res.score);
            }}
          >
            Проверить
          </button>
        ) : null}
      </div>

      {checked && (
        <>
          <div className="card">
            <div className="row" style={{ gap: 16, alignItems: 'center' }}>
              <div className={`score-ring ${res.score >= 80 ? 'good' : res.score >= 50 ? 'mid' : 'bad'}`}>{res.score}</div>
              <div className="grow">
                <h3 style={{ margin: 0 }}>Результат</h3>
                <table className="tbl" style={{ marginTop: 6 }}>
                  <tbody>
                    {res.items.map((i) => (
                        <tr key={i.key}>
                          <td>{i.title}</td>
                          <td className={i.ok ? 'ok' : 'bad'}>{i.ok ? '✓' : '✕'}</td>
                          <td className="small">{i.right}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="teach">
            <h3 style={{ marginBottom: 6 }}>Разбор</h3>
            <p>{c.teach}</p>
            <ul>
              {c.keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Разметка ленты</h3>
            <ul className="findings">
              {describeFeatures(c.features).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <details className="card">
            <summary>
              <b>Как разобрал бы навигатор (экран «Оценка»)</b>
            </summary>
            <div style={{ marginTop: 10 }}>
              <ResultPanel r={engine} showFigo={props.showFigo} compact />
            </div>
          </details>
          <div className="row">
            <button type="button" className="btn" onClick={() => { setA({}); setChecked(false); }}>
              Ещё раз
            </button>
            {props.onNext && (
              <button type="button" className="btn primary" onClick={props.onNext}>
                Следующий случай →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const SPEEDS = [1, 4, 10];

function LiveRun(props: { sc: LiveScenario; voice: boolean; onBack: () => void; onFinish: (score: number) => void }) {
  const [sim, setSim] = useState(() => new LiveSim(props.sc));
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState(4);
  const [paused, setPaused] = useState(false);
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const reported = useRef(false);
  const spokenAlarms = useRef(0);

  useEffect(() => {
    if (paused || sim.finished) return;
    const id = setInterval(() => {
      sim.advance(0.25 * speed);
      setTick((x) => x + 1);
    }, 250);
    return () => clearInterval(id);
  }, [sim, speed, paused]);

  // озвучиваем тревоги монитора и вехи
  useEffect(() => {
    const alarms = sim.msgs.filter((m) => m.kind === 'alarm');
    if (alarms.length > spokenAlarms.current) {
      const last = alarms[alarms.length - 1];
      spokenAlarms.current = alarms.length;
      if (!sim.finished) alertAll(last.text, props.voice, true);
    }
  });

  useEffect(() => {
    if (sim.finished && !reported.current) {
      reported.current = true;
      props.onFinish(liveDebrief(sim).score);
    }
  });

  const span = 10;
  const nowMin = sim.n / sim.hz / 60;
  const start = Math.max(0, nowMin - span + 0.5);
  const debrief = sim.finished ? liveDebrief(sim) : null;
  const restart = () => {
    reported.current = false;
    spokenAlarms.current = 0;
    setSim(new LiveSim(props.sc));
    setPaused(false);
  };

  return (
    <div className="content">
      <div className="row between">
        <button type="button" className="btn small" onClick={props.onBack}>
          ← Сценарии
        </button>
        <div className="seg">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
              ×{s}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>{props.sc.title}</h3>
        <p className="small">{props.sc.intro}</p>
      </div>
      <div className="card">
        <div className="live-head">
          <div>
            <div className="tiny muted">Время</div>
            <div className="live-clock">{fmtClock(sim.t)}</div>
          </div>
          <div className="center">
            <div className="tiny muted">ЧСС плода</div>
            <div className={`live-fhr ${sim.lastFhr < 100 ? 'danger-text pulse' : ''}`}>{Math.round(sim.lastFhr)}</div>
          </div>
          <div className="row">
            {!sim.finished && (
              <button type="button" className="btn" onClick={() => setPaused((p) => !p)}>
                {paused ? '▶ Продолжить' : '❚❚ Пауза'}
              </button>
            )}
            {sim.finished && (
              <button type="button" className="btn primary" onClick={restart}>
                Заново
              </button>
            )}
          </div>
        </div>
        <div ref={wrapRef} className="strip-wrap" style={{ marginTop: 8, overflow: 'hidden' }}>
          <CtgCanvas fhr={sim.fhr} toco={sim.toco} hz={sim.hz} length={sim.n} startMin={start} spanMin={span} width={width - 2} fhrHeight={230} tocoHeight={80} />
        </div>
      </div>

      {!sim.finished && (
        <div className="card">
          <h3>Действия</h3>
          <div className="live-actions">
            {LIVE_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`btn ${sim.done.has(a.id) ? 'used' : ''} ${a.id === 'deliver' ? 'danger' : ''}`}
                disabled={sim.done.has(a.id)}
                onClick={() => {
                  unlockAudio();
                  sim.act(a.id);
                  setTick((x) => x + 1);
                }}
              >
                {sim.done.has(a.id) ? '✓ ' : ''}
                {a.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                sim.finish('Сценарий завершён досрочно.');
                setTick((x) => x + 1);
              }}
            >
              Завершить и разобрать
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>События</h3>
        <ul className="msgs" style={{ maxHeight: 240 }}>
          {[...sim.msgs].reverse().map((m, i) => (
            <li key={i} className={m.kind}>
              <span className="t">{fmtClock(m.t)}</span>
              <span>{m.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {debrief && (
        <>
          <div className="card">
            <div className="row" style={{ gap: 16 }}>
              <div className={`score-ring ${debrief.score >= 80 ? 'good' : debrief.score >= 50 ? 'mid' : 'bad'}`}>{debrief.score}</div>
              <div>
                <h3 style={{ margin: 0 }}>Разбор</h3>
                <p className="small">
                  pH (модель): <b className={debrief.ph < 7.1 ? 'danger-text' : ''}>{debrief.ph.toFixed(2)}</b>
                </p>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Шаг</th>
                    <th>Цель</th>
                    <th>Факт (от начала события)</th>
                  </tr>
                </thead>
                <tbody>
                  {debrief.rows.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{r.target}</td>
                      <td className={r.ok === null ? '' : r.ok ? 'ok' : 'bad'}>{r.actual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {debrief.notes.length > 0 && (
              <ul className="findings" style={{ marginTop: 10 }}>
                {debrief.notes.map((n) => (
                  <li key={n} className="warn">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="teach">
            <p>{props.sc.teach}</p>
          </div>
        </>
      )}
      <p className="tiny muted">Упрощённая модель для отработки последовательности действий, а не физиологический симулятор. Длительность сценария — до {MAX_MIN} мин.</p>
    </div>
  );
}

export function TrainerView(props: {
  pxPerMin: number;
  setPxPerMin: (v: number) => void;
  showFigo: boolean;
  voice: boolean;
  progress: Record<string, number>;
  setProgress: (fn: (p: Record<string, number>) => Record<string, number>) => void;
}) {
  const [mode, setMode] = useState<'cases' | 'live'>('cases');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [level, setLevel] = useState<'all' | '1' | '2' | '3'>('all');

  const record = (key: string, score: number) => props.setProgress((p) => ({ ...p, [key]: Math.max(p[key] ?? 0, score) }));

  if (caseId) {
    const idx = CASES.findIndex((c) => c.id === caseId);
    const c = CASES[idx];
    const next = CASES[idx + 1];
    return (
      <CaseQuiz
        c={c}
        pxPerMin={props.pxPerMin}
        setPxPerMin={props.setPxPerMin}
        showFigo={props.showFigo}
        onFinish={(s) => record(`case:${c.id}`, s)}
        onBack={() => setCaseId(null)}
        onNext={next ? () => setCaseId(next.id) : undefined}
      />
    );
  }
  if (liveId) {
    const sc = LIVE_SCENARIOS.find((s) => s.id === liveId)!;
    return <LiveRun key={sc.id} sc={sc} voice={props.voice} onBack={() => setLiveId(null)} onFinish={(s) => record(`live:${sc.id}`, s)} />;
  }

  const solved = CASES.filter((c) => (props.progress[`case:${c.id}`] ?? 0) >= 80).length;
  const liveSolved = LIVE_SCENARIOS.filter((s) => (props.progress[`live:${s.id}`] ?? 0) >= 80).length;
  const list = CASES.filter((c) => level === 'all' || String(c.level) === level);

  return (
    <div className="content">
      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { value: 'cases', label: `Разбор лент · ${solved}/${CASES.length}` },
          { value: 'live', label: `Живая лента · ${liveSolved}/${LIVE_SCENARIOS.length}` },
        ]}
      />
      {mode === 'cases' ? (
        <>
          <p className="small muted">Лента + клиническая вводная. Разметьте ленту, определите тип гипоксии и тактику — затем разбор с физиологией. Засчитывается результат ≥ 80.</p>
          <Seg
            value={level}
            onChange={setLevel}
            options={[
              { value: 'all', label: 'Все' },
              { value: '1', label: 'Базовый' },
              { value: '2', label: 'Средний' },
              { value: '3', label: 'Сложный' },
            ]}
          />
          <div className="case-grid">
            {list.map((c) => {
              const best = props.progress[`case:${c.id}`];
              return (
                <button key={c.id} type="button" className="case-card" onClick={() => setCaseId(c.id)}>
                  <span className={`lvl lvl-${c.level}`}>{['', 'Базовый', 'Средний', 'Сложный'][c.level]}</span>
                  <strong>{c.title}</strong>
                  <span className="small muted">{c.intro.length > 110 ? c.intro.slice(0, 110) + '…' : c.intro}</span>
                  <span className="best">{best !== undefined ? `Лучший результат: ${best}${best >= 80 ? ' ✓' : ''}` : 'Не решён'}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <p className="small muted">
            Лента идёт в реальном времени (можно ускорить). В какой-то момент что-то случится — заметьте, найдите причину, действуйте. Ход событий зависит от ваших действий; в конце — разбор по правилу 3-6-9-12-15 и pH при рождении.
          </p>
          <div className="case-grid">
            {LIVE_SCENARIOS.map((s) => {
              const best = props.progress[`live:${s.id}`];
              return (
                <button key={s.id} type="button" className="case-card" onClick={() => setLiveId(s.id)}>
                  <span className={`lvl ${s.kind === 'subacute' ? 'lvl-2' : 'lvl-3'}`}>{s.stage === 'second' ? 'II период' : 'I период'}</span>
                  <strong>{s.title}</strong>
                  <span className="small muted">{s.intro}</span>
                  <span className="best">{best !== undefined ? `Лучший результат: ${best}${best >= 80 ? ' ✓' : ''}` : 'Не пройден'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
