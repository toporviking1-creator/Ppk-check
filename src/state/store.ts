import { useCallback, useEffect, useState } from 'react';
import type { Case } from '../protocol/types';
import { newCase, normalizeCase } from '../protocol/case';

const KEY = 'ppk-check.cases.v1';

/** Данные пациенток хранятся только на этом устройстве (localStorage), на сервер не передаются. */
export function loadCases(): Case[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Case>[];
    return Array.isArray(parsed) ? parsed.map(normalizeCase) : [];
  } catch {
    return [];
  }
}

function saveCases(cases: Case[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(cases));
    return true;
  } catch {
    return false;
  }
}

export function useCases() {
  const [cases, setCases] = useState<Case[]>(() => loadCases());
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setSaveError(!saveCases(cases));
  }, [cases]);

  // Синхронизация между вкладками.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setCases(loadCases());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const create = useCallback(() => {
    const c = newCase();
    setCases((cs) => [c, ...cs]);
    return c.id;
  }, []);

  const update = useCallback((id: string, fn: (c: Case) => Case) => {
    setCases((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const remove = useCallback((id: string) => {
    setCases((cs) => cs.filter((c) => c.id !== id));
  }, []);

  const importCases = useCallback((incoming: Partial<Case>[]) => {
    const norm = incoming.map(normalizeCase);
    setCases((cs) => {
      const byId = new Map(cs.map((c) => [c.id, c]));
      for (const c of norm) byId.set(c.id, c);
      return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    return norm.length;
  }, []);

  return { cases, create, update, remove, importCases, saveError };
}
