import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import prisma from '../src/db.js';
import { seed, assertSeedAllowed } from '../prisma/seed.js';
import { users as seedUsers, posts as seedPosts, likes as seedLikes } from '../prisma/seed-data.js';

let fixture;
const user = (username) => fixture.users.find((row) => row.username === username);
const post = (number) => fixture.posts.find((row) => row.imageUrl.includes(`/insta${String(number).padStart(2, '0')}/`));
const keys = (rows) => rows.map((row) => Number(row.imageUrl.split('/')[4].slice(5)));
const names = (rows) => rows.map((row) => row.username);
const summaryKeys = ['fullname', 'id', 'username'];
const missing = 2147483647;
const error = async (response, status, message) => {
  const result = await response;
  expect(result.status).toBe(status);
  expect(result.body).toEqual({ error: message });
};

beforeAll(() => {
  const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema');
  if (process.env.NODE_ENV !== 'test' || !/^instalite_test_[a-f0-9]{32}$/.test(schema)) {
    throw new Error('Run npm test to provision an isolated test schema.');
  }
});
beforeEach(async () => { fixture = await seed(); });
afterAll(async () => { await prisma.$disconnect(); });

describe('server and input handling', () => {
  it('serves health JSON and a consistent route 404', async () => {
    await request(app).get('/health').expect('Content-Type', /json/).expect(200, { status: 'OK' });
    await error(request(app).get('/unknown'), 404, 'Route not found');
  });
  it('rejects malformed JSON and non-object bodies', async () => {
    await error(request(app).post('/users').set('Content-Type', 'application/json').send('{'), 400, 'Invalid JSON body');
    await error(request(app).post('/users').send([]), 400, 'Request body must be a JSON object');
    await request(app).post('/users').send({ username: 'x'.repeat(110000) }).expect(413);
  });
  it.each(['/users/abc', '/posts/0', '/users/1.2/posts', '/users/-1/liked-posts', '/posts/999999999999/likes'])(
    'rejects malformed ID at %s', async (path) => { await error(request(app).get(path), 400, 'id must be a positive integer'); },
  );
});

describe('user CRUD', () => {
  it('creates only approved fields and updates only allowed fields', async () => {
    const created = await request(app).post('/users').send({
      username: 'new_user', email: 'new@example.com', fullname: 'New User',
      id: 999999, isPrivate: true, createdAt: '2000-01-01', updatedAt: '2000-01-01', posts: {},
    }).expect(201);
    expect(created.body).toMatchObject({ username: 'new_user', bio: null, isPrivate: false });
    expect(created.body.id).not.toBe(999999);
    expect(new Date(created.body.createdAt).getFullYear()).toBe(new Date().getFullYear());
    const updated = await request(app).patch(`/users/${created.body.id}`).send({
      fullname: 'Changed', bio: 'Hello', isPrivate: true, username: 'hacked', email: 'hacked@example.com', id: 9,
    }).expect(200);
    expect(updated.body).toMatchObject({ fullname: 'Changed', bio: 'Hello', isPrivate: true, username: 'new_user', email: 'new@example.com' });
    expect(new Date(updated.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.body.updatedAt).getTime());
    await request(app).patch(`/users/${created.body.id}`).send({ bio: null }).expect(200);
    const removed = await request(app).delete(`/users/${created.body.id}`).expect(204);
    expect(removed.text).toBe('');
    await error(request(app).get(`/users/${created.body.id}`), 404, 'User not found');
  });
  it('handles missing fields, duplicate username and duplicate email', async () => {
    await error(request(app).post('/users').send({ username: 'onlyname' }), 400, 'username, email and fullname are required');
    await error(request(app).post('/users'), 400, 'username, email and fullname are required');
    await error(request(app).post('/users').send({ username: 'riya_travels', email: 'other@example.com', fullname: 'Copy' }), 409, 'username or email already taken');
    await error(request(app).post('/users').send({ username: 'unique', email: 'riya@example.com', fullname: 'Copy' }), 409, 'username or email already taken');
  });
  it('rejects invalid editable types but ignores invalid protected fields', async () => {
    await error(request(app).patch(`/users/${user('riya_travels').id}`).send({ isPrivate: 'false' }), 400, 'isPrivate must be a boolean');
    await error(request(app).patch(`/users/${user('riya_travels').id}`).send({ fullname: null }), 400, 'fullname must be a non-empty string');
    await error(request(app).post('/users').send({ username: {}, email: 'x', fullname: 'X' }), 400, 'username must be a non-empty string');
    await request(app).patch(`/users/${user('riya_travels').id}`).send({ email: {}, username: [] }).expect(200);
  });
  it.each(['get', 'patch', 'delete'])('returns exact user 404 for %s', async (method) => {
    await error(request(app)[method](`/users/${missing}`), 404, 'User not found');
  });
});

