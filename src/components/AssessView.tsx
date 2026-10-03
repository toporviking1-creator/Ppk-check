import { useMemo } from 'react';
import { interpret } from '../ktg/interpret';
import { CONTEXT_LABEL, DECEL_NATURE_LABEL, STAGE_LABEL } from '../ktg/labels';
import { recordText } from '../ktg/record';
import { EMPTY_FEATURES, type ClinicalContext, type CtgFeatures } from '../ktg/types';
import type { Patient } from '../state/types';
import { contextKeys, ResultPanel } from './ResultPanel';
import { copyText, NumInput, QRow, Seg, Stepper, Toggle } from './ui';

export interface Draft {
  features: CtgFeatures;
  done: string[];
  note: string;
}

export const EMPTY_DRAFT: Draft = { features: EMPTY_FEATURES, done: [], note: '' };

/** Контекст, который важно не пропустить: отмечается красным. */
const RED_CONTEXT: (keyof ClinicalContext)[] = ['bleeding', 'cordProlapse', 'scarPain', 'hypotension', 'fever'];

export function AssessView(props: {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  patient?: Patient;
  showFigo: boolean;
  onSave: () => void;
  onStartProlonged: () => void;
  onRemind: (min: number) => void;
  toast: (t: string) => void;
}) {
  const { draft, setDraft, patient } = props;
  const f = draft.features;
  const r = useMemo(() => interpret(f), [f]);

  const set = (p: Partial<CtgFeatures>) => setDraft((d) => ({ ...d, features: { ...d.features, ...p } }));
  const setCtx = (k: keyof ClinicalContext, v: boolean) => setDraft((d) => ({ ...d, features: { ...d.features, context: { ...d.features.context, [k]: v } } }));
  const toggleDone = (id: string) => setDraft((d) => ({ ...d, done: d.done.includes(id) ? d.done.filter((x) => x !== id) : [...d.done, id] }));

  const reset = () =>
    setDraft(() => ({
      ...EMPTY_DRAFT,
      features: {
        ...EMPTY_FEATURES,
        stage: f.stage,
        gaWeeks: f.gaWeeks,
        anchorBaseline: f.anchorBaseline,
        context: { ...f.context, cordProlapse: false, bleeding: false, scarPain: false },
      },
    }));

  return (
    <div className="content">
      <button type="button" className="banner red" onClick={props.onStartProlonged}>
        <span>Брадикардия / пролонгированная децелерация прямо сейчас</span>
        <span>Таймер 3-6-9-12-15 →</span>
      </button>

      <div className="assess">
        <div className="stack">
          <div className="card">
            <h3>Ситуация</h3>
            <QRow label="Период">
              <Seg
                value={f.stage}
                onChange={(v) => set({ stage: v })}
                options={[
                  { value: 'antenatal', label: 'До родов / поступление' },
                  { value: 'first', label: 'I период' },
                  { value: 'second', label: 'II период' },
                ]}
              />
            </QRow>
            <QRow label="Срок" hint="базальный ритм снижается с увеличением срока">
              <NumInput value={f.gaWeeks} onChange={(v) => set({ gaWeeks: v })} suffix="нед" ariaLabel="Срок, недель" placeholder="40" />
            </QRow>
            <QRow label="Исходный базальный ритм" hint="«якорь» — при поступлении / в начале наблюдения">
              <NumInput value={f.anchorBaseline} onChange={(v) => set({ anchorBaseline: v })} suffix="уд/мин" ariaLabel="Исходный базальный ритм" placeholder="135" />
            </QRow>
            <div className="section-title" style={{ marginTop: 8 }}>
              Клинический контекст
            </div>
            <div className="chips">
              {contextKeys.map((k) => (
                <button key={k} type="button" className={`chip ${f.context[k] ? 'on' : ''} ${f.context[k] && RED_CONTEXT.includes(k) ? 'red' : ''}`} onClick={() => setCtx(k, !f.context[k])} aria-pressed={f.context[k]}>
                  {CONTEXT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Базальный ритм и вариабельность</h3>
            <QRow label="Базальный ритм" hint="за 10 мин, без акцелераций и децелераций">
              <Stepper value={f.baseline} onChange={(v) => set({ baseline: v })} placeholder="—" ariaLabel="Базальный ритм, уд/мин" min={50} max={220} />
            </QRow>
            <QRow label="Поведение базального ритма">
              <Seg
                value={f.trend}
                onChange={(v) => set({ trend: v })}
                options={[
                  { value: 'stable', label: 'Стабильный' },
                  { value: 'rising', label: 'Растёт', tone: 'mid' },
                  { value: 'falling', label: 'Снижается', tone: 'bad' },
                  { value: 'unstable', label: 'Нестабильный', tone: 'bad' },
                ]}
              />
            </QRow>
            <QRow label="Вариабельность">
              <Seg
                value={f.variability}
                onChange={(v) => set({ variability: v, zigzag: v === 'increased' ? f.zigzag : false })}
                options={[
                  { value: 'reduced', label: '< 5', tone: 'bad' },
                  { value: 'normal', label: '5–25' },
                  { value: 'increased', label: '> 25', tone: 'mid' },
                ]}
              />
              {f.variability !== 'normal' && (
                <div style={{ marginTop: 6 }}>
                  <NumInput value={f.variabilityMin} onChange={(v) => set({ variabilityMin: v })} suffix="мин держится" ariaLabel="Длительность" placeholder="мин" />
                </div>
              )}
            </QRow>
            <QRow label="Особые паттерны">
              <div className="chips">
                <button type="button" className={`chip ${f.zigzag ? 'on red' : ''}`} onClick={() => set({ zigzag: !f.zigzag, variability: !f.zigzag ? 'increased' : f.variability })}>
                  ZigZag (&gt; 25 уд/мин, 2–30 мин)
                </button>
                <button type="button" className={`chip ${f.sinusoidal ? 'on red' : ''}`} onClick={() => set({ sinusoidal: !f.sinusoidal })}>
                  Синусоидальный
                </button>
              </div>
            </QRow>
            <QRow label="Цикличность" hint="смена сна и активности">
              <Seg
                value={f.cycling}
                onChange={(v) => set({ cycling: v })}
                options={[
                  { value: 'present', label: 'Есть' },
                  { value: 'absent', label: 'Нет', tone: 'mid' },
                  { value: 'unknown', label: 'Не ясно' },
                ]}
              />
            </QRow>
            <QRow label="Акцелерации">
              <Seg
                value={f.accelerations}
                onChange={(v) => set({ accelerations: v })}
                options={[
                  { value: 'present', label: 'Есть' },
                  { value: 'absent', label: 'Нет' },
                  { value: 'unknown', label: 'Не ясно' },
                ]}
              />
            </QRow>
          </div>

          <div className="card">
            <h3>Децелерации</h3>
            <QRow label="Частота" hint="повторяющиеся — с ≥ 50 % схваток">
              <Seg
                value={f.decels}
                onChange={(v) => set({ decels: v })}
                options={[
                  { value: 'none', label: 'Нет' },
                  { value: 'occasional', label: 'Единичные' },
                  { value: 'repetitive', label: 'Повторяющиеся', tone: 'mid' },
                ]}
              />
            </QRow>
            {f.decels !== 'none' && (
              <>
                <QRow label="Характер">
                  <Seg
                    value={f.decelNature}
                    onChange={(v) => set({ decelNature: v })}
                    options={(['early', 'rapid', 'gradual', 'mixed'] as const).map((k) => ({ value: k, label: DECEL_NATURE_LABEL[k] }))}
                  />
                </QRow>
                <QRow label="Сколько продолжаются">
                  <NumInput value={f.decelsMin} onChange={(v) => set({ decelsMin: v })} suffix="мин" ariaLabel="Длительность децелераций, мин" placeholder="мин" />
                </QRow>
                <QRow label="Признаки">
                  <div className="stack" style={{ gap: 2 }}>
                    <Toggle checked={f.decelsWorsening} onChange={(v) => set({ decelsWorsening: v })}>
                      Углубляются / удлиняются
                    </Toggle>
                    <Toggle checked={f.subacutePattern} onChange={(v) => set({ subacutePattern: v })}>
                      <b>&gt; 90 с</b>, а стабильного ритма между ними <b>&lt; 30 с</b>
                    </Toggle>
                    <Toggle checked={f.shallowDecels} onChange={(v) => set({ shallowDecels: v })}>
                      Неглубокие (&lt; 15 уд/мин) при сниженной вариабельности
                    </Toggle>
                  </div>
                </QRow>
              </>
            )}
          </div>

          <div className="card">
            <h3>Пролонгированная децелерация / брадикардия</h3>
            <QRow label="Идёт сейчас (≥ 3 мин)">
              <Seg
                value={f.prolonged ? 'yes' : 'no'}
                onChange={(v) => set({ prolonged: v === 'yes' })}
                options={[
                  { value: 'no', label: 'Нет' },
                  { value: 'yes', label: 'Да', tone: 'bad' },
                ]}
              />
            </QRow>
            {f.prolonged && (
              <>
                <QRow label="Длится">
                  <NumInput value={f.prolongedMin} onChange={(v) => set({ prolongedMin: v })} suffix="мин" ariaLabel="Длительность, мин" placeholder="мин" />
                </QRow>
                <QRow label="Вариабельность внутри" hint="особенно в первые 3 мин">
                  <Seg
                    value={f.prolongedVarPreserved}
                    onChange={(v) => set({ prolongedVarPreserved: v })}
                    options={[
                      { value: 'present', label: 'Сохранена' },
                      { value: 'absent', label: 'Утрачена', tone: 'bad' },
                      { value: 'unknown', label: 'Не ясно' },
                    ]}
                  />
                </QRow>
                <button type="button" className="btn danger full" onClick={props.onStartProlonged}>
                  Открыть таймер 3-6-9-12-15
                </button>
              </>
            )}
          </div>

          <div className="card">
            <h3>Сокращения матки</h3>
            <QRow label="Схваток за 10 мин" hint="тахисистолия — > 5 (в среднем за 30 мин)">
              <Stepper value={f.contractions} onChange={(v) => set({ contractions: v })} step={1} min={0} max={10} placeholder="—" ariaLabel="Схваток за 10 минут" />
            </QRow>
            <QRow label="Тонус">
              <Toggle checked={f.hypertonus} onChange={(v) => set({ hypertonus: v })}>
                Гипертонус / матка не расслабляется
              </Toggle>
            </QRow>
          </div>
        </div>

        <div className="assess-result stack">
          <ResultPanel r={r} done={draft.done} onToggleDone={toggleDone} showFigo={props.showFigo} />
          <div className="card">
            <label className="field">
              <span className="field-label">Примечание к оценке</span>
              <textarea value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Например: вызвана заведующая, ВИ — открытие 7 см" />
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn primary" onClick={props.onSave}>
                {patient ? 'Сохранить в карту' : 'Сохранить…'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const text = recordText(f, r, new Date(), draft.done) + (draft.note ? `\n${draft.note}` : '');
                  props.toast((await copyText(text)) ? 'Запись скопирована' : 'Не удалось скопировать');
                }}
              >
                Копировать запись
              </button>
              {r.reassessMin > 0 && (
                <button type="button" className="btn" onClick={() => props.onRemind(r.reassessMin)}>
                  Напомнить через {r.reassessMin} мин
                </button>
              )}
              <button type="button" className="btn ghost" onClick={reset}>
                Новая оценка
              </button>
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {STAGE_LABEL[f.stage]}
              {patient ? ` · ${patient.label || 'без имени'}` : ' · без привязки к пациентке'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
