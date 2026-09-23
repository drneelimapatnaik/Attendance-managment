/**
 * Jest bootstrap.
 *
 * Silences the Nest logger so expected warnings (a deliberately corrupt password
 * hash, a deliberately reused refresh token) do not drown the test output. Failures
 * are still reported by Jest itself.
 */
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);
