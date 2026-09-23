/**
 * Wire-format helpers.
 *
 * The client's types (frontend/src/types/domain.ts) are the contract, so responses
 * must use exactly its spellings: `'On Leave'`, `'Bank Transfer'`, `'Not Started'`,
 * dates as `YYYY-MM-DD`, money as a plain number. Prisma cannot use those strings
 * as enum member names, so it stores them via `@map` and exposes identifier-safe
 * names (`OnLeave`) — these maps are the single place that translation happens.
 */
import { Prisma } from '@prisma/client';
import type {
  AssessmentType,
  AttendanceMark,
  BillingMode,
  CoverageStatus,
  PaymentMethod,
  PortalAccess,
  StudentStatus,
} from '@prisma/client';
import { toISODate } from '@/domain/date';

/** Prisma enum member → the string the client expects. Only members that differ. */
const WIRE_OVERRIDES = {
  StudentStatus: { OnLeave: 'On Leave' },
  PortalAccess: { NotInvited: 'Not Invited' },
  CoverageStatus: { NotStarted: 'Not Started', InProgress: 'In Progress' },
  PaymentMethod: { BankTransfer: 'Bank Transfer' },
  AssessmentType: { UnitTest: 'Unit Test', MockExam: 'Mock Exam' },
  BillingMode: { JoiningDate: 'joining-date', FixedDay: 'fixed-day' },
} as const;

type WireGroup = keyof typeof WIRE_OVERRIDES;

function toWire<T extends string>(group: WireGroup, value: T): string {
  const overrides = WIRE_OVERRIDES[group] as Record<string, string>;
  return overrides[value] ?? value;
}

function fromWire<T extends string>(group: WireGroup, value: string): T {
  const overrides = WIRE_OVERRIDES[group] as Record<string, string>;
  const entry = Object.entries(overrides).find(([, wire]) => wire === value);
  return (entry?.[0] ?? value) as T;
}

export const studentStatusToWire = (value: StudentStatus): string => toWire('StudentStatus', value);
export const studentStatusFromWire = (value: string): StudentStatus => fromWire<StudentStatus>('StudentStatus', value);

export const portalAccessToWire = (value: PortalAccess): string => toWire('PortalAccess', value);
export const portalAccessFromWire = (value: string): PortalAccess => fromWire<PortalAccess>('PortalAccess', value);

export const coverageStatusToWire = (value: CoverageStatus): string => toWire('CoverageStatus', value);
export const coverageStatusFromWire = (value: string): CoverageStatus => fromWire<CoverageStatus>('CoverageStatus', value);

export const paymentMethodToWire = (value: PaymentMethod): string => toWire('PaymentMethod', value);
export const paymentMethodFromWire = (value: string): PaymentMethod => fromWire<PaymentMethod>('PaymentMethod', value);

export const assessmentTypeToWire = (value: AssessmentType): string => toWire('AssessmentType', value);
export const assessmentTypeFromWire = (value: string): AssessmentType => fromWire<AssessmentType>('AssessmentType', value);

export const billingModeToWire = (value: BillingMode): 'joining-date' | 'fixed-day' =>
  toWire('BillingMode', value) as 'joining-date' | 'fixed-day';
export const billingModeFromWire = (value: string): BillingMode => fromWire<BillingMode>('BillingMode', value);

/** Attendance marks are already single letters — kept for symmetry and typing. */
export const attendanceMarkToWire = (value: AttendanceMark): AttendanceMark => value;

/**
 * Prisma `Decimal` → the plain number the client's `Money` fields expect.
 * Rounds to 2 decimals: currency minor units, never floating-point dust.
 */
export function toMoney(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const asNumber = typeof value === 'number' ? value : value.toNumber();
  return Math.round(asNumber * 100) / 100;
}

/** A `@db.Date` column → "YYYY-MM-DD". */
export function dateToWire(value: Date | null | undefined): string | undefined {
  return value ? toISODate(value) : undefined;
}

/** A `DateTime` column → full ISO 8601, e.g. "2026-09-23T09:15:00.000Z". */
export function instantToWire(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}
