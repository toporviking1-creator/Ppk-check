import { useEffect, useRef } from 'react';

export interface StripMarker {
  /** Минута от начала ленты. */
  min: number;
  label: string;
  color?: string;
}

interface Props {
  fhr: ArrayLike<number>;
  toco: ArrayLike<number>;
  hz: number;
  /** Сколько сэмплов уже есть (для «живой» ленты); по умолчанию все. */
  length?: number;
  startMin: number;
  spanMin: number;
  width: number;
  fhrHeight?: number;
  tocoHeight?: number;
  markers?: StripMarker[];
  /** Подсветка отрезка (мин). */
  highlight?: [number, number];
}

const FHR_MIN = 50;
const FHR_MAX = 210;

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Лента КТГ на canvas: ЧСС 50–210 уд/мин, токограмма 0–100. */
export function CtgCanvas(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { fhr, toco, hz, startMin, spanMin, width, markers, highlight } = props;
  const fhrH = props.fhrHeight ?? 260;
  const tocoH = props.tocoHeight ?? 100;
  const gap = 18;
  const height = fhrH + gap + tocoH + 16;
  const n = props.length ?? fhr.length;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const paper = cssVar('--paper', '#fffdf8');
    const gridMinor = cssVar('--grid-minor', '#f1d9d6');
    const gridMajor = cssVar('--grid-major', '#d9a5a0');
    const band = cssVar('--grid-band', 'rgba(40,160,90,0.07)');
    const ink = cssVar('--ink', '#1d2433');
    const muted = cssVar('--muted', '#6b7280');

    g.fillStyle = paper;
    g.fillRect(0, 0, width, height);

    const pxPerMin = width / spanMin;
    const xOf = (min: number) => (min - startMin) * pxPerMin;
    const yF = (v: number) => ((FHR_MAX - v) / (FHR_MAX - FHR_MIN)) * fhrH;
    const tocoTop = fhrH + gap;
    const yT = (v: number) => tocoTop + ((100 - v) / 100) * tocoH;

    // подсветка
    if (highlight) {
      g.fillStyle = 'rgba(255, 196, 0, 0.16)';
      g.fillRect(xOf(highlight[0]), 0, (highlight[1] - highlight[0]) * pxPerMin, fhrH + gap + tocoH);
    }

    // нормальный диапазон 110–160
    g.fillStyle = band;
    g.fillRect(0, yF(160), width, yF(110) - yF(160));

    // горизонтальная сетка ЧСС
    g.lineWidth = 1;
    for (let v = FHR_MIN; v <= FHR_MAX; v += 10) {
      const major = v % 30 === 0 || v === 110 || v === 160;
      g.strokeStyle = major ? gridMajor : gridMinor;
      g.beginPath();
      g.moveTo(0, Math.round(yF(v)) + 0.5);
      g.lineTo(width, Math.round(yF(v)) + 0.5);
      g.stroke();
    }
    // токо
    for (let v = 0; v <= 100; v += 20) {
      g.strokeStyle = v % 40 === 0 ? gridMajor : gridMinor;
      g.beginPath();
      g.moveTo(0, Math.round(yT(v)) + 0.5);
      g.lineTo(width, Math.round(yT(v)) + 0.5);
      g.stroke();
    }
    // вертикальная сетка: минор 20 с при крупном масштабе, мажор — 1 мин, подпись каждые 5/10 мин
    const sub = pxPerMin >= 60 ? 3 : 1;
    const first = Math.floor(startMin);
    for (let m = first; m <= startMin + spanMin; m += 1 / sub) {
      const x = Math.round(xOf(m)) + 0.5;
      if (x < 0) continue;
      const whole = Math.abs(m - Math.round(m)) < 1e-6;
      const ten = whole && Math.round(m) % 10 === 0;
      g.strokeStyle = whole ? gridMajor : gridMinor;
      g.lineWidth = ten ? 1.6 : 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, fhrH);
      g.moveTo(x, tocoTop);
      g.lineTo(x, tocoTop + tocoH);
      g.stroke();
    }
    g.lineWidth = 1;

    // подписи
    g.fillStyle = muted;
    g.font = '10px system-ui, sans-serif';
    g.textBaseline = 'middle';
    const labelEvery = Math.max(60, pxPerMin * 5);
    for (let x0 = 4; x0 < width; x0 += labelEvery) {
      for (const v of [60, 90, 120, 150, 180, 210]) g.fillText(String(v), x0, Math.min(fhrH - 6, Math.max(6, yF(v))));
    }
    g.textBaseline = 'top';
    const step = pxPerMin >= 30 ? 5 : 10;
    for (let m = Math.ceil(startMin / step) * step; m <= startMin + spanMin; m += step) {
      g.fillText(`${m} мин`, xOf(m) + 3, fhrH + 3);
    }

    // кривые
    const from = Math.max(0, Math.floor(startMin * 60 * hz));
    const to = Math.min(n, Math.ceil((startMin + spanMin) * 60 * hz) + 1);
    const drawLine = (arr: ArrayLike<number>, y: (v: number) => number, color: string, lw: number) => {
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.lineJoin = 'round';
      g.beginPath();
      let started = false;
      for (let i = from; i < to; i++) {
        const x = xOf(i / hz / 60);
        const yy = y(arr[i]);
        if (!started) {
          g.moveTo(x, yy);
          started = true;
        } else g.lineTo(x, yy);
      }
      g.stroke();
    };
    drawLine(fhr, yF, ink, 1.3);
    drawLine(toco, yT, ink, 1.2);

    // маркеры
    if (markers) {
      g.font = '11px system-ui, sans-serif';
      g.textBaseline = 'top';
      for (const mk of markers) {
        const x = Math.round(xOf(mk.min)) + 0.5;
        if (x < 0 || x > width) continue;
        g.strokeStyle = mk.color ?? '#1f5fbf';
        g.fillStyle = mk.color ?? '#1f5fbf';
        g.setLineDash([4, 3]);
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, fhrH + gap + tocoH);
        g.stroke();
        g.setLineDash([]);
        const tw = g.measureText(mk.label).width;
        const lx = Math.min(width - tw - 6, x + 3);
        g.fillRect(lx - 2, 2, tw + 6, 15);
        g.fillStyle = '#fff';
        g.fillText(mk.label, lx + 1, 4);
      }
    }

    // подписи осей (только на крупной ленте)
    if (fhrH < 200) return;
    g.fillStyle = muted;
    g.font = '10px system-ui, sans-serif';
    g.textBaseline = 'bottom';
    g.fillText('ЧСС, уд/мин', 4, fhrH - 2);
    g.fillText('Токо', 4, tocoTop + tocoH - 2);
  }, [fhr, toco, hz, n, startMin, spanMin, width, height, fhrH, tocoH, markers, highlight]);

  return <canvas ref={ref} style={{ width, height, display: 'block' }} aria-label="Лента КТГ" role="img" />;
}
