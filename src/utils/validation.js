import { HttpError } from './errors.js';

export const pick = (data, keys) => Object.fromEntries(
  keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]),
);

export function resourceId(value, name = 'id') {
  const valid = (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
    (typeof value === 'number' && Number.isInteger(value));
  const number = Number(value);
  if (!valid || number < 1 || number > 2147483647) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return number;
}

export function bodyObject(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return value;
}

function textFields(data, required, optional) {
  for (const field of required) {
    if (Object.hasOwn(data, field) && (typeof data[field] !== 'string' || !data[field].trim())) {
      throw new HttpError(400, `${field} must be a non-empty string`);
    }
  }
  for (const field of optional) {
    if (Object.hasOwn(data, field) && data[field] !== null && typeof data[field] !== 'string') {
      throw new HttpError(400, `${field} must be a string or null`);
    }
  }
  return data;
}

export function userInput(value, create = false) {
  const body = bodyObject(value);
  if (create && ['username', 'email', 'fullname'].some((key) =>
    body[key] == null || body[key] === '' || (typeof body[key] === 'string' && !body[key].trim()))) {
    throw new HttpError(400, 'username, email and fullname are required');
  }
  const data = pick(body, create ? ['username', 'email', 'fullname', 'bio'] : ['fullname', 'bio', 'isPrivate']);
  textFields(data, ['username', 'email', 'fullname'], ['bio']);
  if (Object.hasOwn(data, 'isPrivate') && typeof data.isPrivate !== 'boolean') {
    throw new HttpError(400, 'isPrivate must be a boolean');
  }
  return data;
}

export function postInput(value, create = false) {
  const body = bodyObject(value);
  if (create && (body.imageUrl == null || body.imageUrl === '' ||
    (typeof body.imageUrl === 'string' && !body.imageUrl.trim()) || body.authorId == null || body.authorId === '')) {
    throw new HttpError(400, 'imageUrl and authorId are required');
  }
  const data = pick(body, create ? ['imageUrl', 'authorId', 'caption', 'location'] : ['caption', 'location']);
  textFields(data, ['imageUrl'], ['caption', 'location']);
  if (create) data.authorId = resourceId(data.authorId, 'authorId');
  return data;
}

export function likeInput(value) {
  const body = bodyObject(value);
  if (body.userId == null || body.userId === '') throw new HttpError(400, 'userId is required');
  return resourceId(body.userId, 'userId');
}
