import { useRef, useState } from 'react';
import { HYPOXIA_SHORT, PHYSIO_LABEL, FIGO_LABEL, URGENCY_LABEL } from '../ktg/labels';
import { fmtDateTime, fmtTime } from '../ktg/record';
import { exportFileName } from '../export/docx';
import { downloadDocx, downloadJson } from '../export/download';
import type { Patient, SavedAssessment } from '../state/types';
import { Field, NumInput } from './ui';

function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/** График базального ритма относительно исходного (порог +10 %). */
function BaselineChart(props: { patient: Patient }) {
  const pts = props.patient.assessments
    .filter((a) => a.features.baseline !== undefined)
    .map((a) => ({ t: new Date(a.at).getTime(), v: a.features.baseline!, a }))
    .sort((x, y) => x.t - y.t);
  const anchor = props.patient.anchorBaseline ?? pts[0]?.a.features.anchorBaseline;
  if (pts.length < 2 && anchor === undefined) return null;
  const W = 640;
  const H = 180;
  const pad = { l: 38, r: 12, t: 12, b: 24 };
  const vals = [...pts.map((p) => p.v), ...(anchor ? [anchor, anchor * 1.1] : [])];
  const lo = Math.floor((Math.min(...vals) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...vals) + 10) / 10) * 10;
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts.length > 1 ? pts[pts.length - 1].t : t0 + 1;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
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

