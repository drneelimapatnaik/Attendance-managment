/**
 * Password hashing and policy. The hashing tests run real argon2 — slow by design,
 * so the suite stays honest about what production actually does.
 */
import { BadRequestError } from '@/common/errors/app.error';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  describe('hashing', () => {
    it('produces an argon2id hash that verifies', async () => {
      const hash = await passwords.hash('Correct#Horse26');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      await expect(passwords.verify(hash, 'Correct#Horse26')).resolves.toBe(true);
    });

    it('rejects the wrong password', async () => {
      const hash = await passwords.hash('Correct#Horse26');
      await expect(passwords.verify(hash, 'correct#horse26')).resolves.toBe(false);
    });

    it('salts: the same password hashes differently every time', async () => {
      const [a, b] = await Promise.all([passwords.hash('Correct#Horse26'), passwords.hash('Correct#Horse26')]);
      expect(a).not.toEqual(b);
    });

    it('returns false — never throws — when there is no stored hash', async () => {
      await expect(passwords.verify(null, 'anything')).resolves.toBe(false);
      await expect(passwords.verify(undefined, 'anything')).resolves.toBe(false);
    });

    it('returns false for a corrupt stored hash instead of crashing sign-in', async () => {
      await expect(passwords.verify('not-a-hash', 'anything')).resolves.toBe(false);
    });
  });

  describe('policy', () => {
    const rejects = (password: string, identifiers: string[] = []) => {
      expect(() => passwords.assertStrong(password, identifiers)).toThrow(BadRequestError);
      try {
        passwords.assertStrong(password, identifiers);
      } catch (error) {
        expect((error as BadRequestError).getResponse()).toMatchObject({ code: 'WEAK_PASSWORD' });
      }
    };

    it('accepts a reasonable password', () => {
      expect(() => passwords.assertStrong('Apex@2026!')).not.toThrow();
      expect(() => passwords.assertStrong('two roads diverged')).not.toThrow();
    });

    it('rejects anything shorter than 8 characters', () => rejects('Ap3x@2'));

    it('rejects absurdly long input', () => rejects('a'.repeat(200)));

    it('rejects passwords that are padded with spaces', () => rejects(' Apex@2026 '));

    it('rejects the usual suspects', () => {
      rejects('password');
      rejects('password123');
      rejects('qwertyuiop');
      rejects('changeme');
    });

    it('rejects a single repeated character', () => rejects('aaaaaaaa'));

    it('rejects simple sequences in both directions', () => {
      rejects('12345678');
      rejects('87654321');
      rejects('abcdefgh');
    });

    it('rejects a password containing the account identifier', () => {
      rejects('neelima-2026', ['neelima@apexacademy.in']);
      rejects('xxSTU-1042xx'.toLowerCase(), ['stu-1042']);
    });

    it('ignores identifiers too short to matter', () => {
      expect(() => passwords.assertStrong('abc#Wonderful1', ['abc'])).not.toThrow();
    });
  });
});
