import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

// Never fall back to DATABASE_URL: integration tests must name a dedicated DB.
const value = process.env.TEST_DATABASE_URL;
if (!value) throw new Error('TEST_DATABASE_URL is required; use a dedicated local database ending in _test.');
const url = new URL(value);
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)) {
  throw new Error('Tests require a local PostgreSQL database ending in _test, outside production.');
}
const schema = `instalite_test_${randomUUID().replaceAll('-', '')}`;
url.searchParams.set('schema', schema);
const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test', ALLOW_DESTRUCTIVE_SEED: 'true' };
const admin = new pg.Client({ connectionString: value, connectionTimeoutMillis: 5000 });
let connected = false;
let created = false;
const run = (file, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file, ...args], { env, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Test command failed (${code ?? signal})`)));
});
try {
  await admin.connect();
  connected = true;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
  await run('node_modules/vitest/vitest.mjs', ['run', '--no-file-parallelism']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // This random schema is owned by this invocation; no public tables are touched.
  try {
    if (created) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    if (connected) await admin.end();
  }
}
