import type { ModuleDef } from '../../core/modules';
import type { Labour, Severity } from '../../core/record';
import { computeAlerts, isBleeding } from './protocol/alerts';
import { visibleSections, sectionProgress } from './protocol/case';
import { formatDuration, lastLab, lastVitals, lossPercent, minutesBetween, SEVERITY_LABEL, severity, shockIndex, totalBloodLoss } from './protocol/calc';
import { qualityScore } from './protocol/quality';
import { buildPphChildren } from './export/docx';
import type { Case } from './protocol/types';

const SEV_TO: Record<string, Severity> = { none: 'info', physiological: 'ok', pathological: 'warn', critical: 'danger' };

function pph(l: Labour): Case | undefined {
  return l.modules.pph;
}

export function pphSummary(c: Case, now: Date): string {
  const lines: string[] = [];
  const loss = totalBloodLoss(c);
  const pct = lossPercent(c);
  lines.push(`Родоразрешение: ${c.patient.deliveryMode === 'cs' ? 'кесарево сечение' : 'через естественные родовые пути'}; ПК ${c.timing === 'late' ? 'позднее' : 'раннее'}.`);
  if (c.bleedingStart) {
    const end = c.bleedingStop ?? now.toISOString();
    lines.push(`Кровотечение с ${new Date(c.bleedingStart).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}, длится ${formatDuration(minutesBetween(c.bleedingStart, end))}${c.bleedingStop ? ' (остановлено)' : ''}.`);
  }
  lines.push(`Кровопотеря ${loss} мл${pct !== undefined ? ` (${Math.round(pct)}% ОЦК)` : ''}, степень: ${SEVERITY_LABEL[severity(c)].toLowerCase()}${c.massiveAt ? '; массивная кровопотеря диагностирована' : ''}.`);
  const v = lastVitals(c);
  if (v) {
    const si = shockIndex(v.hr, v.sbp);
    lines.push(`Последние витальные: ЧСС ${v.hr ?? '—'}, АД ${v.sbp ?? '—'}/${v.dbp ?? '—'}${si ? `, ШИ ${si.toFixed(1)}` : ''}${v.diuresis !== undefined ? `, диурез ${v.diuresis} мл/ч` : ''}.`);
  }
  const lab = lastLab(c);
  if (lab) {
    const parts = [lab.hb && `Hb ${lab.hb}`, lab.plt && `тромб. ${lab.plt}`, lab.fib && `фибриноген ${lab.fib}`, lab.lactate && `лактат ${lab.lactate}`].filter(Boolean);
    if (parts.length) lines.push(`Последние анализы: ${parts.join(', ')}.`);
  }
  if (c.causes.length) lines.push(`Причины (4Т): ${c.causes.join(', ')}.`);
  if (c.meds.length) lines.push(`Введено: ${c.meds.map((m) => `${m.name} ${m.dose} ${m.unit}`).join('; ')}.`);
  const prog = visibleSections(c).map((s) => {
    const p = sectionProgress(c, s);
    return `${s.title} ${p.done}/${p.total}`;
  });
  lines.push(`Чек-лист: ${prog.join('; ')}.`);
  const alerts = computeAlerts(c, now).slice(0, 6);
  if (alerts.length) lines.push(`Подсказки приложения: ${alerts.map((a) => a.text).join(' | ')}.`);
  return lines.join('\n');
}

export const pphDef: ModuleDef = {
  id: 'pph',
  title: 'Послеродовое кровотечение',
  short: 'ПК',
  description: 'Чек-лист у постели, кровопотеря, дозы, анализы и РОТЭМ, критерии качества',
  source: 'КР «Послеродовое кровотечение» (РОАГ, 2025)',
  ready: true,
  active: (l) => !!pph(l),
  status(l, now) {
    const c = pph(l);
    if (!c) return null;
    const loss = totalBloodLoss(c);
    const sev = severity(c);
    const bleeding = isBleeding(c);
    const text = `${bleeding ? 'Кровотечение продолжается' : c.bleedingStop ? 'Остановлено' : c.bleedingStart ? 'Наблюдение' : 'Не начато'} · ${loss} мл · ${SEVERITY_LABEL[sev].toLowerCase()}`;
    const q = qualityScore(c);
    return { severity: bleeding ? 'danger' : SEV_TO[sev] ?? 'info', text: c.bleedingStop ? `${text} · качество ${q.yes}/${q.applicable}` : text + (now && c.bleedingStart && bleeding ? ` · ${formatDuration(minutesBetween(c.bleedingStart, now))}` : '') };
  },
  events(l) {
    const c = pph(l);
    if (!c) return [];
    return c.log
      .filter((e) => e.kind !== 'uncheck')
      .map((e) => ({
        id: `pph-${e.id}`,
        at: e.at,
        module: 'pph' as const,
        text: e.text,
        severity: (e.kind === 'event' ? 'danger' : e.kind === 'bloodloss' ? 'warn' : 'info') as Severity,
      }));
  },
  docx(l) {
    const c = pph(l);
    return c ? buildPphChildren(c, { includeLog: false }) : [];
  },
  assistantContext(l, now) {
    const c = pph(l);
    return c ? pphSummary(c, now) : '';
  },
};
