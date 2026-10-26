# InstaLite

Express REST backend combining the CRUD, filtering/pagination, and relations labs.
It supports users, authored posts, likes, feeds, deterministic seeds, and cascading
deletion. There is no authentication or authorization in the assignment: this is
a development/learning API, not an authenticated production service.

## Stack and layout

Node.js (22.12+; Node 24 LTS recommended), npm, Express 5, Prisma 7.10.1,
PostgreSQL, `@prisma/adapter-pg`, JavaScript ES modules, Vitest and Supertest.
The workspace was empty; no existing database or application was replaced.
`package-lock.json` pins the installed dependencies.

| File/directory | Responsibility |
| --- | --- |
| `src/index.js` | Express app, JSON parser, router mounts, health, server lifecycle |
| `src/db.js` | One shared Prisma Client, dotenv, PostgreSQL adapter and schema |
| `src/routes/` | HTTP methods and controller bindings |
| `src/controllers/` | Request input, validation, service calls and HTTP responses |
| `src/services/` | Prisma queries, business logic and transactions |
| `src/services/selections.js` | Shared nested user summaries and relation counts |
| `src/utils/` | Body allow-lists, IDs, dates, query validation and pagination |
| `src/middleware/error-handler.js` | Safe, consistent JSON errors |
| `prisma/schema.prisma` | User, Post and Like models |
| `prisma/migrations/` | Versioned SQL migrations |
| `prisma/seed-data.js`, `prisma/seed.js` | Exact lab dataset and transactional bulk seeding |
| `tests/` | Unit and real PostgreSQL HTTP integration tests |
| `scripts/test.js` | Dedicated test database checks and isolated schema lifecycle |
| `IMPLEMENTATION.md` | Requirement mapping, reconciliation notes and verification |

## Install and configure

Have a PostgreSQL server running and create development and test databases using
your existing local PostgreSQL role. For example, when your local role is allowed
to create databases:

```sh
createdb instalite
createdb instalite_test
npm ci
cp .env.example .env
```

Edit `.env` to set real `DATABASE_URL` and `TEST_DATABASE_URL` values. The example
contains placeholders, not credentials. Never commit `.env`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for the API, migrations and seed |
| `TEST_DATABASE_URL` | Dedicated local database whose name ends in `_test` |
| `PORT` | HTTP port; defaults to `3000` |
| `NODE_ENV` | `development`, `test` or `production` |
| `ALLOW_DESTRUCTIVE_SEED` | Set to `true` only when intentionally replacing development fixtures |

Prisma 7 reads its CLI URL and seed command from `prisma.config.js`; the shared
client receives the URL through the PostgreSQL driver adapter. `prisma-client-js`
generates executable JavaScript in `@prisma/client`, preserving a plain JS runtime.
See the official [Prisma driver adapter documentation](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers).

```sh
npm run db:validate
npm run generate
npm run db:migrate
# Set ALLOW_DESTRUCTIVE_SEED=true in .env only for this development database.
npm run seed
npm start
```

The default startup message is `Server started on port 3000`. The server checks
the database before listening and exits with code 1 on startup failure. SIGINT
and SIGTERM stop accepting requests and disconnect Prisma after requests finish.

```sh
curl -i http://localhost:3000/health
# HTTP 200, {"status":"OK"}
npm run dev                       # watch source changes
npm run db:status                 # inspect applied migrations
npm run db:migrate:dev -- --name your_change
npm run db:studio
```

### Local environment prepared during implementation

This checkout already has installed dependencies and an ignored `.env` pointing
to the newly created PostgreSQL cluster on `127.0.0.1:55439`. Its role is
`instalite`, its databases are `instalite` and `instalite_test`, and its data
directory is `/private/tmp/instalite-pg-01a17675`. This disposable cluster uses
local development trust authentication and listens only on loopback. No existing
database was touched. The development database contains the original seed data.
The API can be started with `npm start`.

If the cluster is stopped but its temporary directory still exists:

```sh
/Library/PostgreSQL/18/bin/pg_ctl -D /private/tmp/instalite-pg-01a17675 \
  -l /private/tmp/instalite-pg-01a17675/server.log \
  -o '-h 127.0.0.1 -p 55439 -k /private/tmp' start
```

Stop this cluster when finished:

```sh
/Library/PostgreSQL/18/bin/pg_ctl -D /private/tmp/instalite-pg-01a17675 stop
```

Temporary storage can be cleared by the OS. For durable development, configure
your normal PostgreSQL instance using the setup steps above.

## Database model and migrations

- `User`: generated integer ID, unique username and email, required fullname,
  nullable bio, default-public profile, created/updated timestamps.
