import type { Case } from './types';
import { ITEM_BY_ID, type ChecklistItem } from './data';
import { itemApplies } from './case';
import { isBleeding, isClosed, isDone, massiveBranch, procoagulantsUsed } from './alerts';
import { drugGiven, latestLabValue, pphThreshold, totalBloodLoss } from './calc';

/**
 * «Что делать сейчас» — невыполненные пункты чек-листа в порядке алгоритма (Б2, Б4, Б5)
 * с учётом текущей ситуации. Возвращает пункты по убыванию приоритета.
 */
export function nextSteps(c: Case): ChecklistItem[] {
  const ids: string[] = [];
  const add = (...x: string[]) => ids.push(...x);
  const bleeding = isBleeding(c);
  const loss = totalBloodLoss(c);
  const massive = massiveBranch(c);
  const inversion = c.causes.includes('inversion');

  if (!c.bleedingStart) {
    // До кровотечения — профилактика.
    add('prev_active3', 'prev_oxy', 'prev_cs_oxy', 'prev_cs_traction');
    if (c.patient.riskFactors.length) add('prev_txa');
    add('prev_tone', 'prev_observe');
  } else if (bleeding) {
    if (inversion) add('inv_stoputer', 'inv_call', 'inv_iv', 'inv_reposition', 'inv_tocol');

    // Первые минуты: помощь, доступ, анализы, утеротоник, ТК, инфузия.
    add('alert_call', 'alert_anesth', 'first_iv2', 'first_labs');
    if (!inversion) add('drug_oxytocin');
    add('drug_txa', 'inf_crystalloid', 'first_bladder', 'first_o2', 'first_monitor', 'first_gravimetric');
    add('cause_inspect', 'cause_manual', 'cause_bimanual');
    if (c.causes.includes('trauma') || c.causes.length === 0) add('cause_suture');
    add('first_position', 'inf_warm', 'first_leewhite', 'alert_patient', 'alert_transf', 'alert_adkc');

    // Продолжается после окситоцина — мизопростол и баллон.
    if (isDone(c, 'drug_oxytocin') && !inversion) {
      add('drug_miso');
      if (c.causes.includes('tonus') || c.causes.length === 0) add('drug_balloon');
    }
    if (loss >= pphThreshold(c.patient.deliveryMode)) add('alert_or');

    if (massive) {
      add('mas_or', 'mas_inform', 'mas_10min', 'mas_order', 'mas_decision20');
      const hb = latestLabValue(c, 'hb');
      const fib = latestLabValue(c, 'fib');
      const plt = latestLabValue(c, 'plt');
      const ca = latestLabValue(c, 'caIon');
      if (hb === undefined || hb < 70 || loss >= 1500) add('mas_rbc40');
      add('mas_ffp');
      if (fib !== undefined && fib < 2) add('mas_cryo');
      if (plt !== undefined && plt < 80) add('mas_plt');
      if (ca !== undefined && ca < 0.9) add('mas_ca');
      add('mas_coag30', 'mas_abg', 'mas_vaso', 'an_general', 'mas_cellsaver');
      if (isDone(c, 'mas_decision20') || isDone(c, 'mas_or')) {
        add('surg_compress', 'surg_balloon_sutures', 'surg_lap', 'surg_devasc', 'surg_embol', 'surg_hyst');
        if (drugGiven(c, 'txa')) add('surg_txa2');
      }
    }
  } else {
    // Кровотечение остановлено.
    if (inversion) add('inv_uterotonic', 'inv_abx', 'inv_prevent');
    if (procoagulantsUsed(c)) add('after_coag6');
    if (procoagulantsUsed(c) || massive || drugGiven(c, 'rbc')) add('after_vte');
    add('after_cbc', 'prev_observe');
    if (massive || drugGiven(c, 'rbc')) add('after_sheehan');
  }

  if (c.timing === 'late') add('late_us', 'late_culture', 'late_hysteroscopy');

  const seen = new Set<string>();
  return ids
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ITEM_BY_ID[id])
    .filter((i) => i && itemApplies(c, i) && !isClosed(c, i.id));
}
