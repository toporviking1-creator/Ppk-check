import { CONTEXT_LABEL, FIGO_LABEL, PHYSIO_LABEL, URGENCY_LABEL } from '../ktg/labels';
import type { CompensationStage, Interpretation } from '../ktg/types';

const LADDER: { key: CompensationStage; label: string }[] = [
  { key: 'compensated', label: 'Децелерации' },
  { key: 'catecholamine', label: 'Рост БЧСС, нет акцелераций' },
  { key: 'decompensated', label: 'Потеря вариабельности' },
  { key: 'terminal', label: 'Нестабильный ритм, «лестница»' },
];

export function GradualLadder(props: { stage?: CompensationStage }) {
  const idx = LADDER.findIndex((l) => l.key === props.stage);
  return (
    <div className="ladder" aria-label="Стадия постепенно развивающейся гипоксии">
      {LADDER.map((l, i) => (
        <div key={l.key} className={i <= idx ? `on s${i}` : ''}>
          {l.label}
        </div>
      ))}
    </div>
  );
}

export function ResultPanel(props: {
  r: Interpretation;
  done?: string[];
  onToggleDone?: (id: string) => void;
  showFigo?: boolean;
  compact?: boolean;
}) {
  const { r } = props;
  const done = props.done ?? [];
  return (
    <div className={`verdict u-${r.urgency}`}>
      <div className="row between">
        <span className={`urg u-${r.urgency}`}>{URGENCY_LABEL[r.urgency]}</span>
        {r.reassessMin > 0 ? <span className="small muted">Переоценка через {r.reassessMin} мин</span> : <span className="small danger-text">Непрерывно у постели</span>}
      </div>
      <h2>{r.headline}</h2>
      {r.hypoxia === 'gradual' && <GradualLadder stage={r.stage} />}
      <div className="cats">
        <div className="cat">
          <div className="k">Физиологически</div>
          <div className={`v ${r.physio}`}>{PHYSIO_LABEL[r.physio]}</div>
        </div>
        {props.showFigo !== false && (
          <div className="cat" title={r.figoReasons.join('; ')}>
            <div className="k">FIGO 2015 / КР РФ</div>
            <div className={`v ${r.figo}`}>{FIGO_LABEL[r.figo]}</div>
          </div>
        )}
      </div>
      {r.phRate && (
        <p className="small">
          <b>Снижение pH:</b> {r.phRate}
        </p>
      )}
      {r.baselineRisePct !== undefined && (
        <p className="small">
          <b>Базальный ритм от исходного:</b> {r.baselineRisePct > 0 ? '+' : ''}
          {r.baselineRisePct}%{r.baselineRisePct >= 10 ? ' — порог 10 % превышен' : ''}
        </p>
      )}
      <ul className="findings">
        {r.warnings.map((w) => (
          <li key={w} className="warn">
            ⚠ {w}
          </li>
        ))}
        {r.findings.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {r.nonHypoxic.length > 0 && (
        <>
          <div className="section-title">Подумайте о</div>
          <ul className="findings">
            {r.nonHypoxic.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
      {!props.compact && props.showFigo !== false && (
        <p className="tiny muted">FIGO: {r.figoReasons.join('; ')}.</p>
      )}
      <div className="section-title" style={{ marginTop: 10 }}>
        Что делать
      </div>
      <ul className="acts">
        {r.actions.map((a) => {
          const isDone = done.includes(a.id);
          if (a.avoid)
            return (
              <li key={a.id}>
                <div className="act avoid">
                  <span className="box">✕</span>
                  <span>{a.text}</span>
                </div>
              </li>
            );
          return (
            <li key={a.id}>
              <button type="button" className={`act ${a.now ? 'now' : ''} ${isDone ? 'done' : ''}`} onClick={() => props.onToggleDone?.(a.id)} aria-pressed={isDone}>
                <span className="box">{isDone ? '✓' : ''}</span>
                <span>
                  {a.now && <span className="now-tag">СЕЙЧАС</span>}
                  {a.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const contextKeys = Object.keys(CONTEXT_LABEL) as (keyof typeof CONTEXT_LABEL)[];
