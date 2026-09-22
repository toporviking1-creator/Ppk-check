import { useState } from 'react';
import type { Case, TrainingMessage } from '../protocol/types';
import { fmtTime, formatDuration, minutesBetween } from '../protocol/calc';
import { addBloodLoss, addLab, addVitals } from '../state/actions';
import { SCENARIOS, SCENARIO_BY_ID } from '../training/scenarios';
import { markApplied } from '../training/engine';
import { buildDebrief } from '../training/debrief';
import type { Act } from './ChecklistView';
import { Card, Segmented } from './ui';

const SPEEDS = [
  { value: '0', label: '⏸' },
  { value: '1', label: '×1' },
  { value: '2', label: '×2' },
  { value: '5', label: '×5' },
];

/** Панель тренировки: скорость модельного времени и последние вводные. */
export function TrainingPanel(props: { c: Case; act: Act; onSpeed: (s: number) => void; onFinish: () => void; onDebrief: () => void }) {
  const { c, act } = props;
  const t = c.training!;
  const [showAll, setShowAll] = useState(false);
  const s = SCENARIO_BY_ID[t.scenarioId];
  // Вводная сценария — всегда первой, остальные — от новых к старым.
  const msgs = [...t.messages.filter((m) => m.kind === 'intro'), ...t.messages.filter((m) => m.kind !== 'intro').reverse()];
  const pending = msgs.filter((m) => !m.applied && (m.bloodLossMl || m.vitals || m.lab));
  const shown = showAll ? msgs : msgs.filter((m) => !m.applied).slice(0, 3);

  return (
    <div className="training">
      <div className="training-bar">
        <span className="training-badge">🎓 Тренировка</span>
        <span className="training-title">{s?.title}</span>
        {t.finishedAt ? (
          <button className="btn small primary" onClick={props.onDebrief}>
            Разбор
          </button>
        ) : (
          <>
            <Segmented value={String(t.speed)} options={SPEEDS} onChange={(v) => props.onSpeed(Number(v))} />
            <button className="btn small" onClick={() => confirm('Завершить тренировку и перейти к разбору?') && props.onFinish()}>
              Завершить
            </button>
          </>
        )}
      </div>
      <ul className="t-msgs">
        {shown.map((m) => (
          <TMsg key={m.id} m={m} start={c.bleedingStart} act={act} />
        ))}
      </ul>
      <button className="btn ghost small" onClick={() => setShowAll((x) => !x)}>
        {showAll ? 'Скрыть внесённые' : `Все вводные (${t.messages.length})${pending.length ? ` · не внесено: ${pending.length}` : ''}`}
      </button>
    </div>
  );
}

function TMsg({ m, start, act }: { m: TrainingMessage; start?: string; act: Act }) {
  const has = m.bloodLossMl || m.vitals || m.lab;
  const apply = () =>
    act((x, now) => {
      let y = x;
      if (m.bloodLossMl) y = addBloodLoss(y, m.bloodLossMl, 'gravimetric', now);
      if (m.vitals) y = addVitals(y, { ...m.vitals, at: now }, now);
      if (m.lab) y = addLab(y, { ...m.lab, at: now }, now);
      return markApplied(y, m.id);
    });
  const dismiss = () => act((x) => markApplied(x, m.id));
  return (
    <li className={`t-msg t-${m.kind} ${m.applied ? 'applied' : ''}`}>
      <span className="mono t-time">{start ? `+${formatDuration(Math.max(0, minutesBetween(start, m.at)))}` : fmtTime(m.at)}</span>
      <span className="t-text">{m.text}</span>
      {!m.applied &&
        (has ? (
          <button className="btn small primary" onClick={apply}>
            Внести
          </button>
        ) : (
          <button className="btn small ghost" onClick={dismiss} aria-label="Прочитано">
            ✓
          </button>
        ))}
    </li>
  );
}

