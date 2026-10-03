import { useEffect, useRef, useState } from 'react';
import type { ModuleDef } from '../modules';
import { PLATFORM, sampleErrorText, type Sampler, type SampleMessage } from '../platform';
import type { Labour } from '../record';
import { HAS_CHANDRAHARAN } from './knowledge';
import { Markdown } from './Markdown';
import { instructionTurn } from './prompt';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Короткая подпись вместо длинного служебного запроса. */
  shown?: string;
  error?: string;
}

const QUICK = [
  'Что сейчас главное у этой пациентки и что я мог упустить?',
  'Объясни физиологию текущей КТГ: что происходит с плодом?',
  'Составь краткую запись в историю родов по текущим данным.',
  'Какие критерии качества КР сейчас под угрозой?',
];

/** Сколько последних реплик чата отправлять (инструкции отправляются всегда). */
const MAX_TURNS = 12;

export function AssistantPanel(props: {
  open: boolean;
  onClose: () => void;
  sampler: Sampler | null;
  labour?: Labour;
  defs: ModuleDef[];
  pending: { text: string; shown?: string } | null;
  clearPending: () => void;
  chat: ChatTurn[];
  setChat: (fn: (c: ChatTurn[]) => ChatTurn[]) => void;
}) {
  const { sampler, chat, setChat } = props;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [disabled, setDisabled] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat, props.open]);

  const send = async (text: string, shown?: string) => {
    if (!sampler || busy || !text.trim()) return;
    const question = text.trim();
    const history = [...chat.filter((t) => !t.error && t.text), { role: 'user' as const, text: question }].slice(-MAX_TURNS);
    setChat((c) => [...c, { role: 'user', text: question, shown }, { role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    ctl.current = controller;
    const turns: SampleMessage[] = [{ role: 'user', content: instructionTurn(props.labour, props.defs, new Date()) }];
    for (const t of history) {
      // Подряд идущие реплики одной роли допустимы; первая и последняя — от пользователя.
      turns.push({ role: t.role, content: t.text });
    }
    const setLast = (patch: Partial<ChatTurn>) =>
      setChat((c) => {
        const copy = [...c];
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
        return copy;
      });
    try {
      const res = await sampler(turns, { cache: false, signal: controller.signal, onText: ({ text }) => setLast({ text }) });
      setLast({ text: res.text + (res.truncated ? '\n\n*Ответ обрезан — задайте вопрос уже.*' : '') });
    } catch (e) {
      const err = e as { code?: string; text?: string };
      const msg = sampleErrorText(err.code);
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(err.code ?? '')) setDisabled(msg);
      setLast({ text: err.text ?? '', error: err.code === 'cancelled' ? 'Остановлено' : msg });
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  };

  // Вопрос, переданный из модуля («Спросить помощника»).
  useEffect(() => {
    if (props.open && props.pending && sampler && !busy) {
      const q = props.pending;
      props.clearPending();
      void send(q.text, q.shown);
    }
    // send меняется на каждом рендере — достаточно реагировать на появление вопроса
  }, [props.open, props.pending, sampler]);

  if (!props.open) return null;

  return (
    <div className="drawer-back" onClick={props.onClose} role="presentation">
      <aside className="drawer" role="dialog" aria-label="Помощник" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <strong>Помощник</strong>
            <div className="tiny muted">
              {props.labour ? `Видит данные текущих родов${props.labour.training ? ' (учебные)' : ''}, без ФИО` : 'Нет активной записи — общие вопросы'}
              {' · '}
              {HAS_CHANDRAHARAN ? 'КР + конспект Chandraharan' : 'КР + база КТГ-навигатора'}
            </div>
          </div>
          <div className="row">
            {chat.length > 0 && (
              <button type="button" className="btn small ghost" disabled={busy} onClick={() => setChat(() => [])}>
                Новый диалог
              </button>
            )}
            <button type="button" className="btn small" onClick={props.onClose} aria-label="Закрыть помощника">
              ✕
            </button>
          </div>
        </header>

        <div className="drawer-body">
          {!sampler ? (
            <div className="card">
              <p>
                {PLATFORM === 'web'
                  ? 'Помощник работает в версии приложения на claude.ai: там он отвечает через ваш аккаунт Claude. В офлайн-версии он отключён, чтобы данные не покидали устройство.'
                  : 'Помощник недоступен в этом просмотре. Откройте страницу на claude.ai, войдя в аккаунт.'}
              </p>
            </div>
          ) : (
            <>
              {chat.length === 0 && (
                <div className="stack">
                  <p className="small muted">Помощник видит базу знаний (КР, физиологическая интерпретация КТГ) и данные текущих родов. Ответы — поддержка решения, а не назначение.</p>
                  {QUICK.map((q) => (
                    <button key={q} type="button" className="opt" disabled={!!disabled} onClick={() => send(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <ul className="chat">
                {chat.map((t, i) => (
                  <li key={i} className={`bubble ${t.role}`}>
                    {t.role === 'assistant' ? (
                      t.text ? <Markdown text={t.text} /> : !t.error ? <span className="muted pulse">Думает…</span> : null
                    ) : (
                      <p>{t.shown ?? t.text}</p>
                    )}
                    {t.error && <p className="small danger-text">{t.error}</p>}
                  </li>
                ))}
              </ul>
              <div ref={endRef} />
            </>
          )}
        </div>

        {sampler && (
          <form
            className="drawer-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            {disabled && <p className="small danger-text">{disabled}</p>}
            <textarea
              id="assistant-input"
              value={input}
              rows={2}
              placeholder="Вопрос помощнику…"
              disabled={!!disabled}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => ctl.current?.abort()}>
                Стоп
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={!input.trim() || !!disabled}>
                Спросить
              </button>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}