function PatientDetail(props: { p: Patient; update: (fn: (p: Patient) => Patient) => void; onBack: () => void; onDelete: () => void; onAssess: () => void; toast: (t: string) => void }) {
  const { p, update } = props;
  const [note, setNote] = useState('');
  const items = [
    ...p.assessments.map((a) => ({ at: a.at, kind: 'a' as const, a })),
    ...p.events.map((e) => ({ at: e.at, kind: 'e' as const, e })),
  ].sort((x, y) => y.at.localeCompare(x.at));
  return (
    <div className="content">
      <div className="row between">
        <button type="button" className="btn small" onClick={props.onBack}>
          ← Все пациентки
        </button>
        <button type="button" className="btn primary" onClick={props.onAssess}>
          Новая оценка КТГ
        </button>
      </div>
      <div className="card">
        <h3>Пациентка</h3>
        <div className="grid-fields">
          <Field label="ФИО / № истории" wide>
            <input value={p.label} onChange={(e) => update((x) => ({ ...x, label: e.target.value }))} placeholder="Иванова А. А., ИР № 123" />
          </Field>
          <Field label="Срок, нед">
            <NumInput value={p.gaWeeks} onChange={(v) => update((x) => ({ ...x, gaWeeks: v }))} />
          </Field>
          <Field label="+ дней">
            <NumInput value={p.gaDays} onChange={(v) => update((x) => ({ ...x, gaDays: v }))} />
          </Field>
          <Field label="Паритет">
            <input value={p.parity} onChange={(e) => update((x) => ({ ...x, parity: e.target.value }))} placeholder="Б2 Р1" />
          </Field>
          <Field label="Исходный базальный, уд/мин">
            <NumInput value={p.anchorBaseline} onChange={(v) => update((x) => ({ ...x, anchorBaseline: v }))} />
          </Field>
          <Field label="Врач">
            <input value={p.doctor} onChange={(e) => update((x) => ({ ...x, doctor: e.target.value }))} />
          </Field>
          <Field label="Анамнез / факторы риска" wide>
            <textarea value={p.background} onChange={(e) => update((x) => ({ ...x, background: e.target.value }))} placeholder="ЗРП, рубец на матке, ГСД, безводный промежуток…" />
          </Field>
        </div>
      </div>
      <BaselineChart patient={p} />
      <div className="card">
        <div className="card-head">
          <h3>Хронология</h3>
          <span className="small muted">{p.assessments.length} {plural(p.assessments.length, 'оценка', 'оценки', 'оценок')}</span>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Запись: ВИ, решение, событие…" style={{ flex: 1, minWidth: 180 }} />
          <button
            type="button"
            className="btn"
            disabled={!note.trim()}
            onClick={() => {
              update((x) => ({ ...x, events: [...x.events, { id: Math.random().toString(36).slice(2), at: new Date().toISOString(), kind: 'note', text: note.trim() }] }));
              setNote('');
            }}
          >
            Добавить
          </button>
        </div>
        {items.length === 0 && <p className="muted small">Пока пусто. Сохраните оценку с экрана «Оценка».</p>}
        <ul className="timeline">
          {items.map((it) =>
            it.kind === 'a' ? (
              <AssessmentItem key={it.a.id} a={it.a} onDelete={() => confirm('Удалить оценку?') && update((x) => ({ ...x, assessments: x.assessments.filter((y) => y.id !== it.a.id) }))} />
            ) : (
              <li key={it.e.id} className="tl-item ev">
                <span className="small">
                  <b>{fmtTime(it.e.at)}</b> · {it.e.text}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
      <div className="card">
        <h3>Документы</h3>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              try {
                await downloadDocx(p);
              } catch {
                props.toast('Не удалось сформировать документ');
              }
            }}
          >
            Протокол в Word (.docx)
          </button>
          <button type="button" className="btn" onClick={() => downloadJson(p, exportFileName(p).replace(/\.docx$/, '.json'))}>
            Резервная копия (JSON)
          </button>
          <button type="button" className="btn ghost" onClick={() => confirm('Удалить пациентку и все оценки с этого устройства?') && props.onDelete()}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

export function PatientsView(props: {
  patients: Patient[];
  activeId: string | null;
  setActive: (id: string | null) => void;
  create: () => string;
  update: (id: string, fn: (p: Patient) => Patient) => void;
  remove: (id: string) => void;
  importMany: (ps: Partial<Patient>[]) => number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  goAssess: () => void;
  saveError: boolean;
  toast: (t: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const open = props.patients.find((p) => p.id === props.openId);
  if (open) {
    return (
      <PatientDetail
        p={open}
        update={(fn) => props.update(open.id, fn)}
        onBack={() => props.setOpenId(null)}
        onDelete={() => {
          props.remove(open.id);
          if (props.activeId === open.id) props.setActive(null);
          props.setOpenId(null);
        }}
        onAssess={() => {
          props.setActive(open.id);
          props.goAssess();
        }}
        toast={props.toast}
      />
    );
  }
  return (
    <div className="content">
      {props.saveError && <div className="banner warn">Не удаётся сохранить данные на устройстве (приватный режим или нет места).</div>}
      <div className="row">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const id = props.create();
            props.setActive(id);
            props.setOpenId(id);
          }}
        >
          + Новая пациентка
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Импорт JSON
        </button>
        {props.patients.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => downloadJson(props.patients, `ktg-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
            Экспорт всех
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const data = JSON.parse(await file.text());
              const n = props.importMany(Array.isArray(data) ? data : [data]);
              props.toast(`Импортировано: ${n}`);
            } catch {
              props.toast('Файл не распознан');
            }
          }}
        />
      </div>
      {props.patients.length === 0 && (
        <div className="card">
          <p>Здесь ведётся наблюдение за конкретной пациенткой: серия оценок КТГ, динамика базального ритма относительно исходного, хронология таймеров и протокол в Word.</p>
          <p className="small muted" style={{ marginTop: 6 }}>
            Можно пользоваться оценкой и без карты. Данные хранятся только на этом устройстве.
          </p>
        </div>
      )}
      <div className="p-list">
        {props.patients.map((p) => {
          const last = p.assessments[p.assessments.length - 1];
          return (
            <div key={p.id} className={`p-row ${last ? `u-${last.result.urgency}` : ''}`}>
              <button type="button" className="p-open" onClick={() => props.setOpenId(p.id)}>
                <b>{p.label || 'Без имени'}</b>
                <span className="small muted">
                  {p.gaWeeks ? `${p.gaWeeks}${p.gaDays ? `+${p.gaDays}` : ''} нед · ` : ''}
                  {last ? `${fmtDateTime(last.at)} — ${last.result.headline}` : 'нет оценок'}
                </span>
              </button>
              <button type="button" className={`btn small ${props.activeId === p.id ? 'primary' : ''}`} onClick={() => props.setActive(props.activeId === p.id ? null : p.id)}>
                {props.activeId === p.id ? 'Активна' : 'Сделать активной'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