export function ScenarioPicker({ onStart, onClose }: { onStart: (id: string, speed: number) => void; onClose: () => void }) {
  const [speed, setSpeed] = useState('1');
  return (
    <div className="stack">
      <div className="card-head">
        <h2>🎓 Тренировка</h2>
        <button className="btn ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="muted">
        Сценарий развивается сам: кровопотеря нарастает, монитор и лаборатория присылают вводные, осмотры дают находки. Ваши действия
        меняют ход событий. В конце — разбор с временем действий и ошибками. Лучше тренироваться вдвоём: один играет акушерку, другой
        работает с приложением.
      </p>
      <div className="row">
        <span className="field-label">Скорость времени</span>
        <Segmented value={speed} options={SPEEDS.slice(1)} onChange={setSpeed} />
      </div>
      {SCENARIOS.map((s) => (
        <button key={s.id} className="card scenario" onClick={() => onStart(s.id, Number(speed))}>
          <span className={`diff diff-${s.difficulty}`}>{s.difficulty}</span>
          <strong>{s.title}</strong>
          <span className="muted small">{s.summary}</span>
        </button>
      ))}
      <p className="muted small">Модель упрощённая и служит только для отработки последовательности действий, а не для прогноза.</p>
    </div>
  );
}

export function DebriefCard({ c }: { c: Case }) {
  const d = buildDebrief(c);
  if (!d) return null;
  const fmt = (m?: number) => (m === undefined ? '—' : `${Math.round(m)} мин`);
  return (
    <Card title={<>Разбор тренировки: {d.scenarioTitle}</>} className="debrief">
      <div className="debrief-score">
        <span className={`score ${d.score >= 80 ? 'good' : d.score >= 60 ? 'mid' : 'bad'}`}>{d.score}</span>
        <div className="small">
          <div>Длительность: {fmt(d.durationMin)} · кровотечение {d.stopped ? 'остановлено' : <strong className="danger-text">не остановлено</strong>}</div>
          <div>
            Кровопотеря: фактическая {d.trueLoss} мл, внесено в карту {d.documentedLoss} мл
          </div>
          <div>
            Причина: {d.causeText} — {d.causeCorrect ? '✓ определена верно' : <strong className="danger-text">не определена</strong>}
          </div>
          <div>Критерии качества: {d.quality.yes}/{d.quality.applicable}</div>
        </div>
      </div>

      {d.protocolTimers.length > 0 && (
        <>
          <h4>Сроки по протоколу</h4>
          <table className="tbl">
            <tbody>
              {d.protocolTimers.map((r) => (
                <tr key={r.label} className={`dr-${r.status}`}>
                  <td>{r.label}</td>
                  <td className="mono">{fmt(r.minutes)}</td>
                  <td className="mono">≤ {r.targetMin} мин</td>
                  <td>{r.status === 'ok' ? '✓' : r.status === 'late' ? 'поздно' : 'не выполнено'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h4>Ключевые действия (от начала кровотечения)</h4>
      <table className="tbl">
        <tbody>
          {d.keyActions.map((r) => (
            <tr key={r.label} className={`dr-${r.status}`}>
              <td>{r.label}</td>
              <td className="mono">{r.status === 'missed' ? 'не выполнено' : fmt(r.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.errors.length > 0 && (
        <>
          <h4>Ошибки</h4>
          <ul className="findings">
            {d.errors.map((e) => (
              <li key={e} className="finding finding-danger">
                {e}
              </li>
            ))}
          </ul>
        </>
      )}
      {d.missedCritical.length > 0 && (
        <>
          <h4>Пропущены критические пункты</h4>
          <ul className="findings">
            {d.missedCritical.map((e) => (
              <li key={e} className="finding finding-warn">
                {e}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">
        Сроки 10/20/40 мин и интервал анализов 30 мин взяты из КР. Для остальных действий протокол сроков не устанавливает — время дано для
        самоконтроля и сравнения между тренировками.
      </p>
    </Card>
  );
}
