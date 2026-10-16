import { describe, expect, it } from 'vitest';
import { safeHref } from './safeHref';

describe('safeHref', () => {
  it('keeps absolute https URLs', () => {
    expect(safeHref('https://fhb.hhs.texas.gov/a.pdf')).toBe('https://fhb.hhs.texas.gov/a.pdf');
  });
  it('drops anything else', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:x', 'http://x.org', '//x.org', '/a', '', null, undefined]) {
      expect(safeHref(bad)).toBeUndefined();
    }
  });
});
