/**
 * Demo tenant seed — "Apex Academy" (institute code APEX).
 *
 * Mirrors frontend/src/data/seed.ts closely enough that the finished UI feels the
 * same against a real database: the same institute settings, the same staff (one
 * per role), the same batches and the seven students from the design mock-up,
 * plus portal logins so every sign-in flow can be demonstrated:
 *
 *   staff    — email + password                         (all roles)
 *   student  — STU-1042 + password
 *   parent   — mobile + password, and a second parent who signs in by OTP
 *   invited  — a staff member and a portal account still waiting to activate
 *
 * Run with `npm run db:seed`. It is idempotent: the APEX tenant is deleted and
 * rebuilt (every child row cascades), so re-running gives a clean demo.
 * Passwords come from the environment — see SEED_* in .env.example.
 */
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  AssessmentType,
  BatchStatus,
  BillingMode,
  BrandTheme,
  CoverageStatus,
  Gender,
  GuardianRelation,
  LicenseTier,
  OneTimeCodeChannel,
  OneTimeCodePurpose,
  PaymentMethod,
  PortalAccess,
  PortalAccountStatus,
  PortalAuthMethod,
  PortalRole,
  PrincipalType,
  PrismaClient,
  Role,
  StaffStatus,
  StudentStatus,
  Weekday,
  AttendanceMark,
} from '@prisma/client';
import { PasswordService } from '../src/auth/password.service';
import { normalizePhone } from '../src/common/phone';
import { addDays, addMonths, fromISODate, todayIn } from '../src/domain/date';
import { billingDateFor, discountedFee, dueDateFor } from '../src/domain/fees';

const prisma = new PrismaClient();
const passwords = new PasswordService();

const TIMEZONE = 'Asia/Kolkata';
const TODAY = todayIn(TIMEZONE);
const CODE = (process.env.SEED_TENANT_CODE ?? 'APEX').toUpperCase();
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'Apex@2026';
const STUDENT_PASSWORD = process.env.SEED_STUDENT_PASSWORD ?? 'student123';
const PARENT_PASSWORD = process.env.SEED_PARENT_PASSWORD ?? 'parent123';

/** The academic year starts in June, like most Indian institutes. */
const ACADEMIC_YEAR_START = (() => {
  const year = Number(TODAY.slice(0, 4)) - (Number(TODAY.slice(5, 7)) >= 6 ? 0 : 1);
  return `${year}-06-01`;
})();
const ACADEMIC_YEAR = `${ACADEMIC_YEAR_START.slice(0, 4)}-${String((Number(ACADEMIC_YEAR_START.slice(0, 4)) + 1) % 100).padStart(2, '0')}`;

// --------------------------------------------------------------- reference data

