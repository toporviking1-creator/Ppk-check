import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../core/app-context';
import { useDialogs } from '../../core/confirm';
import type { Labour } from '../../core/record';
import { useNow } from './components/ui';
import { Alerts } from './components/Alerts';
import { CaseHeader } from './components/CaseHeader';
import { ChecklistView } from './components/ChecklistView';
import { LabsView } from './components/LabsView';
import { MedsView } from './components/MedsView';
import { MonitorView } from './components/MonitorView';
import { NowView } from './components/NowView';
import { PatientView } from './components/PatientView';
import { ReferenceView } from './components/ReferenceView';
import { ReportView } from './components/ReportView';
import { DebriefCard, ScenarioPicker, TrainingPanel } from './components/Training';
import { computeAlerts } from './protocol/alerts';
import { newCase } from './protocol/case';
import type { Case } from './protocol/types';
import { addBloodLoss, markMassive, removeEntry, resumeBleeding, startBleeding, stopBleeding } from './state/actions';
import { advanceTraining, checkFalseStop, createTrainingCase, finishTraining, setSpeed, simTime } from './training/engine';
import './pph.css';

export type PphTab = 'now' | 'checklist' | 'monitor' | 'labs' | 'meds' | 'patient' | 'ref' | 'report';

const TABS: { id: PphTab; label: string; short: string; icon: string }[] = [
  { id: 'now', label: 'Экстренно', short: 'Сейчас', icon: '🚨' },
  { id: 'checklist', label: 'Чек-лист', short: 'Чек-лист', icon: '☑' },
  { id: 'monitor', label: 'Кровопотеря', short: 'Кровь', icon: '🩸' },
  { id: 'labs', label: 'Анализы', short: 'Анализы', icon: '🧪' },
  { id: 'meds', label: 'Препараты', short: 'Дозы', icon: '💉' },
  { id: 'patient', label: 'Пациентка', short: 'Пациент', icon: '👤' },
  { id: 'ref', label: 'Справка', short: 'Справка', icon: '📖' },
  { id: 'report', label: 'Отчёт', short: 'Отчёт', icon: '📄' },
];

/** Новый случай ПК с данными из записи родов. */
export function pphCaseFor(l: Labour): Case {
  const c = newCase();
  c.patient.fullName = l.patient.label;
  c.patient.age = l.patient.age;
  c.patient.weightKg = l.patient.weightKg;
  c.patient.gestationWeeks = l.patient.gaWeeks;
  return c;
}

const clockOf = (c: Case, real: Date) => (c.training ? simTime(c.training, real) : real);

function Start(props: { labour?: Labour; onStart: () => void; onTraining: (scenario: string, speed: number) => void; onRef: () => void }) {
  const [picking, setPicking] = useState(false);
  if (picking) return <ScenarioPicker onClose={() => setPicking(false)} onStart={props.onTraining} />;
  return (
    <div className="content">
      <div className="card">
        <h3>Послеродовое кровотечение</h3>
        <p>Чек-лист у постели по КР «Послеродовое кровотечение» (2025): кнопки кровопотери, «3 следующих действия», дозы на массу тела, анализы и РОТЭМ/ТЭГ, критерии качества.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn danger big" onClick={props.onStart}>
            {props.labour ? 'Начать: кровотечение у этой пациентки' : 'Начать: новая запись родов'}
          </button>
          <button type="button" className="btn big" onClick={() => setPicking(true)}>
            Тренировка по сценарию
          </button>
          <button type="button" className="btn" onClick={props.onRef}>
            Справка
          </button>
        </div>
        {props.labour && <p className="small muted" style={{ marginTop: 8 }}>Данные пациентки (ФИО, срок, масса) возьмутся из записи «{props.labour.patient.label || 'без имени'}».</p>}
      </div>
    </div>
  );
}

