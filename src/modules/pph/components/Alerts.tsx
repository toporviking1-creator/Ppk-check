import { useState } from 'react';
import type { Alert } from '../protocol/alerts';
import { formatDuration } from '../protocol/calc';

export function Alerts({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts.length) return null;
  const shown = expanded ? alerts : alerts.slice(0, 3);
  return (
    <div className="alerts" role="status">
      {shown.map((a) => (
        <div key={a.id} className={`alert alert-${a.level}`}>
          <span className="alert-text">
            {a.text}
            {a.ref && <span className="ref">КР {a.ref}</span>}
          </span>
          {a.dueInMin !== undefined && (
            <span className={`countdown mono ${a.dueInMin < 0 ? 'overdue' : ''}`}>
              {a.dueInMin < 0 ? `просрочено ${formatDuration(-a.dueInMin)}` : `осталось ${formatDuration(a.dueInMin)}`}
            </span>
          )}
        </div>
      ))}
      {alerts.length > 3 && (
        <button className="btn ghost small" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Свернуть' : `Ещё подсказок: ${alerts.length - 3}`}
        </button>
      )}
    </div>
  );
}
