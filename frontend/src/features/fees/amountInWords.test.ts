/** Receipt amount-in-words: Indian numbering (thousand → lakh → crore). */
import { describe, expect, it } from 'vitest';
import { amountInWords, integerToIndianWords } from './amountInWords';

describe('amountInWords', () => {
  it('spells Indian place values', () => {
    expect(integerToIndianWords(0)).toMatch(/zero/i);
    expect(integerToIndianWords(2500)).toBe('Two Thousand Five Hundred');
    expect(integerToIndianWords(125000)).toBe('One Lakh Twenty Five Thousand');
    expect(integerToIndianWords(10000000)).toBe('One Crore');
  });

  it('wraps INR amounts and skips other currencies', () => {
    expect(amountInWords(125000, 'INR')).toBe('Rupees One Lakh Twenty Five Thousand Only');
    expect(amountInWords(250, 'USD')).toBeNull();
  });
});
