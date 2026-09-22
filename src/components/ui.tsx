import { useEffect, useState, type ReactNode } from 'react';

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function parseNum(s: string): number | undefined {
  const t = s.replace(',', '.').trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** ISO → значение для <input type="datetime-local"> в локальном времени. */
export function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function NumField(props: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  unit?: string;
  step?: string;
  placeholder?: string;
  warn?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value));
  useEffect(() => {
    setText((t) => (parseNum(t) === props.value ? t : props.value === undefined ? '' : String(props.value)));
  }, [props.value]);
  return (
    <label className={`field ${props.warn ? 'field-warn' : ''}`}>
      <span className="field-label">{props.label}</span>
      <span className="field-input">
        <input
          id={props.id}
          inputMode="decimal"
          value={text}
          placeholder={props.placeholder}
          onChange={(e) => {
            setText(e.target.value);
            props.onChange(parseNum(e.target.value));
          }}
        />
        {props.unit && <span className="unit">{props.unit}</span>}
      </span>
    </label>
  );
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean }) {
  return (
    <label className={`field ${props.wide ? 'field-wide' : ''}`}>
      <span className="field-label">{props.label}</span>
      <span className="field-input">
        <input value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function TimeField(props: { label?: string; value?: string; onChange: (iso: string | undefined) => void }) {
  return (
    <label className="field">
      <span className="field-label">{props.label ?? 'Время'}</span>
      <span className="field-input">
        <input type="datetime-local" value={toLocalInput(props.value)} onChange={(e) => props.onChange(fromLocalInput(e.target.value))} />
      </span>
    </label>
  );
}

export function Card(props: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <header className="card-head">
          {props.title && <h3>{props.title}</h3>}
          {props.actions && <div className="card-actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={props.value === o.value ? 'active' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Ref({ children }: { children: ReactNode }) {
  return <span className="ref">КР {children}</span>;
}
