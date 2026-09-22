import { useState } from 'react';
import type { BloodLossMethod, Case, VitalsEntry } from '../protocol/types';
import {
  bloodVolumeMl,
  fmtTime,
  lossPercent,
  meanArterialPressure,
  pphThreshold,
  shockIndex,
  totalBloodLoss,
} from '../protocol/calc';
import { addBloodLoss, addVitals, removeEntry, setBloodLossTotal } from '../state/actions';
import type { Act } from './ChecklistView';
import { Card, NumField, Segmented, TextField, TimeField } from './ui';

export function MonitorView({ c, act }: { c: Case; act: Act }) {
  return (
    <div className="stack">
      <BloodLossCard c={c} act={act} />
      <VitalsCard c={c} act={act} />
    </div>
  );
}

function BloodLossCard({ c, act }: { c: Case; act: Act }) {
  const [method, setMethod] = useState<BloodLossMethod>('gravimetric');
  const [custom, setCustom] = useState<number | undefined>();
  const [total, setTotal] = useState<number | undefined>();
  const loss = totalBloodLoss(c);
  const pct = lossPercent(c);
  const bv = bloodVolumeMl(c.patient.weightKg, c.patient.bvCoefMlKg);
  const thr = pphThreshold(c.patient.deliveryMode);

  const marks = bv
    ? [
        { at: thr, label: `ПК ${thr}` },
        { at: 1000, label: '1000' },
        { at: Math.round(bv * 0.25), label: '25% ОЦК' },
        { at: 1500, label: '1500' },
      ]
    : [
        { at: thr, label: `ПК ${thr}` },
        { at: 1000, label: '1000' },
        { at: 1500, label: '1500' },
      ];
  const scaleMax = Math.max(2500, loss * 1.1, bv ? bv * 0.5 : 0);

  const add = (ml: number) => act((x, now) => addBloodLoss(x, ml, method, now));

  return (
    <Card title="Кровопотеря" actions={<Segmented value={method} onChange={setMethod} options={[{ value: 'gravimetric', label: 'Гравиметрия' }, { value: 'visual', label: 'Визуально' }, { value: 'cellsaver', label: 'Cell saver' }]} />}>
      <div className="loss-total">
        <span className="mono big-num">{loss}</span> мл
        {pct !== undefined && <span className="muted"> · {pct.toFixed(1)}% ОЦК</span>}
      </div>
      <div className="loss-bar" aria-hidden>
        <div className="loss-fill" style={{ width: `${Math.min(100, (loss / scaleMax) * 100)}%` }} />
        {marks.map((m) => (
          <span key={m.label} className="loss-mark" style={{ left: `${(m.at / scaleMax) * 100}%` }}>
            <span>{m.label}</span>
          </span>
        ))}
      </div>
      {method === 'visual' && <p className="warn-text small">Визуальная оценка занижает кровопотерю на 30–50% — используйте гравиметрию (КР 2.5.1).</p>}
      <div className="quick">
        {[50, 100, 200, 300, 500].map((ml) => (
          <button key={ml} className="btn big" onClick={() => add(ml)}>
            +{ml}
          </button>
        ))}
      </div>
      <div className="row">
        <NumField label="Добавить" unit="мл" value={custom} onChange={setCustom} />
        <button className="btn primary" disabled={!custom} onClick={() => { if (custom) { add(custom); setCustom(undefined); } }}>
          Добавить
        </button>
        <NumField label="Итог по взвешиванию" unit="мл" value={total} onChange={setTotal} />
        <button className="btn" disabled={total === undefined} onClick={() => { if (total !== undefined) { act((x, now) => setBloodLossTotal(x, total, method, now)); setTotal(undefined); } }}>
          Установить итог
        </button>
      </div>
      <p className="muted small">
        Гравиметрия: масса пропитанного материала (г) − сухая масса ≈ мл крови. Порог ПК: ≥ 500 мл при родах, ≥ 1000 мл при КС. Массивная: &gt; 1500 мл (25–30% ОЦК) или &gt; 2500 мл (50%) за 3 ч.
      </p>
      {c.bloodLoss.length > 0 && (
        <table className="tbl">
          <thead>
            <tr><th>Время</th><th>+мл</th><th>Итого</th><th>Метод</th><th /></tr>
          </thead>
          <tbody>
            {(() => {
              let acc = 0;
              return [...c.bloodLoss].sort((a, b) => a.at.localeCompare(b.at)).map((b) => {
                acc += b.ml;
                return (
                  <tr key={b.id}>
                    <td className="mono">{fmtTime(b.at)}</td>
                    <td className="mono">{b.ml}</td>
                    <td className="mono">{acc}</td>
                    <td>{{ gravimetric: 'гравиметрия', visual: 'визуально', cellsaver: 'cell saver' }[b.method]}</td>
                    <td><button className="btn tiny ghost" onClick={() => act((x, now) => removeEntry(x, 'bloodLoss', b.id, now))} aria-label="Удалить">✕</button></td>
                  </tr>
                );
              }).reverse();
            })()}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function VitalsCard({ c, act }: { c: Case; act: Act }) {
  const empty: Omit<VitalsEntry, 'id' | 'at'> = {};
  const [v, setV] = useState(empty);
  const [at, setAt] = useState<string | undefined>();
  const si = shockIndex(v.hr, v.sbp);
  const m = meanArterialPressure(v.sbp, v.dbp);
  const set = (k: keyof typeof v) => (val: number | undefined) => setV((s) => ({ ...s, [k]: val }));
  const hasData = Object.values(v).some((x) => x !== undefined && x !== '');

  return (
    <Card title="Витальные функции">
      <div className="grid-fields">
        <NumField label="САД" unit="мм" value={v.sbp} onChange={set('sbp')} warn={v.sbp !== undefined && v.sbp < 90} />
        <NumField label="ДАД" unit="мм" value={v.dbp} onChange={set('dbp')} />
        <NumField label="ЧСС" unit="/мин" value={v.hr} onChange={set('hr')} warn={v.hr !== undefined && v.hr > 110} />
        <NumField label="ЧД" unit="/мин" value={v.rr} onChange={set('rr')} />
        <NumField label="SpO₂" unit="%" value={v.spo2} onChange={set('spo2')} warn={v.spo2 !== undefined && v.spo2 < 92} />
        <NumField label="T тела" unit="°C" value={v.temp} onChange={set('temp')} warn={v.temp !== undefined && v.temp < 36} />
        <NumField label="Диурез" unit="мл/ч" value={v.diuresis} onChange={set('diuresis')} warn={v.diuresis !== undefined && v.diuresis < 30} />
        <NumField label="Бледное пятно" unit="с" value={v.capRefillSec} onChange={set('capRefillSec')} warn={v.capRefillSec !== undefined && v.capRefillSec >= 3} />
        <TextField label="Сознание" value={v.consciousness ?? ''} onChange={(s) => setV((x) => ({ ...x, consciousness: s || undefined }))} placeholder="ясное / оглушение…" />
        <TimeField label="Время (по умолч. сейчас)" value={at} onChange={setAt} />
      </div>
      <div className="row">
        <div className={`si-pill ${si !== undefined && si >= 1 ? 'danger' : si !== undefined && si > 0.9 ? 'warn' : ''}`}>
          ШИ: <strong className="mono">{si !== undefined ? si.toFixed(2) : '—'}</strong>
          <span className="muted small"> норма 0,7–0,9</span>
        </div>
        <div className="si-pill">
          САДср: <strong className="mono">{m !== undefined ? m.toFixed(0) : '—'}</strong>
        </div>
        <button
          className="btn primary"
          disabled={!hasData}
          onClick={() => {
            act((x, now) => addVitals(x, { ...v, at: at ?? now }, now));
            setV(empty);
            setAt(undefined);
          }}
        >
          Записать
        </button>
      </div>
      {c.vitals.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Время</th><th>АД</th><th>ЧСС</th><th>ШИ</th><th>ЧД</th><th>SpO₂</th><th>T</th><th>Диурез</th><th /></tr>
            </thead>
            <tbody>
              {[...c.vitals].sort((a, b) => b.at.localeCompare(a.at)).map((e) => {
                const s = shockIndex(e.hr, e.sbp);
                return (
                  <tr key={e.id}>
                    <td className="mono">{fmtTime(e.at)}</td>
                    <td className="mono">{e.sbp ?? '—'}/{e.dbp ?? '—'}</td>
                    <td className="mono">{e.hr ?? '—'}</td>
                    <td className={`mono ${s !== undefined && s >= 1 ? 'danger-text' : ''}`}>{s !== undefined ? s.toFixed(2) : '—'}</td>
                    <td className="mono">{e.rr ?? '—'}</td>
                    <td className="mono">{e.spo2 ?? '—'}</td>
                    <td className="mono">{e.temp ?? '—'}</td>
                    <td className="mono">{e.diuresis ?? '—'}</td>
                    <td><button className="btn tiny ghost" onClick={() => act((x, now) => removeEntry(x, 'vitals', e.id, now))} aria-label="Удалить">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Адекватность ИТТ: ↑АД и ↓ЧСС на ≥ 10%, диурез &gt; 30 мл/ч, лактат &lt; 2 ммоль/л, бледное пятно &lt; 3 с, нормотермия (КР 3.1).
      </p>
    </Card>
  );
}
