import { useRef, useState } from 'react';
import { Packer } from 'docx';
import { useApp } from './app-context';
import { useDialogs } from './confirm';
import { buildLabourDocument } from './docxkit';
import { downloadJson, safeFileName } from './download';
import type { ModuleDef } from './modules';
import { saveFile } from './platform';
import { gaText, uid, type Labour } from './record';
import { combinedTimeline, MODULE_SHORT } from './timeline';
import { fmtDateTime, fmtTime } from './time';
import { Field, Icon, NumInput } from './ui';

type Def = ModuleDef & { url?: string };

function worst(l: Labour, defs: Def[], now: Date): string {
  const sev = defs.filter((d) => d.ready && d.active(l)).map((d) => d.status(l, now)?.severity);
  if (sev.includes('danger')) return 'danger';
  if (sev.includes('warn')) return 'warn';
  if (sev.includes('ok')) return 'ok';
  return 'info';
}

/** Список родов и каталог модулей. */
export function HomeView(props: {
  labours: Labour[];
  defs: Def[];
  activeId: string | null;
  setActive: (id: string | null) => void;
  create: () => void;
  importMany: (x: unknown[]) => number;
  remove: (id: string) => void;
  importedOnStart: number;
}) {
  const app = useApp();
  const { confirm, notify } = useDialogs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showTraining, setShowTraining] = useState(false);
  const now = new Date();
  const real = props.labours.filter((l) => !l.training);
  const training = props.labours.filter((l) => l.training);

  const row = (l: Labour) => {
    const statuses = props.defs.filter((d) => d.ready && d.active(l)).map((d) => ({ d, s: d.status(l, now) }));
    return (
      <div key={l.id} className={`p-row sev-${worst(l, props.defs, now)} ${props.activeId === l.id ? 'is-active' : ''}`}>
        <button
          type="button"
          className="p-open"
          onClick={() => {
            props.setActive(l.id);
            app.go({ view: 'labour' });
          }}
        >
          <b>{l.patient.label || 'Без имени'}</b>
          <span className="small muted">
            {[gaText(l.patient), `обновлено ${fmtDateTime(l.updatedAt)}`].filter(Boolean).join(' · ')}
          </span>
          {statuses.map(({ d, s }) => (
            <span key={d.id} className="small">
              <span className={`mod-tag sev-${s?.severity ?? 'info'}`}>{d.short}</span> {s?.text}
            </span>
          ))}
        </button>
        <button
          type="button"
          className="btn small ghost"
          aria-label="Удалить запись"
          onClick={async () => {
            if (await confirm(`Удалить запись «${l.patient.label || 'Без имени'}» со всеми данными модулей? Действие необратимо.`, { ok: 'Удалить', danger: true })) {
              props.remove(l.id);
              if (props.activeId === l.id) props.setActive(null);
            }
          }}
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="content">
      {props.importedOnStart > 0 && <div className="banner info">Перенесено записей из отдельных приложений на этом устройстве: {props.importedOnStart}.</div>}

      <section className="stack">
        <div className="row between">
          <h2 className="h2">Роды</h2>
          <div className="row">
            <button type="button" className="btn primary" onClick={props.create}>
              + Новые роды
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Импорт
            </button>
            {props.labours.length > 0 && (
              <button type="button" className="btn ghost" onClick={() => downloadJson(props.labours, `rodzal-backup-${new Date().toISOString().slice(0, 10)}.json`)}>
                Резервная копия
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const data = JSON.parse(await file.text());
              notify(`Импортировано записей: ${props.importMany(Array.isArray(data) ? data : [data])}`);
            } catch {
              notify('Файл не распознан: нужна резервная копия Родзала, КТГ-навигатора или ПК-чек-листа.');
            }
          }}
        />
        {real.length === 0 && (
          <div className="card">
            <p>Одна запись — одни роды. В ней собираются оценки КТГ, чек-лист кровотечения и остальные модули, общая хронология и единый протокол в Word.</p>
            <p className="small muted" style={{ marginTop: 6 }}>
              Можно сразу открыть модуль ниже: запись создастся при первом сохранении. Данные хранятся только на этом устройстве.
            </p>
          </div>
        )}
        <div className="p-list">{real.map(row)}</div>
        {training.length > 0 && (
          <>
            <button type="button" className="btn ghost small" onClick={() => setShowTraining((x) => !x)}>
              {showTraining ? 'Скрыть учебные' : `Учебные записи (${training.length})`}
            </button>
            {showTraining && <div className="p-list">{training.map(row)}</div>}
          </>
        )}
      </section>

      <section className="stack">
        <h2 className="h2">Модули</h2>
        <div className="mod-grid">
          {props.defs.map((d) =>
            d.ready ? (
              <button key={d.id} type="button" className="mod-card" onClick={() => app.go({ view: 'module', module: d.id })}>
                <span className="mod-short">{d.short}</span>
                <strong>{d.title}</strong>
                <span className="small muted">{d.description}</span>
                <span className="tiny muted">{d.source}</span>
              </button>
            ) : (
              <a key={d.id} className="mod-card soon" href={d.url} target="_blank" rel="noreferrer">
                <span className="mod-short">{d.short}</span>
                <strong>{d.title}</strong>
                <span className="small muted">{d.description}</span>
                <span className="tiny">Переносится на платформу · пока открыть отдельное приложение ↗</span>
              </a>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

/** Экран записи родов: пациентка, модули, общая хронология, протокол. */
export function LabourView(props: { defs: Def[] }) {
  const app = useApp();
  const { confirm, notify } = useDialogs();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const l = app.labour;
  if (!l) {
    return (
      <div className="content">
        <div className="card">
          <p>Запись не выбрана.</p>
          <button type="button" className="btn" onClick={() => app.go({ view: 'home' })}>
            К списку родов
          </button>
        </div>
      </div>
    );
  }
  const now = new Date();
  const p = l.patient;
  const setP = (patch: Partial<typeof p>) => app.updateLabour((x) => ({ ...x, patient: { ...x.patient, ...patch } }));
  const tl = combinedTimeline(l, props.defs).reverse();
  const filled = !!(p.label || p.gaWeeks);

  const exportWord = async () => {
    try {
      const blob = await Packer.toBlob(buildLabourDocument(l, props.defs, now));
      const r = await saveFile(blob, safeFileName('Rody', p.label, now, 'docx'));
      if (r === 'unavailable') notify('Сохранение файла недоступно в этом просмотре.');
    } catch (e) {
      notify(`Не удалось сформировать документ: ${(e as Error).message}`);
    }
  };

  return (
    <div className="content">
      {l.training && <div className="banner warn">Учебная запись — не медицинский документ.</div>}
      <div className="card">
        <div className="card-head">
          <div>
            <h3 style={{ margin: 0 }}>{p.label || 'Без имени'}</h3>
            <p className="small muted">{[gaText(p), p.parity, p.age ? `${p.age} лет` : '', p.weightKg ? `${p.weightKg} кг` : ''].filter(Boolean).join(' · ') || 'Срок, паритет и масса не указаны'}</p>
          </div>
          <button type="button" className="btn small" onClick={() => setEditing((x) => !x)}>
            {editing || !filled ? 'Свернуть' : 'Изменить'}
          </button>
        </div>
        {(editing || !filled) && (
          <div className="grid-fields">
            <Field label="ФИО / № истории" wide>
              <input id="pt-label" value={p.label} onChange={(e) => setP({ label: e.target.value })} placeholder="Иванова А. А., ИР № 123" />
            </Field>
            <Field label="Возраст, лет">
              <NumInput value={p.age} onChange={(v) => setP({ age: v })} />
            </Field>
            <Field label="Срок, нед">
              <NumInput value={p.gaWeeks} onChange={(v) => setP({ gaWeeks: v })} />
            </Field>
            <Field label="+ дней">
              <NumInput value={p.gaDays} onChange={(v) => setP({ gaDays: v })} />
            </Field>
            <Field label="Паритет">
              <input id="pt-parity" value={p.parity} onChange={(e) => setP({ parity: e.target.value })} placeholder="Б2 Р1" />
            </Field>
            <Field label="Масса тела, кг">
              <NumInput value={p.weightKg} onChange={(v) => setP({ weightKg: v })} />
            </Field>
            <Field label="Врач">
              <input id="pt-doctor" value={p.doctor} onChange={(e) => setP({ doctor: e.target.value })} />
            </Field>
            <Field label="Анамнез / факторы риска" wide>
              <textarea id="pt-bg" value={p.background} onChange={(e) => setP({ background: e.target.value })} placeholder="ЗРП, рубец на матке, ГСД, преэклампсия, безводный промежуток…" />
            </Field>
          </div>
        )}
      </div>

      <div className="mod-grid">
        {props.defs.map((d) => {
          const s = d.ready ? d.status(l, now) : null;
          if (!d.ready)
            return (
              <a key={d.id} className="mod-card soon" href={d.url} target="_blank" rel="noreferrer">
                <span className="mod-short">{d.short}</span>
                <strong>{d.title}</strong>
                <span className="tiny">Скоро на платформе · отдельное приложение ↗</span>
              </a>
            );
          return (
            <button key={d.id} type="button" className={`mod-card sev-${s?.severity ?? 'none'}`} onClick={() => app.go({ view: 'module', module: d.id })}>
              <span className="mod-short">{d.short}</span>
              <strong>{d.title}</strong>
              <span className="small">{s ? s.text : 'Не использовался'}</span>
            </button>
          );
        })}
      </div>

      <div className="row">
        <button type="button" className="btn primary" onClick={exportWord}>
          <Icon name="doc" size={18} /> Протокол родов в Word
        </button>
        {app.assistantAvailable && (
          <button type="button" className="btn blue" onClick={() => app.ask('Что сейчас главное у этой пациентки и что я мог упустить? Дай план на ближайшие 30 минут.')}>
            <Icon name="chat" size={18} /> Спросить помощника
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Общая хронология</h3>
          <span className="small muted">все модули</span>
        </div>
        <form
          className="row"
          style={{ marginBottom: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            app.updateLabour((x) => ({ ...x, events: [...x.events, { id: uid(), at: new Date().toISOString(), module: 'core', text: note.trim() }] }));
            setNote('');
          }}
        >
          <input id="tl-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Запись: ВИ, решение, событие…" style={{ flex: 1, minWidth: 180 }} />
          <button type="submit" className="btn" disabled={!note.trim()}>
            Добавить
          </button>
        </form>
        {tl.length === 0 && <p className="small muted">Пока пусто: здесь появятся оценки КТГ, события кровотечения, отметки таймеров и ваши записи.</p>}
        <ul className="timeline">
          {tl.map((e) => (
            <li key={e.id} className={`tl-item sev-${e.severity ?? 'info'}`}>
              <span className="small">
                <b>{fmtTime(e.at)}</b> <span className="mod-tag">{MODULE_SHORT[e.module]}</span> {e.text}
              </span>
              {e.module === 'core' && (
                <button
                  type="button"
                  className="btn tiny-btn ghost"
                  aria-label="Удалить запись"
                  onClick={async () => {
                    if (await confirm('Удалить эту запись из хронологии?', { ok: 'Удалить', danger: true })) app.updateLabour((x) => ({ ...x, events: x.events.filter((y) => y.id !== e.id) }));
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
