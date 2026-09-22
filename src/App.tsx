import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCases } from './state/store';
import type { Case } from './protocol/types';
import { computeAlerts } from './protocol/alerts';
import { markMassive, resumeBleeding, startBleeding, stopBleeding } from './state/actions';
import { CaseList } from './components/CaseList';
import { CaseHeader } from './components/CaseHeader';
import { Alerts } from './components/Alerts';
import { ChecklistView } from './components/ChecklistView';
import { MonitorView } from './components/MonitorView';
import { LabsView } from './components/LabsView';
import { MedsView } from './components/MedsView';
import { PatientView } from './components/PatientView';
import { ReferenceView } from './components/ReferenceView';
import { ReportView } from './components/ReportView';
import { useNow } from './components/ui';
import { NowView } from './components/NowView';
import { DebriefCard, ScenarioPicker, TrainingPanel } from './components/Training';
import { advanceTraining, checkFalseStop, createTrainingCase, finishTraining, setSpeed, simTime } from './training/engine';

type Tab = 'now' | 'checklist' | 'monitor' | 'labs' | 'meds' | 'patient' | 'ref' | 'report';

const TABS: { id: Tab; label: string; short: string; icon: string }[] = [
  { id: 'now', label: 'Экстренно', short: 'Сейчас', icon: '🚨' },
  { id: 'checklist', label: 'Чек-лист', short: 'Чек-лист', icon: '☑' },
  { id: 'monitor', label: 'Кровопотеря', short: 'Кровь', icon: '🩸' },
  { id: 'labs', label: 'Анализы', short: 'Анализы', icon: '🧪' },
  { id: 'meds', label: 'Препараты', short: 'Дозы', icon: '💉' },
  { id: 'patient', label: 'Пациентка', short: 'Пациент', icon: '👤' },
  { id: 'ref', label: 'Справка', short: 'Справка', icon: '📖' },
  { id: 'report', label: 'Отчёт', short: 'Отчёт', icon: '📄' },
];

function readHash(): { id?: string; tab: Tab } {
  const [id, tab] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { id: id || undefined, tab: (TABS.some((t) => t.id === tab) ? tab : 'now') as Tab };
}

export default function App() {
  const { cases, create, insert, update, remove, importCases, saveError } = useCases();
  const [picking, setPicking] = useState(false);
  const [route, setRoute] = useState(readHash);
  const now = useNow(1000);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((id?: string, tab: Tab = 'now') => {
    window.location.hash = id ? `/${id}/${tab}` : '';
    setRoute({ id, tab });
  }, []);

  const current = cases.find((c) => c.id === route.id);
  // В тренировке всё работает в модельном времени.
  const clockOf = (c: Case, real: Date) => (c.training ? simTime(c.training, real) : real);
  const clock = current ? clockOf(current, now) : now;
  const act = useCallback(
    (fn: (c: Case, now: string) => Case) => {
      if (!current) return;
      update(current.id, (c) => {
        const t = clockOf(c, new Date()).toISOString();
        const next = fn(c, t);
        return next.training ? checkFalseStop(next, t) : next;
      });
    },
    [current, update],
  );

  const trainingId = current?.training && !current.training.finishedAt ? current.id : undefined;
  useEffect(() => {
    if (trainingId) update(trainingId, (c) => (c.training ? advanceTraining(c, simTime(c.training, new Date()).toISOString()) : c));
  }, [trainingId, now, update]);

  const alerts = useMemo(() => (current ? computeAlerts(current, clock) : []), [current, clock.getTime()]);

  if (!current) {
    return (
      <main className="app">
        {saveError && <div className="alert alert-danger">Не удаётся сохранить данные в памяти браузера — выгрузите отчёт/JSON!</div>}
        {picking ? (
          <ScenarioPicker
            onClose={() => setPicking(false)}
            onStart={(id, speed) => {
              setPicking(false);
              go(insert(createTrainingCase(id, speed)), 'now');
            }}
          />
        ) : (
        <CaseList
          onTraining={() => setPicking(true)}
          cases={cases}
          onOpen={(id) => go(id)}
          onCreate={() => go(create(), 'now')}
          onDelete={remove}
          onImport={importCases}
        />
        )}
      </main>
    );
  }

  const tab = route.tab;
  return (
    <main className="app with-case">
      {saveError && <div className="alert alert-danger">Не удаётся сохранить данные в памяти браузера — выгрузите отчёт/JSON!</div>}
      <div className="sticky-top">
        <CaseHeader
          c={current}
          now={clock}
          alerts={alerts}
          onBack={() => go(undefined)}
          onStart={() => act((c, t) => startBleeding(c, t))}
          onStop={() => {
            if (confirm('Отметить остановку кровотечения?')) act((c, t) => stopBleeding(c, t));
          }}
          onResume={() => act((c, t) => resumeBleeding(c, t))}
          onMassive={() => act((c, t) => markMassive(c, t))}
        />
      </div>
      {current.training && (
        <TrainingPanel
          c={current}
          act={act}
          onSpeed={(s) => update(current.id, (c) => setSpeed(c, s))}
          onFinish={() => {
            update(current.id, (c) => finishTraining(c, clockOf(c, new Date()).toISOString()));
            go(current.id, 'report');
          }}
          onDebrief={() => go(current.id, 'report')}
        />
      )}
      <Alerts alerts={alerts} />
      <div className="content">
        {tab === 'now' && <NowView c={current} act={act} onFullChecklist={() => go(current.id, 'checklist')} />}
        {tab === 'checklist' && <ChecklistView c={current} act={act} />}
        {tab === 'monitor' && <MonitorView c={current} act={act} />}
        {tab === 'labs' && <LabsView c={current} act={act} />}
        {tab === 'meds' && <MedsView c={current} act={act} />}
        {tab === 'patient' && <PatientView c={current} act={act} />}
        {tab === 'ref' && <ReferenceView />}
        {tab === 'report' && (
          <div className="stack">
            {current.training && <DebriefCard c={current} />}
            <ReportView c={current} act={act} />
          </div>
        )}
      </div>
      <nav className="tabbar" aria-label="Разделы">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(current.id, t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="ti" aria-hidden>
              {t.icon}
            </span>
            <span className="tl">{t.label}</span>
            <span className="ts">{t.short}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
