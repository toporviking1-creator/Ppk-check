import type { ModuleDef } from './modules';
import type { Labour, TimelineEvent } from './record';

export const MODULE_SHORT: Record<string, string> = {
  core: 'Запись',
  ktg: 'КТГ',
  pph: 'ПК',
  second: 'II период',
  ovr: 'ОВР',
  pe: 'ПЭ',
};

/** Общая хронология: ручные записи + события всех модулей, по времени. */
export function combinedTimeline(l: Labour, defs: ModuleDef[]): TimelineEvent[] {
  const all = [...l.events];
  for (const d of defs) if (d.ready && d.active(l)) all.push(...d.events(l));
  return all.sort((a, b) => a.at.localeCompare(b.at));
}
