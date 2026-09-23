/**
 * Who is making the request.
 *
 * Three kinds of principal share one API:
 *   staff   — a member of the institute's team; authorised by the role/permission matrix.
 *   student — a portal login for exactly one student.
 *   parent  — a portal login linked to one or more of their children.
 *
 * The principal is rebuilt from the verified JWT on every request (never from a
 * header or body) and stored in the tenant context alongside the tenant id.
 */
import type { Role } from '@prisma/client';

export type PrincipalKind = 'staff' | 'student' | 'parent';

interface BasePrincipal {
  kind: PrincipalKind;
  /** Staff id or portal account id. */
  id: string;
  tenantId: string;
  instituteCode: string;
  name: string;
}

export interface StaffPrincipal extends BasePrincipal {
  kind: 'staff';
  role: Role;
  email: string;
}

export interface PortalPrincipal extends BasePrincipal {
  kind: 'student' | 'parent';
  /** Students this login may read. Exactly one for a student, one or more for a parent. */
  studentIds: string[];
}

export type Principal = StaffPrincipal | PortalPrincipal;

export const isStaff = (principal: Principal | undefined): principal is StaffPrincipal => principal?.kind === 'staff';
export const isPortal = (principal: Principal | undefined): principal is PortalPrincipal =>
  principal?.kind === 'student' || principal?.kind === 'parent';

/**
 * Access-token claims. Short names keep the token small (it travels on every
 * request from a mobile client). Nothing secret goes in here — a JWT is signed,
 * not encrypted.
 */
export interface AccessTokenPayload {
  /** Subject: staff id or portal account id. */
  sub: string;
  /** Principal kind. */
  typ: PrincipalKind;
  /** Tenant id — the authoritative tenant for the request. */
  tid: string;
  /** Institute code, so the server can cross-check the X-Tenant header cheaply. */
  tcode: string;
  name: string;
  /** Staff only. */
  role?: Role;
  email?: string;
  /** Portal only: the students this login may read. */
  sids?: string[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

/** Rebuilds a principal from verified claims. Returns null if the claims are malformed. */
export function principalFromPayload(payload: AccessTokenPayload): Principal | null {
  if (!payload?.sub || !payload.tid || !payload.tcode) return null;

  if (payload.typ === 'staff') {
    if (!payload.role) return null;
    return {
      kind: 'staff',
      id: payload.sub,
      tenantId: payload.tid,
      instituteCode: payload.tcode,
      name: payload.name ?? '',
      role: payload.role,
      email: payload.email ?? '',
    };
  }

  if (payload.typ === 'student' || payload.typ === 'parent') {
    return {
      kind: payload.typ,
      id: payload.sub,
      tenantId: payload.tid,
      instituteCode: payload.tcode,
      name: payload.name ?? '',
      studentIds: Array.isArray(payload.sids) ? payload.sids : [],
    };
  }

  return null;
}
