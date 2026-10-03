import { useEffect, useState } from 'react';
import { AssessView, EMPTY_DRAFT, type Draft } from './components/AssessView';
import { PatientsView } from './components/PatientsView';
import { ReferenceView } from './components/ReferenceView';
import { TimersView } from './components/TimersView';
import { TrainerView } from './components/TrainerView';
import { fmtClock, Icon, Toast, useToast } from './components/ui';
import { interpret } from './ktg/interpret';
import { EMPTY_CONTEXT, EMPTY_FEATURES } from './ktg/types';
import { fmtTime } from './ktg/record';
import { DEFAULT_SETTINGS, uid, usePatients, useStored, type Settings } from './state/store';
import { useTimers } from './state/timers';

type Tab = 'assess' | 'timer' | 'train' | 'ref' | 'patients';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'assess', label: 'Оценка', icon: 'assess' },
  { id: 'timer', label: 'Таймеры', icon: 'timer' },
  { id: 'train', label: 'Тренажёр', icon: 'train' },
  { id: 'ref', label: 'Справка', icon: 'book' },
  { id: 'patients', label: 'Пациентки', icon: 'people' },
];

export default function App() {
  const [tab, setTab] = useStored<Tab>('ktg-pro.tab', 'assess');
  const [settings, setSettings] = useStored<Settings & { everyMinute: boolean }>('ktg-pro.settings.v1', { ...DEFAULT_SETTINGS, everyMinute: false });
  const [progress, setProgress] = useStored<Record<string, number>>('ktg-pro.progress.v1', {});
  const [draftRaw, setDraftRaw] = useStored<Draft>('ktg-pro.draft.v1', EMPTY_DRAFT);
  const [activeId, setActiveId] = useStored<string | null>('ktg-pro.active', null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { patients, create, update, remove, importMany, saveError } = usePatients();
  const timers = useTimers(settings.voice, settings.everyMinute);
  const [toastText, toast] = useToast();

  // Черновик мог сохраниться старой версией — дополняем недостающие поля.
  const draft: Draft = { ...EMPTY_DRAFT, ...draftRaw, features: { ...EMPTY_FEATURES, ...draftRaw.features, context: { ...EMPTY_CONTEXT, ...draftRaw.features?.context } } };
  const setDraft = (fn: (d: Draft) => Draft) => setDraftRaw((d) => fn({ ...EMPTY_DRAFT, ...d, features: { ...EMPTY_FEATURES, ...d.features, context: { ...EMPTY_CONTEXT, ...d.features?.context } } }));

  const active = patients.find((p) => p.id === activeId);

  // Подставить срок и исходный ритм активной пациентки.
  useEffect(() => {
    if (!active) return;
    setDraft((d) => ({
      ...d,
      features: {
        ...d.features,
        gaWeeks: d.features.gaWeeks ?? active.gaWeeks,
        anchorBaseline: active.anchorBaseline ?? d.features.anchorBaseline,
      },
    }));
  }, [activeId, active?.gaWeeks, active?.anchorBaseline]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const saveAssessment = () => {
    const f = draft.features;
    const r = interpret(f);
    const entry = {
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
    let id = activeId && active ? activeId : null;
    if (!id) {
      id = create({ gaWeeks: f.gaWeeks, anchorBaseline: f.anchorBaseline ?? f.baseline, label: '' });
      setActiveId(id);
      toast('Создана новая карта пациентки — заполните её на вкладке «Пациентки»');
    } else toast('Оценка сохранена в карту');
    const pid = id;
    update(pid, (p) => ({ ...p, anchorBaseline: p.anchorBaseline ?? f.anchorBaseline ?? f.baseline, assessments: [...p.assessments, entry] }));
    setDraft((d) => ({ ...d, done: [], note: '' }));
    if (r.reassessMin > 0) timers.remind(r.reassessMin);
  };

  const saveTimerLog = active
    ? () => {
        const log = timers.prolonged.log;
        update(active.id, (p) => ({
          ...p,
          events: [...p.events, ...log.map((l) => ({ id: uid(), at: new Date(l.at).toISOString(), kind: 'timer' as const, text: `Пролонгированная децелерация: ${l.text}` }))],
        }));
        toast('Хронология сохранена в карту');
      }
    : undefined;

  const prolongedSec = timers.running && timers.prolonged.startedAt !== null ? (timers.now - timers.prolonged.startedAt) / 1000 : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo" aria-hidden="true">
          <Icon name="assess" size={22} />
        </div>
        <div className="brand">
          <strong>КТГ-навигатор</strong>
          <span>физиологическая интерпретация · FIGO / КР РФ</span>
        </div>
        {active ? (
          <div className="patient-pill" onClick={() => { setTab('patients'); setOpenId(active.id); }} role="button" tabIndex={0}>
            <b>{active.label || 'Без имени'}</b>
            <button type="button" className="x" aria-label="Снять активную пациентку" onClick={(e) => { e.stopPropagation(); setActiveId(null); }}>
              ×
            </button>
          </div>
        ) : null}
      </header>

      {timers.running && tab !== 'timer' && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <button type="button" className="banner red pulse" onClick={() => setTab('timer')}>
            <span>Пролонгированная децелерация {fmtClock(prolongedSec)}</span>
            <span>К таймеру →</span>
          </button>
        </div>
      )}
      {timers.reassess.dueAt !== null && tab === 'assess' && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="banner info">Переоценка КТГ в {fmtTime(new Date(timers.reassess.dueAt))} (через {fmtClock((timers.reassess.dueAt - timers.now) / 1000)})</div>
        </div>
      )}

      <main>
        {tab === 'assess' && (
          <AssessView
            draft={draft}
            setDraft={setDraft}
            patient={active}
            showFigo={settings.showFigo}
            onSave={saveAssessment}
            onStartProlonged={() => {
              if (!timers.running) timers.startProlonged(draft.features.prolonged && draft.features.prolongedMin ? draft.features.prolongedMin * 60 : 0);
              setTab('timer');
            }}
            onRemind={(m) => {
              timers.remind(m);
              toast(`Напомню через ${m} мин`);
            }}
            toast={toast}
          />
        )}
        {tab === 'timer' && (
          <TimersView
            timers={timers}
            voice={settings.voice}
            everyMinute={settings.everyMinute}
            setVoice={(v) => setSettings((s) => ({ ...s, voice: v }))}
            setEveryMinute={(v) => setSettings((s) => ({ ...s, everyMinute: v }))}
            onSaveLog={saveTimerLog}
          />
        )}
        {tab === 'train' && (
          <TrainerView
            pxPerMin={settings.pxPerMin}
            setPxPerMin={(v) => setSettings((s) => ({ ...s, pxPerMin: v }))}
            showFigo={settings.showFigo}
            voice={settings.voice}
            progress={progress}
            setProgress={setProgress}
          />
        )}
        {tab === 'ref' && <ReferenceView />}
        {tab === 'patients' && (
          <PatientsView
            patients={patients}
            activeId={activeId}
            setActive={setActiveId}
            create={() => create()}
            update={update}
            remove={remove}
            importMany={importMany}
            openId={openId}
            setOpenId={setOpenId}
            goAssess={() => setTab('assess')}
            saveError={saveError}
            toast={toast}
          />
        )}
      </main>

      <footer className="footer">
        КТГ-навигатор · Осокин И. П., врач акушер-гинеколог ·{' '}
        <a href="https://t.me/dr_osokin" target="_blank" rel="noreferrer">
          t.me/dr_osokin
        </a>
        <br />
        Учебный прототип и средство поддержки решений, не медицинское изделие.
      </footer>

      <nav className="tabbar" aria-label="Разделы">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
            {t.id === 'timer' && timers.running && <span className="dot" />}
          </button>
        ))}
      </nav>
      <Toast text={toastText} />
    </div>
  );
}
