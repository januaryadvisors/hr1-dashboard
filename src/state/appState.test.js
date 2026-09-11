import { describe, expect, it } from 'vitest';
import {
  ALL_INFRA,
  activeGeoid,
  fromSearchParams,
  initialState,
  reducer,
  toSearchParams,

} from './appState';
/**
 * @typedef {import('./appState').AppState} AppState
 */

const MONTHS = ['2025-05', '2025-06', '2025-07', '2025-12', '2026-05'];
const defaults = initialState('2025-07', '2026-05');

const roundTrip = (state) =>
  fromSearchParams(toSearchParams(state, defaults), defaults, MONTHS);

describe('initial state matches the spec defaults', () => {
  it('starts on Benefits lost, geo, count, since-H.R.-1', () => {
    // §6.4 said D1; superseded 2026-09-10 by the four-view rework.
    expect(defaults.layer).toBe('loss');
    expect(defaults.style).toBe('geo'); // §6.5
    // Count, not rate, since 2026-09-11: the first question a reader brings to
    // this page is how many people.
    expect(defaults.measure).toBe('count');
    expect(defaults.window).toEqual(['2025-07', '2026-05']); // §6.2
    expect(defaults.infra).toEqual(ALL_INFRA);
  });

  it('has no advanced disclosure to open', () => {
    // Removed 2026-09-11: Measure moved above the map and the infrastructure
    // picker is gated on the view, so there was nothing left behind the toggle.
    expect(defaults).not.toHaveProperty('advanced');
  });
});

describe('reducer', () => {
  it('toggles infrastructure keys while preserving canonical order', () => {
    let s = reducer(defaults, { type: 'toggleInfra', key: 'food_bank' });
    expect(s.infra).toEqual(['cms_navigator', 'chw', 'counselor']);
    s = reducer(s, { type: 'toggleInfra', key: 'food_bank' });
    expect(s.infra).toEqual(ALL_INFRA);
  });

  it('sets and clears the county scope', () => {
    const scoped = reducer(defaults, { type: 'setScope', geoid: '48201' });
    expect(scoped.scope).toBe('48201');
    expect(reducer(scoped, { type: 'setScope', geoid: null }).scope).toBeNull();
  });

  it('does not re-render when the scope is already that county', () => {
    const scoped = reducer(defaults, { type: 'setScope', geoid: '48201' });
    expect(reducer(scoped, { type: 'setScope', geoid: '48201' })).toBe(scoped);
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
    const state = {
      ...defaults,
      measure: 'count',
      layer: 'composite',
      style: 'density',
      window: ['2025-06', '2025-12'],
      infra: ['chw'],
      overlayQ5: true,
      overlayGap: true,
      scope: '48201',
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
      new URLSearchParams('measure=sideways&layer=d9&style=hologram&from=nope&to=nope&adv=maybe'),
      defaults,
      MONTHS,
    );
    expect(s.measure).toBe(defaults.measure);
    expect(s.layer).toBe(defaults.layer);
    expect(s.style).toBe(defaults.style);
    expect(s.window).toEqual(defaults.window);
  });

  it('falls back to geo on a link to the removed cartogram', () => {
    const s = fromSearchParams(new URLSearchParams('style=grid'), defaults, MONTHS);
    expect(s.style).toBe('geo');
  });

  /**
   * The county stat page is the whole reason scope is in the URL: the address bar
   * after picking a county has to BE the shareable link.
   */
  describe('county scope', () => {
    const geoids = new Set(['48201', '48113']);

    it('round-trips a county through the URL', () => {
      const p = toSearchParams({ ...defaults, scope: '48201' }, defaults);
      expect(p.get('county')).toBe('48201');
      expect(fromSearchParams(p, defaults, MONTHS, geoids).scope).toBe('48201');
    });

    it('omits the param when scoped to the state', () => {
      expect(toSearchParams(defaults, defaults).toString()).toBe('');
    });

    it('degrades a county that is not in the dataset to statewide', () => {
      expect(
        fromSearchParams(new URLSearchParams('county=48999'), defaults, MONTHS, geoids).scope,
      ).toBeNull();
    });

    it('accepts any geoid when no validation set is supplied', () => {
      expect(
        fromSearchParams(new URLSearchParams('county=48999'), defaults, MONTHS).scope,
      ).toBe('48999');
    });
  });

  it('accepts every layer a view can show, including pre-rework links', () => {
    for (const layer of ['loss', 'child_loss', 'd1', 'd3', 'work_both', 'composite']) {
      expect(fromSearchParams(new URLSearchParams(`layer=${layer}`), defaults, MONTHS).layer).toBe(
        layer,
      );
    }
  });

  it('sends a layer no view can show back to the default', () => {
    // d2 and d4 lost their strip cards in the four-view rework. Accepting them
    // would highlight one view's card while drawing another view's map.
    for (const layer of ['d2', 'd4', 'd5']) {
      expect(fromSearchParams(new URLSearchParams(`layer=${layer}`), defaults, MONTHS).layer).toBe(
        defaults.layer,
      );
    }
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
