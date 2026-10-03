import type {
  BaselineTrend,
  ClinicalContext,
  CompensationStage,
  DecelFreq,
  DecelNature,
  FigoCategory,
  HypoxiaType,
  PhysioCategory,
  Stage,
  Tri,
  Urgency,
  VarBand,
} from './types';

export const STAGE_LABEL: Record<Stage, string> = {
  antenatal: 'До родов / при поступлении',
  first: 'I период',
  second: 'II период',
};

export const VAR_LABEL: Record<VarBand, string> = {
  reduced: '< 5 уд/мин',
  normal: '5–25 уд/мин',
  increased: '> 25 уд/мин',
};

export const TREND_LABEL: Record<BaselineTrend, string> = {
  stable: 'Стабильный',
  rising: 'Повышается',
  falling: 'Снижается',
  unstable: 'Нестабильный',
};

export const TRI_LABEL: Record<Tri, string> = { present: 'Есть', absent: 'Нет', unknown: 'Не ясно' };

export const DECEL_FREQ_LABEL: Record<DecelFreq, string> = {
  none: 'Нет',
  occasional: 'Единичные',
  repetitive: 'Повторяющиеся',
};

export const DECEL_NATURE_LABEL: Record<DecelNature, string> = {
  early: 'Ранние (компрессия головки)',
  rapid: 'Быстрые — «вариабельные» (пуповина)',
  gradual: 'Постепенные — «поздние»',
  mixed: 'Смешанные',
};

export const HYPOXIA_LABEL: Record<HypoxiaType, string> = {
  none: 'Признаков гипоксии нет',
  acute: 'Острая гипоксия',
  subacute: 'Подострая гипоксия',
  gradual: 'Постепенно развивающаяся гипоксия',
  chronic: 'Хроническая (существовавшая до родов) гипоксия',
  nonhypoxic: 'Негипоксическая причина',
};

export const HYPOXIA_SHORT: Record<HypoxiaType, string> = {
  none: 'Нет гипоксии',
  acute: 'Острая',
  subacute: 'Подострая',
  gradual: 'Постепенно развивающаяся',
  chronic: 'Хроническая',
  nonhypoxic: 'Негипоксическая',
};

export const STAGE_COMP_LABEL: Record<CompensationStage, string> = {
  compensated: 'Компенсирован (гипоксический стресс)',
  catecholamine: 'Напряжение компенсации (катехоламины)',
  decompensated: 'Декомпенсация',
  terminal: 'Претерминальное состояние',
};

export const FIGO_LABEL: Record<FigoCategory, string> = {
  normal: 'Нормальная',
  suspicious: 'Сомнительная',
  pathological: 'Патологическая',
};

export const PHYSIO_LABEL: Record<PhysioCategory, string> = {
  normal: 'Нормальная',
  suspicious: 'Сомнительная',
  pathological: 'Патологическая',
  urgent: 'Нужно срочное вмешательство',
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  routine: 'Плановое наблюдение',
  attention: 'Внимание: устранить причину',
  urgent: 'Срочно: у постели',
  emergency: 'Экстренно',
};

export const CONTEXT_LABEL: Record<keyof ClinicalContext, string> = {
  oxytocin: 'Окситоцин',
  pushing: 'Потуги',
  epidural: 'Эпидуральная анальгезия',
  hypotension: 'Гипотония матери',
  supine: 'Лежит на спине',
  fever: 'Лихорадка ≥ 38 °C / хориоамнионит',
  meconium: 'Меконий в водах',
  bleeding: 'Кровотечение / боль, гипертонус матки',
  cordProlapse: 'Выпадение пуповины',
  scarPain: 'Рубец + боль / подозрение на разрыв',
  fgr: 'ЗРП / маловодие',
  postterm: 'Срок ≥ 41 нед',
  drugs: 'Опиоиды / магния сульфат',
};