const SUBJECTS = [
  { key: 'phy', name: 'Physics', code: 'PHY', shortName: 'Phys', grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
  { key: 'mat', name: 'Mathematics', code: 'MAT', shortName: 'Math', grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
  { key: 'che', name: 'Chemistry', code: 'CHE', shortName: 'Chem', grades: ['Grade 11', 'Grade 12'] },
  { key: 'bio', name: 'Biology', code: 'BIO', shortName: 'Sci', grades: ['Grade 10', 'Grade 12'] },
  { key: 'eng', name: 'English', code: 'ENG', shortName: 'Eng', grades: ['Grade 10'] },
] as const;

/** subject key → grade → [chapter, topic names][] — a trimmed copy of the demo syllabus. */
const SYLLABUS: Record<string, Record<string, [string, string[]][]>> = {
  phy: {
    'Grade 10': [
      ['Unit 1 · Light', ['Reflection of Light', 'Spherical Mirrors', 'Refraction & Lenses']],
      ['Unit 3 · Electricity', ["Ohm's Law", 'Resistors in Series & Parallel']],
    ],
    'Grade 11': [
      ['Unit 1 · Kinematics', ['Units & Measurements', 'Motion in a Straight Line', 'Motion in a Plane']],
      ['Unit 2 · Laws of Motion', ["Newton's Laws", 'Friction', 'Circular Motion']],
    ],
    'Grade 12': [['Unit 1 · Electrostatics', ["Coulomb's Law", 'Electric Field & Flux', "Gauss's Law"]]],
  },
  mat: {
    'Grade 10': [
      ['Unit 1 · Algebra', ['Real Numbers', 'Polynomials', 'Quadratic Equations']],
      ['Unit 3 · Geometry', ['Triangles & Similarity', 'Circles', 'Coordinate Geometry']],
    ],
    'Grade 11': [['Unit 1 · Sets & Functions', ['Sets', 'Relations & Functions']]],
    'Grade 12': [['Unit 3 · Calculus', ['Continuity & Differentiability', 'Applications of Derivatives', 'Integrals']]],
  },
  che: {
    'Grade 11': [['Unit 1 · Basics', ['Mole Concept', 'Structure of Atom']]],
    'Grade 12': [
      ['Unit 1 · Organic Basics', ['IUPAC Nomenclature', 'Isomerism', 'Reaction Mechanisms']],
      ['Unit 2 · Functional Groups', ['Haloalkanes & Haloarenes', 'Alcohols, Phenols & Ethers']],
    ],
  },
  bio: {
    'Grade 10': [['Unit 1 · Life Processes', ['Nutrition', 'Respiration', 'Transportation']]],
    'Grade 12': [['Unit 2 · Genetics', ['Principles of Inheritance', 'Molecular Basis of Inheritance']]],
  },
  eng: {
    'Grade 10': [['Unit 1 · Grammar', ['Tenses', 'Modals', 'Reported Speech']]],
  },
};

interface StaffSeed {
  key: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string;
  subjects: string[];
  status: StaffStatus;
  joinedOn: string;
}

const STAFF: StaffSeed[] = [
  {
    key: 'st-01',
    name: 'Dr. Neelima Patnaik',
    email: 'neelima@apexacademy.in',
    phone: '+91 98450 11223',
    role: Role.owner,
    title: 'Director · Senior Faculty (Physics)',
    subjects: ['phy'],
    status: StaffStatus.Active,
    joinedOn: '2019-04-01',
  },
  {
    key: 'st-02',
    name: 'Prof. K. Sen',
    email: 'ksen@apexacademy.in',
    phone: '+91 98451 22334',
    role: Role.faculty,
    title: 'Head of Mathematics',
    subjects: ['mat'],
    status: StaffStatus.Active,
    joinedOn: '2020-06-15',
  },
  {
    key: 'st-03',
    name: 'Dr. Meenakshi S.',
    email: 'meenakshi@apexacademy.in',
    phone: '+91 98452 33445',
    role: Role.faculty,
    title: 'Senior Faculty · Chemistry',
    subjects: ['che'],
    status: StaffStatus.Active,
    joinedOn: '2021-01-10',
  },
  {
    key: 'st-04',
    name: 'Dr. Rajesh Sharma',
    email: 'rajesh@apexacademy.in',
    phone: '+91 98453 44556',
    role: Role.faculty,
    title: 'Faculty · Physics',
    subjects: ['phy'],
    status: StaffStatus.Active,
    joinedOn: '2022-07-01',
  },
  {
    key: 'st-05',
    name: 'Ms. Farah Khan',
    email: 'farah@apexacademy.in',
    phone: '+91 98454 55667',
    role: Role.faculty,
    title: 'Faculty · Biology',
    subjects: ['bio'],
    status: StaffStatus.Active,
    joinedOn: '2022-11-20',
  },
  {
    key: 'st-07',
    name: 'Ms. Pooja Menon',
    email: 'pooja@apexacademy.in',
    phone: '+91 98456 77889',
    role: Role.admin,
    title: 'Operations Manager',
    subjects: [],
    status: StaffStatus.Active,
    joinedOn: '2020-02-01',
  },
  {
    key: 'st-08',
    name: 'Ms. Kavya Nair',
    email: 'accounts@apexacademy.in',
    phone: '+91 98457 88990',
    role: Role.accountant,
    title: 'Accounts Executive',
    subjects: [],
    status: StaffStatus.Active,
    joinedOn: '2021-08-16',
  },
  {
    key: 'st-09',
    name: 'Mr. Rohit Verma',
    email: 'frontdesk@apexacademy.in',
    phone: '+91 98458 99001',
    role: Role.front_desk,
    title: 'Front Office Coordinator',
    subjects: [],
    status: StaffStatus.Active,
    joinedOn: '2023-03-01',
  },
  {
    // Invited, no password yet: exercises the activation flow.
    key: 'st-10',
    name: 'Ms. Sneha Kulkarni',
    email: 'sneha.k@apexacademy.in',
    phone: '+91 98459 10112',
    role: Role.faculty,
    title: 'Faculty · Mathematics',
    subjects: ['mat'],
    status: StaffStatus.Invited,
    joinedOn: TODAY,
  },
];

interface BatchSeed {
  key: string;
  code: string;
  title: string;
  subject: string;
  grade: string;
  capacity: number;
  days: Weekday[];
  startTime: string;
  endTime: string;
  faculty: string;
  room: string;
  monthlyFee: number;
  status?: BatchStatus;
}

const BATCHES: BatchSeed[] = [
  {
    key: 'bat-a1',
    code: 'A1',
    title: 'Advanced Physics Mechanics',
    subject: 'phy',
    grade: 'Grade 11',
    capacity: 35,
    days: [Weekday.Mon, Weekday.Wed, Weekday.Fri],
    startTime: '11:00',
    endTime: '12:30',
    faculty: 'st-01',
    room: 'Science Lab 2',
    monthlyFee: 2500,
  },
  {
    key: 'bat-m2',
    code: 'M2',
    title: 'Mathematics Elite Calculus',
    subject: 'mat',
    grade: 'Grade 10',
    capacity: 25,
    days: [Weekday.Tue, Weekday.Thu, Weekday.Sat],
    startTime: '16:30',
    endTime: '18:00',
    faculty: 'st-02',
    room: 'Classroom 4B',
    monthlyFee: 2200,
  },
  {
    key: 'bat-c1',
    code: 'C1',
    title: 'Organic Chemistry Intensive',
    subject: 'che',
    grade: 'Grade 12',
    capacity: 30,
    days: [Weekday.Mon, Weekday.Wed, Weekday.Fri],
    startTime: '14:00',
    endTime: '15:30',
    faculty: 'st-03',
    room: 'Lecture Hall A',
    monthlyFee: 2500,
  },
  {
    key: 'bat-s1',
    code: 'S1',
    title: 'Biology Basic',
    subject: 'bio',
    grade: 'Grade 10',
    capacity: 30,
    days: [Weekday.Tue, Weekday.Thu],
    startTime: '15:00',
    endTime: '16:30',
    faculty: 'st-05',
    room: 'Bio Lab',
    monthlyFee: 1800,
  },
  {
    key: 'bat-a2',
    code: 'A2',
    title: 'Physics Foundation',
    subject: 'phy',
    grade: 'Grade 10',
    capacity: 30,
    days: [Weekday.Tue, Weekday.Thu, Weekday.Sat],
    startTime: '10:00',
    endTime: '11:30',
    faculty: 'st-04',
    room: 'Science Lab 1',
    monthlyFee: 2000,
  },
  {
    key: 'bat-p1',
    code: 'P1',
    title: 'Board Revision Crash Course',
    subject: 'phy',
    grade: 'Grade 12',
    capacity: 40,
    days: [Weekday.Sat, Weekday.Sun],
    startTime: '09:00',
    endTime: '12:00',
    faculty: 'st-04',
    room: 'Auditorium',
    monthlyFee: 3500,
    status: BatchStatus.Upcoming,
  },
];

interface StudentSeed {
  code: string;
  cardNo: string;
  name: string;
  gender: Gender;
  grade: string;
  section: string;
  guardian: { name: string; relation: GuardianRelation; phone: string; email?: string };
  batches: string[];
  joinedDaysAgo: number;
  status?: StudentStatus;
  portalAccess?: PortalAccess;
  concessionPct?: number;
  notes?: string;
  email?: string;
  campus?: 'central' | 'north';
}

/** The seven rows from the design mock-up, plus a sibling so a parent has two children. */
const STUDENTS: StudentSeed[] = [
  {
    code: 'STU-1042',
    cardNo: '9401',
    name: 'Aarav Patel',
    gender: Gender.Male,
    grade: 'Grade 10',
    section: 'Section B',
    guardian: { name: 'Vikram Patel', relation: GuardianRelation.Father, phone: '+91 98765 43210', email: 'patel.family@gmail.com' },
    batches: ['bat-m2', 'bat-a2'],
    joinedDaysAgo: 99,
    portalAccess: PortalAccess.Active,
    email: 'aarav.patel@student.apexacademy.in',
  },
  {
    // Same guardian as Aarav: the parent app switches between two children.
    code: 'STU-1043',
    cardNo: '9411',
    name: 'Ira Patel',
    gender: Gender.Female,
    grade: 'Grade 10',
    section: 'Section A',
    guardian: { name: 'Vikram Patel', relation: GuardianRelation.Father, phone: '+91 98765 43210', email: 'patel.family@gmail.com' },
    batches: ['bat-s1'],
    joinedDaysAgo: 60,
    portalAccess: PortalAccess.Active,
  },
  {
    code: 'STU-1045',
    cardNo: '9402',
    name: 'Ananya Iyer',
    gender: Gender.Female,
    grade: 'Grade 10',
    section: 'Section A',
    guardian: { name: 'S. Iyer', relation: GuardianRelation.Mother, phone: '+91 98765 43211', email: 'iyer.family@gmail.com' },
    batches: ['bat-m2', 'bat-s1'],
    joinedDaysAgo: 83,
    portalAccess: PortalAccess.Active,
  },
  {
    code: 'STU-1048',
    cardNo: '9403',
    name: 'Devansh Mehta',
    gender: Gender.Male,
    grade: 'Grade 11',
    section: 'Science',
    guardian: { name: 'Rajesh Mehta', relation: GuardianRelation.Father, phone: '+91 98765 43212' },
    batches: ['bat-a1'],
    joinedDaysAgo: 63,
    portalAccess: PortalAccess.Invited,
  },
  {
    code: 'STU-1051',
    cardNo: '9404',
    name: 'Ishita Sharma',
    gender: Gender.Female,
    grade: 'Grade 10',
    section: 'Section B',
    guardian: { name: 'Sunita Sharma', relation: GuardianRelation.Mother, phone: '+91 98765 43213', email: 'sharma.family@gmail.com' },
    batches: ['bat-m2'],
    joinedDaysAgo: 102,
    concessionPct: 15,
    portalAccess: PortalAccess.Active,
  },
  {
    code: 'STU-1055',
    cardNo: '9405',
    name: 'Kabir Das',
    gender: Gender.Male,
    grade: 'Grade 12',
    section: 'Chemistry Spec',
    guardian: { name: 'Manjit Das', relation: GuardianRelation.Father, phone: '+91 98765 43216', email: 'das.family@gmail.com' },
    batches: ['bat-c1'],
    joinedDaysAgo: 132,
    status: StudentStatus.OnLeave,
    notes: 'On medical leave; parent informed the office.',
    portalAccess: PortalAccess.NotInvited,
  },
  {
    code: 'STU-1058',
    cardNo: '9406',
    name: 'Rhea Sengupta',
    gender: Gender.Female,
    grade: 'Grade 11',
    section: 'Pre-Med',
    guardian: { name: 'P. K. Sengupta', relation: GuardianRelation.Father, phone: '+91 98765 43217', email: 'sengupta.family@gmail.com' },
    batches: ['bat-a1'],
    joinedDaysAgo: 35,
    portalAccess: PortalAccess.Active,
    campus: 'north',
  },
  {
    code: 'STU-1062',
    cardNo: '9407',
    name: 'Tanmay Bhatia',
    gender: Gender.Male,
    grade: 'Grade 10',
    section: 'Foundation',
    guardian: { name: 'Alok Bhatia', relation: GuardianRelation.Father, phone: '+91 98765 43219', email: 'bhatia.family@gmail.com' },
    batches: ['bat-m2'],
    joinedDaysAgo: 80,
    portalAccess: PortalAccess.Active,
  },
];

// ------------------------------------------------------------------------ seed

async function main(): Promise<void> {
  console.log(`\nSeeding demo tenant "${CODE}" …`);

  // Idempotent: every child row cascades from the tenant.
  const existing = await prisma.tenant.findUnique({ where: { instituteCode: CODE }, select: { id: true } });
  if (existing) {
    await prisma.tenant.delete({ where: { id: existing.id } });
    console.log('  · removed the previous demo tenant');
  }

  const tenant = await prisma.tenant.create({
    data: {
      instituteCode: CODE,
      name: 'Apex Academy',
      tagline: 'Coaching for Grades 10–12 · Boards, JEE & NEET',
      brandTheme: BrandTheme.royal,
      academicYear: ACADEMIC_YEAR,
      academicYearStart: fromISODate(ACADEMIC_YEAR_START),
      contactEmail: 'office@apexacademy.in',
      contactPhone: '+91 80 4123 7788',
      address: '14, MG Road, Bengaluru, Karnataka 560001',
      currencyCode: 'INR',
      currencySymbol: '₹',
      currencyLocale: 'en-IN',
      timezone: TIMEZONE,
      workingDays: [Weekday.Mon, Weekday.Tue, Weekday.Wed, Weekday.Thu, Weekday.Fri, Weekday.Sat],
      settings: {
        create: {
          lateAfterMinutes: 10,
          lowAttendanceThreshold: 75,
          countLateAsPresent: true,
          notifyParentOnAbsence: true,
          billingMode: BillingMode.JoiningDate,
          billingDay: 5,
          dueInDays: 7,
          gracePeriodDays: 3,
          lateFee: 100,
          receiptPrefix: 'RCPT',
          notifySms: true,
          notifyWhatsapp: true,
          notifyEmail: true,
          notifyPush: true,
          licenseTier: LicenseTier.Pro,
          licenseValidUntil: fromISODate(`${Number(ACADEMIC_YEAR_START.slice(0, 4)) + 1}-05-31`),
          maxStudents: 500,
        },
      },
      campuses: {
        create: [
          { name: 'Central Campus', address: '14, MG Road, Bengaluru 560001' },
          { name: 'North Branch', address: '221, Sahakar Nagar, Bengaluru 560092' },
        ],
      },
    },
    include: { campuses: true },
  });

  const central = tenant.campuses.find((c) => c.name === 'Central Campus')!;
  const north = tenant.campuses.find((c) => c.name === 'North Branch')!;
  console.log(`  · tenant ${tenant.instituteCode} with ${tenant.campuses.length} campuses`);

  // --- subjects & topics ---------------------------------------------------
  const subjectIds = new Map<string, string>();
  const topicIds = new Map<string, string>(); // "subjectKey|grade|order" → id
  for (const subject of SUBJECTS) {
    const row = await prisma.subject.create({
      data: {
        tenantId: tenant.id,
        name: subject.name,
        code: subject.code,
        shortName: subject.shortName,
        grades: [...subject.grades],
      },
      select: { id: true },
    });
    subjectIds.set(subject.key, row.id);

    for (const [grade, chapters] of Object.entries(SYLLABUS[subject.key] ?? {})) {
      let order = 0;
      for (const [chapter, names] of chapters) {
        for (const name of names) {
          order += 1;
          const topic = await prisma.topic.create({
            data: {
              tenantId: tenant.id,
              subjectId: row.id,
              grade,
              chapter,
              name,
              order,
              plannedHours: 10 + (order % 5),
            },
            select: { id: true },
          });
          topicIds.set(`${subject.key}|${grade}|${order}`, topic.id);
        }
      }
    }
  }
  console.log(`  · ${subjectIds.size} subjects and ${topicIds.size} topics`);

  // --- staff ---------------------------------------------------------------
  const staffHash = await passwords.hash(STAFF_PASSWORD);
  const staffIds = new Map<string, string>();
  for (const member of STAFF) {
    const row = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        title: member.title,
        status: member.status,
        joinedOn: fromISODate(member.joinedOn),
        // An invited member has no password until they activate their account.
        passwordHash: member.status === StaffStatus.Active ? staffHash : null,
        lastActiveAt: member.status === StaffStatus.Active ? new Date() : null,
        subjects: {
          create: member.subjects.map((key) => ({ tenantId: tenant.id, subjectId: subjectIds.get(key)! })),
        },
      },
      select: { id: true },
    });
    staffIds.set(member.key, row.id);
  }
  console.log(`  · ${staffIds.size} staff accounts`);

  // --- batches -------------------------------------------------------------
  const batchIds = new Map<string, string>();
  for (const batch of BATCHES) {
    const row = await prisma.batch.create({
      data: {
        tenantId: tenant.id,
        campusId: central.id,
        code: batch.code,
        name: `Batch ${batch.code}`,
        title: batch.title,
        subjectId: subjectIds.get(batch.subject)!,
        grade: batch.grade,
        capacity: batch.capacity,
        days: batch.days,
        startTime: batch.startTime,
        endTime: batch.endTime,
        facultyId: staffIds.get(batch.faculty)!,
        room: batch.room,
        monthlyFee: batch.monthlyFee,
        startDate: fromISODate(batch.status === BatchStatus.Upcoming ? addDays(TODAY, 20) : ACADEMIC_YEAR_START),
        status: batch.status ?? BatchStatus.Active,
      },
      select: { id: true },
    });
    batchIds.set(batch.key, row.id);
  }
  console.log(`  · ${batchIds.size} batches`);

  // --- students ------------------------------------------------------------
  const studentIds = new Map<string, string>();
  for (const student of STUDENTS) {
    const joiningDate = addDays(TODAY, -student.joinedDaysAgo);
    // Ages roughly match the grade, which keeps the roster believable.
    const age = student.grade === 'Grade 12' ? 17 : student.grade === 'Grade 11' ? 16 : 15;
    const row = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        campusId: student.campus === 'north' ? north.id : central.id,
        studentCode: student.code,
        cardNo: student.cardNo,
        name: student.name,
        gender: student.gender,
        dob: fromISODate(addMonths(TODAY, -12 * age)),
        grade: student.grade,
        section: student.section,
        school: 'DPS Central',
        email: student.email,
        guardianName: student.guardian.name,
        guardianRelation: student.guardian.relation,
        guardianPhone: student.guardian.phone,
        guardianPhoneKey: normalizePhone(student.guardian.phone),
        guardianEmail: student.guardian.email,
        joiningDate: fromISODate(joiningDate),
        status: student.status ?? StudentStatus.Active,
        concessionPct: student.concessionPct ?? 0,
        portalAccess: student.portalAccess ?? PortalAccess.NotInvited,
        notes: student.notes,
        batches: {
          create: student.batches.map((key) => ({
            tenantId: tenant.id,
            batchId: batchIds.get(key)!,
            enrolledOn: fromISODate(joiningDate),
          })),
        },
      },
      select: { id: true },
    });
    studentIds.set(student.code, row.id);
  }
  console.log(`  · ${studentIds.size} students with guardians and enrolments`);

  // --- topic coverage ------------------------------------------------------
  // The first two topics of each active batch's syllabus are under way.
  for (const batch of BATCHES.filter((b) => b.status !== BatchStatus.Upcoming)) {
    for (let order = 1; order <= 2; order++) {
      const topicId = topicIds.get(`${batch.subject}|${batch.grade}|${order}`);
      if (!topicId) continue;
      await prisma.batchTopicCoverage.create({
        data: {
          tenantId: tenant.id,
          batchId: batchIds.get(batch.key)!,
          topicId,
          status: order === 1 ? CoverageStatus.Completed : CoverageStatus.InProgress,
          startedOn: fromISODate(addDays(TODAY, -30 * order)),
          completedOn: order === 1 ? fromISODate(addDays(TODAY, -14)) : null,
          hoursSpent: order === 1 ? 12 : 5,
        },
      });
    }
  }

  // --- one attendance session, so the attendance rules have data -----------
  const m2 = batchIds.get('bat-m2')!;
  const m2Students = ['STU-1042', 'STU-1045', 'STU-1051', 'STU-1062'];
  const sessionDate = addDays(TODAY, -1);
  const marks: AttendanceMark[] = [AttendanceMark.P, AttendanceMark.P, AttendanceMark.L, AttendanceMark.A];
  await prisma.attendanceSession.create({
    data: {
      tenantId: tenant.id,
      batchId: m2,
      date: fromISODate(sessionDate),
      startTime: '16:30',
      endTime: '18:00',
      facultyId: staffIds.get('st-02')!,
      markedById: staffIds.get('st-02')!,
      notes: 'Revision of quadratic equations.',
      topics: {
        create: [{ tenantId: tenant.id, topicId: topicIds.get('mat|Grade 10|1')! }],
      },
      records: {
        create: m2Students.map((code, index) => ({
          tenantId: tenant.id,
          studentId: studentIds.get(code)!,
          mark: marks[index],
          lateByMinutes: marks[index] === AttendanceMark.L ? 15 : null,
        })),
      },
    },
  });

  // --- a small assessment --------------------------------------------------
  await prisma.assessment.create({
    data: {
      tenantId: tenant.id,
      batchId: m2,
      title: 'Unit Test 1 · Algebra',
      type: AssessmentType.UnitTest,
      date: fromISODate(addDays(TODAY, -10)),
      maxMarks: 50,
      topics: { create: [{ tenantId: tenant.id, topicId: topicIds.get('mat|Grade 10|1')! }] },
      scores: {
        create: [
          { tenantId: tenant.id, studentId: studentIds.get('STU-1042')!, marks: 42 },
          { tenantId: tenant.id, studentId: studentIds.get('STU-1045')!, marks: 47 },
          { tenantId: tenant.id, studentId: studentIds.get('STU-1051')!, marks: 38 },
          // null = absent / not submitted, exactly as the client's type allows.
          { tenantId: tenant.id, studentId: studentIds.get('STU-1062')!, marks: null },
        ],
      },
    },
  });

  // --- invoices & payments -------------------------------------------------
  // Three months of billing for the enrolled students, paid except for the most
  // recent month — so the roster shows Paid, Pending and Overdue side by side.
  let invoiceSeq = 1;
  let receiptSeq = 1;
  const accountantId = staffIds.get('st-08')!;

  for (const student of STUDENTS) {
    const studentId = studentIds.get(student.code)!;
    const joiningDate = addDays(TODAY, -student.joinedDaysAgo);

    for (let monthsBack = 2; monthsBack >= 0; monthsBack--) {
      const period = addMonths(`${TODAY.slice(0, 7)}-01`, -monthsBack).slice(0, 7);
      const issuedOn = billingDateFor(joiningDate, period, { billingMode: 'joining-date', billingDay: 5 });
      if (issuedOn < joiningDate || issuedOn > TODAY) continue;

      for (const batchKey of student.batches) {
        const batch = BATCHES.find((b) => b.key === batchKey)!;
        if (batch.status === BatchStatus.Upcoming) continue;

        const amount = discountedFee(batch.monthlyFee, student.concessionPct ?? 0);
        const invoice = await prisma.feeInvoice.create({
          data: {
            tenantId: tenant.id,
            invoiceNo: `INV-${period.slice(2, 4)}${period.slice(5, 7)}-${String(invoiceSeq++).padStart(4, '0')}`,
            studentId,
            batchId: batchIds.get(batchKey)!,
            period,
            description: `Batch ${batch.code} · ${batch.title} — monthly tuition`,
            amount,
            issuedOn: fromISODate(issuedOn),
            dueDate: fromISODate(dueDateFor(issuedOn, 7)),
          },
          select: { id: true },
        });

        // Kabir Das (on leave) stops paying, which leaves an overdue invoice.
        const paysThisMonth = monthsBack > 0 && !(student.code === 'STU-1055' && monthsBack < 2);
        if (!paysThisMonth) continue;

        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            receiptNo: `RCPT-${String(receiptSeq++).padStart(6, '0')}`,
            invoiceId: invoice.id,
            studentId,
            amount,
            date: fromISODate(addDays(issuedOn, 2)),
            method: receiptSeq % 3 === 0 ? PaymentMethod.Cash : PaymentMethod.UPI,
            reference: receiptSeq % 3 === 0 ? null : `UPI${400000000 + receiptSeq * 7919}`,
            collectedById: accountantId,
          },
        });
      }
    }
  }
  console.log(`  · ${invoiceSeq - 1} invoices and ${receiptSeq - 1} payments`);

  // --- portal accounts -----------------------------------------------------
  const studentHash = await passwords.hash(STUDENT_PASSWORD);
  const parentHash = await passwords.hash(PARENT_PASSWORD);

  // Student login: the student code is the login id.
  const aarav = STUDENTS[0];
  await prisma.portalAccount.create({
    data: {
      tenantId: tenant.id,
      role: PortalRole.student,
      name: aarav.name,
      loginId: aarav.code,
      email: aarav.email,
      emailVerified: true,
      authMethod: PortalAuthMethod.password,
      passwordHash: studentHash,
      status: PortalAccountStatus.Active,
      invitedOn: fromISODate(addDays(TODAY, -90)),
      activatedOn: fromISODate(addDays(TODAY, -88)),
      students: { create: [{ tenantId: tenant.id, studentId: studentIds.get(aarav.code)! }] },
    },
  });

  // Parent login with a password, linked to both Patel children.
  await prisma.portalAccount.create({
    data: {
      tenantId: tenant.id,
      role: PortalRole.parent,
      name: 'Vikram Patel',
      loginId: normalizePhone('+91 98765 43210'),
      phone: '+91 98765 43210',
      phoneKey: normalizePhone('+91 98765 43210'),
      email: 'patel.family@gmail.com',
      emailVerified: true,
      authMethod: PortalAuthMethod.password,
      passwordHash: parentHash,
      status: PortalAccountStatus.Active,
      invitedOn: fromISODate(addDays(TODAY, -90)),
      activatedOn: fromISODate(addDays(TODAY, -89)),
      students: {
        create: [
          { tenantId: tenant.id, studentId: studentIds.get('STU-1042')! },
          { tenantId: tenant.id, studentId: studentIds.get('STU-1043')! },
        ],
      },
    },
  });

  // Parent who signs in by OTP only (no password on file).
  await prisma.portalAccount.create({
    data: {
      tenantId: tenant.id,
      role: PortalRole.parent,
      name: 'S. Iyer',
      loginId: normalizePhone('+91 98765 43211'),
      phone: '+91 98765 43211',
      phoneKey: normalizePhone('+91 98765 43211'),
      email: 'iyer.family@gmail.com',
      emailVerified: true,
      authMethod: PortalAuthMethod.otp,
      status: PortalAccountStatus.Active,
      invitedOn: fromISODate(addDays(TODAY, -80)),
      activatedOn: fromISODate(addDays(TODAY, -79)),
      students: { create: [{ tenantId: tenant.id, studentId: studentIds.get('STU-1045')! }] },
    },
  });

  // Invited student account: exercises POST /auth/portal/activate.
  const invitedStudent = await prisma.portalAccount.create({
    data: {
      tenantId: tenant.id,
      role: PortalRole.student,
      name: 'Devansh Mehta',
      loginId: 'STU-1048',
      email: 'devansh.mehta@student.apexacademy.in',
      authMethod: PortalAuthMethod.password,
      status: PortalAccountStatus.Invited,
      invitedOn: fromISODate(addDays(TODAY, -3)),
      students: { create: [{ tenantId: tenant.id, studentId: studentIds.get('STU-1048')! }] },
    },
    select: { id: true, email: true },
  });

  console.log('  · 4 portal accounts (student, two parents, one pending invitation)');

  // --- invitation tokens ---------------------------------------------------
  // Real invitations are issued when an admin adds a person; the seed mints them
  // directly so the activation flow can be demonstrated without that screen.
  const studentInvite = await createInvitation(tenant.id, {
    portalAccountId: invitedStudent.id,
    email: invitedStudent.email!,
    principalType: PrincipalType.student,
  });
  const staffInvite = await createInvitation(tenant.id, {
    staffId: staffIds.get('st-10')!,
    email: 'sneha.k@apexacademy.in',
    principalType: PrincipalType.staff,
  });

  printCredentials({ studentInvite, staffInvite });
}