export function PphModule(props: { tab: PphTab; setTab: (t: PphTab) => void }) {
  const app = useApp();
  const { confirm } = useDialogs();
  const { tab, setTab } = props;
  const l = app.labour;
  const current = l?.modules.pph;
  const now = useNow(1000);
  const clock = current ? clockOf(current, now) : now;

  const setCase = useCallback((fn: (c: Case) => Case) => app.updateLabour((x) => (x.modules.pph ? { ...x, modules: { ...x.modules, pph: fn(x.modules.pph) } } : x)), [app]);

  const act = useCallback(
    (fn: (c: Case, now: string) => Case) => {
      setCase((c) => {
        const t = clockOf(c, new Date()).toISOString();
        const next = { ...fn(c, t), updatedAt: new Date().toISOString() };
        return next.training ? checkFalseStop(next, t) : next;
      });
    },
    [setCase],
  );

  const trainingActive = !!current?.training && !current.training.finishedAt;
  useEffect(() => {
    if (trainingActive) setCase((c) => (c.training ? advanceTraining(c, simTime(c.training, new Date()).toISOString()) : c));
    // модельное время продвигается раз в секунду
  }, [trainingActive, now, setCase]);

  const alerts = useMemo(() => (current ? computeAlerts(current, clock) : []), [current, clock]);

  if (!current) {
    if (tab === 'ref') {
      return (
        <div className="mod-pph">
          <div className="content">
            <button type="button" className="btn small" onClick={() => setTab('now')}>
              ← Назад
            </button>
            <ReferenceView />
          </div>
        </div>
      );
    }
    return (
      <div className="mod-pph">
        <Start
          labour={l}
          onRef={() => setTab('ref')}
          onStart={() => {
            const id = app.ensureLabour();
            app.updateById(id, (x) => ({ ...x, modules: { ...x.modules, pph: pphCaseFor(x) } }));
            setTab('now');
          }}
          onTraining={(scenario, speed) => {
            const c = createTrainingCase(scenario, speed);
            app.ensureLabour({ label: c.patient.fullName || 'Тренировка: ПК', weightKg: c.patient.weightKg, gaWeeks: c.patient.gestationWeeks }, { training: true, modules: { pph: c } });
            setTab('now');
          }}
        />
      </div>
    );
  }

  return (
    <div className="mod-pph with-case">
      <div className="sticky-top">
        <CaseHeader
          c={current}
          now={clock}
          alerts={alerts}
          onBack={() => app.go({ view: 'labour' })}
          onAddLoss={(ml) => act((c, t) => addBloodLoss(c, ml, 'gravimetric', t))}
          onUndoLoss={
            current.bloodLoss.length
              ? async () => {
                  const last = [...current.bloodLoss].sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
                  if (await confirm(`Отменить последнюю запись: +${last.ml} мл?`, { ok: 'Отменить запись' })) act((c, t) => removeEntry(c, 'bloodLoss', last.id, t));
                }
              : undefined
          }
          onStart={() => act((c, t) => startBleeding(c, t))}
          onStop={async () => {
            if (await confirm('Отметить остановку кровотечения?', { ok: 'Остановлено' })) act((c, t) => stopBleeding(c, t));
          }}
          onResume={() => act((c, t) => resumeBleeding(c, t))}
          onMassive={() => act((c, t) => markMassive(c, t))}
        />
      </div>
      {current.training && (
        <TrainingPanel
          c={current}
          act={act}
          onSpeed={(s) => setCase((c) => setSpeed(c, s))}
          onFinish={async () => {
            if (!(await confirm('Завершить тренировку и перейти к разбору?', { ok: 'Завершить' }))) return;
            setCase((c) => finishTraining(c, clockOf(c, new Date()).toISOString()));
            setTab('report');
          }}
          onDebrief={() => setTab('report')}
        />
      )}
      <Alerts alerts={alerts} />
      <div className="content">
        {tab === 'now' && <NowView c={current} act={act} onFullChecklist={() => setTab('checklist')} />}
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
      <nav className="tabbar" aria-label="Разделы ПК">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="ti" aria-hidden>
              {t.icon}
            </span>
            <span className="tl">{t.label}</span>
            <span className="ts">{t.short}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
