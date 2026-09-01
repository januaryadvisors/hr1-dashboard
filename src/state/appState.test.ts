import { describe, expect, it } from 'vitest';
import {
  ALL_INFRA,
  activeGeoid,
  fromSearchParams,
  initialState,
  reducer,
  toSearchParams,
  type AppState,
} from './appState';

const MONTHS = ['2025-05', '2025-06', '2025-07', '2025-12', '2026-05'];
const defaults = initialState('2025-07', '2026-05');

const roundTrip = (state: AppState): AppState =>
  fromSearchParams(toSearchParams(state, defaults), defaults, MONTHS);

describe('initial state matches the spec defaults', () => {
  it('starts on D1, geo, rate, since-H.R.-1', () => {
    expect(defaults.layer).toBe('d1'); // §6.4
    expect(defaults.style).toBe('geo'); // §6.5
    expect(defaults.measure).toBe('rate');
    expect(defaults.window).toEqual(['2025-07', '2026-05']); // §6.2
    expect(defaults.infra).toEqual(ALL_INFRA);
  });
});

describe('reducer', () => {
  it('toggles infrastructure keys while preserving canonical order', () => {
    let s = reducer(defaults, { type: 'toggleInfra', key: 'food_bank' });
    expect(s.infra).toEqual(['cms_navigator', 'chw', 'counselor']);
    s = reducer(s, { type: 'toggleInfra', key: 'food_bank' });
    expect(s.infra).toEqual(ALL_INFRA);
  });

  it('returns the same object when hover does not change', () => {
    const s = reducer(defaults, { type: 'hover', geoid: '48201' });
    expect(reducer(s, { type: 'hover', geoid: '48201' })).toBe(s);
  });
});

describe('activeGeoid (§6.5)', () => {
  it('is the hovered county, or null', () => {
    expect(activeGeoid({ ...defaults, hovered: '48201' })).toBe('48201');
    expect(activeGeoid(defaults)).toBeNull();
  });
});

describe('URL mirroring', () => {
  it('omits defaults so a pristine view has a clean URL', () => {
    expect(toSearchParams(defaults, defaults).toString()).toBe('');
  });

  it('round-trips every mirrored field', () => {
    const state: AppState = {
      ...defaults,
      measure: 'count',
      layer: 'composite',
      style: 'density',
      window: ['2025-06', '2025-12'],
      infra: ['chw'],
      overlayQ5: true,
      overlayGap: true,
    };
    const back = roundTrip(state);
    expect(back).toEqual({ ...state, hovered: null });
  });

  it('keeps hovered out of the URL (§4: transient)', () => {
    const p = toSearchParams({ ...defaults, hovered: '48201' }, defaults);
    expect(p.toString()).toBe('');
  });

  it('distinguishes an empty infra selection from an absent param', () => {
    const none = roundTrip({ ...defaults, infra: [] });
    expect(none.infra).toEqual([]);
    // An absent param means "default", which is all four on.
    expect(fromSearchParams(new URLSearchParams(), defaults, MONTHS).infra).toEqual(ALL_INFRA);
  });

  it('ignores junk rather than throwing, so a mangled link still opens', () => {
    const s = fromSearchParams(
      new URLSearchParams('measure=sideways&layer=d9&style=hologram&from=nope&to=nope'),
      defaults,
      MONTHS,
    );
    expect(s.measure).toBe(defaults.measure);
    expect(s.layer).toBe(defaults.layer);
    expect(s.style).toBe(defaults.style);
    expect(s.window).toEqual(defaults.window);
  });

  it('rejects a window whose months are absent or out of order', () => {
    expect(
      fromSearchParams(new URLSearchParams('from=2026-05&to=2025-07'), defaults, MONTHS).window,
    ).toEqual(defaults.window);
    expect(
      fromSearchParams(new URLSearchParams('from=1999-01&to=2026-05'), defaults, MONTHS).window,
    ).toEqual(defaults.window);
  });
});

describe('hoverOrigin', () => {
  it('defaults to pointer', () => {
    const s = reducer(defaults, { type: 'hover', geoid: '48201' });
    expect(s.hoverOrigin).toBe('pointer');
  });

  it('records an external origin so the tooltip can anchor to the county', () => {
    const s = reducer(defaults, { type: 'hover', geoid: '48201', origin: 'external' });
    expect(s.hoverOrigin).toBe('external');
  });

  it('re-renders when only the origin changes', () => {
    const external = reducer(defaults, { type: 'hover', geoid: '48201', origin: 'external' });
    const pointer = reducer(external, { type: 'hover', geoid: '48201', origin: 'pointer' });
    expect(pointer).not.toBe(external);
    expect(pointer.hoverOrigin).toBe('pointer');
  });

  it('stays identical when nothing changes', () => {
    const a = reducer(defaults, { type: 'hover', geoid: '48201' });
    expect(reducer(a, { type: 'hover', geoid: '48201' })).toBe(a);
  });

  it('is not mirrored to the URL', () => {
    const s = reducer(defaults, { type: 'hover', geoid: '48201', origin: 'external' });
    expect(toSearchParams(s, defaults).toString()).toBe('');
  });
});
