import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CtgCanvas, type StripMarker } from './CtgCanvas';

/** Прокручиваемая лента целиком (для разбора). */
export function StaticStrip(props: {
  fhr: ArrayLike<number>;
  toco: ArrayLike<number>;
  hz: number;
  minutes: number;
  pxPerMin: number;
  setPxPerMin?: (v: number) => void;
  markers?: StripMarker[];
  highlight?: [number, number];
  /** Прокрутить к концу (к «сейчас»). */
  scrollToEnd?: boolean;
  fhrHeight?: number;
  tocoHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = Math.round(props.minutes * props.pxPerMin);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && props.scrollToEnd) el.scrollLeft = el.scrollWidth;
  }, [width, props.scrollToEnd]);
  return (
    <div>
      {props.setPxPerMin && (
        <div className="strip-tools">
          <span className="tiny muted">Сетка: 1 мин / 10 уд/мин · зелёная полоса — 110–160 · прокрутите ленту пальцем</span>
          <div className="seg">
            {[
              [20, '1 см/мин ×½'],
              [40, '1 см/мин'],
              [90, '3 см/мин'],
            ].map(([v, l]) => (
              <button key={v} type="button" className={props.pxPerMin === v ? 'on' : ''} onClick={() => props.setPxPerMin?.(v as number)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="strip-wrap" ref={ref}>
        <CtgCanvas
          fhr={props.fhr}
          toco={props.toco}
          hz={props.hz}
          startMin={0}
          spanMin={props.minutes}
          width={width}
          markers={props.markers}
          highlight={props.highlight}
          fhrHeight={props.fhrHeight}
          tocoHeight={props.tocoHeight}
        />
      </div>
    </div>
  );
}

/** Ширина контейнера (для «живой» ленты фиксированной ширины). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.floor(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(280, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
