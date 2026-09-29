/**
 * Row → `StaffDto`, and the Prisma selection that feeds it.
 *
 * It lives in its own file, free of Nest decorators, because two modules need it:
 * the staff endpoints and the auth flows (a sign-in response carries the same staff
 * object). Keeping one mapper is what stops the two drifting.
 *
 * The password hash is never part of the selection below, so it cannot reach a
 * response by accident.
 */
import type { StaffStatus } from '@prisma/client';
import { dateToWire, instantToWire } from '@/common/serialization/wire';
import { StaffDto } from './dto/staff.dto';

/** Everything `toStaffDto` needs, and nothing secret. */
export const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  roleId: true,
  isOwner: true,
  title: true,
  status: true,
  joinedOn: true,
  avatarUrl: true,
  lastActiveAt: true,
  role: { select: { key: true, name: true } },
  subjects: { select: { subjectId: true } },
} as const;

/** The shape `STAFF_SELECT` produces. Written out so the mapper needs no Prisma generics. */
export interface StaffRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  isOwner: boolean;
  title: string;
  status: StaffStatus;
  joinedOn: Date;
  avatarUrl: string | null;
  lastActiveAt: Date | null;
  role: { key: string; name: string };
  subjects: { subjectId: string }[];
}

export function toStaffDto(staff: StaffRow): StaffDto {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    roleId: staff.roleId,
    roleKey: staff.role.key,
    roleName: staff.role.name,
    isOwner: staff.isOwner,
    title: staff.title,
    subjectIds: staff.subjects.map((link) => link.subjectId),
    status: staff.status,
    // `joinedOn` is a calendar date (YYYY-MM-DD); `lastActiveAt` is an instant.
    joinedOn: dateToWire(staff.joinedOn) as string,
    avatarUrl: staff.avatarUrl ?? undefined,
    lastActiveAt: instantToWire(staff.lastActiveAt),
  };
}
