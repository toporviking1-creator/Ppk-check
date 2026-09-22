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

type Tab = 'checklist' | 'monitor' | 'labs' | 'meds' | 'patient' | 'ref' | 'report';

const TABS: { id: Tab; label: string; short: string; icon: string }[] = [
  { id: 'checklist', label: 'Чек-лист', short: 'Чек-лист', icon: '☑' },
  { id: 'monitor', label: 'Кровопотеря', short: 'Кровь', icon: '🩸' },
  { id: 'labs', label: 'Анализы', short: 'Анализы', icon: '🧪' },
  { id: 'meds', label: 'Препараты', short: 'Лекарства', icon: '💉' },
  { id: 'patient', label: 'Пациентка', short: 'Пациент', icon: '👤' },
  { id: 'ref', label: 'Справка', short: 'Справка', icon: '📖' },
  { id: 'report', label: 'Отчёт', short: 'Отчёт', icon: '📄' },
];

function readHash(): { id?: string; tab: Tab } {
  const [id, tab] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { id: id || undefined, tab: (TABS.some((t) => t.id === tab) ? tab : 'checklist') as Tab };
}

export default function App() {
  const { cases, create, update, remove, importCases, saveError } = useCases();
  const [route, setRoute] = useState(readHash);
  const now = useNow(1000);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((id?: string, tab: Tab = 'checklist') => {
    window.location.hash = id ? `/${id}/${tab}` : '';
    setRoute({ id, tab });
  }, []);

  const current = cases.find((c) => c.id === route.id);
  const act = useCallback(
    (fn: (c: Case, now: string) => Case) => {
      if (current) update(current.id, (c) => fn(c, new Date().toISOString()));
    },
    [current, update],
  );

  const alerts = useMemo(() => (current ? computeAlerts(current, now) : []), [current, now]);

  if (!current) {
    return (
      <main className="app">
        {saveError && <div className="alert alert-danger">Не удаётся сохранить данные в памяти браузера — выгрузите отчёт/JSON!</div>}
        <CaseList
          cases={cases}
          onOpen={(id) => go(id)}
          onCreate={() => go(create(), 'patient')}
          onDelete={remove}
          onImport={importCases}
        />
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
          now={now}
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
      <Alerts alerts={alerts} />
      <div className="content">
        {tab === 'checklist' && <ChecklistView c={current} act={act} />}
        {tab === 'monitor' && <MonitorView c={current} act={act} />}
        {tab === 'labs' && <LabsView c={current} act={act} />}
        {tab === 'meds' && <MedsView c={current} act={act} />}
        {tab === 'patient' && <PatientView c={current} act={act} />}
        {tab === 'ref' && <ReferenceView />}
        {tab === 'report' && <ReportView c={current} act={act} />}
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
