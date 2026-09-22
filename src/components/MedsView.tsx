import { useMemo, useState } from 'react';
import type { Case } from '../protocol/types';
import { DRUGS, DRUG_BY_ID, type DrugDef } from '../protocol/drugs';
import { drugTotal, fmtTime, infusionTotals, totalBloodLoss } from '../protocol/calc';
import { addMed, removeEntry } from '../state/actions';
import type { Act } from './ChecklistView';
import { Card, NumField, TextField, TimeField } from './ui';

const GROUPS: DrugDef['group'][] = ['Утеротоники', 'Гемостаз', 'Компоненты крови', 'Инфузия', 'Анестезия и ИТ', 'Профилактика'];

export function MedsView({ c, act }: { c: Case; act: Act }) {
  const [sel, setSel] = useState<string>('oxytocin');
  const drug = DRUG_BY_ID[sel];
  const sug = drug.suggest(c.patient.weightKg);
  const [dose, setDose] = useState<number | undefined>(sug.dose);
  const [volume, setVolume] = useState<number | undefined>(sug.volumeMl);
  const [route, setRoute] = useState(sug.route);
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | undefined>();

  const choose = (id: string) => {
    setSel(id);
    const s = DRUG_BY_ID[id].suggest(c.patient.weightKg);
    setDose(s.dose || undefined);
    setVolume(s.volumeMl);
    setRoute(s.route);
    setNote('');
  };

  const inf = infusionTotals(c);
  const loss = totalBloodLoss(c);
  const w = c.patient.weightKg;
  const totals = useMemo(
    () => [
      { label: 'Окситоцин', v: `${drugTotal(c, 'oxytocin') + drugTotal(c, 'oxytocin_prev')} ЕД`, max: 'макс. 60 МЕ/сут' },
      { label: 'Транексамовая к-та', v: `${drugTotal(c, 'txa')} мг`, max: 'макс. 4000 мг' },
      { label: 'Кристаллоиды/коллоиды', v: `${inf.crystalloidColloid} мл`, max: w ? `30 мл/кг = ${w * 30} мл` : '30 мл/кг' },
      { label: 'Компоненты крови', v: `${inf.blood} мл`, max: '' },
      { label: 'ИТТ : кровопотеря', v: loss ? `${(inf.total / loss).toFixed(2)} : 1` : '—', max: 'цель 1:1' },
    ],
    [c, inf, loss, w],
  );

  return (
    <div className="stack">
      <Card title="Баланс">
        <div className="totals">
          {totals.map((t) => (
            <div key={t.label} className="stat">
              <span className="label">{t.label}</span>
              <span className="value mono">{t.v}</span>
              <span className="sub">{t.max}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Записать введение">
        {!w && <p className="warn-text small">Укажите массу тела на вкладке «Пациентка» — дозы рассчитываются на кг.</p>}
        <div className="drug-groups">
          {GROUPS.map((g) => (
            <div key={g} className="drug-group">
              <span className="muted small">{g}</span>
              <div className="chips">
                {DRUGS.filter((d) => d.group === g).map((d) => (
                  <button key={d.id} className={`chip ${sel === d.id ? 'on' : ''}`} onClick={() => choose(d.id)}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="dose-hint">
          <strong>{drug.name}</strong> <span className="ref">КР {drug.ref}</span>
          <p>{sug.text}</p>
          {drug.cautions?.map((t) => (
            <p key={t} className="warn-text small">⚠ {t}</p>
          ))}
        </div>
        <div className="grid-fields">
          <NumField label="Доза" unit={sug.unit} value={dose} onChange={setDose} />
          <TextField label="Путь введения" value={route} onChange={setRoute} />
          <NumField label="Объём" unit="мл" value={volume} onChange={setVolume} />
          <TextField label="Примечание" value={note} onChange={setNote} placeholder="№ дозы, группа, скорость…" />
          <TimeField value={at} onChange={setAt} />
        </div>
        <button
          className="btn primary big"
          onClick={() => {
            act((x, now) => addMed(x, { at: at ?? now, drug: drug.id, name: drug.name, dose: dose ?? 0, unit: sug.unit, route, volumeMl: volume, note: note || undefined }, now));
            setNote('');
            setAt(undefined);
          }}
        >
          Записать: {drug.name} {dose ? `${dose} ${sug.unit}` : ''}
        </button>
      </Card>

      {c.meds.length > 0 && (
        <Card title="Введено">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Время</th><th>Препарат</th><th>Доза</th><th>Путь</th><th>Объём</th><th>Прим.</th><th /></tr>
              </thead>
              <tbody>
                {[...c.meds].sort((a, b) => b.at.localeCompare(a.at)).map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{fmtTime(m.at)}</td>
                    <td>{m.name}</td>
                    <td className="mono">{m.dose ? `${m.dose} ${m.unit}` : '—'}</td>
                    <td>{m.route}</td>
                    <td className="mono">{m.volumeMl ?? '—'}</td>
                    <td>{m.note ?? ''}</td>
                    <td><button className="btn tiny ghost" onClick={() => act((x, now) => removeEntry(x, 'meds', m.id, now))} aria-label="Удалить">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
