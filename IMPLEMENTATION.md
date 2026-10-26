# Implementation checklist

Repository audit: the supplied workspace was empty (no package.json, schema,
environment, migrations, source, tests, Git history, or AGENTS.md). Node 26.3.0,
npm 11.16.0 and PostgreSQL 18 binaries are available. Nothing is being replaced.
Use npm, ESM JavaScript, Express 5 and Prisma 7 with the PostgreSQL driver adapter.
PostgreSQL supports the required case-insensitive queries and bulk-returning inserts.

| Source requirement | Implementation | Verification |
| --- | --- | --- |
| CRUD lab: health, startup, shared client | src/index.js, src/db.js | HTTP health test and startup smoke check |
| CRUD lab: user CRUD and field allow-lists | users routes/controller/service, validation utility | integration tests: user CRUD, duplicates, protected fields, missing records |
| CRUD + relations: post CRUD and required author | posts routes/controller/service | integration tests: author FK, partial updates, missing records |
| Query lab: pagination, sorting, filters, dates | utils/pagination.js, utils/queries.js, services | integration tests: source examples, invalid queries, combined filters, boundaries |
| Relations: schema, cascades, composite key, indexes | prisma/schema.prisma, migrations | schema validation, migration deployment, integration tests |
| Relations: nested summaries and counts | services/selections.js, users/posts services | integration tests: exact nested keys and counts |
| Relations: user posts and liked feed | users routes/controller, posts service | integration tests: source feed order and metadata |
| Relations: list likes, like, unlike | likes routes/controller/service | integration tests: ordering, missing parents, concurrent duplicate insert |
| Query + relations: exact seed data and repeatability | prisma/seed-data.js, seed.js | three seed runs, record comparison, counts, FK checks |
| Master request: input security and consistent failures | utils/validation.js, middleware/error-handler.js | integration and unit tests: malformed JSON/IDs/types, database failures |
| Master request: setup, scripts, endpoint inventory | package.json, .env.example, README.md | documented commands and final verification report |

## Reconciliation decisions

- Later query and relations labs supersede original plain-array lists and posts
  without authors. Only the likes list remains an unpaginated array, username ASC.
- The master request explicitly distinguishes missing post/user/like on DELETE
  likes; it takes precedence over the older lab's single missing-like case.
- The final entry point is src/index.js; inconsistent server.js/app.js references
  in the labs do not create extra entry points.
- Seed values are copied from the relations document; only the CommonJS export
  is adapted to ESM. Like timestamps are database defaults, as in that dataset.
- Fresh workspace: initial tables, add_post_author, and add_likes migrations.
  No existing database is reset. The author migration refuses populated posts;
  an existing deployment must first backfill known authors (see README).
- Tests use a dedicated local instalite_test database; the test runner creates
  an isolated schema for each invocation and removes only that schema afterward.

## Verification — completed 2026-10-26

All requirements in the table above are implemented and verified. Commands and
results from the actual local run:

| Command/check | Result |
| --- | --- |
| `npm install` | Installed dependencies and created package-lock.json |
| `npm ls --depth=0` | Express 5.3.0, Prisma/client/adapter 7.10.1, pg 8.23.1, dotenv 17.4.2, Vitest 4.1.12, Supertest 7.3.1 |
| `npm run db:validate` | Schema valid |
| `npm run generate` | Generated Prisma Client 7.10.1 |
| `npm run db:migrate` | Applied all three migrations to the new development database |
| `npm run db:status` | Database schema up to date |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | No difference detected, exit 0 |
| `npm run seed` three times | Each printed exactly `🌱 Seeded 12 users, 24 posts and 29 likes` |
| `npm run check` | All project JavaScript syntax checks passed |
| `npm run test:unit` | 39 tests passed without a database |
| `npm test` | 114 tests passed: 75 integration and 39 unit; final rerun also passed |
| Source seed comparison | Byte-for-byte match to the relations document's JS block, except ESM export |
| `npm start` | Printed `Server started on port 3000` |
| Live `/health` and popular-post HTTP checks | 200; health JSON and insta24/01/15/10/08 order matched |
| Real refused database connection | `/users` returned 503 with only `Database unavailable` |
| Startup with refused database connection | Safe startup error and expected exit 1 |
| Large page `2147483648` | 200 with empty data |
| Post-test database checks | Development still has 12/24/29 records; no temporary test schemas remain |

The initial sandbox blocked npm DNS and PostgreSQL shared-memory initialization;
approved tool escalation resolved both. No application check remains blocked.
No original database, production system, or user data was accessed or reset.

## Delivery state and practical limits

- API running on port 3000; isolated development PostgreSQL running on loopback
  port 55439. The ignored local .env is configured for these created databases.
- PostgreSQL storage is disposable under /private/tmp/instalite-pg-01a17675.
  README documents restarting/stopping it and setting up durable development.
- No authentication is implemented because it is outside the requested scope.
- No unresolved implementation or test failures. No existing-schema backfill was
  performed because the workspace was empty; the upgrade procedure is documented.
