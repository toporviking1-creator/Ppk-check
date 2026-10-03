import { useState } from 'react';
import type { Case } from '../protocol/types';
import type { ChecklistItem, Role } from '../protocol/data';
import { CAUSES } from '../protocol/data';
import { sectionProgress, visibleSections } from '../protocol/case';
import { fmtTime } from '../protocol/calc';
import { isBleeding } from '../protocol/alerts';
import { DRUG_BY_ID } from '../protocol/drugs';
import { addMed, setCheck, setCheckNote, setCheckTime, setNa, toggleCause, setField } from '../state/actions';
import { Segmented, fromLocalInput, toLocalInput } from './ui';

export type Act = (fn: (c: Case, now: string) => Case) => void;

const ROLE_FILTERS: { value: 'all' | Role; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'Врач', label: 'Врач' },
  { value: 'Акушерка 1', label: 'Акушерка 1' },
  { value: 'Акушерка 2', label: 'Акушерка 2' },
  { value: 'Анестезиолог', label: 'Анестезиолог' },
];

export function ChecklistView({ c, act }: { c: Case; act: Act }) {
  const [role, setRole] = useState<'all' | Role>('all');
  const [hideDone, setHideDone] = useState(false);
  const sections = visibleSections(c);
  const bleeding = isBleeding(c);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>Причина кровотечения — 4Т</h3>
          <Segmented
            value={c.timing}
            options={[
              { value: 'early', label: 'Раннее < 24 ч' },
              { value: 'late', label: 'Позднее 24 ч–42 дн' },
            ]}
            onChange={(v) => act((x, now) => setField(x, 'timing', v, now))}
          />
        </div>
        <div className="causes">
          {CAUSES.map((cz) => (
            <button
              key={cz.id}
              className={`cause ${c.causes.includes(cz.id) ? 'on' : ''}`}
              onClick={() => act((x, now) => toggleCause(x, cz.id, now))}
              aria-pressed={c.causes.includes(cz.id)}
            >
              <strong>{cz.t}</strong>
              <span>{cz.title}</span>
              <small>{cz.signs}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <Segmented value={role} options={ROLE_FILTERS} onChange={setRole} />
        <label className="toggle">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Скрыть выполненные
        </label>
      </div>

      {sections.map((s) => {
        const items = s.items.filter(
          (i) => (role === 'all' || i.role === role || (!i.role && role === 'Врач')) && (!hideDone || !(c.checks[i.id]?.done || c.checks[i.id]?.na)),
        );
        if (!items.length) return null;
        const pr = sectionProgress(c, s);
        return (
          <section key={s.id} className={`card cl-section ${s.condition ? 'cl-special' : ''}`}>
            <header className="card-head">
              <div>
                <h3>{s.title}</h3>
                {s.subtitle && <p className="muted small">{s.subtitle}</p>}
              </div>
              <span className={`progress ${pr.done === pr.total ? 'complete' : ''}`}>
                {pr.done}/{pr.total}
              </span>
            </header>
            <ul className="cl-list">
              {items.map((i) => (
                <CheckRow key={i.id} c={c} item={i} act={act} highlight={bleeding && !!i.critical} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CheckRow({ c, item, act, highlight }: { c: Case; item: ChecklistItem; act: Act; highlight: boolean }) {
  const st = c.checks[item.id];
  const [open, setOpen] = useState(false);
  const done = !!st?.done;
  const na = !!st?.na;
  const drug = item.drug ? DRUG_BY_ID[item.drug] : undefined;
  const sug = drug?.suggest(c.patient.weightKg);

  return (
    <li className={`cl-item ${done ? 'done' : ''} ${na ? 'na' : ''} ${highlight && !done && !na ? 'critical' : ''}`}>
      <button
        className="cl-check"
        role="checkbox"
        aria-checked={done}
        onClick={() => act((x, now) => setCheck(x, item.id, !done, now))}
      >
        <span className="box">{done ? '✓' : na ? '—' : ''}</span>
        <span className="cl-text">
          <span className="cl-title">{item.text}</span>
          {item.detail && <span className="cl-detail">{item.detail}</span>}
          <span className="cl-meta">
            {item.role && <span className="role">{item.role}</span>}
            <span className="ref">КР {item.ref}</span>
            {item.grade && <span className="grade">УУР/УДД {item.grade}</span>}
            {(done || na) && st && <span className="time mono">{fmtTime(st.at)}</span>}
            {st?.note && <span className="note">📝 {st.note}</span>}
          </span>
        </span>
      </button>
      <div className="cl-side">
        {drug && sug && !done && (
          <button
            className="btn small primary"
            title={sug.text}
            onClick={() =>
              act((x, now) =>
                addMed(x, { at: now, drug: drug.id, name: drug.name, dose: sug.dose, unit: sug.unit, route: sug.route, volumeMl: sug.volumeMl }, now),
              )
            }
          >
            Ввести{sug.dose ? ` ${sug.dose} ${sug.unit}` : ''}
          </button>
        )}
        <button className="btn small ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Подробнее">
          ⋯
        </button>
      </div>
      {open && (
        <div className="cl-more">
          <label className="field">
            <span className="field-label">Время выполнения</span>
            <span className="field-input">
              <input
                type="datetime-local"
                value={toLocalInput(st?.at)}
                disabled={!st}
                onChange={(e) => {
                  const iso = fromLocalInput(e.target.value);
                  if (iso) act((x, now) => setCheckTime(x, item.id, iso, now));
                }}
              />
            </span>
          </label>
          <label className="field field-wide">
            <span className="field-label">Примечание</span>
            <span className="field-input">
              <input
                value={st?.note ?? ''}
                placeholder="доза, исполнитель, причина невыполнения…"
                onChange={(e) => act((x, now) => setCheckNote(x, item.id, e.target.value, now))}
              />
            </span>
          </label>
          <button className="btn small" onClick={() => act((x, now) => setNa(x, item.id, !na, now))}>
            {na ? 'Снять «не применимо»' : 'Не применимо / противопоказано'}
          </button>
          {sug && <p className="muted small">{sug.text}</p>}
          {drug?.cautions?.map((t) => (
            <p key={t} className="warn-text small">
              ⚠ {t}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}
