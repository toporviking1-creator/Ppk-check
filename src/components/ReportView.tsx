import { useState } from 'react';
import type { Case } from '../protocol/types';
import { QUALITY_CRITERIA, QUALITY_LABEL, qualityScore, qualityValue } from '../protocol/quality';
import { fmtTime } from '../protocol/calc';
import { addNote, removeEntry, setField, setQualityOverride } from '../state/actions';
import { downloadDocx, downloadJson } from '../export/download';
import type { Act } from './ChecklistView';
import { Card } from './ui';

export function ReportView({ c, act }: { c: Case; act: Act }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const sc = qualityScore(c);

  const exportWord = async (blank = false) => {
    setBusy(true);
    setErr(null);
    try {
      await downloadDocx(c, { blank });
    } catch (e) {
      setErr(`Не удалось сформировать документ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card title="Выгрузка">
        <div className="export-buttons">
          <button className="btn primary big" disabled={busy} onClick={() => exportWord(false)}>
            ⬇ Отчёт в Word (.docx)
          </button>
          <button className="btn big" disabled={busy} onClick={() => exportWord(true)}>
            ⬇ Пустой бланк чек-листа (.docx)
          </button>
          <button className="btn" onClick={() => downloadJson(c, `ПК_${c.patient.historyNo || c.id}.json`)}>
            Резервная копия (JSON)
          </button>
          <button className="btn" onClick={() => window.print()}>
            Печать экрана
          </button>
        </div>
        {err && <p className="danger-text">{err}</p>}
        <p className="muted small">
          Отчёт включает сведения о пациентке, сводку, бригаду, чек-лист с отметками времени, динамику кровопотери, витальные функции, анализы,
          ТЭГ/РОТЭМ, введённые препараты, критерии качества, хронологический журнал и поля для подписей.
        </p>
      </Card>

      <Card title={<>Критерии качества медицинской помощи: {sc.yes}/{sc.applicable}</>}>
        <p className="muted small">Оценка рассчитывается автоматически по чек-листу и журналу; при необходимости переопределите вручную.</p>
        <ul className="quality">
          {QUALITY_CRITERIA.map((q) => {
            const v = qualityValue(c, q);
            const o = c.qualityOverride[q.id];
            return (
              <li key={q.id} className={`q q-${v}`}>
                <span className="q-n">{q.n}</span>
                <span className="q-text">{q.text}</span>
                <span className="q-val">
                  <strong>{QUALITY_LABEL[v]}</strong>
                  <span className="q-btns">
                    <button className={`btn tiny ${o === true ? 'primary' : ''}`} onClick={() => act((x, now) => setQualityOverride(x, q.id, o === true ? undefined : true, now))}>Да</button>
                    <button className={`btn tiny ${o === false ? 'primary' : ''}`} onClick={() => act((x, now) => setQualityOverride(x, q.id, o === false ? undefined : false, now))}>Нет</button>
                    {o !== undefined && <span className="muted small">вручную</span>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Исход и примечания">
        <label className="field field-wide">
          <span className="field-label">Исход</span>
          <textarea rows={2} value={c.outcome} onChange={(e) => act((x, now) => setField(x, 'outcome', e.target.value, now))} placeholder="Кровотечение остановлено на этапе… Переведена в ОРИТ…" />
        </label>
        <label className="field field-wide">
          <span className="field-label">Примечания</span>
          <textarea rows={3} value={c.notes} onChange={(e) => act((x, now) => setField(x, 'notes', e.target.value, now))} />
        </label>
      </Card>

      <Card title="Хронологический журнал">
        <div className="row">
          <input className="grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Добавить запись в журнал…" onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { act((x, now) => addNote(x, note.trim(), now)); setNote(''); } }} />
          <button className="btn" disabled={!note.trim()} onClick={() => { act((x, now) => addNote(x, note.trim(), now)); setNote(''); }}>Добавить</button>
        </div>
        <ul className="log">
          {[...c.log].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
            <li key={l.id} className={`log-${l.kind}`}>
              <span className="mono">{fmtTime(l.at)}</span>
              <span>{l.text}</span>
              {l.kind === 'note' && <button className="btn tiny ghost" onClick={() => act((x, now) => removeEntry(x, 'log', l.id, now))} aria-label="Удалить">✕</button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
