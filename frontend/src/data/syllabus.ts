/**
 * Demo syllabus — subjects and their topics per grade. Real tenants build
 * their own syllabus in "Subject & Topic Master"; this only seeds the demo.
 */
import type { Subject } from '@/types/domain';

export const DEMO_SUBJECTS: Subject[] = [
  { id: 'sub-phy', name: 'Physics', code: 'PHY', shortName: 'Phys', grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
  { id: 'sub-mat', name: 'Mathematics', code: 'MAT', shortName: 'Math', grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
  { id: 'sub-che', name: 'Chemistry', code: 'CHE', shortName: 'Chem', grades: ['Grade 11', 'Grade 12'] },
  { id: 'sub-bio', name: 'Biology', code: 'BIO', shortName: 'Sci', grades: ['Grade 10', 'Grade 12'] },
  { id: 'sub-eng', name: 'English', code: 'ENG', shortName: 'Eng', grades: ['Grade 10'] },
];

/** subjectId → grade → [chapter, topic names…][] */
export const DEMO_SYLLABUS: Record<string, Record<string, [string, string[]][]>> = {
  'sub-phy': {
    'Grade 10': [
      ['Unit 1 · Light', ['Reflection of Light', 'Spherical Mirrors', 'Refraction & Lenses']],
      ['Unit 2 · Human Eye', ['Defects of Vision', 'Dispersion & Scattering']],
      ['Unit 3 · Electricity', ["Ohm's Law", 'Resistors in Series & Parallel', 'Heating Effect of Current']],
      ['Unit 4 · Magnetism', ['Magnetic Field of a Current', 'Electromagnetic Induction']],
    ],
    'Grade 11': [
      ['Unit 1 · Kinematics', ['Units & Measurements', 'Motion in a Straight Line', 'Motion in a Plane']],
      ['Unit 2 · Laws of Motion', ["Newton's Laws", 'Friction', 'Circular Motion']],
      ['Unit 3 · Work & Energy', ['Work-Energy Theorem', 'Conservation of Momentum']],
      ['Unit 4 · Rotation', ['Centre of Mass', 'Torque & Angular Momentum', 'Moment of Inertia']],
    ],
    'Grade 12': [
      ['Unit 1 · Electrostatics', ["Coulomb's Law", 'Electric Field & Flux', "Gauss's Law", 'Capacitance']],
      ['Unit 2 · Current Electricity', ["Kirchhoff's Laws", 'Wheatstone Bridge']],
      ['Unit 3 · Magnetism', ['Biot–Savart Law', "Ampère's Law", 'Magnetic Materials']],
      ['Unit 4 · Optics', ['Ray Optics', 'Wave Optics']],
    ],
  },
  'sub-mat': {
    'Grade 10': [
      ['Unit 1 · Algebra', ['Real Numbers', 'Polynomials', 'Linear Equations in Two Variables', 'Quadratic Equations']],
      ['Unit 2 · Sequences', ['Arithmetic Progressions']],
      ['Unit 3 · Geometry', ['Triangles & Similarity', 'Circles', 'Coordinate Geometry']],
      ['Unit 4 · Trigonometry', ['Trigonometric Ratios', 'Heights & Distances']],
      ['Unit 5 · Calculus Primer', ['Limits (Intro)', 'Rates of Change']],
    ],
    'Grade 11': [
      ['Unit 1 · Sets & Functions', ['Sets', 'Relations & Functions', 'Trigonometric Functions']],
      ['Unit 2 · Algebra', ['Complex Numbers', 'Permutations & Combinations', 'Binomial Theorem']],
      ['Unit 3 · Coordinate Geometry', ['Straight Lines', 'Conic Sections']],
      ['Unit 4 · Calculus', ['Limits & Derivatives']],
    ],
    'Grade 12': [
      ['Unit 1 · Relations', ['Relations & Functions', 'Inverse Trigonometric Functions']],
      ['Unit 2 · Algebra', ['Matrices', 'Determinants']],
      ['Unit 3 · Calculus', ['Continuity & Differentiability', 'Applications of Derivatives', 'Integrals', 'Differential Equations']],
      ['Unit 4 · Vectors', ['Vector Algebra', '3D Geometry']],
      ['Unit 5 · Probability', ['Probability']],
    ],
  },
  'sub-che': {
    'Grade 11': [
      ['Unit 1 · Basics', ['Mole Concept', 'Structure of Atom', 'Periodic Classification']],
      ['Unit 2 · Bonding', ['Chemical Bonding', 'States of Matter']],
      ['Unit 3 · Physical Chemistry', ['Thermodynamics', 'Chemical Equilibrium', 'Ionic Equilibrium']],
    ],
    'Grade 12': [
      ['Unit 1 · Organic Basics', ['IUPAC Nomenclature', 'Isomerism', 'Reaction Mechanisms']],
      ['Unit 2 · Functional Groups', ['Haloalkanes & Haloarenes', 'Alcohols, Phenols & Ethers', 'Aldehydes & Ketones', 'Carboxylic Acids']],
      ['Unit 3 · Nitrogen Compounds', ['Amines', 'Biomolecules']],
      ['Unit 4 · Physical', ['Solutions', 'Electrochemistry', 'Chemical Kinetics']],
    ],
  },
  'sub-bio': {
    'Grade 10': [
      ['Unit 1 · Life Processes', ['Nutrition', 'Respiration', 'Transportation', 'Excretion']],
      ['Unit 2 · Control', ['Nervous System', 'Hormones in Animals & Plants']],
      ['Unit 3 · Reproduction', ['Asexual Reproduction', 'Sexual Reproduction']],
      ['Unit 4 · Heredity', ['Heredity & Variation', 'Evolution Basics']],
    ],
    'Grade 12': [
      ['Unit 1 · Reproduction', ['Reproduction in Organisms', 'Human Reproduction', 'Reproductive Health']],
      ['Unit 2 · Genetics', ['Principles of Inheritance', 'Molecular Basis of Inheritance', 'Evolution']],
      ['Unit 3 · Biology & Welfare', ['Human Health & Disease', 'Microbes in Human Welfare']],
      ['Unit 4 · Biotechnology', ['Biotech Principles', 'Biotech Applications']],
    ],
  },
  'sub-eng': {
    'Grade 10': [
      ['Unit 1 · Grammar', ['Tenses', 'Modals', 'Reported Speech']],
      ['Unit 2 · Writing', ['Formal Letters', 'Analytical Paragraphs']],
      ['Unit 3 · Literature', ['Prose: First Flight', 'Poetry Analysis']],
      ['Unit 4 · Speaking', ['Group Discussion', 'Public Speaking']],
    ],
  },
};
