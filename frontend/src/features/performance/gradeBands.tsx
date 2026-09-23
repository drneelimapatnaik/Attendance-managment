/**
 * Grade bands (A+ … E) for the Performance screens: display order, score
 * ranges (mirroring `gradeBand()` in domain/academics.ts) and one badge style,
 * so a band reads the same in tables, charts and the assessment dialog.
 */
import type { GradeBand } from '@/domain/academics';
import { gradeBand, PASS_MARK } from '@/domain/academics';
import { Badge, type BadgeTone } from '@/components/ui';

export const GRADE_BANDS: GradeBand[] = ['A+', 'A', 'B', 'C', 'D', 'E'];

export const GRADE_RANGE: Record<GradeBand, string> = {
  'A+': '90–100%',
  A: '75–89%',
  B: '60–74%',
  C: '50–59%',
  D: `${PASS_MARK * 100}–49%`,
  E: `Below ${PASS_MARK * 100}%`,
};

/** Students averaging below this share of marks need attention (covers everyone failing too). */
export const AT_RISK_BELOW = 0.5;

const TONE: Record<GradeBand, BadgeTone> = { 'A+': 'success', A: 'success', B: 'primary', C: 'info', D: 'warning', E: 'danger' };

export function GradeBadge({ ratio }: { ratio: number }) {
  if (!Number.isFinite(ratio)) return <Badge tone="neutral">—</Badge>;
  const band = gradeBand(ratio);
  return (
    <Badge tone={TONE[band]} className="min-w-[2.25rem] justify-center">
      {band}
    </Badge>
  );
}

/** Score ratio → whole percent ("72%"), em dash when there is no score. */
export const pct = (ratio: number) => (Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : '—');
