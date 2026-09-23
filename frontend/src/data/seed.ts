/**
 * Demo tenant generator.
 *
 * Builds one realistic, internally consistent institute ("Apex Academy") so
 * every screen has meaningful data before a backend exists:
 *   staff → batches → students (enrolled per grade/capacity)
 *   → attendance sessions since the academic year started
 *   → topic coverage derived from those sessions
 *   → monthly invoices + payments (billed on each student's joining date)
 *   → assessments with scores correlated to each student's ability.
 *
 * Everything is relative to `now` and driven by a seeded PRNG, so the data is
 * stable across reloads yet always looks "current". The seven students shown
 * in the design mock-up are pinned with fixed IDs, batches and fee states.
 */
import type {
  ActivityEntry,
  AppNotification,
  Assessment,
  AssessmentType,
  AttendanceMark,
  AttendanceSession,
  Batch,
  DataSnapshot,
  FeeInvoice,
  Gender,
  ID,
  ISODate,
  InstituteSettings,
  Payment,
  PaymentMethod,
  PortalAccount,
  Staff,
  Student,
  Topic,
  TopicCoverage,
} from '@/types/domain';
import { addDays, addMonths, diffDays, minutesOf, parseISODate, toISODate, weekdayOf } from '@/lib/date';
import { createRng } from '@/lib/random';
import { normalizePhone } from '@/lib/format';
import { DEMO_SUBJECTS, DEMO_SYLLABUS } from './syllabus';

const SEED = 20260922;
/** Students pinned from the design mock-up (the first entries created below). */
const PINNED_COUNT = 7;
/** Demo-only passwords for the student/parent app; a real deployment hashes them server-side. */
export const DEMO_STUDENT_PASSWORD = 'student123';
export const DEMO_PARENT_PASSWORD = 'parent123';
const pad2 = (n: number) => String(n).padStart(2, '0');

/* ---------------------------------------------------------------- Reference */

const MALE = [
  'Aditya',
  'Arjun',
  'Vivaan',
  'Reyansh',
  'Ishaan',
  'Shaurya',
  'Atharv',
  'Advik',
  'Pranav',
  'Rohan',
  'Karan',
  'Siddharth',
  'Yash',
  'Aryan',
  'Dhruv',
  'Kartik',
  'Nikhil',
  'Rahul',
  'Varun',
  'Harsh',
  'Parth',
  'Samar',
  'Veer',
  'Ayaan',
  'Laksh',
  'Neel',
  'Rudra',
  'Krish',
];
const FEMALE = [
  'Aadhya',
  'Diya',
  'Saanvi',
  'Anika',
  'Kiara',
  'Myra',
  'Navya',
  'Pari',
  'Riya',
  'Sara',
  'Tara',
  'Zoya',
  'Meera',
  'Nisha',
  'Sneha',
  'Avni',
  'Ira',
  'Kavya',
  'Mahi',
  'Naina',
  'Prisha',
  'Shreya',
  'Trisha',
  'Vanya',
  'Anvi',
  'Aditi',
  'Khushi',
  'Palak',
  'Siya',
];
const FATHERS = [
  'Rakesh',
  'Sanjay',
  'Anil',
  'Sunil',
  'Vijay',
  'Manoj',
  'Ashok',
  'Rajiv',
  'Deepak',
  'Suresh',
  'Ramesh',
  'Prakash',
  'Arvind',
  'Naveen',
  'Girish',
];
const MOTHERS = ['Sunita', 'Anita', 'Kavita', 'Rekha', 'Meena', 'Lata', 'Geeta', 'Priya', 'Shalini', 'Deepa', 'Radha', 'Asha'];
const SURNAMES = [
  'Sharma',
  'Verma',
  'Iyer',
  'Nair',
  'Reddy',
  'Rao',
  'Gupta',
  'Mehta',
  'Shah',
  'Patel',
  'Joshi',
  'Kulkarni',
  'Deshpande',
  'Menon',
  'Pillai',
  'Chatterjee',
  'Banerjee',
  'Mukherjee',
  'Das',
  'Sen',
  'Bose',
  'Singh',
  'Kapoor',
  'Malhotra',
  'Agarwal',
  'Bhatia',
  'Chopra',
  'Saxena',
  'Trivedi',
  'Pandey',
  'Mishra',
  'Naidu',
  'Fernandes',
];
const SCHOOLS = [
  'DPS Central',
  'Kendriya Vidyalaya No. 2',
  "St. Xavier's High School",
  'Ryan International',
  'National Public School',
  'Bishop Cotton School',
];
const SECTIONS: Record<string, string[]> = {
  'Grade 10': ['Section A', 'Section B', 'Section C', 'Foundation'],
  'Grade 11': ['Science', 'Pre-Med', 'Section A'],
  'Grade 12': ['Science', 'Pre-Med', 'Chemistry Spec', 'JEE Track'],
};
const AGE_BY_GRADE: Record<string, number> = { 'Grade 10': 15, 'Grade 11': 16, 'Grade 12': 17 };

/** Per-student behaviour used only while generating (never persisted). */
interface Traits {
  attendance: number; // probability of turning up
  ability: number; // expected score ratio
  payer: 'prompt' | 'late' | 'defaulter';
  skipLastInvoices?: number; // pinned fee states for the design rows
  pinned?: boolean; // design-mock-up rows: fixed batches, pay on the invoice date
}

