import { useState } from 'react';
import type { Case, LabEntry, ViscoEntry } from '../protocol/types';
import { assessLabs, assessVisco, cryoUnits, fmtTime, latestLabValue, type Finding } from '../protocol/calc';
import { isBleeding } from '../protocol/alerts';
import { addLab, addVisco, removeEntry } from '../state/actions';
import type { Act } from './ChecklistView';
import { Card, NumField, Segmented, TimeField } from './ui';

export function Findings({ items }: { items: Finding[] }) {
  if (!items.length) return null;
  return (
    <ul className="findings">
      {items.map((f, i) => (
        <li key={i} className={`finding finding-${f.level}`}>
          <strong>{f.text}</strong>
          {f.action && <span> → {f.action}</span>}
          {f.ref && <span className="ref">КР {f.ref}</span>}
        </li>
      ))}
    </ul>
  );
}

export function LabsView({ c, act }: { c: Case; act: Act }) {
  return (
    <div className="stack">
      <LabCard c={c} act={act} />
      <ViscoCard c={c} act={act} />
      <CryoCalc c={c} />
    </div>
  );
}

function LabCard({ c, act }: { c: Case; act: Act }) {
  const [l, setL] = useState<Omit<LabEntry, 'id' | 'at'>>({});
  const [at, setAt] = useState<string | undefined>();
  const set = (k: keyof typeof l) => (v: number | undefined) => setL((s) => ({ ...s, [k]: v }));
  const preview = assessLabs({ ...l, id: '', at: '' }, isBleeding(c));
  const hasData = Object.values(l).some((x) => x !== undefined && x !== false);
  const sorted = [...c.labs].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card title="Лабораторные показатели">
      <div className="grid-fields">
        <NumField label="Hb" unit="г/л" value={l.hb} onChange={set('hb')} warn={l.hb !== undefined && l.hb < 70} />
        <NumField label="Ht" unit="%" value={l.hct} onChange={set('hct')} />
        <NumField label="Тромбоциты" unit="×10⁹/л" value={l.plt} onChange={set('plt')} warn={l.plt !== undefined && l.plt < 50} />
        <NumField label="Фибриноген" unit="г/л" value={l.fib} onChange={set('fib')} warn={l.fib !== undefined && l.fib < 2} />
        <NumField label="ПТВ" unit="× нормы" value={l.ptRatio} onChange={set('ptRatio')} warn={(l.ptRatio ?? 0) > 1.5} />
        <NumField label="АЧТВ" unit="× нормы" value={l.apttRatio} onChange={set('apttRatio')} warn={(l.apttRatio ?? 0) > 1.5} />
        <NumField label="МНО" value={l.inr} onChange={set('inr')} />
        <NumField label="Ли-Уайт" unit="мин" value={l.leeWhite} onChange={set('leeWhite')} warn={(l.leeWhite ?? 0) > 7} />
        <NumField label="Ca²⁺ ионизир." unit="ммоль/л" value={l.caIon} onChange={set('caIon')} warn={l.caIon !== undefined && l.caIon < 0.9} />
        <NumField label="Лактат" unit="ммоль/л" value={l.lactate} onChange={set('lactate')} warn={(l.lactate ?? 0) >= 2} />
        <NumField label="pH" value={l.ph} onChange={set('ph')} warn={l.ph !== undefined && l.ph < 7.2} />
        <NumField label="K⁺" unit="ммоль/л" value={l.potassium} onChange={set('potassium')} />
        <label className="toggle">
          <input type="checkbox" checked={!!l.leeWhiteLooseClot} onChange={(e) => setL((s) => ({ ...s, leeWhiteLooseClot: e.target.checked || undefined }))} />
          Рыхлый, легко разрушающийся сгусток
        </label>
        <TimeField label="Время забора" value={at} onChange={setAt} />
      </div>
      <Findings items={preview} />
      <div className="row">
        <button
          className="btn primary"
          disabled={!hasData}
          onClick={() => {
            act((x, now) => addLab(x, { ...l, at: at ?? now }, now));
            setL({});
            setAt(undefined);
          }}
        >
          Записать анализ
        </button>
        <span className="muted small">Цели: Hb &gt; 70; Tr &gt; 50; ПТВ/АЧТВ &lt; 1,5 N; фибриноген &gt; 2 г/л. При кровотечении — не реже 1 раза в 30 мин.</span>
      </div>
      {sorted.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Время</th><th>Hb</th><th>Ht</th><th>Tr</th><th>Фг</th><th>ПТВ</th><th>АЧТВ</th><th>Ли-Уайт</th><th>Ca²⁺</th><th>Лактат</th><th>pH</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{fmtTime(e.at)}</td>
                  <td className={`mono ${(e.hb ?? 999) < 70 ? 'danger-text' : ''}`}>{e.hb ?? '—'}</td>
                  <td className="mono">{e.hct ?? '—'}</td>
                  <td className={`mono ${(e.plt ?? 999) < 50 ? 'danger-text' : ''}`}>{e.plt ?? '—'}</td>
                  <td className={`mono ${(e.fib ?? 99) < 2 ? 'danger-text' : ''}`}>{e.fib ?? '—'}</td>
                  <td className="mono">{e.ptRatio ?? '—'}</td>
                  <td className="mono">{e.apttRatio ?? '—'}</td>
                  <td className="mono">{e.leeWhite ?? '—'}{e.leeWhiteLooseClot ? ' рыхл.' : ''}</td>
                  <td className="mono">{e.caIon ?? '—'}</td>
                  <td className="mono">{e.lactate ?? '—'}</td>
                  <td className="mono">{e.ph ?? '—'}</td>
                  <td><button className="btn tiny ghost" onClick={() => act((x, now) => removeEntry(x, 'labs', e.id, now))} aria-label="Удалить">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ViscoCard({ c, act }: { c: Case; act: Act }) {
  const [device, setDevice] = useState<ViscoEntry['device']>('rotem');
  const [v, setV] = useState<Omit<ViscoEntry, 'id' | 'at' | 'device'>>({});
  const set = (k: keyof typeof v) => (val: number | undefined) => setV((s) => ({ ...s, [k]: val }));
  const preview = assessVisco({ ...v, device, id: '', at: '' }, c.patient.weightKg);
  const hasData = Object.values(v).some((x) => x !== undefined);

  return (
    <Card title="ТЭГ / РОТЭМ (Прил. А3.3)" actions={<Segmented value={device} onChange={setDevice} options={[{ value: 'rotem', label: 'РОТЭМ' }, { value: 'teg', label: 'ТЭГ' }]} />}>
      <div className="grid-fields">
        {device === 'rotem' ? (
          <>
            <NumField label="FIBTEM A5" unit="мм" value={v.fibtemA5} onChange={set('fibtemA5')} />
            <NumField label="EXTEM CT" unit="с" value={v.extemCt} onChange={set('extemCt')} />
            <NumField label="EXTEM MCF" unit="мм" value={v.extemMcf} onChange={set('extemMcf')} />
            <NumField label="EXTEM ML" unit="%" value={v.extemMl} onChange={set('extemMl')} />
          </>
        ) : (
          <>
            <NumField label="FF MA" unit="мм" value={v.ffMa} onChange={set('ffMa')} />
            <NumField label="R" unit="мин" value={v.tegR} onChange={set('tegR')} />
            <NumField label="MA" unit="мм" value={v.tegMa} onChange={set('tegMa')} />
            <NumField label="LY30" unit="%" value={v.tegLy30} onChange={set('tegLy30')} />
          </>
        )}
      </div>
      <Findings items={preview} />
      <button
        className="btn primary"
        disabled={!hasData}
        onClick={() => {
          act((x, now) => addVisco(x, { ...v, device, at: now }, now));
          setV({});
        }}
      >
        Записать
      </button>
      {c.visco.length > 0 && (
        <ul className="plain">
          {[...c.visco].sort((a, b) => b.at.localeCompare(a.at)).map((e) => (
            <li key={e.id}>
              <span className="mono">{fmtTime(e.at)}</span> {e.device === 'rotem' ? 'РОТЭМ' : 'ТЭГ'}:{' '}
              {e.device === 'rotem'
                ? `A5 ${e.fibtemA5 ?? '—'}, CT ${e.extemCt ?? '—'}, MCF ${e.extemMcf ?? '—'}, ML ${e.extemMl ?? '—'}`
                : `FF MA ${e.ffMa ?? '—'}, R ${e.tegR ?? '—'}, MA ${e.tegMa ?? '—'}, LY30 ${e.tegLy30 ?? '—'}`}
              <button className="btn tiny ghost" onClick={() => act((x, now) => removeEntry(x, 'visco', e.id, now))} aria-label="Удалить">✕</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CryoCalc({ c }: { c: Case }) {
  const [target, setTarget] = useState<number | undefined>(2);
  const [current, setCurrent] = useState<number | undefined>(() => latestLabValue(c, 'fib'));
  const [hct, setHct] = useState<number | undefined>(() => latestLabValue(c, 'hct'));
  const [w, setW] = useState<number | undefined>(c.patient.weightKg);
  const units = target !== undefined && current !== undefined && hct !== undefined && w ? cryoUnits(target, current, w, hct) : undefined;
  return (
    <Card title="Расчёт доз криопреципитата (без ТЭГ/РОТЭМ)">
      <p className="muted small">КП = (ФГжел − ФГим) × МТ × 70 × (1 − Ht) / 250 (КР 3.1). Упрощённо: 1 доза на 5 кг массы; 2 дозы повышают фибриноген ≈ на 1 г/л.</p>
      <div className="grid-fields">
        <NumField label="Желаемый фибриноген" unit="г/л" value={target} onChange={setTarget} />
        <NumField label="Текущий фибриноген" unit="г/л" value={current} onChange={setCurrent} />
        <NumField label="Гематокрит" unit="%" value={hct} onChange={setHct} />
        <NumField label="Масса тела" unit="кг" value={w} onChange={setW} />
      </div>
      <div className="result">
        {units !== undefined ? (
          <>
            Требуется: <strong className="mono">{units}</strong> ед. криопреципитата
            {w ? <span className="muted"> (эмпирически 1 доза/5 кг = {Math.ceil(w / 5)})</span> : null}
          </>
        ) : (
          <span className="muted">Заполните все поля</span>
        )}
      </div>
    </Card>
  );
}
