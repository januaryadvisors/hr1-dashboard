import { describe, expect, it } from 'vitest';
import { toCsv } from './download';

describe('toCsv', () => {
  it('writes a header row and one row per record', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])).toBe('a,b\n1,x\n2,y');
  });

  it('quotes values containing commas, quotes or newlines', () => {
    expect(toCsv([{ name: 'De Witt, TX' }])).toBe('name\n"De Witt, TX"');
    expect(toCsv([{ name: 'say "hi"' }])).toBe('name\n"say ""hi"""');
    expect(toCsv([{ name: 'a\nb' }])).toBe('name\n"a\nb"');
  });

  it('renders null as empty rather than the string "null"', () => {
    expect(toCsv([{ moe: null }])).toBe('moe\n');
  });

  it('keeps false distinguishable from empty', () => {
    expect(toCsv([{ is_gap: false }])).toBe('is_gap\nfalse');
  });

  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});