describe('post CRUD', () => {
  it('creates a post and protects image, author, IDs and timestamps on updates', async () => {
    const authorId = user('riya_travels').id;
    const created = await request(app).post('/posts').send({ imageUrl: 'https://example.com/photo.jpg', authorId,
      id: 999999, createdAt: '2000-01-01', author: {}, likes: [] }).expect(201);
    expect(created.body).toMatchObject({ authorId, caption: null, location: null });
    expect(created.body.id).not.toBe(999999);
    const updated = await request(app).patch(`/posts/${created.body.id}`).send({
      caption: 'New caption', location: 'Goa', imageUrl: {}, authorId: missing, id: 9,
    }).expect(200);
    expect(updated.body).toMatchObject({ imageUrl: created.body.imageUrl, authorId, caption: 'New caption', location: 'Goa' });
    await request(app).patch(`/posts/${created.body.id}`).send({ caption: null, location: null }).expect(200);
    expect((await request(app).delete(`/posts/${created.body.id}`).expect(204)).text).toBe('');
  });
  it('validates required fields and author foreign key', async () => {
    for (const body of [{}, { imageUrl: 'x' }, { authorId: user('riya_travels').id }]) {
      await error(request(app).post('/posts').send(body), 400, 'imageUrl and authorId are required');
    }
    await error(request(app).post('/posts').send({ imageUrl: 'x', authorId: missing }), 404, 'User not found');
    await error(request(app).post('/posts').send({ imageUrl: 'x', authorId: 'no' }), 400, 'authorId must be a positive integer');
    await error(request(app).post('/posts').send({ imageUrl: [], authorId: 1 }), 400, 'imageUrl must be a non-empty string');
    await error(request(app).patch(`/posts/${post(1).id}`).send({ caption: {} }), 400, 'caption must be a string or null');
  });
  it.each(['get', 'patch', 'delete'])('returns exact post 404 for %s', async (method) => {
    await error(request(app)[method](`/posts/${missing}`), 404, 'Post not found');
  });
  it('returns a limited author summary and correct like counts', async () => {
    for (const [number, likes] of [[1, 5], [24, 6], [5, 0]]) {
      const { body } = await request(app).get(`/posts/${post(number).id}`).expect(200);
      expect(body._count).toEqual({ likes });
      expect(Object.keys(body.author).sort()).toEqual(summaryKeys);
      expect(JSON.stringify(body)).not.toContain('email');
    }
  });
});

describe('pagination and query validation', () => {
  it.each(['/users', '/posts', '/user-posts', '/liked-posts'])('applies pagination rules to %s', async (path) => {
    const route = path === '/user-posts' ? `/users/${user('riya_travels').id}/posts`
      : path === '/liked-posts' ? `/users/${user('riya_travels').id}/liked-posts` : path;
    const total = path === '/users' ? 12 : path === '/posts' ? 24 : path === '/user-posts' ? 7 : 4;
    const first = await request(app).get(route).expect(200);
    expect(first.body.meta).toEqual({ page: 1, limit: 10, total, totalPages: Math.ceil(total / 10) });
    const capped = await request(app).get(route).query({ limit: 99 }).expect(200);
    expect(capped.body.meta.limit).toBe(50);
    expect(capped.body.data).toHaveLength(total);
    const beyond = await request(app).get(route).query({ page: 99 }).expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(total);
    for (const value of ['0', '-1', '1.5', 'abc', '', '1e2']) {
      for (const field of ['page', 'limit']) await error(request(app).get(route).query({ [field]: value }), 400, 'page and limit must be positive integers');
    }
    await error(request(app).get(`${route}?page=1&page=2`), 400, 'page and limit must be positive integers');
  });
  it.each([
    ['/users?sortBy=email', 'sortBy must be one of: createdAt, username, fullname'],
    ['/posts?sortBy=caption', 'sortBy must be one of: createdAt, updatedAt, likes'],
    ['/users?order=sideways', 'order must be asc or desc'], ['/posts?order=ASC', 'order must be asc or desc'],
    ['/users?isPrivate=yes', 'isPrivate must be true or false'], ['/users?hasPosts=yes', 'hasPosts must be true or false'],
    ['/posts?from=yesterday', 'from and to must be valid dates'], ['/posts?to=2026-02-30', 'from and to must be valid dates'],
    ['/users?search=a&search=b', 'search must be a string'], ['/posts?location=a&location=b', 'location must be a string'],
  ])('validates %s', async (path, message) => { await error(request(app).get(path), 400, message); });
});