/* ------------------------------------------------------------------ Builder */

/** Settings + empty collections: the placeholder used before saved data hydrates. */
export function createDemoSettingsOnly(now: Date = new Date()): DataSnapshot {
  return {
    ...EMPTY,
    settings: buildSettings(now),
    subjects: DEMO_SUBJECTS,
  };
}

const EMPTY: Omit<DataSnapshot, 'settings'> = {
  staff: [],
  subjects: [],
  topics: [],
  batches: [],
  students: [],
  coverage: [],
  sessions: [],
  invoices: [],
  payments: [],
  assessments: [],
  notifications: [],
  activity: [],
  portalAccounts: [],
};

function buildSettings(now: Date): InstituteSettings {
  const ayYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    tenantId: 'tnt-apex',
    instituteCode: 'APEX',
    name: 'Apex Academy',
    tagline: 'Coaching for Grades 10–12 · Boards, JEE & NEET',
    brandTheme: 'royal',
    campuses: [
      { id: 'cmp-central', name: 'Central Campus', address: '14, MG Road, Bengaluru 560001' },
      { id: 'cmp-north', name: 'North Branch', address: '221, Sahakar Nagar, Bengaluru 560092' },
    ],
    academicYear: `${ayYear}-${pad2((ayYear + 1) % 100)}`,
    academicYearStart: `${ayYear}-06-01`,
    contactEmail: 'office@apexacademy.in',
    contactPhone: '+91 80 4123 7788',
    address: '14, MG Road, Bengaluru, Karnataka 560001',
    currency: { code: 'INR', symbol: '₹', locale: 'en-IN' },
    timezone: 'Asia/Kolkata',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    attendance: { lateAfterMinutes: 10, lowAttendanceThreshold: 75, countLateAsPresent: true, notifyParentOnAbsence: true },
    fees: { billingMode: 'joining-date', billingDay: 5, dueInDays: 7, gracePeriodDays: 3, lateFee: 100, receiptPrefix: 'RCPT' },
    notifications: { sms: true, whatsapp: true, email: true, push: true },
    license: { tier: 'Pro', validUntil: `${ayYear + 1}-05-31`, maxStudents: 500 },
  };
}

