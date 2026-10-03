import ktg from './knowledge/ktg.md?raw';
import chandraharan from './knowledge/chandraharan.md?raw';
import { CHECKLIST, GUIDELINE } from '../../modules/pph/protocol/data';
import { DRUGS } from '../../modules/pph/protocol/drugs';

const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').trim();

/** База ПК собирается из того же чек-листа и справочника доз, что использует приложение. */
export function pphKnowledge(weightKg?: number): string {
  const lines = [`# ПК: КР «${GUIDELINE.title}» (${GUIDELINE.year}), МКБ-10 ${GUIDELINE.icd}`, 'Пункты чек-листа приложения (раздел КР, УУР/УДД):'];
  for (const s of CHECKLIST) {
    lines.push(`\n## ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}`);
    for (const it of s.items) {
      lines.push(`- ${it.text}${it.detail ? `. ${it.detail}` : ''} [КР ${it.ref}${it.grade ? `, ${it.grade}` : ''}]${it.role ? ` (${it.role})` : ''}${it.onlyFor ? ` — только ${it.onlyFor === 'cs' ? 'КС' : 'роды'}` : ''}`);
    }
  }
  lines.push(`\n## Дозы в приложении${weightKg ? ` (для массы ${weightKg} кг)` : ''}`);
  for (const d of DRUGS) {
    const sug = d.suggest(weightKg);
    lines.push(`- ${d.name}: ${sug.text} [КР ${d.ref}]${d.cautions?.length ? `. Осторожно: ${d.cautions.join('; ')}` : ''}`);
  }
  return lines.join('\n');
}

export function knowledgeBase(opts: { modules: string[]; weightKg?: number }): string {
  const parts: string[] = [];
  const ch = strip(chandraharan);
  if (opts.modules.includes('ktg') || !opts.modules.length) {
    parts.push(ktg);
    if (ch) parts.push(`# Конспект книги Chandraharan (авторский)\n${ch}`);
  }
  if (opts.modules.includes('pph')) parts.push(pphKnowledge(opts.weightKg));
  return parts.join('\n\n---\n\n');
}

export const HAS_CHANDRAHARAN = strip(chandraharan).length > 0;
