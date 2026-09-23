/**
 * Phone matching decides who can sign in to the parent app, so the shapes people
 * actually type all have to land on the same key.
 */
import { isPhoneKey, maskEmail, maskPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('maps every way of writing one number onto the same key', () => {
    const key = '9876543210';
    for (const written of ['+91 98765 43210', '098765 43210', '9876543210', '+91-98765-43210', '(+91) 98765 43210']) {
      expect(normalizePhone(written)).toBe(key);
    }
  });

  it('keeps short numbers as they are rather than inventing digits', () => {
    expect(normalizePhone('12345')).toBe('12345');
  });

  it('recognises a usable 10-digit key', () => {
    expect(isPhoneKey(normalizePhone('+91 98765 43210'))).toBe(true);
    expect(isPhoneKey('12345')).toBe(false);
  });
});

describe('masking', () => {
  it('shows only the last five digits of a number', () => {
    expect(maskPhone('+91 98765 43210')).toBe('••••• 43210');
  });

  it('shows only the first letter of an email local part', () => {
    expect(maskEmail('kavya.nair@apexacademy.in')).toBe('k•••••••••@apexacademy.in');
  });
});