/**
 * Mints a single-use activation token (the same row `OtpService.issueLinkToken`
 * writes) and returns the raw value so it can be printed.
 */
async function createInvitation(
  tenantId: string,
  target: { staffId?: string; portalAccountId?: string; email: string; principalType: PrincipalType },
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.oneTimeCode.create({
    data: {
      tenantId,
      purpose: OneTimeCodePurpose.portal_activation,
      channel: OneTimeCodeChannel.email,
      destination: target.email,
      destinationKey: target.email.toLowerCase(),
      codeHash: createHash('sha256').update(token).digest('hex'),
      principalType: target.principalType,
      staffId: target.staffId ?? null,
      portalAccountId: target.portalAccountId ?? null,
      maxAttempts: 1,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  return token;
}

function printCredentials(invites: { studentInvite: string; staffInvite: string }): void {
  const line = '─'.repeat(72);
  console.log(`\n${line}\nDemo credentials — institute code ${CODE}\n${line}`);
  console.log('\nStaff (POST /api/v1/auth/staff/login) — password for all: ' + STAFF_PASSWORD);
  for (const member of STAFF) {
    const note = member.status === StaffStatus.Invited ? '  (invited — no password yet)' : '';
    console.log(`  ${member.role.padEnd(11)} ${member.email.padEnd(32)} ${member.name}${note}`);
  }
  console.log('\nStudent (POST /api/v1/auth/student/login)');
  console.log(`  studentId STU-1042   password ${STUDENT_PASSWORD}   (Aarav Patel)`);
  console.log(`  studentId STU-1048   invited — activate first (POST /auth/portal/activate)`);
  console.log('\nParent (POST /api/v1/auth/parent/login)');
  console.log(`  phone +91 98765 43210   password ${PARENT_PASSWORD}   (Vikram Patel — two children)`);
  console.log('\nParent by OTP (POST /api/v1/auth/parent/otp/request then /verify)');
  console.log('  phone +91 98765 43211   (S. Iyer — the code is logged and returned as devCode outside production)');
  console.log('\nActivation (POST /api/v1/auth/portal/activate) — single-use, valid for 7 days');
  console.log(`  student STU-1048  token ${invites.studentInvite}`);
  console.log(`  staff   sneha.k@apexacademy.in  token ${invites.staffInvite}`);
  console.log('\nPassword recovery (POST /api/v1/auth/password/forgot) — outside production the');
  console.log('reset link comes back as `devResetUrl`, and the dev mail sender logs it too.');
  console.log(`\n${line}\n`);
}

main()
  .catch((error) => {
    console.error('\nSeeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
