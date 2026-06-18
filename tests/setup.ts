import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

// Global test timeout
jest.setTimeout(30_000);
