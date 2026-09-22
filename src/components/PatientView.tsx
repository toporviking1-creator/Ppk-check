import type { Case, Team } from '../protocol/types';
import { RISK_FACTORS, RISK_LABEL, riskLevel } from '../protocol/data';
import { bloodVolumeMl } from '../protocol/calc';
import { updatePatient, updateTeam } from '../state/actions';
import type { Act } from './ChecklistView';
import { Card, NumField, Segmented, TextField, TimeField } from './ui';

const TEAM_FIELDS: [keyof Team, string][] = [
  ['obstetrician', 'Врач акушер-гинеколог'],
  ['obstetrician2', '2-й акушер-гинеколог'],
  ['midwife1', '1-я акушерка'],
  ['midwife2', '2-я акушерка'],
  ['anesthesiologist', 'Анестезиолог-реаниматолог'],
  ['nurseAnesthetist', 'Медсестра-анестезист'],
  ['transfusiologist', 'Трансфузиолог'],
  ['surgeon', 'Хирург (перевязка сосудов / гистерэктомия)'],
];

export function PatientView({ c, act }: { c: Case; act: Act }) {
  const p = c.patient;
  const up = (patch: Partial<Case['patient']>) => act((x, now) => updatePatient(x, patch, now));
  const risk = riskLevel(p.riskFactors);
  const bv = bloodVolumeMl(p.weightKg, p.bvCoefMlKg);
  const bmi = p.weightKg && p.heightCm ? p.weightKg / (p.heightCm / 100) ** 2 : undefined;

  return (
    <div className="stack">
      <Card title="Пациентка">
        <div className="grid-fields">
          <TextField label="ФИО" value={p.fullName} onChange={(v) => up({ fullName: v })} wide />
          <TextField label="№ истории родов" value={p.historyNo} onChange={(v) => up({ historyNo: v })} />
          <NumField label="Возраст" unit="лет" value={p.age} onChange={(v) => up({ age: v })} />
          <NumField label="Масса тела" unit="кг" value={p.weightKg} onChange={(v) => up({ weightKg: v })} warn={!p.weightKg} />
          <NumField label="Рост" unit="см" value={p.heightCm} onChange={(v) => up({ heightCm: v })} />
          <NumField label="Срок гестации" unit="нед" value={p.gestationWeeks} onChange={(v) => up({ gestationWeeks: v })} />
          <NumField label="Роды по счёту" value={p.parity} onChange={(v) => up({ parity: v })} />
          <TextField label="Группа крови, Rh" value={p.bloodGroup} onChange={(v) => up({ bloodGroup: v })} placeholder="A(II) Rh+" />
          <NumField label="Исходный Hb" unit="г/л" value={p.initialHb} onChange={(v) => up({ initialHb: v })} />
          <TextField label="Отделение" value={p.department} onChange={(v) => up({ department: v })} placeholder="родблок / операционная" />
          <TimeField label="Рождение плода" value={p.birthTime} onChange={(v) => up({ birthTime: v })} />
        </div>
        <div className="row">
          <span className="field-label">Родоразрешение</span>
          <Segmented
            value={p.deliveryMode}
            onChange={(v) => up({ deliveryMode: v })}
            options={[
              { value: 'vaginal', label: 'Через естественные пути' },
              { value: 'cs', label: 'Кесарево сечение' },
            ]}
          />
        </div>
        <div className="row">
          <NumField label="Коэффициент ОЦК" unit="мл/кг" value={p.bvCoefMlKg} onChange={(v) => up({ bvCoefMlKg: v ?? 90 })} />
          <div className="result">
            ОЦК ≈ <strong className="mono">{bv ?? '—'}</strong> мл{bmi ? <span className="muted"> · ИМТ {bmi.toFixed(1)}</span> : null}
          </div>
        </div>
        <p className="muted small">
          В III триместре ОЦК 85–100 мл/кг (КР 2.5.1). При ожирении объём крови на кг массы значительно ниже — уменьшите коэффициент
          {bmi && bmi >= 30 ? ' (ИМТ ≥ 30!)' : ''}.
        </p>
      </Card>

      <Card title={<>Стратификация риска ПК: <span className={`risk risk-${risk}`}>{RISK_LABEL[risk]}</span></>}>
        <div className="risk-list">
          {RISK_FACTORS.map((f) => {
            const on = p.riskFactors.includes(f.id);
            return (
              <label key={f.id} className={`risk-item ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => up({ riskFactors: on ? p.riskFactors.filter((x) => x !== f.id) : [...p.riskFactors, f.id] })}
                />
                <span>{f.text}</span>
                <span className={`risk risk-${f.level}`}>{RISK_LABEL[f.level]}</span>
              </label>
            );
          })}
        </div>
        <p className="muted small">
          Низкий риск — одноплодная беременность, &lt; 4 родов, нет операций на матке и ПК в анамнезе. При высоком риске — транексамовая кислота 1,0 г в/в после родов (КР 5).
        </p>
      </Card>

      <Card title="Бригада">
        <div className="grid-fields">
          {TEAM_FIELDS.map(([k, label]) => (
            <TextField key={k} label={label} value={c.team[k]} onChange={(v) => act((x, now) => updateTeam(x, { [k]: v }, now))} />
          ))}
        </div>
      </Card>
    </div>
  );
}
