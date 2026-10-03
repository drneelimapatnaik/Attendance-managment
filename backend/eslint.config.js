// ESLint flat config: TypeScript rules for the API, formatting delegated to Prettier.
// Mirrors the frontend's setup (typescript-eslint recommended + a lenient unused-vars rule).
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'prisma/migrations'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Decorator metadata means interfaces are often implemented by classes with empty ctors.
      '@typescript-eslint/no-empty-function': ['warn', { allow: ['constructors'] }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `any` is banned in exported signatures by review, not by the linter: Nest internals
      // (ExecutionContext payloads, Express requests) occasionally need it locally.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Config files are plain CommonJS scripts, not part of the Nest program.
    files: ['eslint.config.js', 'jest.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
