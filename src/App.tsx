import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppCtx, type AppApi, type Route } from './core/app-context';
import { AssistantPanel, type ChatTurn } from './core/assistant/AssistantPanel';
import { DialogProvider } from './core/confirm';
import { HomeView, LabourView } from './core/HomeView';
import { getSampler, PLATFORM, type Sampler } from './core/platform';
import type { Labour } from './core/record';
import { DEFAULT_SETTINGS, useLabours, useStored, type Settings } from './core/store';
import { useTimers } from './core/timers';
import { fmtClock, Icon } from './core/ui';
import { KtgModule, type KtgTab } from './modules/ktg/KtgModule';
import { PphModule, type PphTab } from './modules/pph/PphModule';
import { MODULES, READY_MODULES } from './modules/registry';

function Shell() {
  const [route, setRoute] = useStored<Route>('rodzal.route.v1', { view: 'home' });
  const [settings, setSettings] = useStored<Settings>('rodzal.settings.v1', DEFAULT_SETTINGS);
  const [progress, setProgress] = useStored<Record<string, number>>('ktg-pro.progress.v1', {});
  const [activeId, setActiveId] = useStored<string | null>('rodzal.active.v1', null);
  const { labours, create, update, remove, importMany, saveError, importedOnStart } = useLabours();
  const timers = useTimers(settings.voice, settings.everyMinute);
  const [sampler, setSampler] = useState<Sampler | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pending, setPending] = useState<{ text: string; shown?: string } | null>(null);
  const [chats, setChats] = useState<Record<string, ChatTurn[]>>({});

  useEffect(() => {
    let alive = true;
    void getSampler().then((s) => alive && setSampler(() => s));
    return () => {
      alive = false;
    };
  }, []);

  const labour = labours.find((l) => l.id === activeId);
  const go = useCallback((r: Route) => {
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, [setRoute]);

  const api: AppApi = useMemo(
    () => ({
      labour,
      updateLabour: (fn) => labour && update(labour.id, fn),
      ensureLabour: (init, extra) => {
        if (labour && !extra) return labour.id;
        const id = create(init, extra);
        setActiveId(id);
        return id;
      },
      updateById: update,
      settings,
      setSettings,
      timers,
      progress,
      setProgress,
      go,
      ask: (q, shown) => {
        if (q) setPending({ text: q, shown });
        setAssistantOpen(true);
      },
      assistantAvailable: PLATFORM === 'claude' && !!sampler,
    }),
    [labour, update, create, setActiveId, settings, setSettings, timers, progress, setProgress, go, sampler],
  );

  const chatKey = labour?.id ?? 'general';
  const chat = chats[chatKey] ?? [];
  const setChat = (fn: (c: ChatTurn[]) => ChatTurn[]) => setChats((all) => ({ ...all, [chatKey]: fn(all[chatKey] ?? []) }));

  const prolongedSec = timers.running && timers.prolonged.startedAt !== null ? (timers.now - timers.prolonged.startedAt) / 1000 : 0;
  const onKtgTimer = route.view === 'module' && route.module === 'ktg' && route.tab === 'timer';
  const moduleTitle = route.view === 'module' ? MODULES.find((m) => m.id === route.module)?.short : undefined;

  return (
    <AppCtx.Provider value={api}>
      <div className="app">
        <header className="topbar">
          <button type="button" className="logo" aria-label="На главную" onClick={() => go({ view: 'home' })}>
            <Icon name="pulse" size={22} />
          </button>
          <div className="brand">
            <strong>
              Родзал{moduleTitle ? <span className="crumb"> · {moduleTitle}</span> : null}
            </strong>
            <span>КТГ · кровотечение · скоро II период, ОВР, преэклампсия</span>
          </div>
          {labour && (
            <button type="button" className="patient-pill" onClick={() => go({ view: 'labour' })}>
              <b>{labour.training ? '🎓 ' : ''}{labour.patient.label || 'Без имени'}</b>
            </button>
          )}
          <button type="button" className="btn small assist-btn" onClick={() => setAssistantOpen(true)} aria-label="Помощник">
            <Icon name="chat" size={18} />
            <span className="assist-label">Помощник</span>
          </button>
        </header>

        {saveError && <div className="content" style={{ paddingBottom: 0 }}><div className="banner warn">Не удаётся сохранить данные на устройстве (приватный режим или нет места) — сделайте резервную копию.</div></div>}
        {timers.running && !onKtgTimer && (
          <div className="content" style={{ paddingBottom: 0 }}>
            <button type="button" className="banner red pulse" onClick={() => go({ view: 'module', module: 'ktg', tab: 'timer' })}>
              <span>Пролонгированная децелерация {fmtClock(prolongedSec)}</span>
              <span>К таймеру →</span>
            </button>
          </div>
        )}

        <main>
          {route.view === 'home' && (
            <HomeView
              labours={labours}
              defs={MODULES}
              activeId={activeId}
              setActive={setActiveId}
              create={() => {
                setActiveId(create());
                go({ view: 'labour' });
              }}
              importMany={importMany}
              remove={remove}
              importedOnStart={importedOnStart}
            />
          )}
          {route.view === 'labour' && <LabourView defs={MODULES} />}
          {route.view === 'module' && route.module === 'ktg' && (
            <KtgModule tab={(route.tab as KtgTab) ?? 'assess'} setTab={(t) => go({ view: 'module', module: 'ktg', tab: t })} />
          )}
          {route.view === 'module' && route.module === 'pph' && (
            <PphModule tab={(route.tab as PphTab) ?? 'now'} setTab={(t) => go({ view: 'module', module: 'pph', tab: t })} />
          )}
        </main>

        <footer className="footer">
          Родзал · Осокин И. П., врач акушер-гинеколог ·{' '}
          <a href="https://t.me/dr_osokin" target="_blank" rel="noreferrer">
            t.me/dr_osokin
          </a>
          <br />
          Учебный прототип и средство поддержки решений, не медицинское изделие.
        </footer>

        {route.view !== 'module' && (
          <nav className="tabbar" aria-label="Разделы" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <button type="button" className={route.view === 'home' ? 'active' : ''} onClick={() => go({ view: 'home' })}>
              <Icon name="home" />
              <span>Главная</span>
            </button>
            <button type="button" className={route.view === 'labour' ? 'active' : ''} onClick={() => go({ view: labour ? 'labour' : 'home' })}>
              <Icon name="user" />
              <span>Роды</span>
            </button>
            <button type="button" onClick={() => go({ view: 'module', module: 'ktg', tab: 'assess' })}>
              <Icon name="assess" />
              <span>КТГ</span>
              {timers.running && <span className="dot" />}
            </button>
            <button type="button" onClick={() => go({ view: 'module', module: 'pph' })}>
              <Icon name="drop" />
              <span>ПК</span>
            </button>
          </nav>
        )}

        <AssistantPanel
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          sampler={sampler}
          labour={labour as Labour | undefined}
          defs={READY_MODULES}
          pending={pending}
          clearPending={() => setPending(null)}
          chat={chat}
          setChat={setChat}
        />
      </div>
    </AppCtx.Provider>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <Shell />
    </DialogProvider>
  );
}
