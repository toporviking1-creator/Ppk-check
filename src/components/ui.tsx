import { useEffect, useState, type ReactNode } from 'react';

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
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

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
  tone?: 'bad' | 'mid';
}

export function Seg<T extends string>(props: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={`${props.value === o.value ? 'on' : ''} ${o.tone ?? ''}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function QRow(props: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="q-row">
      <div className="q-label">
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </div>
      <div>{props.children}</div>
    </div>
  );
}

export function NumInput(props: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; suffix?: string; ariaLabel?: string; width?: number }) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value));
  useEffect(() => {
    setText((t) => (parseNum(t) === props.value ? t : props.value === undefined ? '' : String(props.value)));
  }, [props.value]);
  return (
    <span className="inline-num">
      <input
        inputMode="decimal"
        aria-label={props.ariaLabel}
        value={text}
        placeholder={props.placeholder}
        style={props.width ? { width: props.width } : undefined}
        onChange={(e) => {
          setText(e.target.value);
          props.onChange(parseNum(e.target.value));
        }}
      />
      {props.suffix && <span className="muted small">{props.suffix}</span>}
    </span>
  );
}

/** Степпер для быстрого ввода базального ритма одной рукой. */
export function Stepper(props: { value?: number; onChange: (v: number | undefined) => void; step?: number; min?: number; max?: number; placeholder?: string; ariaLabel?: string }) {
  const step = props.step ?? 5;
  const clamp = (v: number) => Math.min(props.max ?? 240, Math.max(props.min ?? 0, v));
  return (
    <span className="stepper">
      <button type="button" aria-label="Меньше" onClick={() => props.onChange(clamp((props.value ?? 140) - step))}>
        −
      </button>
      <NumInputBare value={props.value} onChange={props.onChange} placeholder={props.placeholder} ariaLabel={props.ariaLabel} />
      <button type="button" aria-label="Больше" onClick={() => props.onChange(clamp((props.value ?? 130) + step))}>
        +
      </button>
    </span>
  );
}

function NumInputBare(props: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; ariaLabel?: string }) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value));
  useEffect(() => {
    setText((t) => (parseNum(t) === props.value ? t : props.value === undefined ? '' : String(props.value)));
  }, [props.value]);
  return (
    <input
      inputMode="numeric"
      aria-label={props.ariaLabel}
      value={text}
      placeholder={props.placeholder}
      onChange={(e) => {
        setText(e.target.value);
        props.onChange(parseNum(e.target.value));
      }}
    />
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.children}</span>
    </label>
  );
}

export function Field(props: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${props.wide ? 'field-wide' : ''}`}>
      <span className="field-label">{props.label}</span>
      {props.children}
    </label>
  );
}

export function Toast(props: { text: string | null }) {
  if (!props.text) return null;
  return (
    <div className="toast" role="status">
      {props.text}
    </div>
  );
}

export function useToast(): [string | null, (t: string) => void] {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 2200);
    return () => clearTimeout(t);
  }, [text]);
  return [text, setText];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const ICONS: Record<string, string> = {
  assess: 'M3 12h4l3-8 4 16 3-8h4',
  timer: 'M12 8v5l3 2M9 2h6M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  train: 'M3 7l9-4 9 4-9 4-9-4zm4 2.5V15c0 1.5 2.5 3 5 3s5-1.5 5-3V9.5M21 7v6',
  book: 'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10v-1a6 6 0 0 1 12 0v1M17 11a3 3 0 1 0 0-6M22 21v-1a5 5 0 0 0-4-4.9',
};

export function Icon(props: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={props.size ?? 22} height={props.size ?? 22} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[props.name] ?? ''} />
    </svg>
  );
}