- `Post`: generated integer ID, required image URL and author, nullable caption
  and location, created/updated timestamps. `authorId` is indexed.
- `Like`: explicit join with composite primary key `(userId, postId)`, creation
  timestamp and index on `postId`. There is no separate like ID. Its primary key
  also indexes queries beginning with `userId`.
- Deleting a user cascades to their posts and likes given. Deleting a post
  cascades to likes on it. The database enforces all foreign keys and uniqueness.

The three migrations are `init_users_posts`, `add_post_author` and `add_likes`.
`npm run db:migrate` applies them without resetting or seeding. A fresh schema
has no posts at the point when the required author column is added.

### Upgrading an existing populated lab database

Do not blindly apply these fresh-project migrations to an existing database or
run a reset. Back up the database and preserve/baseline its existing migration
history first. In its own migration history, add `authorId` as nullable, backfill
each existing post using a verified ownership mapping, verify that every post
references an existing user, and only then add the NOT NULL constraint, foreign
key, and index. Stop for a data decision if ownership cannot be determined.
Follow with the Like migration. Do not invent placeholder authors.

The supplied `add_post_author` deliberately fails on populated legacy posts;
it neither guesses ownership nor deletes them. Never edit migrations already
applied to a deployment. Use reviewed forward migrations there.

## Endpoints

All errors are JSON `{ "error": "message" }`. A successful DELETE has no body.
The API's generated integer resource IDs must be positive 32-bit integers.

| Method | Path | Result / accepted input |
| --- | --- | --- |
| GET | `/health` | 200 `{ "status": "OK" }` |
| POST | `/users` | 201; required username, email, fullname; optional bio |
| GET | `/users` | 200 paginated users with post and like counts |
| GET | `/users/:id` | 200 user with `_count.posts` and `_count.likes`; 404 |
| PATCH | `/users/:id` | 200; fullname, bio, isPrivate only; 404 |
| DELETE | `/users/:id` | 204; cascades to posts and likes; 404 |
| GET | `/users/:id/posts` | 200 paginated authored posts, newest first; 404 |
| GET | `/users/:id/liked-posts` | 200 paginated liked posts, newest post first; 404 |
| POST | `/posts` | 201; required imageUrl and authorId; optional caption, location |
| GET | `/posts` | 200 paginated posts, author summaries and like counts |
| GET | `/posts/:id` | 200 post, author summary and like count; 404 |
| PATCH | `/posts/:id` | 200; caption and location only; 404 |
| DELETE | `/posts/:id` | 204; cascades to likes; 404 |
| GET | `/posts/:id/likes` | 200 unpaginated array of user summaries, username ascending; 404 |
| POST | `/posts/:id/likes` | 201 Like object; body requires userId; 400/404/409 |
| DELETE | `/posts/:id/likes/:userId` | 204; missing post/user/like gives a specific 404 |

Unapproved body fields are ignored. Clients cannot supply primary keys or
timestamps, create private profiles, or modify usernames/emails/images/authors
through PATCH. Missing required creation fields give 400. Nullable bio, caption
and location accept `null`. Other invalid editable field types give 400.

Nested users contain **only** `id`, `username` and `fullname`; no nested email.
`_count.likes` on a user counts likes **given**. On a post it counts likes received.
Authored-post feeds contain `_count.likes` without repeating the author summary.
Liked-post feeds include both the author summary and like count.

### Request examples

```sh
curl -i -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"username":"new_user","email":"new@example.com","fullname":"New User","bio":"Hello"}'

# Replace USER_ID and POST_ID with IDs returned by the API; IDs change after seed.
curl -i -X PATCH localhost:3000/users/USER_ID -H 'Content-Type: application/json' \
  -d '{"isPrivate":true,"bio":null}'
curl -i -X POST localhost:3000/posts -H 'Content-Type: application/json' \
  -d '{"imageUrl":"https://example.com/photo.jpg","authorId":USER_ID,"caption":"Sunset","location":"Goa"}'
curl -i -X PATCH localhost:3000/posts/POST_ID -H 'Content-Type: application/json' \
  -d '{"caption":"Updated caption","location":null}'
curl -i -X POST localhost:3000/posts/POST_ID/likes -H 'Content-Type: application/json' \
  -d '{"userId":USER_ID}'
curl -i -X DELETE localhost:3000/posts/POST_ID/likes/USER_ID
```

## Pagination, sorting and filters

Users, posts, user-post feeds and liked-post feeds share this response:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

`page=1` and `limit=10` are defaults. Both accept positive decimal integers only.
Limits above 50 are capped. Invalid, repeated, decimal, negative or zero values
give 400. Pages must fit JavaScript's safe integer/offset range. A page beyond
the result set returns 200 with empty data and the correct filtered total.
Each page and count execute in one repeatable-read transaction, so they see the
same database snapshot. Rows are filtered, sorted and paginated in PostgreSQL.