describe('user sorting, filtering and counts', () => {
  it.each([
    ['page=2', ['arjun_clicks', 'riya_travels'], 12],
    ['page=3&limit=5', ['arjun_clicks', 'riya_travels'], 12],
    ['sortBy=username&order=asc&limit=3', ['aditya_codes', 'ananya_reads', 'arjun_clicks'], 12],
    ['sortBy=fullname&order=desc&limit=3', ['vikram.trek', 'sara_sketches', 'rohan_runs'], 12],
    ['order=asc&limit=2', ['riya_travels', 'arjun_clicks'], 12],
    ['isPrivate=true', ['dev_shoots', 'neha_designs', 'ananya_reads', 'meera.eats'], 4],
    ['search=sh', ['dev_shoots', 'isha_dances', 'riya_travels'], 3],
    ['search=SH&isPrivate=false&sortBy=fullname&order=asc&limit=2', ['isha_dances', 'riya_travels'], 2],
    ['search=zzz', [], 0], ['hasPosts=false', ['aditya_codes', 'neha_designs'], 2],
    ['hasPosts=true&isPrivate=true', ['dev_shoots', 'ananya_reads', 'meera.eats'], 3],
    ['hasPosts=true&isPrivate=true&search=EA&sortBy=username&order=asc&limit=1', ['ananya_reads'], 2],
  ])('matches source query %s', async (query, expected, total) => {
    const { body } = await request(app).get(`/users?${query}`).expect(200);
    expect(names(body.data)).toEqual(expected);
    expect(body.meta.total).toBe(total);
    expect(body.meta.totalPages).toBe(Math.ceil(total / body.meta.limit));
    for (const row of body.data) expect(Object.keys(row._count).sort()).toEqual(['likes', 'posts']);
  });
  it('counts authored posts and likes given, including users without posts', async () => {
    for (const [username, posts, likes] of [['riya_travels', 7, 4], ['dev_shoots', 2, 1], ['aditya_codes', 0, 2]]) {
      const { body } = await request(app).get(`/users/${user(username).id}`).expect(200);
      expect(body._count).toEqual({ posts, likes });
    }
    expect((await request(app).get('/users?hasPosts=true')).body.meta.total).toBe(10);
    expect((await request(app).get('/users?isPrivate=false')).body.meta.total).toBe(8);
  });
});

describe('post sorting and filters', () => {
  it.each([
    ['limit=2', [24, 23], 24], ['page=3', [4, 3, 2, 1], 24], ['order=asc&limit=3', [1, 2, 3], 24],
    ['location=goa', [23, 16, 10, 1], 4], ['search=SUNSET', [20, 8, 1], 3],
    ['from=2026-03-01&to=2026-04-01', [16, 15, 14, 13, 12, 11, 10, 9], 8],
    ['from=2026-04-01', [24, 23, 22, 21, 20, 19, 18, 17], 8],
    ['location=PUNE&search=CHAI&from=2026-03-01&to=2026-04-01', [15], 1],
    ['location=mumbai&order=asc&limit=2', [2, 6], 4],
    ['sortBy=likes&limit=5', [24, 1, 15, 10, 8], 24],
    ['sortBy=likes&order=asc&limit=3', [23, 21, 19], 24],
    ['location=goa&sortBy=likes', [1, 10, 23, 16], 4],
    ['location=Go', [], 0], ['search=zzzz', [], 0],
    ['from=2026-05-01&to=2026-03-01', [], 0],
    ['from=2026-03-07T13%3A40%3A00.000Z&to=2026-03-11T05%3A20%3A00.000Z', [10], 1],
  ])('matches source query %s', async (query, expected, total) => {
    const { body } = await request(app).get(`/posts?${query}`).expect(200);
    expect(keys(body.data)).toEqual(expected);
    expect(body.meta.total).toBe(total);
    expect(body.meta.totalPages).toBe(Math.ceil(total / body.meta.limit));
    for (const row of body.data) {
      expect(Object.keys(row.author).sort()).toEqual(summaryKeys);
      expect(row._count.likes).toBe(fixture.likes.filter((like) => like.postId === row.id).length);
    }
  });
  it('sorts by updatedAt in either direction', async () => {
    await prisma.post.update({ where: { id: post(5).id }, data: { updatedAt: new Date('2099-01-01') } });
    const desc = await request(app).get('/posts?sortBy=updatedAt&order=desc&limit=1').expect(200);
    expect(keys(desc.body.data)).toEqual([5]);
    const asc = await request(app).get('/posts?sortBy=updatedAt&order=asc&limit=50').expect(200);
    expect(keys(asc.body.data).at(-1)).toBe(5);
  });
  it('treats wildcard characters as literal search and location text', async () => {
    await request(app).post('/posts').send({ imageUrl: 'x', authorId: user('riya_travels').id,
      caption: '100%_done', location: 'Goa_100%' }).expect(201);
    expect((await request(app).get('/posts').query({ search: '%_' })).body.meta.total).toBe(1);
    expect((await request(app).get('/posts').query({ location: 'goa_100%' })).body.meta.total).toBe(1);
    expect((await request(app).get('/users').query({ search: '%' })).body.meta.total).toBe(0);
  });
});

