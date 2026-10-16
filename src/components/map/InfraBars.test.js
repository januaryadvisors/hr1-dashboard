import { describe, expect, it } from 'vitest';
import { infraMax } from './InfraBars';

const county = (infra) => ({ infra: { cms_navigator: 0, chw: 0, cpp: 0, food_bank: null, ...infra } });

describe('infraMax', () => {
  it('tops each registry at its busiest county', () => {
    const max = infraMax([county({ cms_navigator: 3, cpp: 97 }), county({ cms_navigator: 1 })]);
    expect(max.cms_navigator).toBe(3);
    expect(max.cpp).toBe(97);
  });

  it('holds the food-bank scale at 5 until a county passes it', () => {
    expect(infraMax([county({ food_bank: 2 })]).food_bank).toBe(5);
    expect(infraMax([county({ food_bank: 7 })]).food_bank).toBe(7);
  });
});
