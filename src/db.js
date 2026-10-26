import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure .env before starting the application.');
}
const url = new URL(process.env.DATABASE_URL);
export const databaseSchema = url.searchParams.get('schema') || 'public';
const adapter = new PrismaPg(
  { connectionString: url.toString(), connectionTimeoutMillis: 5000 },
  { schema: databaseSchema },
);
const prisma = new PrismaClient({ adapter });
export default prisma;
