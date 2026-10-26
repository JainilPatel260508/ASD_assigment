import express from 'express';
import { pathToFileURL } from 'node:url';
import prisma from './db.js';
import users from './routes/users.routes.js';
import posts from './routes/posts.routes.js';
import likes from './routes/likes.routes.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.get('/health', (req, res) => res.json({ status: 'OK' }));
app.use('/users', users);
app.use('/posts/:id/likes', likes);
app.use('/posts', posts);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);
export default app;

export async function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once('error', reject);
  });
  console.log(`Server started on port ${port}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = await startServer();
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      const timeout = setTimeout(() => process.exit(1), 10000).unref();
      server.close(async () => {
        await prisma.$disconnect();
        clearTimeout(timeout);
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error('Server startup failed. Check DATABASE_URL, database availability and PORT.',
      { name: error.name, code: error.code });
    await prisma.$disconnect();
    process.exitCode = 1;
  }
}
