import { describe, expect, it } from 'vitest';
import {
  endLabelMargin,
  indexAxis,
  lastFinite,
  linePath,
  seriesColor,
  SERIES_COLORS,
  stackLabels,
  yearStarts,
} from './chart';

describe('stackLabels', () => {
  it('leaves labels that already clear each other alone', () => {
    expect(stackLabels([10, 40, 80], 10)).toEqual([10, 40, 80]);
  });

  it('pushes each label below the one above it, in input order', () => {
    expect(stackLabels([52, 50, 51], 10)).toEqual([70, 50, 60]);
  });

  it('lifts the whole stack when it runs past maxY', () => {
    expect(stackLabels([95, 96, 97], 10, 100)).toEqual([80, 90, 100]);
  });
});

describe('linePath', () => {
  const id = (v) => v;
  it('breaks the line at missing values', () => {
    expect(linePath([1, 2, null, 4, 5], id, id)).toBe('M0,1L1,2M3,4L4,5');
  });

  it('draws a slice at the slice’s own indices', () => {
    expect(linePath([1, 2, 3, 4], id, id, 2, 3)).toBe('M2,3L3,4');
  });
});

describe('lastFinite', () => {
  it('finds the last value present', () => {
    expect(lastFinite([1, 2, null])).toEqual({ i: 1, v: 2 });
    expect(lastFinite([null])).toBeNull();
  });
});

describe('endLabelMargin', () => {
  it('fits the longest label, with a floor', () => {
    expect(endLabelMargin(['Texas', 'Harris County'], { perChar: 7, extra: 10, min: 24 })).toBe(101);
    expect(endLabelMargin([], { perChar: 7, extra: 10, min: 24 })).toBe(24);
  });
});

describe('seriesColor', () => {
  it('prefers the series’ own colour, else cycles the palette', () => {
    expect(seriesColor({ color: 'red' }, 0)).toBe('red');
    expect(seriesColor({}, SERIES_COLORS.length + 1)).toBe(SERIES_COLORS[1]);
  });
});

describe('yearStarts', () => {
  it('marks the first month present of each year', () => {
    expect(yearStarts(['2022-11', '2022-12', '2023-01', '2023-02', '2024-01'])).toEqual([
      { i: 0, label: '2022' },
      { i: 2, label: '2023' },
      { i: 4, label: '2024' },
    ]);
  });
});

describe('indexAxis', () => {
  it('steps by ten with headroom past the data', () => {
    expect(indexAxis([79.9, 103.8])).toEqual({ domain: [70, 110], ticks: [70, 80, 90, 100, 110] });
  });

  it('keeps a step clear of data that lands on a gridline', () => {
    expect(indexAxis([80, 100]).domain).toEqual([70, 110]);
  });

  it('widens the step when the lines spread far', () => {
    expect(indexAxis([40, 190]).ticks).toEqual([0, 50, 100, 150, 200]);
  });
});
