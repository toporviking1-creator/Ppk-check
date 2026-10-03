import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface Ask {
  text: string;
  ok: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

type ConfirmFn = (text: string, opts?: { ok?: string; danger?: boolean }) => Promise<boolean>;
type NotifyFn = (text: string) => void;

const Ctx = createContext<{ confirm: ConfirmFn; notify: NotifyFn } | null>(null);

/**
 * Подтверждения и уведомления внутри страницы: `window.confirm/alert`
 * не работают во встроенном просмотре claude.ai и неудобны на телефоне.
 */
export function DialogProvider(props: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (text, opts) =>
      new Promise<boolean>((resolve) => setAsk({ text, ok: opts?.ok ?? 'Да', danger: opts?.danger ?? false, resolve })),
    [],
  );
  const notify = useCallback<NotifyFn>((text) => setToast(text), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (ask) okRef.current?.focus();
  }, [ask]);

  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };

  return (
    <Ctx.Provider value={{ confirm, notify }}>
      {props.children}
      {ask && (
        <div className="modal-back" role="presentation" onClick={() => close(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label={ask.text} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close(false)}>
            <p>{ask.text}</p>
            <div className="row end">
              <button type="button" className="btn" onClick={() => close(false)}>
                Отмена
              </button>
              <button ref={okRef} type="button" className={`btn ${ask.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
                {ask.ok}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDialogs() {
  const c = useContext(Ctx);
  if (!c) throw new Error('DialogProvider is missing');
  return c;
}
