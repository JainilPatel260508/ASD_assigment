import { HttpError } from './errors.js';
import { pagination } from './pagination.js';

export function sortQuery(query, fields) {
  const sortBy = query.sortBy === undefined ? 'createdAt' : query.sortBy;
  const order = query.order === undefined ? 'desc' : query.order;
  if (!fields.includes(sortBy)) throw new HttpError(400, `sortBy must be one of: ${fields.join(', ')}`);
  if (!['asc', 'desc'].includes(order)) throw new HttpError(400, 'order must be asc or desc');
  return { sortBy, order };
}

function booleanQuery(value, field) {
  if (value === undefined) return undefined;
  if (value !== 'true' && value !== 'false') throw new HttpError(400, `${field} must be true or false`);
  return value === 'true';
}

function stringQuery(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  // Prisma's PostgreSQL insensitive matching uses ILIKE. Treat %, _ and \ literally.
  return value.replace(/[\\%_]/g, '\\$&');
}

export function dateQuery(value) {
  if (value === undefined) return undefined;
  const fail = () => { throw new HttpError(400, 'from and to must be valid dates'); };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return fail();
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day ||
    (value.length > 10 && Number(value.slice(11, 13)) > 23)) return fail();
  return date;
}

export function userQuery(query = {}) {
  const paging = pagination(query);
  const { sortBy, order } = sortQuery(query, ['createdAt', 'username', 'fullname']);
  const isPrivate = booleanQuery(query.isPrivate, 'isPrivate');
  const hasPosts = booleanQuery(query.hasPosts, 'hasPosts');
  const search = stringQuery(query.search, 'search');
  const where = {};
  if (isPrivate !== undefined) where.isPrivate = isPrivate;
  if (hasPosts !== undefined) where.posts = hasPosts ? { some: {} } : { none: {} };
  if (search !== undefined) where.OR = ['username', 'fullname'].map((field) => ({
    [field]: { contains: search, mode: 'insensitive' },
  }));
  return { paging, where, orderBy: [{ [sortBy]: order }, { id: order }] };
}

export function postQuery(query = {}) {
  const paging = pagination(query);
  const { sortBy, order } = sortQuery(query, ['createdAt', 'updatedAt', 'likes']);
  const location = stringQuery(query.location, 'location');
  const search = stringQuery(query.search, 'search');
  const from = dateQuery(query.from);
  const to = dateQuery(query.to);
  const where = {};
  if (location !== undefined) where.location = { equals: location, mode: 'insensitive' };
  if (search !== undefined) where.caption = { contains: search, mode: 'insensitive' };
  if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lt: to }) };
  const orderBy = sortBy === 'likes'
    ? [{ likes: { _count: order } }, { createdAt: 'desc' }, { id: 'desc' }]
    : [{ [sortBy]: order }, { id: order }];
  return { paging, where, orderBy };
}
