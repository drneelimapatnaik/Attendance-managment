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
export type PrincipalKind = 'staff' | 'student' | 'parent';

interface BasePrincipal {
  kind: PrincipalKind;
  /** Staff id or portal account id. */
  id: string;
  tenantId: string;
  instituteCode: string;
  name: string;
}

/**
 * A staff session. The token names the *role*, not the permissions: roles are
 * institute data and are edited while people are signed in, so what the role may
 * do is read from the database on every request (PermissionResolverService).
 */
export interface StaffPrincipal extends BasePrincipal {
  kind: 'staff';
  roleId: string;
  /** Stable slug of the role, carried for logging and cheap branching. */
  roleKey: string;
  /** The person who set the institute up: implicitly holds every capability. */
  isOwner: boolean;
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
  /** Staff only: the role's id (`rid`) and slug (`rkey`), and the owner flag. */
  rid?: string;
  rkey?: string;
  own?: boolean;
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
    // A staff token without a role is malformed (or was issued before roles became
    // data): refuse it rather than guess, so the holder signs in again.
    if (!payload.rid) return null;
    return {
      kind: 'staff',
      id: payload.sub,
      tenantId: payload.tid,
      instituteCode: payload.tcode,
      name: payload.name ?? '',
      roleId: payload.rid,
      roleKey: payload.rkey ?? '',
      isOwner: payload.own === true,
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
