/**
 * Domain model — the shapes shared by the store, business logic and UI.
 *
 * These mirror the entities the backend will expose. Every record belongs to a
 * tenant (institute) and, where relevant, a campus/branch. IDs are strings so
 * they can be UUIDs from the server or readable codes (STU-1042) in the demo.
 *
 * Dates are ISO strings: `YYYY-MM-DD` for calendar dates, full ISO for instants.
 * Times are `HH:mm` (24h). Money is stored in the institute currency's major
 * unit (e.g. rupees) as a number.
 */

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO 8601
export type TimeHM = string; // HH:mm

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ------------------------------------------------------------------ Tenant */

export type BrandTheme = 'royal' | 'indigo' | 'teal' | 'plum' | 'slate';

export interface Campus {
  id: ID;
  name: string; // "Central Campus"
  address: string;
}

export interface InstituteSettings {
  tenantId: ID;
  instituteCode: string; // used at login to pick the tenant, e.g. "APEX"
  name: string; // "Apex Academy"
  tagline: string;
  logoUrl?: string;
  brandTheme: BrandTheme;
  campuses: Campus[];
  academicYear: string; // "2026-27"
  academicYearStart: ISODate;
  contactEmail: string;
  contactPhone: string;
  address: string;
  currency: { code: string; symbol: string; locale: string };
  timezone: string;
  workingDays: Weekday[];
  attendance: {
    lateAfterMinutes: number; // arrivals after this many minutes count as Late
    lowAttendanceThreshold: number; // % below which a student is flagged
    countLateAsPresent: boolean; // whether Late counts towards attendance %
    notifyParentOnAbsence: boolean;
  };
  fees: {
    /** 'joining-date': each student is billed on their joining anniversary; 'fixed-day': everyone on `billingDay`. */
    billingMode: 'joining-date' | 'fixed-day';
    billingDay: number;
    dueInDays: number; // invoice due this many days after issue
    gracePeriodDays: number; // after due date + grace, an invoice is Overdue
    lateFee: number;
    receiptPrefix: string;
  };
  notifications: { sms: boolean; whatsapp: boolean; email: boolean; push: boolean };
  license: { tier: 'Starter' | 'Pro' | 'Enterprise'; validUntil: ISODate; maxStudents: number };
}

/* ------------------------------------------------------------ People & RBAC */

export type Role = 'owner' | 'admin' | 'faculty' | 'accountant' | 'front_desk';

/** Fine-grained capabilities; roles map to a set of these (see config/permissions.ts). */
export type Permission =
  | 'dashboard.view'
  | 'attendance.mark'
  | 'attendance.reports'
  | 'students.view'
  | 'students.manage'
  | 'batches.view'
  | 'batches.manage'
  | 'topics.manage'
  | 'fees.view'
  | 'fees.collect'
  | 'performance.view'
  | 'performance.manage'
  | 'faculty.manage'
  | 'settings.manage';

export type StaffStatus = 'Active' | 'Inactive' | 'Invited';

export interface Staff {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string; // "Senior Faculty – Physics"
  subjectIds: ID[];
  status: StaffStatus;
  joinedOn: ISODate;
  avatarUrl?: string;
  lastActiveAt?: ISODateTime;
}

export type Gender = 'Male' | 'Female' | 'Other';
export type StudentStatus = 'Active' | 'Inactive' | 'On Leave';
export type PortalAccess = 'Not Invited' | 'Invited' | 'Active';

export interface Guardian {
  name: string;
  relation: 'Father' | 'Mother' | 'Guardian';
  phone: string;
  email?: string;
}

export interface Student {
  id: ID; // STU-1042
  cardNo: string; // "9401" — RFID / ID card number
  name: string;
  gender: Gender;
  dob: ISODate;
  grade: string; // "Grade 10"
  section: string; // "Section B"
  school?: string;
  phone?: string;
  email?: string;
  address?: string;
  guardian: Guardian;
  batchIds: ID[];
  joiningDate: ISODate;
  status: StudentStatus;
  photoUrl?: string;
  /** Concession applied to every invoice, as a percentage (0–100). */
  concessionPct: number;
  /** Parent/student app access — the tenant links students to the mobile portal. */
  portalAccess: PortalAccess;
  notes?: string;
  campusId: ID;
}

/* ------------------------------------------------------ Academics & batches */

export interface Topic {
  id: ID;
  subjectId: ID;
  grade: string; // syllabus differs per grade
  chapter: string; // "Unit 2 · Kinematics"
  name: string;
  order: number;
  plannedHours: number;
}

export interface Subject {
  id: ID;
  name: string; // "Physics"
  code: string; // "PHY"
  shortName?: string; // "Phys" — compact labels in tables
  grades: string[];
}

export type BatchStatus = 'Active' | 'Upcoming' | 'Archived';

export interface Batch {
  id: ID;
  code: string; // "A1"
  name: string; // "Batch A1"
  title: string; // "Advanced Physics Mechanics"
  subjectId: ID;
  grade: string;
  capacity: number;
  days: Weekday[];
  startTime: TimeHM;
  endTime: TimeHM;
  facultyId: ID;
  room: string;
  monthlyFee: number;
  startDate: ISODate;
  endDate?: ISODate;
  status: BatchStatus;
  campusId: ID;
}