describe('feeds and likes', () => {
  it('paginates authored posts without repeating the author', async () => {
    const id = user('riya_travels').id;
    const first = await request(app).get(`/users/${id}/posts?limit=3`).expect(200);
    expect(keys(first.body.data)).toEqual([23, 19, 16]);
    expect(first.body.meta).toEqual({ page: 1, limit: 3, total: 7, totalPages: 3 });
    expect(first.body.data.every((row) => !('author' in row) && row._count)).toBe(true);
    expect(keys((await request(app).get(`/users/${id}/posts?limit=3&page=3`)).body.data)).toEqual([1]);
    const empty = await request(app).get(`/users/${user('aditya_codes').id}/posts`).expect(200);
    expect(empty.body).toEqual({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    await error(request(app).get(`/users/${missing}/posts`), 404, 'User not found');
  });
  it('returns liked posts newest post first with author summaries', async () => {
    for (const [name, expected] of [['riya_travels', [24, 20, 10, 3]], ['neha_designs', [22, 15, 1]]]) {
      const { body } = await request(app).get(`/users/${user(name).id}/liked-posts`).expect(200);
      expect(keys(body.data)).toEqual(expected);
      expect(body.meta.total).toBe(expected.length);
      expect(body.data.every((row) => Object.keys(row.author).sort().join() === summaryKeys.join())).toBe(true);
    }
    const arjun = await request(app).get(`/users/${user('arjun_clicks').id}/liked-posts?limit=2`).expect(200);
    expect(keys(arjun.body.data)).toEqual([24, 14]);
    expect(arjun.body.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    const created = await request(app).post('/users').send({ username: 'new', email: 'new@x.com', fullname: 'New' });
    expect((await request(app).get(`/users/${created.body.id}/liked-posts`)).body.meta.totalPages).toBe(0);
    await error(request(app).get(`/users/${missing}/liked-posts`), 404, 'User not found');
  });
  it('lists likers as a sorted unpaginated array of summaries', async () => {
    const { body } = await request(app).get(`/posts/${post(1).id}/likes`).expect(200);
    expect(names(body)).toEqual(['arjun_clicks', 'isha_dances', 'meera.eats', 'neha_designs', 'vikram.trek']);
    expect(body.every((row) => Object.keys(row).sort().join() === summaryKeys.join())).toBe(true);
    expect(names((await request(app).get(`/posts/${post(24).id}/likes`)).body)).toEqual(
      ['aditya_codes', 'arjun_clicks', 'riya_travels', 'rohan_runs', 'sara_sketches', 'vikram.trek']);
    await request(app).get(`/posts/${post(5).id}/likes`).expect(200, []);
    await error(request(app).get(`/posts/${missing}/likes`), 404, 'Post not found');
  });
  it('likes once, rejects duplicates, and unlikes once', async () => {
    const postId = post(5).id;
    const userId = user('riya_travels').id;
    const { body } = await request(app).post(`/posts/${postId}/likes`).send({ userId, id: 999 }).expect(201);
    expect(body).toEqual({ userId, postId, createdAt: expect.any(String) });
    await error(request(app).post(`/posts/${postId}/likes`).send({ userId }), 409, 'Already liked');
    expect((await request(app).get(`/posts/${postId}`)).body._count.likes).toBe(1);
    expect(names((await request(app).get(`/posts/${postId}/likes`)).body)).toEqual(['riya_travels']);
    expect((await request(app).delete(`/posts/${postId}/likes/${userId}`).expect(204)).text).toBe('');
    await error(request(app).delete(`/posts/${postId}/likes/${userId}`), 404, 'Like not found');
  });
  it('orders validation and missing parent errors correctly', async () => {
    await error(request(app).post(`/posts/${missing}/likes`).send({}), 400, 'userId is required');
    await error(request(app).post(`/posts/${missing}/likes`).send({ userId: missing }), 404, 'Post not found');
    await error(request(app).post(`/posts/${post(1).id}/likes`).send({ userId: missing }), 404, 'User not found');
    await error(request(app).delete(`/posts/${missing}/likes/${missing}`), 404, 'Post not found');
    await error(request(app).delete(`/posts/${post(1).id}/likes/${missing}`), 404, 'User not found');
  });
  it('prevents concurrent duplicate likes at the database boundary', async () => {
    const postId = post(5).id;
    const userId = user('riya_travels').id;
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      request(app).post(`/posts/${postId}/likes`).send({ userId })));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.like.count({ where: { postId, userId } })).toBe(1);
  });
});

