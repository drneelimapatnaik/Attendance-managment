/**
 * Rate limit for the OTP request route.
 *
 * The default throttler counts requests per IP, which does not stop someone
 * walking a list of phone numbers from one address, and punishes a whole school
 * behind one NAT. This tracker combines the caller's IP with the *phone number
 * being targeted*, so both "many codes to one number" and "many numbers from one
 * address" are limited.
 */
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { normalizePhone } from '@/common/phone';

@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : 'unknown';
    const forwarded = req.ips as string[] | undefined;
    const ip = forwarded?.length ? forwarded[0] : ((req.ip as string | undefined) ?? 'unknown');
    return `otp:${ip}:${phone}`;
  }
}
