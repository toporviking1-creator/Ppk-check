import { useRef } from 'react';
import type { Case } from '../protocol/types';
import { SEVERITY_LABEL, fmtDateTime, severity, totalBloodLoss } from '../protocol/calc';
import { isBleeding } from '../protocol/alerts';
import { GUIDELINE, CHECKLIST } from '../protocol/data';
import { newCase } from '../protocol/case';
import { downloadDocx, downloadJson } from '../export/download';

export function CaseList(props: {
  cases: Case[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onImport: (cases: Partial<Case>[]) => number;
  onTraining: () => void;
  onKas: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const n = props.onImport(Array.isArray(data) ? data : [data]);
      alert(`Импортировано случаев: ${n}`);
    } catch {
      alert('Файл не распознан — ожидается JSON-копия из приложения.');
    }
  };

  return (
    <div className="home">
      <header className="home-head">
        <div className="logo" aria-hidden>
          ПК
        </div>
        <div>
          <h1>Послеродовое кровотечение</h1>
          <p className="muted">
            Чек-лист у постели пациентки · КР {GUIDELINE.year} · {CHECKLIST.reduce((s, x) => s + x.items.length, 0)} пунктов · выгрузка в Word
          </p>
        </div>
      </header>

      <button className="btn danger huge" onClick={props.onCreate}>
        + Новая пациентка — начать чек-лист
      </button>
      <button className="btn big training-start" onClick={props.onTraining}>
        🎓 Тренировка по сценарию
      </button>
      <button className="btn big kas-start" onClick={props.onKas}>
        📝 КАС из эпикриза
      </button>

      <section className="case-list">
        {props.cases.length === 0 && <p className="muted center">Случаев пока нет. Данные хранятся только на этом устройстве.</p>}
        {props.cases.map((c) => {
          const sev = severity(c);
          return (
            <div key={c.id} className={`case-row sev-${sev}`}>
              <button className="case-open" onClick={() => props.onOpen(c.id)}>
                <strong>{c.patient.fullName || 'Без имени'}</strong>
                <span className="muted small">
                  {c.patient.historyNo ? `И/Р ${c.patient.historyNo} · ` : ''}
                  {fmtDateTime(c.bleedingStart ?? c.createdAt)}
                </span>
                <span className="small">
                  {totalBloodLoss(c)} мл · {SEVERITY_LABEL[sev]}
                  {c.training ? <span className="badge"> 🎓 тренировка</span> : isBleeding(c) && <span className="badge danger"> идёт кровотечение</span>}
                </span>
              </button>
              <button
                className="btn tiny ghost"
                aria-label="Удалить"
                onClick={() => {
                  if (confirm(`Удалить случай «${c.patient.fullName || 'Без имени'}»? Действие необратимо.`)) props.onDelete(c.id);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </section>

      <div className="home-tools">
        <button className="btn" onClick={() => downloadDocx(newCase(), { blank: true })}>
          ⬇ Пустой бланк чек-листа (Word)
        </button>
        <button className="btn" disabled={!props.cases.length} onClick={() => downloadJson(props.cases, `ПК_все_случаи_${new Date().toISOString().slice(0, 10)}.json`)}>
          Экспорт всех (JSON)
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Импорт JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted small disclaimer">
        Приложение — инструмент поддержки решений и документирования по КР «{GUIDELINE.title}» ({GUIDELINE.year}). Не заменяет клиническое
        решение врача. Работает без интернета; персональные данные не покидают устройство.
      </p>
    </div>
  );
}