export type CoverageStatus = 'Not Started' | 'In Progress' | 'Completed';

export interface TopicCoverage {
  batchId: ID;
  topicId: ID;
  status: CoverageStatus;
  startedOn?: ISODate;
  completedOn?: ISODate;
  hoursSpent: number;
}

/* ---------------------------------------------------------------- Attendance */

/** P = Present, L = Late, A = Absent, E = Excused (approved leave). */
export type AttendanceMark = 'P' | 'L' | 'A' | 'E';

export interface AttendanceSession {
  id: ID;
  batchId: ID;
  date: ISODate;
  startTime: TimeHM;
  endTime: TimeHM;
  facultyId: ID;
  topicIds: ID[];
  records: Record<ID, AttendanceMark>; // studentId → mark
  notes?: string;
  markedAt: ISODateTime;
  markedBy: ID;
  /** Local-first: true until the backend acknowledges the write. */
  pendingSync?: boolean;
}

/* ---------------------------------------------------------------------- Fees */

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Cheque';

export interface FeeInvoice {
  id: ID; // INV-2609-0012
  studentId: ID;
  batchId: ID;
  period: string; // "2026-09" (billing month)
  description: string;
  amount: number; // after concession
  dueDate: ISODate;
  issuedOn: ISODate;
  waived?: boolean;
}

export interface Payment {
  id: ID;
  receiptNo: string;
  invoiceId: ID;
  studentId: ID;
  amount: number;
  date: ISODate;
  method: PaymentMethod;
  reference?: string;
  collectedBy: ID;
}

/** Derived per-invoice / per-student state — never stored, always computed. */
export type FeeStatus = 'Paid' | 'Pending' | 'Overdue';

/* --------------------------------------------------------------- Assessments */

export type AssessmentType = 'Unit Test' | 'Quiz' | 'Mock Exam' | 'Assignment';

export interface Assessment {
  id: ID;
  batchId: ID;
  title: string;
  type: AssessmentType;
  date: ISODate;
  maxMarks: number;
  topicIds: ID[];
  /** studentId → marks obtained; null = absent / not submitted. */
  scores: Record<ID, number | null>;
}

/* ------------------------------------------------------------- Notifications */

export type NotificationKind = 'absence' | 'fee' | 'batch' | 'system';

export interface AppNotification {
  id: ID;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: ISODateTime;
  read: boolean;
  link?: string; // in-app route to open
}

/* ------------------------------------------------------------ Activity log */

/** Audit trail of who changed what — shown on the dashboard and profiles. */
export interface ActivityEntry {
  id: ID;
  at: ISODateTime;
  actorId: ID;
  action: string; // "marked attendance for Batch A1"
  entity?: { type: 'student' | 'batch' | 'invoice' | 'session' | 'assessment' | 'staff'; id: ID };
}

/* ------------------------------------------------------------ Tenant data */

/**
 * Everything the app knows about one tenant. The demo store persists this
 * whole object locally; with a backend it becomes a cache of API responses.
 */
export interface DataSnapshot {
  settings: InstituteSettings;
  staff: Staff[];
  subjects: Subject[];
  topics: Topic[];
  batches: Batch[];
  students: Student[];
  coverage: TopicCoverage[];
  sessions: AttendanceSession[];
  invoices: FeeInvoice[];
  payments: Payment[];
  assessments: Assessment[];
  notifications: AppNotification[];
  activity: ActivityEntry[];
  portalAccounts: PortalAccount[];
}

/* ------------------------------------------- Student & parent app accounts */

export type PortalRole = 'student' | 'parent';
export type PortalAccountStatus = 'Invited' | 'Active' | 'Disabled';
/** Parents may sign in with a one-time code or a password; students use a password. */
export type PortalAuthMethod = 'otp' | 'password';

/**
 * A login for the student/parent app. Student and parent accounts are separate
 * but linked to the same student record: a parent with two children has one
 * account listing both, and switches between them in the app.
 */
export interface PortalAccount {
  id: ID;
  role: PortalRole;
  name: string;
  /** Students linked to this login: exactly one for a student, one or more for a parent. */
  studentIds: ID[];
  /** Sign-in identifier: the student ID, or the parent's mobile number. */
  loginId: string;
  phone?: string; // parents: receives the OTP
  /** Required for parents, optional for students — used for password recovery. */
  email?: string;
  emailVerified: boolean;
  authMethod: PortalAuthMethod;
  /** DEMO ONLY. A real deployment stores a salted hash server-side and never ships it to the client. */
  password?: string;
  status: PortalAccountStatus;
  invitedOn: ISODate;
  activatedOn?: ISODate;
  lastLoginAt?: ISODateTime;
  /** Single-use link from the invite or the "forgot password" email. */
  token?: { value: string; purpose: 'activate' | 'reset'; expiresAt: ISODateTime };
  /** Which alerts this account wants (channels are the institute's settings). */
  notify: { attendance: boolean; fees: boolean; results: boolean };
}