| Parameter | Users | Posts |
| --- | --- | --- |
| `sortBy` | createdAt (default), username, fullname | createdAt (default), updatedAt, likes |
| `order` | desc (default), asc | desc (default), asc |
| `search` | Case-insensitive substring of username OR fullname | Case-insensitive substring of caption |
| `isPrivate` | Exactly true or false | — |
| `hasPosts` | true: at least one post; false: none | — |
| `location` | — | Case-insensitive exact match |
| `from` | — | Inclusive createdAt lower bound |
| `to` | — | Exclusive createdAt upper bound |

All filters combine with sorting and pagination. `sortBy=likes` always breaks
ties by newer posts first, even in ascending order. IDs provide a final stable
tie-breaker. Dates accept `YYYY-MM-DD` or ISO timestamps with seconds and an
explicit timezone (`Z` or an offset); impossible calendar dates are rejected.
An inverted valid range returns no matches. SQL wildcard characters in search
or location are treated literally. Feeds support page/limit and retain their
specified newest-post-first order.

```sh
curl -s 'localhost:3000/users?hasPosts=true&isPrivate=true&sortBy=username&order=asc&limit=2'
curl -s 'localhost:3000/users?search=SH&isPrivate=false&sortBy=fullname&order=asc'
curl -s 'localhost:3000/posts?location=goa&sortBy=likes'
curl -s 'localhost:3000/posts?from=2026-03-01&to=2026-04-01&search=chai'
curl -s 'localhost:3000/users/USER_ID/posts?limit=3&page=2'
curl -s 'localhost:3000/users/USER_ID/liked-posts?limit=2'
```

### Required error messages

| Status | Error |
| --- | --- |
| 400 | `username, email and fullname are required` |
| 400 | `imageUrl and authorId are required` |
| 400 | `userId is required` |
| 400 | `page and limit must be positive integers` |
| 400 | `sortBy must be one of: createdAt, username, fullname` |
| 400 | `sortBy must be one of: createdAt, updatedAt, likes` |
| 400 | `order must be asc or desc` |
| 400 | `isPrivate must be true or false` |
| 400 | `hasPosts must be true or false` |
| 400 | `from and to must be valid dates` |
| 404 | `User not found`, `Post not found`, or `Like not found` |
| 409 | `username or email already taken` |
| 409 | `Already liked` |

Like creation validates the body first, then post existence, then user existence.
It attempts the insert and translates the composite-key violation into 409.
Parent rows are key-share locked until the operation commits. Concurrent likes
cannot create duplicates. Unlike distinguishes missing post, user, and Like.

Malformed JSON gives 400 `Invalid JSON body`, invalid IDs/types give descriptive
400 errors, oversized bodies give 413, unsupported body encodings give 415,
database connection failures give 503 `Database unavailable`, and unexpected
errors give 500 `Internal server error`. Responses never expose raw Prisma errors,
stack traces or connection strings.

## Seeding and verification

`npm run seed` intentionally deletes all likes, posts and users, in that order.
It is refused in production or without `ALLOW_DESTRUCTIVE_SEED=true`. The
replacement happens atomically in one transaction. It uses one
`createManyAndReturn` per model, resolves authors by username and posts by their
`insta##` URL key, and prints actual returned counts:

```text
🌱 Seeded 12 users, 24 posts and 29 likes
```

The dataset preserves the lab's timestamps, nullable fields, captions, emojis,
locations (including lowercase `goa` on insta16) and all like relationships.
`updatedAt` and Like timestamps use database/Prisma defaults because the source
does not prescribe their values. Auto-increment IDs are deliberately not reset.
The CLI seed disconnects on success and failure and exits 1 when it fails.

```sh
npm run check          # JavaScript syntax checks
npm run db:validate    # Prisma schema
npm run generate       # generate the matching client
npm run test:unit      # no database needed
npm test               # full suite, real PostgreSQL through TEST_DATABASE_URL
```

The integration runner never falls back to the application URL. It requires a
local database ending in `_test`, creates a random schema, deploys all migrations,
runs tests, then drops only its own schema. Tests verify CRUD, exact errors,
protected fields, malformed input, all filters and sorts, date boundaries,
pagination, summaries, counts, feeds, concurrent duplicate likes, foreign keys,
three repeat seed runs, exact seed values, and cascading deletes. The unit suite
covers input edge cases and safe database-error responses.

The implementation run passed 114 tests (75 integration, 39 unit), schema
validation, client generation, and three actual CLI seed invocations. See
`IMPLEMENTATION.md` for the final live smoke-check and migration results.
