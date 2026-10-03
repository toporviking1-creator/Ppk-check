import type { ModuleDef } from '../core/modules';
import type { ModuleId } from '../core/record';
import { ktgDef } from './ktg/def';
import { pphDef } from './pph/def';

function soon(id: ModuleId, title: string, short: string, description: string, source: string, url: string): ModuleDef & { url: string } {
  return { id, title, short, description, source, ready: false, url, active: () => false, status: () => null, events: () => [] };
}

/** Порядок — по ходу родов. */
export const MODULES: (ModuleDef & { url?: string })[] = [
  ktgDef,
  soon('second', 'Второй период родов', 'II период', 'Положения под плоскость таза, таймер позы, развилка ОВР/КС', 'Авторский алгоритм', 'https://toporviking1-creator.github.io/Vtoroi-period-rodov/'),
  soon('ovr', 'Оперативные влагалищные роды', 'ОВР', 'Выбор метода, таймер и счётчики, критерии неуспеха, протокол', 'КР «Оперативные влагалищные роды» (РОАГ, 2023)', 'https://toporviking1-creator.github.io/Operativevaginal/'),
  pphDef,
  soon('pe', 'Преэклампсия', 'ПЭ', 'Оценка тяжести, эклампсия, магний, АД, HELLP', 'КР «Преэклампсия…» (РОАГ, 2024)', 'https://toporviking1-creator.github.io/Pe-navigator/'),
];

export const READY_MODULES = MODULES.filter((m) => m.ready);

export function moduleById(id: ModuleId) {
  return MODULES.find((m) => m.id === id);
}
