/** Голос, звук, вибрация и удержание экрана — всё с мягкой деградацией. */

let audioCtx: AudioContext | null = null;

export function beep(freq = 880, ms = 180, times = 1) {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    for (let i = 0; i < times; i++) {
      const t0 = ctx.currentTime + i * (ms / 1000 + 0.08);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + ms / 1000 + 0.02);
    }
  } catch {
    /* звук недоступен */
  }
}

/** Разблокировать звук/голос по жесту пользователя (iOS). */
export function unlockAudio() {
  beep(1, 1);
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}

function russianVoice(): SpeechSynthesisVoice | undefined {
  try {
    return window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ru'));
  } catch {
    return undefined;
  }
}

export function speak(text: string, enabled = true) {
  if (!enabled) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    const v = russianVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* голос недоступен */
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** Не давать экрану гаснуть, пока идёт таймер. */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return () => {};
    const lock = await nav.wakeLock.request('screen');
    return () => void lock.release().catch(() => {});
  } catch {
    return () => {};
  }
}

export function alertAll(text: string, voice: boolean, urgent = false) {
  beep(urgent ? 1046 : 880, 200, urgent ? 3 : 2);
  vibrate(urgent ? [300, 120, 300, 120, 300] : [200, 100, 200]);
  setTimeout(() => speak(text, voice), urgent ? 700 : 450);
}
