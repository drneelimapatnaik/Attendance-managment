/**
 * Email delivery.
 *
 * Same contract as SmsSender: the auth flows depend on the interface, not on a
 * provider. Account activation and password recovery are the only emails the
 * foundation sends; the development implementation logs the link so the flow can
 * be finished locally.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { maskEmail } from '@/common/phone';

export const MAIL_SENDER = 'MAIL_SENDER';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. A templated HTML version belongs in the real provider adapter. */
  text: string;
  purpose: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/** Development / test implementation: logs instead of sending. */
@Injectable()
export class LoggingMailSender implements MailSender {
  private readonly logger = new Logger('MailSender');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    if (this.config.isProduction) {
      // The body carries a single-use link — log only that an email was due.
      this.logger.error({ to: maskEmail(message.to), purpose: message.purpose }, 'No mail provider configured — message dropped');
      return;
    }
    this.logger.warn(`[DEV MAIL → ${message.to}] ${message.subject}\n${message.text}`);
  }
}
