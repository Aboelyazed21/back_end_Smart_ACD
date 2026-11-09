import { closePool } from '../config/db';
import { fakeEngine } from './fakeEngine';
import { resetDatabase } from './db';

beforeAll(async () => {
  await fakeEngine.start();
  await resetDatabase();
});

beforeEach(() => {
  fakeEngine.reset();
});

afterAll(async () => {
  await fakeEngine.stop();
  await closePool();
});
