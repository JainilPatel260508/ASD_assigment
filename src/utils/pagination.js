import { HttpError } from './errors.js';

export function pagination(query = {}) {
  const invalid = () => { throw new HttpError(400, 'page and limit must be positive integers'); };
  const parse = (value, fallback, cap) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) < 1n) return invalid();
    if (cap && BigInt(value) > BigInt(cap)) return cap;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) return invalid();
    return number;
  };
  const page = parse(query.page, 1);
  const limit = parse(query.limit, 10, 50);
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) return invalid();
  return { page, limit, skip };
}

export function pageResponse(data, total, { page, limit }) {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
