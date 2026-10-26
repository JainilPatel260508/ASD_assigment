import { Prisma } from '@prisma/client';
import prisma, { databaseSchema } from '../db.js';
import { requiredRecord, writeRecord } from '../utils/errors.js';
import { userSummary } from './selections.js';

async function lockParents(tx, postId, userId) {
  // Key-share locks keep parents alive until the insert/delete commits. No like
  // existence check: the composite primary key arbitrates concurrent inserts.
  const schema = `"${databaseSchema.replaceAll('"', '""')}"`;
  const posts = Prisma.raw(`${schema}."Post"`);
  const users = Prisma.raw(`${schema}."User"`);
  requiredRecord((await tx.$queryRaw`SELECT "id" FROM ${posts} WHERE "id" = ${postId} FOR KEY SHARE`)[0], 'Post');
  requiredRecord((await tx.$queryRaw`SELECT "id" FROM ${users} WHERE "id" = ${userId} FOR KEY SHARE`)[0], 'User');
}

export async function listLikes(postId) {
  const post = requiredRecord(await prisma.post.findUnique({
    where: { id: postId },
    select: { likes: { orderBy: { user: { username: 'asc' } }, select: { user: { select: userSummary } } } },
  }), 'Post');
  return post.likes.map(({ user }) => user);
}

export const createLike = (postId, userId) => writeRecord(() => prisma.$transaction(async (tx) => {
  await lockParents(tx, postId, userId);
  return tx.like.create({ data: { userId, postId } });
}), 'Like', { P2002: [409, 'Already liked'] });

export const deleteLike = (postId, userId) => writeRecord(() => prisma.$transaction(async (tx) => {
  await lockParents(tx, postId, userId);
  return tx.like.delete({ where: { userId_postId: { userId, postId } } });
}), 'Like');
