import { useState } from 'react';
import { useDialogs } from '../../../core/confirm';
import { ktgOf, type Labour } from '../../../core/record';
import { fmtTime, plural } from '../../../core/time';
import { NumInput } from '../../../core/ui';
import { FIGO_LABEL, HYPOXIA_SHORT, PHYSIO_LABEL, URGENCY_LABEL } from '../logic/labels';
import type { SavedAssessment } from '../types-state';

/** График базального ритма относительно исходного (порог +10 %). */
export function BaselineChart(props: { labour: Labour }) {
  const k = ktgOf(props.labour);
  const pts = k.assessments
    .filter((a) => a.features.baseline !== undefined)
    .map((a) => ({ t: new Date(a.at).getTime(), v: a.features.baseline!, a }))
    .sort((x, y) => x.t - y.t);
  const anchor = k.anchorBaseline ?? pts[0]?.a.features.anchorBaseline;
  if (pts.length < 1) return null;
  const W = 640;
  const H = 180;
  const pad = { l: 38, r: 12, t: 12, b: 24 };
  const vals = [...pts.map((p) => p.v), ...(anchor ? [anchor, anchor * 1.1] : [])];
  const lo = Math.floor((Math.min(...vals) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...vals) + 10) / 10) * 10;
  const t0 = pts[0].t;
  const t1 = pts.length > 1 ? pts[pts.length - 1].t : t0 + 1;
  const x = (t: number) => (pts.length === 1 ? (W + pad.l - pad.r) / 2 : pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 10) ticks.push(v);
  return (
    <div className="card">
      <h3>Базальный ритм в динамике</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Базальный ритм по времени оценок">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        {anchor !== undefined && (
          <>
            <line x1={pad.l} x2={W - pad.r} y1={y(anchor)} y2={y(anchor)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} />
            <text x={W - pad.r} y={y(anchor) - 4} fontSize="11" textAnchor="end" fill="var(--muted)">
              исходный {anchor}
            </text>
            <line x1={pad.l} x2={W - pad.r} y1={y(anchor * 1.1)} y2={y(anchor * 1.1)} stroke="var(--warn)" strokeDasharray="6 4" strokeWidth={1.5} />
            <text x={W - pad.r} y={y(anchor * 1.1) - 4} fontSize="11" textAnchor="end" fill="var(--warn)">
              +10 % ({Math.round(anchor * 1.1)})
            </text>
          </>
        )}
        {pts.length > 1 && <polyline fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} />}
        {pts.map((p) => (
          <g key={p.a.id}>
            <circle cx={x(p.t)} cy={y(p.v)} r={9} fill="transparent">
              <title>{`${fmtTime(p.a.at)} — ${p.v} уд/мин, ${HYPOXIA_SHORT[p.a.result.hypoxia].toLowerCase()}`}</title>
            </circle>
            <circle cx={x(p.t)} cy={y(p.v)} r={4.5} fill="var(--text)" stroke="var(--surface)" strokeWidth={2} pointerEvents="none" />
            <text x={x(p.t)} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">
              {fmtTime(p.a.at)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function AssessmentItem(props: { a: SavedAssessment; onDelete: () => void }) {
  const { a } = props;
  const [open, setOpen] = useState(false);
  return (
    <li className={`tl-item u-${a.result.urgency}`}>
      <div className="row between">
        <b>
          {fmtTime(a.at)} · {a.result.headline}
        </b>
        <span className="tiny muted">{URGENCY_LABEL[a.result.urgency]}</span>
      </div>
      <p className="small">
        Базальный {a.features.baseline ?? '—'} · физиологически: {PHYSIO_LABEL[a.result.physio].toLowerCase()} · FIGO: {FIGO_LABEL[a.result.figo].toLowerCase()}
      </p>
      {a.note && <p className="small">{a.note}</p>}
      <div className="row">
        <button type="button" className="btn small ghost" onClick={() => setOpen((o) => !o)}>
          {open ? 'Свернуть' : 'Подробнее'}
        </button>
        <button type="button" className="btn small ghost" onClick={props.onDelete}>
          Удалить
        </button>
      </div>
      {open && (
        <ul className="findings">
          {a.result.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
          {a.result.actions.map((t) => (
            <li key={t}>→ {t}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Наблюдение КТГ в текущей записи родов. */
export function ObservationView(props: { labour?: Labour; update: (fn: (l: Labour) => Labour) => void; onAssess: () => void }) {
  const { confirm } = useDialogs();
  const l = props.labour;
  if (!l) {
    return (
      <div className="content">
        <div className="card">
          <p>Нет активной записи родов. Сохраните оценку на вкладке «Оценка» — запись создастся автоматически, или выберите роды на главной.</p>
        </div>
      </div>
    );
  }
  const k = ktgOf(l);
  const list = [...k.assessments].sort((a, b) => b.at.localeCompare(a.at));
  const setK = (fn: (k: ReturnType<typeof ktgOf>) => ReturnType<typeof ktgOf>) => props.update((x) => ({ ...x, modules: { ...x.modules, ktg: fn(ktgOf(x)) } }));
  return (
    <div className="content">
      <div className="card">
        <div className="row between">
          <div className="field" style={{ maxWidth: 260 }}>
            <span className="field-label">Исходный базальный ритм («якорь»), уд/мин</span>
            <NumInput value={k.anchorBaseline} onChange={(v) => setK((x) => ({ ...x, anchorBaseline: v }))} placeholder="135" ariaLabel="Исходный базальный ритм" />
          </div>
          <button type="button" className="btn primary" onClick={props.onAssess}>
            Новая оценка КТГ
          </button>
        </div>
      </div>
      <BaselineChart labour={l} />
      <div className="card">
        <div className="card-head">
          <h3>Оценки КТГ</h3>
          <span className="small muted">
            {list.length} {plural(list.length, 'оценка', 'оценки', 'оценок')}
          </span>
        </div>
        {list.length === 0 && <p className="muted small">Пока нет сохранённых оценок.</p>}
        <ul className="timeline">
          {list.map((a) => (
            <AssessmentItem
              key={a.id}
              a={a}
              onDelete={async () => {
                if (await confirm('Удалить эту оценку КТГ?', { ok: 'Удалить', danger: true })) setK((x) => ({ ...x, assessments: x.assessments.filter((y) => y.id !== a.id) }));
              }}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
