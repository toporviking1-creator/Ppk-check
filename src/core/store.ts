import { useCallback, useEffect, useState } from 'react';
import { fromLegacyKtg, fromPphCase, newLabour, normalizeLabour, type Labour, type LabourPatient } from './record';
import { normalizeCase } from '../modules/pph/protocol/case';
import type { Case as PphCase } from '../modules/pph/protocol/types';

const KEY = 'rodzal.labours.v1';
const MIGRATED = 'rodzal.migrated.v1';
/** Ключи отдельных приложений на том же домене (GitHub Pages делит localStorage между репозиториями). */
const LEGACY_KTG = 'ktg-pro.patients.v1';
const LEGACY_PPH = 'ppk-check.cases.v1';

export { uid } from './record';

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

/** Однократно забрать записи из КТГ-навигатора и ПК-чек-листа на этом устройстве. */
export function migrateLegacy(existing: Labour[]): { labours: Labour[]; imported: number } {
  if (readLS<boolean>(MIGRATED, false)) return { labours: existing, imported: 0 };
  const ids = new Set(existing.map((l) => l.id));
  const add: Labour[] = [];
  for (const p of readLS<unknown[]>(LEGACY_KTG, [])) {
    try {
      const l = fromLegacyKtg(p as Parameters<typeof fromLegacyKtg>[0]);
      if (!ids.has(l.id)) add.push(l);
    } catch {
      /* пропустить повреждённую запись */
    }
  }
  for (const c of readLS<Partial<PphCase>[]>(LEGACY_PPH, [])) {
    try {
      const l = fromPphCase(normalizeCase(c));
      if (!ids.has(l.id)) add.push(l);
    } catch {
      /* пропустить */
    }
  }
  writeLS(MIGRATED, true);
  const labours = [...existing, ...add].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { labours, imported: add.length };
}

function load(): Labour[] {
  return readLS<Partial<Labour>[]>(KEY, []).map(normalizeLabour);
}

/** Данные хранятся только на этом устройстве. */
export function useLabours() {
  const [state] = useState(() => migrateLegacy(load()));
  const [labours, setLabours] = useState<Labour[]>(state.labours);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!writeLS(KEY, labours));
  }, [labours]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLabours(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const create = useCallback((init: Partial<LabourPatient> = {}, extra: Partial<Labour> = {}) => {
    const l = { ...newLabour(init), ...extra };
    setLabours((ls) => [l, ...ls]);
    return l.id;
  }, []);

  const update = useCallback((id: string, fn: (l: Labour) => Labour) => {
    setLabours((ls) => ls.map((l) => (l.id === id ? { ...fn(l), updatedAt: new Date().toISOString() } : l)));
  }, []);

  const remove = useCallback((id: string) => setLabours((ls) => ls.filter((l) => l.id !== id)), []);

  const importMany = useCallback((incoming: unknown[]) => {
    // Принимает резервные копии платформы, а также JSON из КТГ-навигатора и ПК-чек-листа.
    const norm = incoming.map((x) => {
      const o = x as Record<string, unknown>;
      if (o && typeof o === 'object' && 'modules' in o) return normalizeLabour(o as Partial<Labour>);
      if (o && 'checks' in o && 'bloodLoss' in o) return fromPphCase(normalizeCase(o as Partial<PphCase>));
      if (o && 'assessments' in o) return fromLegacyKtg(o as unknown as Parameters<typeof fromLegacyKtg>[0]);
      throw new Error('unknown');
    });
    setLabours((ls) => {
      const byId = new Map(ls.map((l) => [l.id, l]));
      for (const l of norm) byId.set(l.id, l);
      return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    return norm.length;
  }, []);

  return { labours, create, update, remove, importMany, saveError, importedOnStart: state.imported };
}

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

export interface Settings {
  voice: boolean;
  everyMinute: boolean;
  pxPerMin: number;
  showFigo: boolean;
}

export const DEFAULT_SETTINGS: Settings = { voice: true, everyMinute: false, pxPerMin: 40, showFigo: true };
