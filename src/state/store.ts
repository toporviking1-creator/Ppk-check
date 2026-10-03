import { useCallback, useEffect, useState } from 'react';
import type { Patient } from './types';

const KEY = 'ktg-pro.patients.v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newPatient(): Patient {
  const now = new Date().toISOString();
  return { id: uid(), createdAt: now, updatedAt: now, label: '', parity: '', background: '', doctor: '', assessments: [], events: [] };
}

export function normalizePatient(p: Partial<Patient>): Patient {
  const base = newPatient();
  return {
    ...base,
    ...p,
    id: p.id ?? base.id,
    assessments: Array.isArray(p.assessments) ? p.assessments : [],
    events: Array.isArray(p.events) ? p.events : [],
  };
}

/** Безопасный доступ к localStorage (может быть недоступен в приватном режиме). */
export function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLS(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Данные пациенток хранятся только на этом устройстве. */
export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>(() => readLS<Partial<Patient>[]>(KEY, []).map(normalizePatient));
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!writeLS(KEY, patients));
  }, [patients]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setPatients(readLS<Partial<Patient>[]>(KEY, []).map(normalizePatient));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const create = useCallback((init: Partial<Patient> = {}) => {
    const p = { ...newPatient(), ...init };
    setPatients((ps) => [p, ...ps]);
    return p.id;
  }, []);

  const update = useCallback((id: string, fn: (p: Patient) => Patient) => {
    setPatients((ps) => ps.map((p) => (p.id === id ? { ...fn(p), updatedAt: new Date().toISOString() } : p)));
  }, []);

  const remove = useCallback((id: string) => setPatients((ps) => ps.filter((p) => p.id !== id)), []);

  const importMany = useCallback((incoming: Partial<Patient>[]) => {
    const norm = incoming.map(normalizePatient);
    setPatients((ps) => {
      const byId = new Map(ps.map((p) => [p.id, p]));
      for (const p of norm) byId.set(p.id, p);
      return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    return norm.length;
  }, []);

  return { patients, create, update, remove, importMany, saveError };
}

/** Настройки и прогресс тренажёра. */
export interface Settings {
  voice: boolean;
  pxPerMin: number;
  showFigo: boolean;
}

export const DEFAULT_SETTINGS: Settings = { voice: true, pxPerMin: 40, showFigo: true };

export function useStored<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    const stored = readLS<T>(key, init);
    return typeof init === 'object' && init !== null && !Array.isArray(init) ? { ...init, ...stored } : stored;
  });
  useEffect(() => {
    writeLS(key, v);
  }, [key, v]);
  return [v, setV];
}
