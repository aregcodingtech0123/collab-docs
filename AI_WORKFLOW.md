# AI Workflow

## Tools used

## How I used AI

## Principles (what I delegated vs. did myself)

## Running log

| Date | Task | AI output | What I changed / rejected | How I verified |
| ---- | ---- | --------- | ------------------------- | -------------- |
| 2026-11-18 | Project scaffold (Next.js, Drizzle schema, stubs, `permissions.ts`) | Full file structure, schema + initial migration, pure permission functions | Kept the generator's `cacheComponents` default (later reversed, see below); bumped `@types/node` to ^22 instead of `--force` for Vitest; scoped `lint` to `src tests` after ESLint walked into `node_modules` | `build`, `lint`, `tsc` pass; read generated SQL; smoke-ran the permission matrix with `tsx` |
| 2026-11-18 | Fix `Could not validate instant` error on `/` | Moved the `/` redirect to `src/proxy.ts` (plus `constants.ts`) | Rejected the `<Suspense>` + `redirect()` variant after `curl` showed it only produces a 200 with a 1 s `<meta refresh>`; later removed the proxy entirely (next row) | `curl` against the dev server: real 307 to `/login` / `/documents` |
| 2026-11-18 | Turn `cacheComponents` off | Removed `cacheComponents` + `partialPrefetching`, the Suspense wrapper on the editor page, `proxy.ts`, `constants.ts`; `/` is a plain dynamic page again | Decision is mine: every page reads the per-user cookie, so Cache Components only added constraints. Reworded comments that referred to it | `next build` shows `/` as dynamic and no "Cache Components enabled"; `next start` + `curl`: `/` still returns 307 to the right place |
| 2026-11-18 | Config cleanup (`vitest.config.mts`, `engines`, lint script) | Renamed config, added `engines.node >=20.12`, `eslint src tests "*.config.*"` | Checked that the wider lint glob does not pull in `node_modules` before keeping it | `npm test` has no ESM warning; `npm run lint` exit 0 |
| 2026-11-18 | Permission unit tests | 27 Vitest tests (`it.each` matrix: owner / editor / viewer / stranger / signed out, owner-in-shares, user-id matching, per-document scoping) | Wrote a "fails closed on unknown permission" test first: it failed 5/5 because `getRole` treated any non-`editor` share as `viewer`. Fixed `getRole` to grant `viewer` only for an explicit `"viewer"`. The "share for a different document" case cannot be expressed in these signatures (shares carry no `documentId`), so it is tested as isolation between two contexts and noted as the caller's job | Saw the 5 failures before the fix and 27/27 after; `lint`, `tsc`, `build` pass |
| 2026-11-18 | Remove `neon.ts`, `@neon/config`, `@neon/env`, `.neon` | Decided they were unused after `neon init` | Grepped: only `neon.ts` imported `@neon/config`; nothing imported `@neon/env`; `neon deploy` never ran and we connect with `@neondatabase/serverless` + Drizzle on Vercel. Also stripped a UTF-8 BOM my own `.gitignore` rewrite had introduced | `git grep`, `npm run build` still passes, `.gitignore` diff is one line |
| 2026-11-18 | Verify the Neon database | One-off script (not committed) querying `pg_catalog` / `information_schema` | Printed only schema facts, never the connection string; deleted the script afterwards | Confirmed 3 tables, `share_permission` enum, `UNIQUE (document_id, user_id)`, `ON DELETE CASCADE`, 1 applied migration |
| 2026-11-18 | Validation schemas + tests | zod schemas, `parseJson`, 63 tests | Default zod messages omit the field name, so added `formatZodError`; made `content` require at least one node (a bare `{type:"doc"}` would not load in TipTap); my own test about the path prefix was wrong (the message already named the field) and I fixed the test, not the code | `npm test` |
| 2026-11-18 | Seed script | Idempotent upserts + fixed UUIDs; sample data in a pure module | Added a test that validates the seed JSON against the real TipTap schema (`getSchema` + `nodeFromJSON().check()`); added `@tiptap/core` as a direct dependency because the test imports it | Ran `db:seed` twice: same 3 documents / 2 shares both times |
| 2026-11-18 | Mock auth + login page | Cookie holds user id; DB lookup per request | Rejected trusting the cookie value blindly: malformed ids are treated as signed out (otherwise an invalid uuid reaches Postgres and returns a 500); documented the spoofing risk in `auth.ts` and `ARCHITECTURE.md` | e2e: tampered cookie and unknown id both return 401 |
| 2026-11-18 | Documents + shares API | Handlers plus `lib/documents.ts` (single access path) | Kept the share lookup filtered by BOTH document_id and user_id; kept the `content` column out of permission checks to avoid transferring up to 1 MB per request; PATCH checks access before reading the body | 93-check e2e script against `next start`: all pass, including "an editor share on document A does not leak to document B" |
| 2026-11-18 | Spotted a Neon connection string with credentials in `.env.example` | Flagged it, left the file unstaged and did not commit it | Did not use it for DB verification: the task said to use `.env.local`, which does not exist yet | `git diff` / `git status`; HEAD still has `DATABASE_URL=` |

## Reflections
