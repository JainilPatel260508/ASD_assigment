import prisma from '../db.js';
import { pageResponse } from '../utils/pagination.js';

export async function pagedQuery(model, { where, orderBy, include, paging }, ensureParent) {
  return prisma.$transaction(async (tx) => {
    if (ensureParent) await ensureParent(tx);
    const data = await tx[model].findMany({ where, orderBy, include, skip: paging.skip, take: paging.limit });
    const total = await tx[model].count({ where });
    return pageResponse(data, total, paging);
  }, { isolationLevel: 'RepeatableRead' });
}
