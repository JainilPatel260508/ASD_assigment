import { pathToFileURL } from 'node:url';
import prisma from '../src/db.js';
import { users, posts, likes } from './seed-data.js';

export function assertSeedAllowed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('Seeding requires ALLOW_DESTRUCTIVE_SEED=true and a non-production environment.');
  }
}

export async function seed() {
  assertSeedAllowed();
  return prisma.$transaction(async (tx) => {
    await tx.like.deleteMany();
    await tx.post.deleteMany();
    await tx.user.deleteMany();
    const createdUsers = await tx.user.createManyAndReturn({ data: users });
    const userIds = new Map(createdUsers.map((user) => [user.username, user.id]));
    const createdPosts = await tx.post.createManyAndReturn({
      data: posts.map(({ author, ...post }) => ({ ...post, authorId: userIds.get(author) })),
    });
    const postIds = new Map(createdPosts.map((post) => [post.imageUrl.split('/')[4], post.id]));
    const createdLikes = await tx.like.createManyAndReturn({
      data: likes.map(({ user, post }) => ({ userId: userIds.get(user), postId: postIds.get(post) })),
    });
    return { users: createdUsers, posts: createdPosts, likes: createdLikes };
  }, { timeout: 30000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await seed();
    console.log(`🌱 Seeded ${result.users.length} users, ${result.posts.length} posts and ${result.likes.length} likes`);
  } catch (error) {
    console.error('Seed failed', { name: error.name, code: error.code,
      message: error.name === 'Error' ? error.message : 'Database operation failed; check the database configuration.' });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
