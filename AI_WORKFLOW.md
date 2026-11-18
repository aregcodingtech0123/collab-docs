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
| 2026-11-18 | Spotted a Neon connection string with credentials in `.env.example` | Flagged it, left the file unstaged and did not commit it | Did not use it for DB verification: the task said to use `.env.local`, which does not exist yet | `git diff` / `git status`; HEAD still has `DATABASE_URL=` |

## Reflections
