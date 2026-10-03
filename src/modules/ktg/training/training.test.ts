import { describe, expect, it } from 'vitest';
import { LIVE_SCENARIOS, LiveSim, liveDebrief, MAX_MIN } from './live';

const sc = (id: string) => LIVE_SCENARIOS.find((s) => s.id === id)!;

describe('живая лента', () => {
  it('устранение причины восстанавливает ритм и завершает сценарий', () => {
    const sim = new LiveSim(sc('hyper'));
    sim.advance(sc('hyper').onsetSec + 60);
    sim.act('help');
    sim.act('ve');
    sim.act('tocolysis');
    sim.act('stop_oxy');
    sim.advance(400);
    expect(sim.recoveredAt).not.toBeNull();
    expect(sim.finished).toBe(true);
    const d = liveDebrief(sim);
    expect(d.score).toBeGreaterThanOrEqual(90);
    expect(d.ph).toBeGreaterThan(7.2);
  });

  it('ЧСС падает при пролонгированной децелерации', () => {
    const sim = new LiveSim(sc('aortocaval'));
    sim.advance(sc('aortocaval').onsetSec + 150);
    expect(sim.lastFhr).toBeLessThan(105);
    sim.act('lateral');
    sim.advance(200);
    expect(sim.lastFhr).toBeGreaterThan(110);
  });

  it('острое событие не восстанавливается — нужно родоразрешение', () => {
    const s = sc('prolapse');
    const sim = new LiveSim(s);
    sim.advance(s.onsetSec + 60);
    sim.act('ve');
    sim.act('help');
    sim.act('elevate');
    sim.act('stop_oxy');
    sim.act('theatre');
    sim.act('deliver');
    sim.advance(400);
    expect(sim.recoveredAt).toBeNull();
    expect(sim.deliveredAt).not.toBeNull();
    const d = liveDebrief(sim);
    expect(d.rows.find((r) => r.label === 'Рождение')?.ok).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(85);
  });

  it('бездействие — низкая оценка и тяжёлый ацидоз', () => {
    const s = sc('abruption');
    const sim = new LiveSim(s);
    sim.advance(MAX_MIN * 60 + 5);
    expect(sim.finished).toBe(true);
    const d = liveDebrief(sim);
    expect(d.score).toBeLessThan(30);
    expect(d.ph).toBeLessThan(7.05);
  });

  it('увеличение окситоцина штрафуется', () => {
    const s = sc('hyper');
    const sim = new LiveSim(s);
    sim.advance(s.onsetSec + 30);
    sim.act('oxy_up');
    sim.act('tocolysis');
    sim.act('help');
    sim.act('ve');
    sim.act('stop_oxy');
    sim.advance(500);
    expect(liveDebrief(sim).notes.join(' ')).toMatch(/окситоцин/i);
  });

  it('все сценарии проходят до конца без ошибок', () => {
    for (const s of LIVE_SCENARIOS) {
      const sim = new LiveSim(s);
      sim.advance(MAX_MIN * 60 + 5);
      expect(sim.finished).toBe(true);
      expect(Number.isFinite(sim.ph)).toBe(true);
    }
  });
});
