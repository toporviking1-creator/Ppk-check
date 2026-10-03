/**
 * Платформа сборки:
 * - `web` — офлайн-приложение (GitHub Pages, один файл): всё локально, помощника нет;
 * - `claude` — страница на claude.ai: помощник (Claude) и сохранение файлов через возможности страницы.
 */
export type Platform = 'web' | 'claude';

export const PLATFORM: Platform = import.meta.env.VITE_PLATFORM === 'claude' ? 'claude' : 'web';

export interface SampleTextUpdate {
  text: string;
  delta: string;
}

export interface SampleMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SampleOptions {
  onText?: (u: SampleTextUpdate) => void;
  signal?: AbortSignal;
  modelTier?: 'default' | 'complex' | 'quick';
  cache?: boolean | { gcTime?: number; refresh?: boolean };
}

export type Sampler = (input: string | SampleMessage[], opts?: SampleOptions) => Promise<{ text: string; truncated: boolean }>;

interface Downloads {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface ClaudeRuntime {
  use(name: 'sample'): Promise<Sampler | null>;
  use(name: 'downloads'): Promise<Downloads | null>;
}

function runtime(): ClaudeRuntime | null {
  if (PLATFORM !== 'claude' || typeof window === 'undefined') return null;
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

let samplerPromise: Promise<Sampler | null> | null = null;

/** Помощник доступен только на claude.ai; `null` — скрыть функцию. */
export function getSampler(): Promise<Sampler | null> {
  if (!samplerPromise) {
    const rt = runtime();
    samplerPromise = rt ? rt.use('sample').catch(() => null) : Promise.resolve(null);
  }
  return samplerPromise;
}

/** Ошибки помощника — понятным языком. */
export function sampleErrorText(code: string | undefined): string {
  switch (code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      return 'Помощник недоступен: доступ к Claude для этой страницы не разрешён.';
    case 'rate_limited':
      return 'Слишком много запросов или исчерпан лимит. Попробуйте позже.';
    case 'session_expired':
      return 'Сессия claude.ai истекла — войдите снова.';
    case 'prompt_too_large':
      return 'Запрос слишком большой — сократите вопрос.';
    case 'refused':
      return 'Claude отказался отвечать на этот запрос — переформулируйте вопрос.';
    case 'cancelled':
      return '';
    default:
      return 'Связь с помощником прервалась. Попробуйте ещё раз.';
  }
}

/** Сохранить файл: в браузере — обычная загрузка, на claude.ai — через подтверждение платформы. */
export async function saveFile(blob: Blob, filename: string): Promise<'saved' | 'declined' | 'unavailable'> {
  const rt = runtime();
  if (rt) {
    const dl = await rt.use('downloads').catch(() => null);
    if (!dl) return 'unavailable';
    try {
      await dl.save({ filename, data: blob });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
