import { useState } from 'react';
import type { Case } from '../protocol/types';
import type { ChecklistItem } from '../protocol/data';
import { CAUSES } from '../protocol/data';
import { nextSteps } from '../protocol/steps';
import { DRUG_BY_ID } from '../protocol/drugs';
import { lossPercent, totalBloodLoss } from '../protocol/calc';
import { addBloodLoss, addMed, addVitals, setCheck, setNa, toggleCause, updatePatient } from '../state/actions';
import type { Act } from './ChecklistView';
import { NumField } from './ui';

export function NowView({ c, act, onFullChecklist }: { c: Case; act: Act; onFullChecklist: () => void }) {
  const steps = nextSteps(c);
  const now = steps.slice(0, 3);
  const later = steps.slice(3, 9);
  const loss = totalBloodLoss(c);
  const pct = lossPercent(c);

  return (
    <div className="stack now">
      {!c.patient.weightKg && (
        <div className="card now-weight">
          <NumField label="Масса тела — для расчёта доз и % ОЦК" unit="кг" value={undefined} onChange={(v) => v && v > 20 && act((x, t) => updatePatient(x, { weightKg: v }, t))} />
        </div>
      )}

      <div className="card now-loss">
        <div className="now-loss-total">
          <span className="label">Кровопотеря</span>
          <span className="mono big-num">{loss}</span>
          <span className="muted">мл{pct !== undefined ? ` · ${pct.toFixed(0)}% ОЦК` : ''}</span>
        </div>
        <div className="now-loss-btns">
          {[100, 200, 300, 500].map((ml) => (
            <button key={ml} className="btn big" onClick={() => act((x, t) => addBloodLoss(x, ml, 'gravimetric', t))}>
              +{ml}
            </button>
          ))}
        </div>
      </div>

      <QuickVitals act={act} />

      <section className="card">
        <header className="card-head">
          <h3>Сейчас</h3>
          <span className="muted small">по алгоритму КР (Б2, Б4, Б5)</span>
        </header>
        {now.length === 0 ? (
          <p className="muted">{c.bleedingStop ? 'Первоочередные пункты выполнены. Проверьте раздел «После остановки» в полном чек-листе.' : 'Все первоочередные пункты выполнены.'}</p>
        ) : (
          <ol className="now-steps">
            {now.map((i, n) => (
              <NowStep key={i.id} c={c} item={i} act={act} n={n + 1} />
            ))}
          </ol>
        )}
        {later.length > 0 && (
          <>
            <h4 className="now-later-title">Далее</h4>
            <ul className="now-later">
              {later.map((i) => (
                <li key={i.id}>
                  <button className="now-later-item" onClick={() => act((x, t) => setCheck(x, i.id, true, t))}>
                    <span className="box" />
                    <span>{i.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="btn ghost" onClick={onFullChecklist}>
          Полный чек-лист →
        </button>
      </section>

      <section className="card">
        <header className="card-head">
          <h3>Причина — 4Т</h3>
        </header>
        <div className="chips">
          {CAUSES.map((cz) => (
            <button key={cz.id} className={`chip ${c.causes.includes(cz.id) ? 'on' : ''}`} onClick={() => act((x, t) => toggleCause(x, cz.id, t))} title={cz.signs}>
              {cz.t}: {cz.title}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function NowStep({ c, item, act, n }: { c: Case; item: ChecklistItem; act: Act; n: number }) {
  const drug = item.drug ? DRUG_BY_ID[item.drug] : undefined;
  const sug = drug?.suggest(c.patient.weightKg);
  return (
    <li className={`now-step ${n === 1 ? 'first' : ''}`}>
      <div className="now-step-text">
        <span className="now-n">{n}</span>
        <div>
          <strong>{item.text}</strong>
          {item.detail && <p className="muted small">{item.detail}</p>}
          <span className="cl-meta">
            {item.role && <span className="role">{item.role}</span>}
            <span className="ref">КР {item.ref}</span>
          </span>
        </div>
      </div>
      <div className="now-step-btns">
        {drug && sug ? (
          <button
            className="btn primary big"
            onClick={() =>
              act((x, t) => addMed(x, { at: t, drug: drug.id, name: drug.name, dose: sug.dose, unit: sug.unit, route: sug.route, volumeMl: sug.volumeMl }, t))
            }
          >
            ✓ Введено{sug.dose ? ` ${sug.dose} ${sug.unit}` : ''}
          </button>
        ) : (
          <button className="btn ok big" onClick={() => act((x, t) => setCheck(x, item.id, true, t))}>
            ✓ Выполнено
          </button>
        )}
        <button className="btn small ghost" onClick={() => act((x, t) => setNa(x, item.id, true, t))}>
          Не применимо
        </button>
      </div>
    </li>
  );
}

function QuickVitals({ act }: { act: Act }) {
  const [sbp, setSbp] = useState<number | undefined>();
  const [dbp, setDbp] = useState<number | undefined>();
  const [hr, setHr] = useState<number | undefined>();
  const [spo2, setSpo2] = useState<number | undefined>();
  const ok = sbp !== undefined || hr !== undefined || spo2 !== undefined;
  return (
    <div className="card now-vitals">
      <NumField label="САД" value={sbp} onChange={setSbp} />
      <NumField label="ДАД" value={dbp} onChange={setDbp} />
      <NumField label="ЧСС" value={hr} onChange={setHr} />
      <NumField label="SpO₂" value={spo2} onChange={setSpo2} />
      <button
        className="btn primary"
        disabled={!ok}
        onClick={() => {
          act((x, t) => addVitals(x, { at: t, sbp, dbp, hr, spo2 }, t));
          setSbp(undefined);
          setDbp(undefined);
          setHr(undefined);
          setSpo2(undefined);
        }}
      >
        Записать АД/ЧСС
      </button>
    </div>
  );
}