describe('cascades and exact seeding', () => {
  it('repeats seeding three times with exact records and real foreign keys', async () => {
    let previousId = fixture.users[0].id;
    for (let i = 0; i < 3; i++) {
      const result = await seed();
      expect([result.users.length, result.posts.length, result.likes.length]).toEqual([12, 24, 29]);
      expect(result.users[0].id).toBeGreaterThan(previousId);
      previousId = result.users[0].id;
    }
    const users = await prisma.user.findMany();
    const posts = await prisma.post.findMany({ include: { author: true } });
    const likes = await prisma.like.findMany({ include: { user: true, post: true } });
    expect([users.length, posts.length, likes.length]).toEqual([12, 24, 29]);
    for (const expected of seedUsers) {
      expect(users.find((row) => row.username === expected.username)).toMatchObject({ ...expected, createdAt: new Date(expected.createdAt) });
    }
    for (const { author, ...expected } of seedPosts) {
      expect(posts.find((row) => row.imageUrl === expected.imageUrl)).toMatchObject({
        ...expected, createdAt: new Date(expected.createdAt), author: { username: author },
      });
    }
    expect(likes.map((like) => `${like.user.username}:${like.post.imageUrl.split('/')[4]}`).sort())
      .toEqual(seedLikes.map((like) => `${like.user}:${like.post}`).sort());
  });
  it('refuses seeds without opt-in or in production', () => {
    const oldAllow = process.env.ALLOW_DESTRUCTIVE_SEED;
    const oldEnv = process.env.NODE_ENV;
    try {
      process.env.ALLOW_DESTRUCTIVE_SEED = 'false';
      expect(assertSeedAllowed).toThrow('Seeding requires');
      process.env.ALLOW_DESTRUCTIVE_SEED = 'true';
      process.env.NODE_ENV = 'production';
      expect(assertSeedAllowed).toThrow('Seeding requires');
    } finally {
      process.env.ALLOW_DESTRUCTIVE_SEED = oldAllow;
      process.env.NODE_ENV = oldEnv;
    }
  });
  it('cascades user → posts → likes and likes given exactly as the relations lab', async () => {
    const riya = user('riya_travels').id;
    await request(app).delete(`/users/${riya}`).expect(204);
    expect((await request(app).get('/users?limit=1')).body.meta.total).toBe(11);
    expect((await request(app).get('/posts?limit=1')).body.meta.total).toBe(17);
    expect(keys((await request(app).get('/posts?location=goa')).body.data)).toEqual([10]);
    const popular = (await request(app).get('/posts?sortBy=likes&limit=3')).body.data;
    expect(keys(popular)).toEqual([24, 15, 17]);
    expect(popular.map((row) => row._count.likes)).toEqual([5, 3, 2]);
    expect(names((await request(app).get(`/posts/${post(10).id}/likes`)).body)).toEqual(['ananya_reads', 'kabir_sings']);
    expect(names((await request(app).get(`/posts/${post(24).id}/likes`)).body)).toEqual(
      ['aditya_codes', 'arjun_clicks', 'rohan_runs', 'sara_sketches', 'vikram.trek']);
    expect((await request(app).get(`/users/${user('arjun_clicks').id}`)).body._count).toEqual({ posts: 4, likes: 2 });
    await error(request(app).get(`/users/${riya}/posts`), 404, 'User not found');
    expect(await prisma.like.count()).toBe(16);
  });
  it('cascades post deletion to its likes but preserves users', async () => {
    await request(app).delete(`/posts/${post(24).id}`).expect(204);
    expect(await prisma.like.count()).toBe(23);
    expect(await prisma.user.count()).toBe(12);
  });
  it('enforces foreign keys independently of HTTP validation', async () => {
    await expect(prisma.post.create({ data: { imageUrl: 'x', authorId: missing } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.like.create({ data: { userId: missing, postId: post(1).id } })).rejects.toMatchObject({ code: 'P2003' });
  });
});
