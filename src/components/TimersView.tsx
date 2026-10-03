import { useMemo, useState } from 'react';
import { fmtTime } from '../ktg/record';
import { unlockAudio } from '../lib/voice';
import { MILESTONES, type Timers } from '../state/timers';
import { fmtClock, Toggle, useNow } from './ui';

const QUICK_LOG = [
  'Вызвана помощь',
  'Влагалищное исследование',
  'Левый бок',
  'Окситоцин остановлен',
  'Острый токолиз',
  'Инфузия / вазопрессор',
  'Потуги прекращены',
  'Перевод в операционную',
  'Решение о родоразрешении',
  'Ребёнок родился',
];

function ProlongedTimer(props: { timers: Timers; voice: boolean; onSaveLog?: () => void }) {
  const { timers } = props;
  const p = timers.prolonged;
  const elapsed = p.startedAt === null ? 0 : ((p.stoppedAt ?? timers.now) - p.startedAt) / 1000;
  const elapsedMin = elapsed / 60;
  const cls = elapsedMin >= 9 ? 't-danger' : elapsedMin >= 3 ? 't-warn' : '';
  const currentIdx = MILESTONES.findIndex((m) => elapsedMin < m.min);

  if (p.startedAt === null) {
    return (
      <div className="card">
        <h3>Пролонгированная децелерация: 3-6-9-12-15</h3>
        <p className="small muted">Запустите в момент начала децелерации. Вехи озвучиваются голосом; экран не гаснет.</p>
        <button
          type="button"
          className="btn danger big full"
          style={{ margin: '12px 0 8px' }}
          onClick={() => {
            unlockAudio();
            timers.startProlonged(0);
          }}
        >
          Старт — децелерация началась сейчас
        </button>
        <div className="row">
          <span className="small muted">Началась раньше:</span>
          {[1, 2, 3, 5].map((m) => (
            <button
              key={m}
              type="button"
              className="btn small"
              onClick={() => {
                unlockAudio();
                timers.startProlonged(m * 60);
              }}
            >
              {m} мин назад
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Пролонгированная децелерация</h3>
        <span className="small muted">с {fmtTime(new Date(p.startedAt))}</span>
      </div>
      <div className={`big-timer ${cls}`} aria-live="polite">
        {fmtClock(elapsed)}
      </div>
      {p.stoppedAt !== null && <p className="center small">Остановлено: {p.stopReason}</p>}
      <ul className="milestones">
        {MILESTONES.map((m, i) => (
          <li key={m.min} className={`ms ${elapsedMin >= m.min ? 'passed' : ''} ${i === currentIdx && p.stoppedAt === null ? 'current' : ''}`}>
            <span className="m">{m.min}′</span>
            <span>
              <strong>{m.title}</strong>
              <p>{m.text}</p>
            </span>
          </li>
        ))}
      </ul>
      {p.stoppedAt === null && (
        <>
          <div className="section-title">Отметить</div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {QUICK_LOG.map((t) => (
              <button key={t} type="button" className={`chip ${p.log.some((l) => l.text === t) ? 'on' : ''}`} onClick={() => timers.logProlonged(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="timer-btns">
            <button type="button" className="btn ok big" onClick={() => timers.stopProlonged('Ритм восстановился')}>
              Ритм восстановился
            </button>
            <button type="button" className="btn big" onClick={() => timers.stopProlonged('Ребёнок родился')}>
              Ребёнок родился
            </button>
          </div>
        </>
      )}
      <div className="section-title" style={{ marginTop: 12 }}>
        Хронология
      </div>
      <ul className="msgs">
        {p.log.map((l, i) => (
          <li key={i}>
            <span className="t">{p.startedAt !== null ? fmtClock((l.at - p.startedAt) / 1000) : ''}</span>
            <span>
              {fmtTime(new Date(l.at))} — {l.text}
            </span>
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 10 }}>
        {props.onSaveLog && (
          <button type="button" className="btn primary" onClick={props.onSaveLog}>
            Сохранить хронологию в карту
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            if (p.stoppedAt !== null || confirm('Сбросить идущий таймер?')) timers.resetProlonged();
          }}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}

function ReassessTimer(props: { timers: Timers }) {
  const { timers } = props;
  const r = timers.reassess;
  const left = r.dueAt === null ? null : (r.dueAt - timers.now) / 1000;
  return (
    <div className="card">
      <h3>Напоминание о переоценке КТГ</h3>
      {left !== null ? (
        <>
          <div className="big-timer" style={{ fontSize: '3rem' }}>
            {fmtClock(left)}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={timers.cancelRemind}>
              Отменить
            </button>
            <button type="button" className="btn" onClick={() => timers.remind(r.minutes)}>
              Заново {r.minutes} мин
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          {[5, 10, 15, 30, 60].map((m) => (
            <button
              key={m}
              type="button"
              className="btn"
              onClick={() => {
                unlockAudio();
                timers.remind(m);
              }}
            >
              {m} мин
            </button>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ marginTop: 8 }}>
        Интервал переоценки предлагается после каждой оценки на экране «Оценка». Напоминание сработает, пока приложение открыто.
      </p>
    </div>
  );
}

/** Счётчик схваток: тахисистолия — > 5 схваток за 10 мин в среднем за 30 мин. */
function ContractionCounter() {
  const [taps, setTaps] = useState<number[]>([]);
  const now = useNow(1000);
  const stats = useMemo(() => {
    const in10 = taps.filter((t) => now - t <= 600_000).length;
    const in30 = taps.filter((t) => now - t <= 1_800_000).length;
    const span = taps.length ? Math.min(30, (now - taps[0]) / 60_000) : 0;
    const avg = span >= 10 ? (in30 / span) * 10 : null;
    return { in10, in30, avg, span };
  }, [taps, now]);
  const tachy = (stats.avg ?? 0) > 5 || stats.in10 > 5;
  return (
    <div className="card">
      <h3>Счётчик схваток</h3>
      <p className="small muted">Нажимайте в начале каждой схватки.</p>
      <div className="row" style={{ justifyContent: 'center', gap: 24, margin: '10px 0' }}>
        <div className="center">
          <div className={`counter-big ${stats.in10 > 5 ? 'danger-text' : ''}`}>{stats.in10}</div>
          <div className="tiny muted">за 10 мин</div>
        </div>
        <div className="center">
          <div className={`counter-big ${(stats.avg ?? 0) > 5 ? 'danger-text' : ''}`}>{stats.avg === null ? '—' : stats.avg.toFixed(1)}</div>
          <div className="tiny muted">среднее / 10 мин за {Math.round(stats.span)} мин</div>
        </div>
      </div>
      {tachy && <div className="banner warn">Тахисистолия: &gt; 5 схваток за 10 мин — снизьте/остановите окситоцин, рассмотрите острый токолиз.</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn primary big grow" onClick={() => setTaps((t) => [...t, Date.now()])}>
          Схватка
        </button>
        <button type="button" className="btn" disabled={!taps.length} onClick={() => setTaps((t) => t.slice(0, -1))}>
          Отменить
        </button>
        <button type="button" className="btn ghost" disabled={!taps.length} onClick={() => setTaps([])}>
          Сброс
        </button>
      </div>
    </div>
  );
}

export function TimersView(props: { timers: Timers; voice: boolean; everyMinute: boolean; setVoice: (v: boolean) => void; setEveryMinute: (v: boolean) => void; onSaveLog?: () => void }) {
  return (
    <div className="content">
      <ProlongedTimer timers={props.timers} voice={props.voice} onSaveLog={props.onSaveLog} />
      <div className="card">
        <div className="row">
          <Toggle checked={props.voice} onChange={props.setVoice}>
            Голосовые подсказки
          </Toggle>
          <Toggle checked={props.everyMinute} onChange={props.setEveryMinute}>
            Озвучивать каждую минуту
          </Toggle>
        </div>
        <p className="tiny muted">На iPhone выключите беззвучный режим. Голос зависит от синтезатора речи устройства.</p>
      </div>
      <ReassessTimer timers={props.timers} />
      <ContractionCounter />
    </div>
  );
}
