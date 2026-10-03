import { useCallback, useEffect, useRef, useState } from 'react';
import { alertAll, beep, keepAwake, speak } from '../lib/voice';
import { readLS, writeLS } from './store';

export interface Milestone {
  min: number;
  title: string;
  text: string;
  voice: string;
}

/** Правило 3-6-9-12-15 для пролонгированной децелерации (Chandraharan). */
export const MILESTONES: Milestone[] = [
  {
    min: 3,
    title: 'Помощь и причина',
    text: 'Позвать на помощь. Исключить острые события: отслойку плаценты, выпадение пуповины, разрыв матки. Устранить причину: положение, окситоцин, токолиз, гипотония.',
    voice: 'Три минуты. Позовите помощь. Исключите отслойку, выпадение пуповины и разрыв матки. Устраните причину.',
  },
  {
    min: 6,
    title: 'В операционную',
    text: 'Нет признаков восстановления — перевод в операционную (или развернуть её).',
    voice: 'Шесть минут. Нет восстановления — переводите в операционную.',
  },
  {
    min: 9,
    title: 'Решение',
    text: 'Нет восстановления к 9 мин — решение о родоразрешении самым быстрым безопасным способом.',
    voice: 'Девять минут. Примите решение о родоразрешении.',
  },
  {
    min: 12,
    title: 'Родоразрешение',
    text: 'Начато извлечение плода (КС или влагалищные оперативные роды).',
    voice: 'Двенадцать минут. Должно идти родоразрешение.',
  },
  {
    min: 15,
    title: 'Рождение',
    text: 'Плод должен быть извлечён к 15 мин.',
    voice: 'Пятнадцать минут. Плод должен быть извлечён.',
  },
];

export interface LogEntry {
  at: number;
  text: string;
}

export interface ProlongedState {
  startedAt: number | null;
  stoppedAt: number | null;
  stopReason?: string;
  log: LogEntry[];
}

const PKEY = 'ktg-pro.prolonged.v1';
const RKEY = 'ktg-pro.reassess.v1';

export interface ReassessState {
  dueAt: number | null;
  minutes: number;
}

/** Глобальные таймеры: пролонгированная децелерация и напоминание о переоценке. */
export function useTimers(voice: boolean, everyMinute: boolean) {
  const [prolonged, setProlonged] = useState<ProlongedState>(() => readLS<ProlongedState>(PKEY, { startedAt: null, stoppedAt: null, log: [] }));
  const [reassess, setReassess] = useState<ReassessState>(() => readLS<ReassessState>(RKEY, { dueAt: null, minutes: 30 }));
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef<Set<number>>(new Set());
  const release = useRef<(() => void) | null>(null);

  useEffect(() => void writeLS(PKEY, prolonged), [prolonged]);
  useEffect(() => void writeLS(RKEY, reassess), [reassess]);

  const running = prolonged.startedAt !== null && prolonged.stoppedAt === null;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), running ? 250 : 1000);
    return () => clearInterval(t);
  }, [running]);

  // Удерживать экран включённым во время таймера.
  useEffect(() => {
    if (!running) {
      release.current?.();
      release.current = null;
      return;
    }
    let cancelled = false;
    void keepAwake().then((r) => {
      if (cancelled) r();
      else release.current = r;
    });
    return () => {
      cancelled = true;
    };
  }, [running]);

  // Голосовые вехи.
  useEffect(() => {
    if (!running || prolonged.startedAt === null) return;
    const elapsedSec = (now - prolonged.startedAt) / 1000;
    for (const m of MILESTONES) {
      const key = m.min * 60;
      if (elapsedSec >= key && elapsedSec < key + 5 && !announced.current.has(key)) {
        announced.current.add(key);
        alertAll(m.voice, voice, m.min >= 9);
      }
    }
    if (everyMinute) {
      const whole = Math.floor(elapsedSec / 60);
      const key = whole * 60 + 0.5; // отдельное пространство ключей
      if (whole > 0 && elapsedSec - whole * 60 < 2 && !MILESTONES.some((m) => m.min === whole) && !announced.current.has(key)) {
        announced.current.add(key);
        beep(660, 120);
        speak(`${whole} ${minutesWord(whole)}`, voice);
      }
    }
  }, [now, running, prolonged.startedAt, voice, everyMinute]);

  // Напоминание о переоценке.
  useEffect(() => {
    if (reassess.dueAt !== null && now >= reassess.dueAt) {
      alertAll('Время переоценить КТГ.', voice);
      setReassess((r) => ({ ...r, dueAt: null }));
    }
  }, [now, reassess.dueAt, voice]);

  const startProlonged = useCallback((agoSec = 0) => {
    announced.current = new Set();
    // Вехи, которые уже прошли при старте «задним числом», не озвучиваем повторно.
    for (const m of MILESTONES) if (m.min * 60 < agoSec) announced.current.add(m.min * 60);
    const at = Date.now() - agoSec * 1000;
    setProlonged({ startedAt: at, stoppedAt: null, log: [{ at, text: 'Начало пролонгированной децелерации' }] });
    beep(880, 150, 1);
  }, []);

  const logProlonged = useCallback((text: string) => {
    setProlonged((p) => ({ ...p, log: [...p.log, { at: Date.now(), text }] }));
  }, []);

  const stopProlonged = useCallback((reason: string) => {
    setProlonged((p) => (p.startedAt === null ? p : { ...p, stoppedAt: Date.now(), stopReason: reason, log: [...p.log, { at: Date.now(), text: reason }] }));
  }, []);

  const resetProlonged = useCallback(() => {
    announced.current = new Set();
    setProlonged({ startedAt: null, stoppedAt: null, log: [] });
  }, []);

  const remind = useCallback((minutes: number) => setReassess({ minutes, dueAt: Date.now() + minutes * 60_000 }), []);
  const cancelRemind = useCallback(() => setReassess((r) => ({ ...r, dueAt: null })), []);

  return { now, prolonged, running, startProlonged, logProlonged, stopProlonged, resetProlonged, reassess, remind, cancelRemind };
}

export type Timers = ReturnType<typeof useTimers>;

export function minutesWord(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 'минута';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'минуты';
  return 'минут';
}
