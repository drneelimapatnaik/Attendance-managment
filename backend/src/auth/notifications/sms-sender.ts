/**
 * SMS delivery.
 *
 * The API only ever talks to this interface, so swapping the development logger
 * for a real gateway (MSG91, Twilio, Gupshup…) is a one-provider change in
 * AuthModule — no flow code moves.
 *
 * The development implementation prints the message so the demo can be completed
 * without a gateway. It refuses to print codes in production, where an
 * unconfigured sender is an error, not a convenience.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { maskPhone } from '@/common/phone';

export const SMS_SENDER = 'SMS_SENDER';

export interface SmsMessage {
  /** Destination number as the institute stored it. */
  to: string;
  body: string;
  /** Free-form tag for logs and delivery reports, e.g. 'parent-otp'. */
  purpose: string;
}

export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

/** Development / test implementation: logs instead of sending. */
@Injectable()
export class LoggingSmsSender implements SmsSender {
  private readonly logger = new Logger('SmsSender');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: SmsMessage): Promise<void> {
    if (this.config.isProduction) {
      // Never print the body (it contains the OTP) and make the misconfiguration loud.
      this.logger.error({ to: maskPhone(message.to), purpose: message.purpose }, 'No SMS provider configured — message dropped');
      return;
    }
    this.logger.warn(`[DEV SMS → ${message.to}] ${message.body}`);
  }
}
