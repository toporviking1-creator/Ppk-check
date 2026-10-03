import type { CtgFeatures, CompensationStage, FigoCategory, HypoxiaType, PhysioCategory, Strategy, Urgency } from './logic/types';

export interface SavedAssessment {
  id: string;
  at: string;
  features: CtgFeatures;
  /** Снимок заключения на момент оценки. */
  result: {
    hypoxia: HypoxiaType;
    stage?: CompensationStage;
    physio: PhysioCategory;
    figo: FigoCategory;
    figoReasons: string[];
    strategy: Strategy;
    urgency: Urgency;
    headline: string;
    findings: string[];
    actions: string[];
  };
  /** Отмеченные выполненные действия (id). */
  done: string[];
  note: string;
}
