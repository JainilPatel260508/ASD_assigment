import prisma from '../db.js';
import { userInput } from '../utils/validation.js';
import { userQuery } from '../utils/queries.js';
import { requiredRecord, writeRecord } from '../utils/errors.js';
import { userCounts } from './selections.js';
import { pagedQuery } from './paged-query.js';

export const createUser = (data) => writeRecord(
  () => prisma.user.create({ data: userInput(data, true) }), 'User',
  { P2002: [409, 'username or email already taken'] },
);
export const listUsers = (query) => pagedQuery('user', { ...userQuery(query), include: userCounts });
export async function getUserById(id) {
  return requiredRecord(await prisma.user.findUnique({ where: { id }, include: userCounts }), 'User');
}
export const updateUser = (id, data) => writeRecord(
  () => prisma.user.update({ where: { id }, data: userInput(data) }), 'User',
);
export const deleteUser = (id) => writeRecord(() => prisma.user.delete({ where: { id } }), 'User');
