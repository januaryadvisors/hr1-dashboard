import { describe, expect, it } from 'vitest';
import { titleSize } from './printTitle';

describe('titleSize', () => {
  it('keeps the full size for Texas, a district or one county', () => {
    expect(titleSize(0)).toBe('lg');
    expect(titleSize(1)).toBe('lg');
  });

  it('steps down as more counties are added together', () => {
    expect([2, 3].map(titleSize)).toEqual(['md', 'md']);
    expect([4, 5, 6].map(titleSize)).toEqual(['sm', 'sm', 'sm']);
    expect([7, 10, 40].map(titleSize)).toEqual(['xs', 'xs', 'xs']);
  });
});
