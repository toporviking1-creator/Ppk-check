import { useEffect, useRef, useState } from 'react';
import { type KasDoc, buildKas, filledRows, kasToPlainText } from '../kas/build';
import { parseEpicrisis } from '../kas/parse';
import { fileToText } from '../kas/extract';
import { kasFileName, kasToBlob } from '../kas/docx';
import { downloadBlob } from '../export/download';
import { Card, Segmented } from './ui';

const ORG_KEY = 'kas-org';
const DRAFT_KEY = 'kas-draft';
const DEFAULT_ORG = 'ГКБ №67 им. Л.А. Ворохобова филиал “Перинатальный центр”';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — черновик просто не сохранится */
  }
}

interface Draft {
  source: string;
  doc: KasDoc;
  instrMode: 'conclusion' | 'full';
}

export function KasView(props: { onBack: () => void }) {
  const [org, setOrg] = useState(() => load(ORG_KEY, DEFAULT_ORG));
  const [draft, setDraft] = useState<Draft | undefined>(() => load<Draft | undefined>(DRAFT_KEY, undefined));
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => save(ORG_KEY, org), [org]);
  useEffect(() => save(DRAFT_KEY, draft), [draft]);

  const build = (source: string, instrMode: Draft['instrMode'] = draft?.instrMode ?? 'conclusion') => {
    const epi = parseEpicrisis(source);
    if (!epi.sections.length || epi.sections.every((s) => !s.lines.length)) {
      setError('Текст эпикриза не распознан. Если PDF — это скан, скопируйте текст из МИС и вставьте в поле ниже.');
      return;
    }
    setError('');
    setDraft({ source, instrMode, doc: buildKas(epi, { org, instrMode }) });
  };

  const openFile = async (f: File) => {
    setBusy(true);
    setError('');
    try {
      const text = await fileToText(f);
      if (text.replace(/\s/g, '').length < 50) throw new Error('В файле нет текстового слоя (возможно, это скан). Скопируйте текст из МИС и вставьте в поле ниже.');
      build(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать файл.');
    } finally {
      setBusy(false);
    }
  };

  const setRow = (id: string, text: string) =>
    setDraft((d) => d && { ...d, doc: { ...d.doc, rows: d.doc.rows.map((r) => (r.id === id ? { ...r, text } : r)) } });

  if (!draft) {
    return (
      <div className="stack kas">
        <header className="kas-head">
          <button className="btn ghost" onClick={props.onBack}>
            ← Назад
          </button>
          <h2>КАС из эпикриза</h2>
        </header>
        <p className="muted">
          Загрузите этапный (выписной, переводной) эпикриз из МИС — приложение разложит его по строкам извещения о критическом акушерском
          состоянии. Строки, для которых в эпикризе нет данных, в КАС не попадут. Файл обрабатывается только на этом устройстве.
        </p>
        <Card title="Организация">
          <label className="field field-wide">
            <span className="field-label">Наименование медицинской организации (шапка КАС)</span>
            <span className="field-input">
              <input value={org} onChange={(e) => setOrg(e.target.value)} />
            </span>
          </label>
        </Card>
        <div
          className={`kas-drop ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) openFile(f);
          }}
        >
          <button className="btn danger huge" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Читаю файл…' : '📄 Выбрать файл эпикриза'}
          </button>
          <span className="muted small">PDF, DOCX или TXT · можно перетащить файл сюда</span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {error && <div className="alert alert-danger">{error}</div>}
        <Card title="…или вставьте текст эпикриза">
          <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Скопируйте эпикриз из МИС (Ctrl+A, Ctrl+C) и вставьте сюда" />
          <div className="toolbar">
            <button className="btn primary" disabled={!paste.trim()} onClick={() => build(paste)}>
              Сформировать КАС
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const { doc } = draft;
  const filled = new Set(filledRows(doc).map((r) => r.id));

  return (
    <div className="stack kas">
      <header className="kas-head">
        <button className="btn ghost" onClick={props.onBack}>
          ← Назад
        </button>
        <h2>КАС из эпикриза</h2>
      </header>
      <div className="toolbar kas-actions">
        <button className="btn primary" onClick={async () => downloadBlob(await kasToBlob(doc), kasFileName(doc))}>
          ⬇ Скачать КАС (Word)
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(kasToPlainText(doc));
              alert('Текст КАС скопирован.');
            } catch {
              alert('Не удалось скопировать — браузер не дал доступ к буферу обмена.');
            }
          }}
        >
          Копировать текст
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            if (confirm('Начать заново? Текущий черновик КАС будет удалён.')) setDraft(undefined);
          }}
        >
          Новый эпикриз
        </button>
      </div>
      <p className="muted small">
        Проверьте и при необходимости исправьте текст. Строки, начинающиеся с «#», — подзаголовки (жирным). Пустые строки в документ не
        попадут.
      </p>

      <Card title="Шапка">
        <label className="field field-wide">
          <span className="field-label">Организация</span>
          <span className="field-input">
            <input
              value={doc.org}
              onChange={(e) => {
                setOrg(e.target.value);
                setDraft({ ...draft, doc: { ...doc, org: e.target.value } });
              }}
            />
          </span>
        </label>
        <label className="field field-wide">
          <span className="field-label">Эпикриз — критическое состояние</span>
          <span className="field-input">
            <input
              value={doc.title}
              placeholder="Например: Преждевременная отслойка нормально расположенной плаценты"
              onChange={(e) => setDraft({ ...draft, doc: { ...doc, title: e.target.value } })}
            />
          </span>
        </label>
        <div className="kas-mode">
          <span className="field-label">Инструментальные исследования</span>
          <Segmented
            value={draft.instrMode}
            options={[
              { value: 'conclusion', label: 'Заключения' },
              { value: 'full', label: 'Полностью' },
            ]}
            onChange={(m) => {
              const epi = parseEpicrisis(draft.source);
              const instr = buildKas(epi, { org, instrMode: m }).rows.find((r) => r.id === 'instr')!.text;
              setDraft({ ...draft, instrMode: m, doc: { ...doc, rows: doc.rows.map((r) => (r.id === 'instr' ? { ...r, text: instr } : r)) } });
            }}
          />
        </div>
      </Card>

      {doc.rows.map((r) => (
        <section key={r.id} className={`card kas-row ${filled.has(r.id) ? '' : 'kas-empty'}`}>
          <header className="card-head">
            <h3>{r.label}</h3>
            {!filled.has(r.id) && <span className="badge">нет данных — строка пропускается</span>}
          </header>
          <textarea
            value={r.text}
            rows={Math.min(18, Math.max(2, r.text.split('\n').reduce((n, l) => n + 1 + Math.floor(l.length / 90), 0)))}
            onChange={(e) => setRow(r.id, e.target.value)}
          />
        </section>
      ))}

      <div className="toolbar kas-actions">
        <button className="btn primary" onClick={async () => downloadBlob(await kasToBlob(doc), kasFileName(doc))}>
          ⬇ Скачать КАС (Word)
        </button>
      </div>
    </div>
  );
}
