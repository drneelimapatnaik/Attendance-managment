/**
 * Password hashing and policy.
 *
 * argon2id with OWASP's 2024 baseline parameters (19 MiB, 2 passes). Two details
 * matter as much as the algorithm:
 *
 *   * `verify()` always does the same work, even when the account does not exist
 *     or has no password yet — otherwise response timing tells an attacker which
 *     accounts are real.
 *   * `assertStrong()` rejects the passwords that actually get used ("password1",
 *     the user's own email, "12345678") rather than demanding symbol soup.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { BadRequestError, ErrorCodes } from '@/common/errors/app.error';

/** OWASP recommended argon2id settings; tuned so a hash takes ~50–100 ms. */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** The passwords that turn up in every breach corpus. Cheap, high-value filter. */
const WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'letmein1',
  'welcome1',
  'abc12345',
  'changeme',
  'institute',
  'edutrack',
  'student1',
  'teacher1',
]);

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  /**
   * A hash of a value nobody knows, verified against when there is no real hash.
   * Keeps the "wrong password" and "no such user" paths the same length.
   */
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  /**
   * Constant-ish time verification. `hash` may be null (invited account that has
   * never chosen a password) — we still burn the same CPU before returning false.
   */
  async verify(hash: string | null | undefined, plain: string): Promise<boolean> {
    if (!hash) {
      await this.burnTime(plain);
      return false;
    }
    try {
      // argon2.verify is itself constant-time for a given hash.
      return await argon2.verify(hash, plain, ARGON2_OPTIONS);
    } catch (error) {
      // A malformed hash in the database must not crash sign-in.
      this.logger.warn({ err: error }, 'Password hash could not be verified');
      return false;
    }
  }

  /** True when the stored hash used weaker parameters and should be upgraded on next login. */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, ARGON2_OPTIONS);
    } catch {
      return true;
    }
  }

  /**
   * Throws BadRequestError(WEAK_PASSWORD) unless the password is acceptable.
   * `identifiers` are values the password must not simply repeat — the email,
   * student code or phone number of the account being protected.
   */
  assertStrong(password: string, identifiers: readonly string[] = []): void {
    const fail = (message: string): never => {
      throw new BadRequestError(message, ErrorCodes.WEAK_PASSWORD);
    };

    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      fail(`Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      fail(`Passwords cannot be longer than ${PASSWORD_MAX_LENGTH} characters.`);
    }
    if (password.trim().length !== password.length) {
      fail('Passwords cannot start or end with a space.');
    }

    const lower = password.toLowerCase();
    if (WEAK_PASSWORDS.has(lower)) fail('That password is too common. Choose something harder to guess.');

    // "aaaaaaaa" and "11111111".
    if (/^(.)\1+$/.test(password)) fail('That password is too easy to guess.');

    // "12345678", "abcdefgh" and their reverses.
    if (isSequential(lower)) fail('That password is too easy to guess.');

    for (const identifier of identifiers) {
      const needle = identifier?.split('@')[0]?.toLowerCase();
      if (needle && needle.length >= 4 && lower.includes(needle)) {
        fail('Your password cannot contain your email, student ID or phone number.');
      }
    }
  }

  /** Spends roughly one argon2 verification's worth of time. */
  private async burnTime(plain: string): Promise<void> {
    this.dummyHash ??= argon2.hash('edutrack-dummy-password-for-timing-equalisation', ARGON2_OPTIONS);
    try {
      await argon2.verify(await this.dummyHash, plain, ARGON2_OPTIONS);
    } catch {
      // Ignored: the point is the elapsed time, not the result.
    }
  }
}

/** "1234…", "abcd…" and their reverses, for the whole string. */
function isSequential(value: string): boolean {
  if (value.length < 4) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i++) {
    const delta = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }
  return ascending || descending;
}