export function createDemoSnapshot(now: Date = new Date()): DataSnapshot {
  const rng = createRng(SEED);
  const today = toISODate(now);
  const nowHM = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const ayYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const ayStart: ISODate = `${ayYear}-06-01`;
  const holidays = new Set([`${ayYear}-08-15`, `${ayYear}-10-02`, `${ayYear}-12-25`, `${ayYear + 1}-01-26`]);
  const at = (date: ISODate, hm: string) => {
    const d = parseISODate(date);
    const [h, m] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  /* Settings ------------------------------------------------------------- */
  const settings = buildSettings(now);

  /* Staff ---------------------------------------------------------------- */
  const staff: Staff[] = [
    {
      id: 'st-01',
      name: 'Dr. Neelima Patnaik',
      email: 'neelima@apexacademy.in',
      phone: '+91 98450 11223',
      role: 'owner',
      title: 'Director · Senior Faculty (Physics)',
      subjectIds: ['sub-phy'],
      status: 'Active',
      joinedOn: '2019-04-01',
    },
    {
      id: 'st-02',
      name: 'Prof. K. Sen',
      email: 'ksen@apexacademy.in',
      phone: '+91 98451 22334',
      role: 'faculty',
      title: 'Head of Mathematics',
      subjectIds: ['sub-mat'],
      status: 'Active',
      joinedOn: '2020-06-15',
    },
    {
      id: 'st-03',
      name: 'Dr. Meenakshi S.',
      email: 'meenakshi@apexacademy.in',
      phone: '+91 98452 33445',
      role: 'faculty',
      title: 'Senior Faculty · Chemistry',
      subjectIds: ['sub-che'],
      status: 'Active',
      joinedOn: '2021-01-10',
    },
    {
      id: 'st-04',
      name: 'Dr. Rajesh Sharma',
      email: 'rajesh@apexacademy.in',
      phone: '+91 98453 44556',
      role: 'faculty',
      title: 'Faculty · Physics',
      subjectIds: ['sub-phy'],
      status: 'Active',
      joinedOn: '2022-07-01',
    },
    {
      id: 'st-05',
      name: 'Ms. Farah Khan',
      email: 'farah@apexacademy.in',
      phone: '+91 98454 55667',
      role: 'faculty',
      title: 'Faculty · Biology',
      subjectIds: ['sub-bio'],
      status: 'Active',
      joinedOn: '2022-11-20',
    },
    {
      id: 'st-06',
      name: 'Mr. Arjun Rao',
      email: 'arjun@apexacademy.in',
      phone: '+91 98455 66778',
      role: 'faculty',
      title: 'Faculty · English',
      subjectIds: ['sub-eng'],
      status: 'Active',
      joinedOn: '2023-06-05',
    },
    {
      id: 'st-07',
      name: 'Ms. Pooja Menon',
      email: 'pooja@apexacademy.in',
      phone: '+91 98456 77889',
      role: 'admin',
      title: 'Operations Manager',
      subjectIds: [],
      status: 'Active',
      joinedOn: '2020-02-01',
    },
    {
      id: 'st-08',
      name: 'Ms. Kavya Nair',
      email: 'accounts@apexacademy.in',
      phone: '+91 98457 88990',
      role: 'accountant',
      title: 'Accounts Executive',
      subjectIds: [],
      status: 'Active',
      joinedOn: '2021-08-16',
    },
    {
      id: 'st-09',
      name: 'Mr. Rohit Verma',
      email: 'frontdesk@apexacademy.in',
      phone: '+91 98458 99001',
      role: 'front_desk',
      title: 'Front Office Coordinator',
      subjectIds: [],
      status: 'Active',
      joinedOn: '2023-03-01',
    },
    {
      id: 'st-10',
      name: 'Ms. Sneha Kulkarni',
      email: 'sneha.k@apexacademy.in',
      phone: '+91 98459 10112',
      role: 'faculty',
      title: 'Faculty · Mathematics',
      subjectIds: ['sub-mat'],
      status: 'Invited',
      joinedOn: today,
    },
  ];
  staff.forEach((s, i) => {
    if (s.status === 'Active') s.lastActiveAt = new Date(now.getTime() - (i * 47 + 5) * 60_000).toISOString();
  });

  /* Syllabus ------------------------------------------------------------- */
  const topics: Topic[] = [];
  for (const subject of DEMO_SUBJECTS) {
    for (const [grade, chapters] of Object.entries(DEMO_SYLLABUS[subject.id] ?? {})) {
      let order = 0;
      for (const [chapter, names] of chapters) {
        for (const name of names) {
          order++;
          topics.push({
            id: `top-${subject.code.toLowerCase()}${grade.replace(/\D/g, '')}-${pad2(order)}`,
            subjectId: subject.id,
            grade,
            chapter,
            name,
            order,
            plannedHours: rng.int(9, 15),
          });
        }
      }
    }
  }

  /* Batches -------------------------------------------------------------- */
  const C = 'cmp-central';
  const mk = (b: Omit<Batch, 'name' | 'startDate' | 'status' | 'campusId'> & Partial<Batch>): Batch => ({
    name: `Batch ${b.code}`,
    startDate: ayStart,
    status: 'Active',
    campusId: C,
    ...b,
  });
  const batches: Batch[] = [
    mk({
      id: 'bat-a1',
      code: 'A1',
      title: 'Advanced Physics Mechanics',
      subjectId: 'sub-phy',
      grade: 'Grade 11',
      capacity: 35,
      days: ['Mon', 'Wed', 'Fri'],
      startTime: '11:00',
      endTime: '12:30',
      facultyId: 'st-01',
      room: 'Science Lab 2',
      monthlyFee: 2500,
    }),
    mk({
      id: 'bat-m2',
      code: 'M2',
      title: 'Mathematics Elite Calculus',
      subjectId: 'sub-mat',
      grade: 'Grade 10',
      capacity: 25,
      days: ['Tue', 'Thu', 'Sat'],
      startTime: '16:30',
      endTime: '18:00',
      facultyId: 'st-02',
      room: 'Classroom 4B',
      monthlyFee: 2200,
    }),
    mk({
      id: 'bat-c1',
      code: 'C1',
      title: 'Organic Chemistry Intensive',
      subjectId: 'sub-che',
      grade: 'Grade 12',
      capacity: 30,
      days: ['Mon', 'Wed', 'Fri'],
      startTime: '14:00',
      endTime: '15:30',
      facultyId: 'st-03',
      room: 'Lecture Hall A',
      monthlyFee: 2500,
    }),
    mk({
      id: 'bat-s1',
      code: 'S1',
      title: 'Biology Basic',
      subjectId: 'sub-bio',
      grade: 'Grade 10',
      capacity: 30,
      days: ['Tue', 'Thu'],
      startTime: '15:00',
      endTime: '16:30',
      facultyId: 'st-05',
      room: 'Bio Lab',
      monthlyFee: 1800,
    }),
    mk({
      id: 'bat-a2',
      code: 'A2',
      title: 'Physics Foundation',
      subjectId: 'sub-phy',
      grade: 'Grade 10',
      capacity: 30,
      days: ['Tue', 'Thu', 'Sat'],
      startTime: '10:00',
      endTime: '11:30',
      facultyId: 'st-04',
      room: 'Science Lab 1',
      monthlyFee: 2000,
    }),
    mk({
      id: 'bat-m1',
      code: 'M1',
      title: 'Algebra & Geometry Core',
      subjectId: 'sub-mat',
      grade: 'Grade 10',
      capacity: 30,
      days: ['Mon', 'Wed', 'Fri'],
      startTime: '16:00',
      endTime: '17:30',
      facultyId: 'st-02',
      room: 'Classroom 4B',
      monthlyFee: 2000,
    }),
    mk({
      id: 'bat-m3',
      code: 'M3',
      title: 'JEE Mathematics',
      subjectId: 'sub-mat',
      grade: 'Grade 12',
      capacity: 30,
      days: ['Mon', 'Wed', 'Fri'],
      startTime: '17:30',
      endTime: '19:00',
      facultyId: 'st-02',
      room: 'Classroom 3A',
      monthlyFee: 3000,
    }),
    mk({
      id: 'bat-c2',
      code: 'C2',
      title: 'Physical Chemistry',
      subjectId: 'sub-che',
      grade: 'Grade 11',
      capacity: 30,
      days: ['Tue', 'Thu', 'Sat'],
      startTime: '14:00',
      endTime: '15:30',
      facultyId: 'st-03',
      room: 'Lecture Hall A',
      monthlyFee: 2400,
    }),
    mk({
      id: 'bat-b2',
      code: 'B2',
      title: 'NEET Biology',
      subjectId: 'sub-bio',
      grade: 'Grade 12',
      capacity: 30,
      days: ['Mon', 'Wed', 'Fri'],
      startTime: '09:00',
      endTime: '10:30',
      facultyId: 'st-05',
      room: 'Bio Lab',
      monthlyFee: 2800,
    }),
    mk({
      id: 'bat-a3',
      code: 'A3',
      title: 'JEE Physics',
      subjectId: 'sub-phy',
      grade: 'Grade 12',
      capacity: 30,
      days: ['Tue', 'Thu', 'Sat'],
      startTime: '17:30',
      endTime: '19:00',
      facultyId: 'st-04',
      room: 'Science Lab 2',
      monthlyFee: 3000,
    }),
    mk({
      id: 'bat-e1',
      code: 'E1',
      title: 'English Communication',
      subjectId: 'sub-eng',
      grade: 'Grade 10',
      capacity: 25,
      days: ['Wed', 'Sat'],
      startTime: '11:00',
      endTime: '12:30',
      facultyId: 'st-06',
      room: 'Classroom 2',
      monthlyFee: 1500,
    }),
    mk({
      id: 'bat-m4',
      code: 'M4',
      title: 'Grade 11 Mathematics',
      subjectId: 'sub-mat',
      grade: 'Grade 11',
      capacity: 30,
      days: ['Tue', 'Thu', 'Sat'],
      startTime: '11:00',
      endTime: '12:30',
      facultyId: 'st-02',
      room: 'Classroom 3A',
      monthlyFee: 2400,
    }),
    mk({
      id: 'bat-n1',
      code: 'N1',
      title: 'Foundation Science (Weekend)',
      subjectId: 'sub-phy',
      grade: 'Grade 10',
      capacity: 20,
      days: ['Sun'],
      startTime: '10:00',
      endTime: '12:30',
      facultyId: 'st-04',
      room: 'North · Room 1',
      monthlyFee: 1600,
      campusId: 'cmp-north',
    }),
    mk({
      id: 'bat-p1',
      code: 'P1',
      title: 'Board Revision Crash Course',
      subjectId: 'sub-phy',
      grade: 'Grade 12',
      capacity: 40,
      days: ['Sat', 'Sun'],
      startTime: '09:00',
      endTime: '12:00',
      facultyId: 'st-04',
      room: 'Auditorium',
      monthlyFee: 3500,
      status: 'Upcoming',
      startDate: addDays(today, 20),
    }),
  ];
  const batchById = new Map(batches.map((b) => [b.id, b]));

  /* Students ------------------------------------------------------------- */
  const traits = new Map<ID, Traits>();
  const students: Student[] = [];
  const pinned = (s: Omit<Student, 'concessionPct' | 'portalAccess' | 'campusId' | 'school'> & Partial<Student>, t: Traits) => {
    students.push({ concessionPct: 0, portalAccess: 'Active', campusId: C, school: rng.pick(SCHOOLS), ...s });
    traits.set(s.id, { ...t, pinned: true });
  };
  const dobFor = (grade: string) => addDays(addMonths(today, -12 * AGE_BY_GRADE[grade]), -rng.int(0, 360));

  // The seven rows from the design mock-up.
  pinned(
    {
      id: 'STU-1042',
      cardNo: '9401',
      name: 'Aarav Patel',
      gender: 'Male',
      dob: dobFor('Grade 10'),
      grade: 'Grade 10',
      section: 'Section B',
      guardian: { name: 'Vikram Patel', relation: 'Father', phone: '+91 98765 43210' },
      batchIds: ['bat-m2'],
      joiningDate: addDays(today, -99),
      status: 'Active',
    },
    { attendance: 0.95, ability: 0.8, payer: 'prompt' },
  );
  pinned(
    {
      id: 'STU-1045',
      cardNo: '9402',
      name: 'Ananya Iyer',
      gender: 'Female',
      dob: dobFor('Grade 10'),
      grade: 'Grade 10',
      section: 'Section A',
      guardian: { name: 'S. Iyer', relation: 'Mother', phone: '+91 98765 43211' },
      batchIds: ['bat-m2', 'bat-s1'],
      joiningDate: addDays(today, -83),
      status: 'Active',
    },
    { attendance: 0.97, ability: 0.9, payer: 'prompt' },
  );
  pinned(
    {
      id: 'STU-1048',
      cardNo: '9403',
      name: 'Devansh Mehta',
      gender: 'Male',
      dob: dobFor('Grade 11'),
      grade: 'Grade 11',
      section: 'Science',
      guardian: { name: 'Rajesh Mehta', relation: 'Father', phone: '+91 98765 43212' },
      batchIds: ['bat-a1'],
      joiningDate: addDays(addMonths(today, -2), -3),
      status: 'Active',
    },
    { attendance: 0.86, ability: 0.7, payer: 'prompt', skipLastInvoices: 1 },
  );
  pinned(
    {
      id: 'STU-1051',
      cardNo: '9404',
      name: 'Ishita Sharma',
      gender: 'Female',
      dob: dobFor('Grade 10'),
      grade: 'Grade 10',
      section: 'Section B',
      guardian: { name: 'Sunita Sharma', relation: 'Mother', phone: '+91 98765 43213' },
      batchIds: ['bat-m2'],
      joiningDate: addDays(today, -102),
      status: 'Active',
    },
    { attendance: 0.92, ability: 0.75, payer: 'prompt' },
  );
  pinned(
    {
      id: 'STU-1055',
      cardNo: '9405',
      name: 'Kabir Das',
      gender: 'Male',
      dob: dobFor('Grade 12'),
      grade: 'Grade 12',
      section: 'Chemistry Spec',
      guardian: { name: 'Manjit Das', relation: 'Father', phone: '+91 98765 43216' },
      batchIds: ['bat-c1'],
      joiningDate: addDays(addMonths(today, -4), -12),
      status: 'On Leave',
      notes: 'On medical leave; parent informed the office.',
    },
    { attendance: 0.72, ability: 0.55, payer: 'prompt', skipLastInvoices: 2 },
  );
  pinned(
    {
      id: 'STU-1058',
      cardNo: '9406',
      name: 'Rhea Sengupta',
      gender: 'Female',
      dob: dobFor('Grade 11'),
      grade: 'Grade 11',
      section: 'Pre-Med',
      guardian: { name: 'P. K. Sengupta', relation: 'Father', phone: '+91 98765 43217' },
      batchIds: ['bat-a1'],
      joiningDate: addDays(today, -35),
      status: 'Active',
    },
    { attendance: 0.94, ability: 0.85, payer: 'prompt' },
  );
  pinned(
    {
      id: 'STU-1062',
      cardNo: '9407',
      name: 'Tanmay Bhatia',
      gender: 'Male',
      dob: dobFor('Grade 10'),
      grade: 'Grade 10',
      section: 'Foundation',
      guardian: { name: 'Alok Bhatia', relation: 'Father', phone: '+91 98765 43219' },
      batchIds: ['bat-m2'],
      joiningDate: addDays(today, -80),
      status: 'Active',
    },
    { attendance: 0.9, ability: 0.65, payer: 'prompt' },
  );

  let nextNo = 1063;
  let nextCard = 9408;
  const usedNames = new Set(students.map((s) => s.name));
  const newStudent = (batch: Batch): Student => {
    let gender: Gender;
    let name: string;
    let surname: string;
    do {
      gender = rng.chance(0.5) ? 'Male' : 'Female';
      surname = rng.pick(SURNAMES);
      name = `${rng.pick(gender === 'Male' ? MALE : FEMALE)} ${surname}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    const father = rng.chance(0.7);
    const joinedEarlier = rng.chance(0.2);
    const joiningDate = joinedEarlier
      ? addDays(ayStart, -rng.int(30, 380))
      : addDays(ayStart, rng.int(-10, Math.max(0, diffDays(ayStart, today) - 5)));
    const statusRoll = rng.next();
    const student: Student = {
      id: `STU-${nextNo}`,
      cardNo: String(nextCard++),
      name,
      gender,
      dob: dobFor(batch.grade),
      grade: batch.grade,
      section: rng.pick(SECTIONS[batch.grade]),
      school: rng.pick(SCHOOLS),
      guardian: {
        name: `${rng.pick(father ? FATHERS : MOTHERS)} ${surname}`,
        relation: father ? 'Father' : 'Mother',
        phone: `+91 ${rng.int(70000, 99999)} ${rng.int(10000, 99999)}`,
        email: rng.chance(0.6) ? `${surname.toLowerCase()}.family@gmail.com` : undefined,
      },
      batchIds: [],
      joiningDate,
      status: statusRoll < 0.92 ? 'Active' : statusRoll < 0.96 ? 'On Leave' : 'Inactive',
      concessionPct: rng.chance(0.12) ? rng.pick([10, 15, 20, 25]) : 0,
      portalAccess: rng.chance(0.6) ? 'Active' : rng.chance(0.55) ? 'Invited' : 'Not Invited',
      campusId: batch.campusId,
    };
    nextNo += rng.int(1, 3);
    const ability = 0.35 + rng.next() * 0.6;
    const payerRoll = rng.next();
    traits.set(student.id, {
      ability,
      // Stronger students tend to attend more — keeps reports believable.
      attendance: Math.min(0.99, 0.55 + ability * 0.35 + rng.next() * 0.15),
      payer: payerRoll < 0.72 ? 'prompt' : payerRoll < 0.92 ? 'late' : 'defaulter',
    });
    students.push(student);
    return student;
  };

  const enrolTargets: Record<ID, number> = { 'bat-a1': 30, 'bat-m2': 25, 'bat-c1': 28, 'bat-n1': 14 };
  for (const batch of batches.filter((b) => b.status === 'Active')) {
    const target = enrolTargets[batch.id] ?? Math.round(batch.capacity * (0.72 + rng.next() * 0.26));
    let count = students.filter((s) => s.batchIds.includes(batch.id)).length;
    while (count < target) {
      // ~35% of seats go to students already enrolled in another subject.
      const pool = students.filter(
        (s) =>
          !traits.get(s.id)?.pinned &&
          s.grade === batch.grade &&
          s.campusId === batch.campusId &&
          s.batchIds.length < 2 &&
          !s.batchIds.some((id) => batchById.get(id)?.subjectId === batch.subjectId),
      );
      const student = pool.length && rng.chance(0.35) ? rng.pick(pool) : newStudent(batch);
      student.batchIds.push(batch.id);
      count++;
    }
  }
  // A few early registrations for the upcoming crash course.
  students
    .filter((s) => s.grade === 'Grade 12' && s.status === 'Active')
    .slice(0, 6)
    .forEach((s) => s.batchIds.push('bat-p1'));

  /** Inactive students stopped coming ~30 days ago. */
  const activeOn = (s: Student, date: ISODate) => s.joiningDate <= date && !(s.status === 'Inactive' && date > addDays(today, -30));

  /* Attendance sessions -------------------------------------------------- */
  const sessions: AttendanceSession[] = [];
  const sessionsByBatch = new Map<ID, AttendanceSession[]>();
  for (const batch of batches.filter((b) => b.status === 'Active')) {
    const roster = students.filter((s) => s.batchIds.includes(batch.id));
    const list: AttendanceSession[] = [];
    for (let d = batch.startDate; d <= today; d = addDays(d, 1)) {
      if (!batch.days.includes(weekdayOf(d)) || holidays.has(d)) continue;
      if (d === today && batch.endTime > nowHM) continue; // not held yet — marked live
      const records: Record<ID, AttendanceMark> = {};
      for (const s of roster) {
        if (!activeOn(s, d)) continue;
        if (s.status === 'On Leave' && diffDays(d, today) <= 12) {
          records[s.id] = 'E';
          continue;
        }
        const t = traits.get(s.id)!;
        records[s.id] = rng.next() < t.attendance ? (rng.chance(0.07) ? 'L' : 'P') : rng.chance(0.12) ? 'E' : 'A';
      }
      const markedAt = at(d, batch.endTime);
      list.push({
        id: `ses-${batch.code.toLowerCase()}-${d}`,
        batchId: batch.id,
        date: d,
        startTime: batch.startTime,
        endTime: batch.endTime,
        facultyId: batch.facultyId,
        topicIds: [],
        records,
        markedAt,
        markedBy: batch.facultyId,
      });
    }
    sessionsByBatch.set(batch.id, list);
    sessions.push(...list);
  }

  /* Topic coverage (derived from sessions) ------------------------------ */
  const coverage: TopicCoverage[] = [];
  for (const batch of batches) {
    const syllabus = topics.filter((t) => t.subjectId === batch.subjectId && t.grade === batch.grade);
    const list = sessionsByBatch.get(batch.id) ?? [];
    const reached = list.length ? Math.max(1, Math.round(syllabus.length * (0.35 + rng.next() * 0.3))) : 0;
    const hours = (minutesOf(batch.endTime) - minutesOf(batch.startTime)) / 60;
    list.forEach((s, i) => {
      const topic = syllabus[Math.floor((i * reached) / list.length)];
      if (topic) s.topicIds = [topic.id];
    });
    syllabus.forEach((topic, idx) => {
      const taught = list.filter((s) => s.topicIds.includes(topic.id));
      coverage.push({
        batchId: batch.id,
        topicId: topic.id,
        status: idx < reached - 1 ? 'Completed' : idx === reached - 1 ? 'In Progress' : 'Not Started',
        startedOn: taught[0]?.date,
        completedOn: idx < reached - 1 ? taught[taught.length - 1]?.date : undefined,
        hoursSpent: taught.length * hours,
      });
    });
  }

  /* Assessments ----------------------------------------------------------- */
  const assessments: Assessment[] = [];
  const TYPE_CYCLE: AssessmentType[] = ['Quiz', 'Unit Test', 'Assignment', 'Unit Test', 'Mock Exam'];
  const MAX: Record<AssessmentType, number> = { Quiz: 20, 'Unit Test': 50, Assignment: 25, 'Mock Exam': 100 };
  for (const batch of batches.filter((b) => b.status === 'Active')) {
    const list = sessionsByBatch.get(batch.id) ?? [];
    const roster = students.filter((s) => s.batchIds.includes(batch.id));
    const counters: Partial<Record<AssessmentType, number>> = {};
    let prev = batch.startDate;
    for (let i = 0, date = addDays(batch.startDate, 20); date < today; i++, date = addDays(date, 18)) {
      const type = TYPE_CYCLE[i % TYPE_CYCLE.length];
      counters[type] = (counters[type] ?? 0) + 1;
      const covered = [...new Set(list.filter((s) => s.date > prev && s.date <= date).flatMap((s) => s.topicIds))];
      const firstTopic = topics.find((t) => t.id === covered[0]);
      const scores: Record<ID, number | null> = {};
      for (const s of roster) {
        if (!activeOn(s, date)) continue;
        const t = traits.get(s.id)!;
        const ratio = Math.min(1, Math.max(0.05, t.ability + (rng.next() - 0.5) * 0.3 + i * 0.01));
        scores[s.id] = rng.chance(0.05) ? null : Math.round(ratio * MAX[type]);
      }
      assessments.push({
        id: `asm-${batch.code.toLowerCase()}-${i + 1}`,
        batchId: batch.id,
        title: `${type} ${counters[type]}${firstTopic ? ` · ${firstTopic.chapter.split('· ')[1] ?? firstTopic.name}` : ''}`,
        type,
        date,
        maxMarks: MAX[type],
        topicIds: covered,
        scores,
      });
      prev = date;
    }
  }

  /* Invoices & payments -------------------------------------------------- */
  const invoices: FeeInvoice[] = [];
  const payments: Payment[] = [];
  const METHODS: PaymentMethod[] = ['UPI', 'UPI', 'UPI', 'Cash', 'Cash', 'Card', 'Bank Transfer', 'Cheque'];
  let invSeq = 1;
  for (const s of students) {
    const t = traits.get(s.id)!;
    const cycleDay = Math.min(28, parseISODate(s.joiningDate).getDate());
    const studentInvoices: FeeInvoice[] = [];
    for (let period = ayStart.slice(0, 7); `${period}-01` <= today; period = addMonths(`${period}-01`, 1).slice(0, 7)) {
      const issuedOn = `${period}-${pad2(cycleDay)}`;
      if (issuedOn < s.joiningDate || issuedOn > today || !activeOn(s, issuedOn)) continue;
      for (const batchId of s.batchIds) {
        const batch = batchById.get(batchId)!;
        if (batch.status !== 'Active') continue;
        const amount = Math.round((batch.monthlyFee * (1 - s.concessionPct / 100)) / 10) * 10;
        const inv: FeeInvoice = {
          id: `INV-${period.slice(2, 4)}${period.slice(5, 7)}-${String(invSeq++).padStart(4, '0')}`,
          studentId: s.id,
          batchId,
          period,
          description: `${batch.name} · ${batch.title} — monthly tuition`,
          amount,
          issuedOn,
          dueDate: addDays(issuedOn, settings.fees.dueInDays),
        };
        studentInvoices.push(inv);
      }
    }
    invoices.push(...studentInvoices);
    const skipFrom =
      studentInvoices.length - (t.skipLastInvoices ?? 0) * s.batchIds.filter((id) => batchById.get(id)?.status === 'Active').length;
    studentInvoices.forEach((inv, idx) => {
      if (idx >= skipFrom) return;
      if (t.payer === 'defaulter' && diffDays(inv.issuedOn, today) < 45) return;
      const delay = t.pinned ? 0 : t.payer === 'late' ? rng.int(6, 18) : rng.int(0, 6);
      const date = addDays(inv.issuedOn, delay);
      if (date > today) return;
      payments.push({
        id: `pay-${inv.id}`,
        receiptNo: '',
        invoiceId: inv.id,
        studentId: s.id,
        amount: inv.amount,
        date,
        method: rng.pick(METHODS),
        collectedBy: rng.chance(0.75) ? 'st-08' : 'st-09',
      });
    });
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));
  payments.forEach((p, i) => {
    p.receiptNo = `${settings.fees.receiptPrefix}-${String(i + 1).padStart(6, '0')}`;
    if (p.method === 'UPI') p.reference = `UPI${400000000 + i * 7919}`;
    if (p.method === 'Cheque') p.reference = `CHQ ${100200 + i}`;
  });

  /* Notifications ------------------------------------------------------- */
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const notifications: AppNotification[] = [];
  // Students absent from their last three sessions in a batch.
  for (const [batchId, list] of sessionsByBatch) {
    const last3 = list.slice(-3);
    if (last3.length < 3) continue;
    for (const sid of Object.keys(last3[2].records)) {
      if (last3.every((ses) => ses.records[sid] === 'A') && notifications.length < 3) {
        const st = students.find((x) => x.id === sid)!;
        notifications.push({
          id: `ntf-abs-${sid}`,
          kind: 'absence',
          title: `3 consecutive absences · ${st.name}`,
          message: `${batchById.get(batchId)!.name} — parent ${st.guardian.name} has been notified by SMS.`,
          createdAt: minsAgo(35 + notifications.length * 50),
          read: false,
          link: `/students/${sid}`,
        });
      }
    }
  }
  notifications.push(
    {
      id: 'ntf-fee-1055',
      kind: 'fee',
      title: 'Fee overdue · Kabir Das',
      message: 'Two monthly invoices for Batch C1 are past the grace period.',
      createdAt: minsAgo(190),
      read: false,
      link: '/students/STU-1055',
    },
    {
      id: 'ntf-batch-m2',
      kind: 'batch',
      title: 'Batch M2 is at full capacity',
      message: '25 / 25 seats filled. New admissions go to the waitlist.',
      createdAt: minsAgo(60 * 20),
      read: true,
      link: '/batches/bat-m2',
    },
    {
      id: 'ntf-sys-lic',
      kind: 'system',
      title: `License active · ${settings.license.tier} ${settings.academicYear}`,
      message: `Your subscription is valid until ${settings.license.validUntil}.`,
      createdAt: minsAgo(60 * 50),
      read: true,
    },
    {
      id: 'ntf-batch-p1',
      kind: 'batch',
      title: 'Upcoming batch P1 opens soon',
      message: 'Board Revision Crash Course starts in 20 days — 6 early registrations.',
      createdAt: minsAgo(60 * 30),
      read: true,
      link: '/batches/bat-p1',
    },
  );

  /* Activity log --------------------------------------------------------- */
  const activity: ActivityEntry[] = [
    ...sessions
      .slice()
      .sort((a, b) => b.markedAt.localeCompare(a.markedAt))
      .slice(0, 6)
      .map<ActivityEntry>((s) => ({
        id: `act-${s.id}`,
        at: s.markedAt,
        actorId: s.markedBy,
        action: `marked attendance for ${batchById.get(s.batchId)!.name}`,
        entity: { type: 'session', id: s.id },
      })),
    ...payments.slice(-6).map<ActivityEntry>((p) => ({
      id: `act-${p.id}`,
      // Payments are stamped at noon, but never later than the moment the demo is generated.
      at: [at(p.date, '12:00'), now.toISOString()].sort()[0],
      actorId: p.collectedBy,
      action: `collected ${settings.currency.symbol}${p.amount.toLocaleString('en-IN')} from ${students.find((s) => s.id === p.studentId)!.name}`,
      entity: { type: 'invoice', id: p.invoiceId },
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  /* Student & parent app accounts --------------------------------------- */
  // Give a few families a shared guardian so the parent app can switch children.
  for (const pin of students.slice(0, PINNED_COUNT)) {
    const surname = pin.name.split(' ').pop();
    const sibling = students.find(
      (s) =>
        s !== pin &&
        s.campusId === pin.campusId &&
        s.status === 'Active' &&
        s.name.endsWith(` ${surname}`) &&
        s.guardian.phone !== pin.guardian.phone,
    );
    if (sibling) sibling.guardian = { ...pin.guardian };
  }

  // Most students have their own email too; it is optional, and only accounts
  // that have one can reset their own password.
  for (const [i, s] of students.entries()) {
    if (i < PINNED_COUNT || rng.chance(0.55)) {
      const [first, last] = [s.name.split(' ')[0], s.name.split(' ').pop()];
      s.email ??= `${first}.${last}`.toLowerCase() + '@gmail.com';
    }
  }

  const portalAccounts: PortalAccount[] = [];
  const parentByPhone = new Map<string, PortalAccount>();
  for (const s of students) {
    if (s.portalAccess === 'Not Invited') continue;
    const active = s.portalAccess === 'Active';
    const invitedOn = addDays(s.joiningDate, 1);
    const activatedOn = active ? addDays(invitedOn, rng.int(0, 4)) : undefined;
    const lastLoginAt = active ? new Date(now.getTime() - rng.int(1, 96) * 3_600_000).toISOString() : undefined;

    // Students sign in with their student ID and a password; email is optional.
    portalAccounts.push({
      id: `pa-s-${s.id}`,
      role: 'student',
      name: s.name,
      studentIds: [s.id],
      loginId: s.id,
      email: s.email,
      emailVerified: !!s.email && active,
      authMethod: 'password',
      password: active ? DEMO_STUDENT_PASSWORD : undefined,
      status: active ? 'Active' : 'Invited',
      invitedOn,
      activatedOn,
      lastLoginAt,
      token: active ? undefined : { value: `invite-${s.id}`, purpose: 'activate', expiresAt: addDays(today, 7) },
      notify: { attendance: true, fees: false, results: true },
    });

    // Parents sign in with their mobile — one account per number, linking every child.
    const key = normalizePhone(s.guardian.phone);
    const existing = parentByPhone.get(key);
    if (existing) {
      existing.studentIds.push(s.id);
      continue;
    }
    // A parent login always needs an email for password recovery.
    s.guardian.email ??= `${s.guardian.name.split(' ').pop()!.toLowerCase()}.family@gmail.com`;
    const usesOtp = rng.chance(0.6);
    const parent: PortalAccount = {
      id: `pa-p-${key}`,
      role: 'parent',
      name: s.guardian.name,
      studentIds: [s.id],
      loginId: key,
      phone: s.guardian.phone,
      email: s.guardian.email,
      emailVerified: active,
      authMethod: usesOtp ? 'otp' : 'password',
      password: !usesOtp && active ? DEMO_PARENT_PASSWORD : undefined,
      status: active ? 'Active' : 'Invited',
      invitedOn,
      activatedOn,
      lastLoginAt,
      token: active ? undefined : { value: `invite-${key}`, purpose: 'activate', expiresAt: addDays(today, 7) },
      notify: { attendance: true, fees: true, results: true },
    };
    parentByPhone.set(key, parent);
    portalAccounts.push(parent);
  }

  return {
    settings,
    staff,
    subjects: DEMO_SUBJECTS,
    topics,
    batches,
    students,
    coverage,
    sessions,
    invoices,
    payments,
    assessments,
    notifications,
    activity,
    portalAccounts,
  };
}
