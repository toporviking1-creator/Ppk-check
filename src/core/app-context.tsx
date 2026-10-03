import { createContext, useContext } from 'react';
import type { Labour, LabourPatient, ModuleId } from './record';
import type { Settings } from './store';
import type { Timers } from './timers';

export type Route = { view: 'home' } | { view: 'labour' } | { view: 'module'; module: ModuleId; tab?: string } | { view: 'settings' };

export interface AppApi {
  /** Активная запись «Роды» (если выбрана). */
  labour?: Labour;
  updateLabour(fn: (l: Labour) => Labour): void;
  /** Вернуть id активной записи, создав её при необходимости. */
  ensureLabour(init?: Partial<LabourPatient>, extra?: Partial<Labour>): string;
  updateById(id: string, fn: (l: Labour) => Labour): void;
  settings: Settings;
  setSettings(fn: (s: Settings) => Settings): void;
  timers: Timers;
  progress: Record<string, number>;
  setProgress(fn: (p: Record<string, number>) => Record<string, number>): void;
  go(r: Route): void;
  /** Открыть помощника, опционально сразу с вопросом. */
  ask(question?: string, shown?: string): void;
  assistantAvailable: boolean;
}

export const AppCtx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(AppCtx);
  if (!v) throw new Error('AppCtx is missing');
  return v;
}
