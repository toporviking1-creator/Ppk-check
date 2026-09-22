import type { Case } from '../protocol/types';
import {
  SEVERITY_LABEL,
  bloodVolumeMl,
  formatDuration,
  lastVitals,
  lossPercent,
  minutesBetween,
  severity,
  shockIndex,
  totalBloodLoss,
} from '../protocol/calc';
import { isBleeding, type Alert } from '../protocol/alerts';

export function CaseHeader(props: {
  c: Case;
  now: Date;
  alerts: Alert[];
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
  onMassive: () => void;
  onBack: () => void;
}) {
  const { c, now } = props;
  const loss = totalBloodLoss(c);
  const pct = lossPercent(c);
  const sev = severity(c);
  const v = lastVitals(c);
  const si = shockIndex(v?.hr, v?.sbp);
  const bleeding = isBleeding(c);
  const bv = bloodVolumeMl(c.patient.weightKg, c.patient.bvCoefMlKg);
  const timed = props.alerts.filter((a) => a.dueInMin !== undefined).sort((a, b) => a.dueInMin! - b.dueInMin!);
  const dangerCount = props.alerts.filter((a) => a.level === 'danger').length;
  const elapsed = c.bleedingStart ? minutesBetween(c.bleedingStart, c.bleedingStop ? new Date(c.bleedingStop) : now) : undefined;

  return (
    <div className={`case-header sev-${sev} ${bleeding ? 'is-bleeding' : ''}`}>
      <div className="ch-row">
        <button className="btn ghost back" onClick={props.onBack} aria-label="К списку пациенток">
          ‹
        </button>
        <div className="ch-name">
          <strong>{c.patient.fullName || 'Пациентка без имени'}</strong>
          <span>
            {c.patient.historyNo ? `И/Р ${c.patient.historyNo} · ` : ''}
            {c.patient.deliveryMode === 'cs' ? 'Кесарево сечение' : 'Естественные роды'}
            {c.patient.weightKg ? ` · ${c.patient.weightKg} кг` : ''}
          </span>
        </div>
        <div className="ch-timer" aria-live="off">
          <span className="label">{c.bleedingStop ? 'Остановлено через' : bleeding ? 'От начала' : 'Таймер'}</span>
          <span className="value mono">{elapsed !== undefined ? formatDuration(elapsed) : '00:00'}</span>
        </div>
      </div>
      <div className="ch-stats">
        <div className="stat">
          <span className="label">Кровопотеря</span>
          <span className="value mono">{loss} мл</span>
          <span className="sub">{pct !== undefined ? `${pct.toFixed(0)}% ОЦК${bv ? ` из ${bv}` : ''}` : 'масса не указана'}</span>
        </div>
        <div className="stat">
          <span className="label">Степень (Б1)</span>
          <span className={`value sev-text-${sev}`}>{SEVERITY_LABEL[sev].split(' ')[0]}</span>
        </div>
        <div className="stat">
          <span className="label">Шоковый индекс</span>
          <span className={`value mono ${si !== undefined && si >= 1 ? 'danger-text' : si !== undefined && si > 0.9 ? 'warn-text' : ''}`}>
            {si !== undefined ? si.toFixed(2) : '—'}
          </span>
          <span className="sub">{v ? `АД ${v.sbp ?? '—'}/${v.dbp ?? '—'}, ЧСС ${v.hr ?? '—'}` : 'нет данных'}</span>
        </div>
        <div className="ch-actions">
          {!c.bleedingStart && (
            <button className="btn danger big" onClick={props.onStart}>
              ▶ Начало кровотечения
            </button>
          )}
          {bleeding && (
            <>
              {!c.massiveAt && (
                <button className="btn warn" onClick={props.onMassive} title="Отметить диагностику массивной кровопотери (запуск контроля 10/20/40 мин)">
                  Массивная
                </button>
              )}
              <button className="btn ok" onClick={props.onStop}>
                ■ Остановлено
              </button>
            </>
          )}
          {c.bleedingStop && (
            <button className="btn ghost" onClick={props.onResume}>
              Возобновилось
            </button>
          )}
        </div>
      </div>
      {(timed.length > 0 || dangerCount > 0) && (
        <button className="ch-urgent" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          {dangerCount > 0 && <span className="badge-danger">⚠ {dangerCount}</span>}
          {timed[0] && (
            <span className={timed[0].dueInMin! < 0 ? 'danger-text' : ''}>
              {timed[0].text}:{' '}
              <strong className="mono">
                {timed[0].dueInMin! < 0 ? `просрочено ${formatDuration(-timed[0].dueInMin!)}` : formatDuration(timed[0].dueInMin!)}
              </strong>
            </span>
          )}
        </button>
      )}
    </div>
  );
}
