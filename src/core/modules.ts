import type { Paragraph, Table } from 'docx';
import type { Labour, ModuleId, Severity, TimelineEvent } from './record';

export interface ModuleStatus {
  severity: Severity;
  text: string;
}

/**
 * Описание модуля для ядра. Экран модуля подключается отдельно
 * (`modules/registry.tsx`), чтобы логика ядра не зависела от React.
 */
export interface ModuleDef {
  id: ModuleId;
  title: string;
  short: string;
  description: string;
  /** Источник: КР / книга. */
  source: string;
  /** false — модуль ещё не перенесён на ядро (показывается как «скоро»). */
  ready: boolean;
  /** Есть ли у записи данные этого модуля. */
  active(l: Labour): boolean;
  /** Краткое состояние для карточки на главной. */
  status(l: Labour, now: Date): ModuleStatus | null;
  /** События для общей хронологии. */
  events(l: Labour): TimelineEvent[];
  /** Раздел общего протокола в Word. */
  docx?(l: Labour, now: Date): (Paragraph | Table)[];
  /** Что знает модуль о текущей записи — для помощника (обычный текст). */
  assistantContext?(l: Labour, now: Date): string;
}
