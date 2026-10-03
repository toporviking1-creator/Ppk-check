import { useEffect } from 'react';
import { useApp } from '../../core/app-context';
import { useDialogs } from '../../core/confirm';
import { ktgOf, uid } from '../../core/record';
import { useStored } from '../../core/store';
import { fmtClock, TabBar } from '../../core/ui';
import { fmtTime } from '../../core/time';
import { AssessView, EMPTY_DRAFT, type Draft } from './components/AssessView';
import { ObservationView } from './components/ObservationView';
import { ReferenceView } from './components/ReferenceView';
import { TimersView } from './components/TimersView';
import { TrainerView } from './components/TrainerView';
import { interpret } from './logic/interpret';
import { recordText } from './logic/record';
import { EMPTY_CONTEXT, EMPTY_FEATURES } from './logic/types';
import type { SavedAssessment } from './types-state';

export type KtgTab = 'assess' | 'timer' | 'train' | 'ref' | 'obs';

export function KtgModule(props: { tab: KtgTab; setTab: (t: KtgTab) => void }) {
  const app = useApp();
  const { notify } = useDialogs();
  const { tab, setTab } = props;
  const [draftRaw, setDraftRaw] = useStored<Draft>('rodzal.ktg.draft.v1', EMPTY_DRAFT);
  const l = app.labour;
  const timers = app.timers;

  // Черновик мог сохраниться старой версией — дополняем недостающие поля.
  const fix = (d: Partial<Draft>): Draft => ({ ...EMPTY_DRAFT, ...d, features: { ...EMPTY_FEATURES, ...d.features, context: { ...EMPTY_CONTEXT, ...d.features?.context } } });
  const draft = fix(draftRaw);
  const setDraft = (fn: (d: Draft) => Draft) => setDraftRaw((d) => fn(fix(d)));

  // Подставить срок и исходный ритм из активной записи.
  const anchor = l ? ktgOf(l).anchorBaseline : undefined;
  useEffect(() => {
    if (!l) return;
    setDraft((d) => ({
      ...d,
      features: { ...d.features, gaWeeks: d.features.gaWeeks ?? l.patient.gaWeeks, anchorBaseline: anchor ?? d.features.anchorBaseline },
    }));
  }, [l?.id, l?.patient.gaWeeks, anchor]);

  const save = () => {
    const f = draft.features;
    const r = interpret(f);
    const entry: SavedAssessment = {
      id: uid(),
      at: new Date().toISOString(),
      features: f,
      result: {
        hypoxia: r.hypoxia,
        stage: r.stage,
        physio: r.physio,
        figo: r.figo,
        figoReasons: r.figoReasons,
        strategy: r.strategy,
        urgency: r.urgency,
        headline: r.headline,
        findings: r.findings,
        actions: r.actions.filter((a) => !a.avoid).map((a) => a.text),
      },
      done: draft.done,
      note: draft.note,
    };
    const created = !l;
    const id = app.ensureLabour({ gaWeeks: f.gaWeeks });
    app.updateById(id, (x) => {
      const k = ktgOf(x);
      return { ...x, modules: { ...x.modules, ktg: { anchorBaseline: k.anchorBaseline ?? f.anchorBaseline ?? f.baseline, assessments: [...k.assessments, entry] } } };
    });
    notify(created ? 'Создана новая запись родов — заполните данные пациентки на главной' : 'Оценка сохранена в запись');
    setDraft((d) => ({ ...d, done: [], note: '' }));
    if (r.reassessMin > 0) timers.remind(r.reassessMin);
  };

  const saveTimerLog = l
    ? () => {
        const log = timers.prolonged.log;
        app.updateLabour((x) => ({
          ...x,
          events: [...x.events, ...log.map((e) => ({ id: uid(), at: new Date(e.at).toISOString(), module: 'ktg' as const, text: `Пролонгированная децелерация: ${e.text}`, severity: 'danger' as const }))],
        }));
        notify('Хронология сохранена в запись');
      }
    : undefined;

  const explain = () => {
    const f = draft.features;
    app.ask(`Разбери мою текущую оценку КТГ (черновик на экране) с позиции физиологической интерпретации: что происходит с плодом, согласен ли ты с заключением, что я мог упустить, что делать дальше.\n\nЧерновик оценки:\n${recordText(f, interpret(f), new Date(), draft.done)}${draft.note ? `\nПримечание: ${draft.note}` : ''}`, 'Разбери мою текущую оценку КТГ');
  };

  return (
    <>
      {timers.reassess.dueAt !== null && tab === 'assess' && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="banner info">
            Переоценка КТГ в {fmtTime(new Date(timers.reassess.dueAt))} (через {fmtClock((timers.reassess.dueAt - timers.now) / 1000)})
          </div>
        </div>
      )}
      {tab === 'assess' && (
        <AssessView
          draft={draft}
          setDraft={setDraft}
          patientLabel={l ? l.patient.label : null}
          showFigo={app.settings.showFigo}
          onSave={save}
          onStartProlonged={() => {
            if (!timers.running) timers.startProlonged(draft.features.prolonged && draft.features.prolongedMin ? draft.features.prolongedMin * 60 : 0);
            setTab('timer');
          }}
          onRemind={(m) => {
            timers.remind(m);
            notify(`Напомню через ${m} мин`);
          }}
          onExplain={app.assistantAvailable ? explain : undefined}
          toast={notify}
        />
      )}
      {tab === 'timer' && (
        <TimersView
          timers={timers}
          voice={app.settings.voice}
          everyMinute={app.settings.everyMinute}
          setVoice={(v) => app.setSettings((s) => ({ ...s, voice: v }))}
          setEveryMinute={(v) => app.setSettings((s) => ({ ...s, everyMinute: v }))}
          onSaveLog={saveTimerLog}
        />
      )}
      {tab === 'train' && (
        <TrainerView
          pxPerMin={app.settings.pxPerMin}
          setPxPerMin={(v) => app.setSettings((s) => ({ ...s, pxPerMin: v }))}
          showFigo={app.settings.showFigo}
          voice={app.settings.voice}
          progress={app.progress}
          setProgress={app.setProgress}
        />
      )}
      {tab === 'ref' && <ReferenceView />}
      {tab === 'obs' && <ObservationView labour={l} update={app.updateLabour} onAssess={() => setTab('assess')} />}
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'assess', label: 'Оценка', icon: 'assess' },
          { id: 'obs', label: 'Наблюдение', icon: 'chart' },
          { id: 'timer', label: 'Таймеры', icon: 'timer', dot: timers.running },
          { id: 'train', label: 'Тренажёр', icon: 'train' },
          { id: 'ref', label: 'Справка', icon: 'book' },
        ]}
      />
    </>
  );
}
