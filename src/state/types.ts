import type { CtgFeatures, CompensationStage, FigoCategory, HypoxiaType, PhysioCategory, Strategy, Urgency } from '../ktg/types';

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

export interface TimelineEvent {
  id: string;
  at: string;
  kind: 'timer' | 'note' | 'action';
  text: string;
}

export interface Patient {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  gaWeeks?: number;
  gaDays?: number;
  parity: string;
  anchorBaseline?: number;
  background: string;
  doctor: string;
  assessments: SavedAssessment[];
  events: TimelineEvent[];
}
