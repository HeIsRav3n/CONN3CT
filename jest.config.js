/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false } }] },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@bot/(.*)$': '<rootDir>/src/bot/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@cache/(.*)$': '<rootDir>/src/cache/$1',
    '^@engines/(.*)$': '<rootDir>/src/engines/$1',
    '^@workers/(.*)$': '<rootDir>/src/workers/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/bot/deploy-commands.ts',
  ],
  coverageThreshold: {
    global: { branches: 60, functions: 70, lines: 70, statements: 70 },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Auto-mock winston in all tests to prevent file system writes
  modulePathIgnorePatterns: [],
};
