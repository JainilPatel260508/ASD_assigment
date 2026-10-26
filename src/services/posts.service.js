import prisma from '../db.js';
import { postInput } from '../utils/validation.js';
import { postQuery } from '../utils/queries.js';
import { pagination } from '../utils/pagination.js';
import { requiredRecord, writeRecord } from '../utils/errors.js';
import { postDetails, postCounts } from './selections.js';
import { pagedQuery } from './paged-query.js';

export const createPost = (data) => writeRecord(
  () => prisma.post.create({ data: postInput(data, true) }), 'Post',
  { P2003: [404, 'User not found'] },
);
export const listPosts = (query) => pagedQuery('post', { ...postQuery(query), include: postDetails });
export async function getPostById(id) {
  return requiredRecord(await prisma.post.findUnique({ where: { id }, include: postDetails }), 'Post');
}
export const updatePost = (id, data) => writeRecord(
  () => prisma.post.update({ where: { id }, data: postInput(data) }), 'Post',
);
export const deletePost = (id) => writeRecord(() => prisma.post.delete({ where: { id } }), 'Post');

export const userPosts = (userId, query, liked = false) => pagedQuery('post', {
  paging: pagination(query),
  where: liked ? { likes: { some: { userId } } } : { authorId: userId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  include: liked ? postDetails : postCounts,
}, async (tx) => requiredRecord(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }), 'User'));
