# Architecture

## Overview

## Data model

Three tables (`src/db/schema.ts`, migrations in `drizzle/`):

- `users` (id, name, unique email)
- `documents` (id, owner_id → users, title, `content` jsonb = TipTap JSON, created_at, updated_at)
- `document_shares` (id, document_id → documents **ON DELETE CASCADE**, user_id → users,
  permission enum `viewer | editor`, **UNIQUE (document_id, user_id)**)

Ownership is `documents.owner_id`; it is never stored as a share. The unique constraint is what
makes "share again" an upsert (`INSERT ... ON CONFLICT (document_id, user_id) DO UPDATE`).

## Permissions model

| Role   | view | edit | share / unshare | delete |
| ------ | :--: | :--: | :-------------: | :----: |
| owner  | yes  | yes  | yes             | yes    |
| editor | yes  | yes  | no              | no     |
| viewer | yes  | no   | no              | no     |
| none   | no   | no   | no              | no     |

- The rules are pure functions in `src/lib/permissions.ts` (unit-tested, no DB).
- **One code path decides access:** every document and share handler calls
  `requireDocumentAccess()` in `src/lib/documents.ts`. It loads the document joined with *only the
  caller's own share row* (joined on both `document_id` and `user_id`), asks `permissions.ts` for
  the role, and throws the right error. A share on another document, or for another user, cannot
  reach the permission functions.
- **Status codes:** missing document *or* no access at all → `404` (existence is not leaked);
  can view but lacks the permission → `403`; not signed in → `401`.
- `getRole` fails closed: a share with an unrecognised permission value grants nothing.
- Permission checks do not load the `content` column (it can be up to 1 MB); only
  `GET /api/documents/:id` reads it.

## Authentication (seeded users)

Mock auth, on purpose. Three seeded users; the login page lists them and `POST /api/auth/login`
sets an httpOnly cookie (`collab_user_id`, `SameSite=Lax`, `Path=/`, 7 days, `Secure` in
production) whose value is the user's id. On every request the user is looked up in the database,
so a cookie for an unknown user, or a malformed one, is simply "signed out" (401).

### Deliberate cuts

| Cut | Consequence | What we would do in production |
| --- | ----------- | ------------------------------ |
| The cookie is a plain user id: no signature, no password, no server-side session | Anyone who knows or guesses a user id (UUIDs are random but not secret: they appear in API responses) can set the cookie and act as that user. | Real authentication (email + password/passkeys, magic link or OAuth, e.g. Auth.js / Clerk / Neon Auth) issuing an opaque session token or signed/encrypted cookie, stored and revocable server-side, with expiry and rotation. |
| No CSRF protection beyond `SameSite=Lax` | A cross-site `POST`/`PATCH` is blocked by Lax cookies in modern browsers, but there is no token or `Origin` check. | CSRF token or strict `Origin`/`Sec-Fetch-Site` validation on state-changing routes. |
| `GET /api/users` and the login page list every user's email | Fine for a three-user demo; a user directory leak in a real product. | Share by invitation / search scoped to the org; never enumerate users. |
| No rate limiting or login throttling | The API can be hammered. | Per-IP / per-user limits (e.g. Upstash Ratelimit on Vercel). |

## API surface

See the table in [README.md](./README.md#api-overview). Every handler: authenticate
(`requireUser`) → validate the `:id` param and JSON body with zod (`src/lib/validation.ts`) →
authorize (`requireDocumentAccess`) → query → respond; any thrown error goes through
`handleApiError`, which maps `ApiError` / `ZodError` to JSON and hides unknown errors as a 500.

## Editor and autosave

## File import

## Key decisions and trade-offs

- **Cache Components off.** Every page depends on the per-user cookie, so prerendering/caching
  has nothing to offer and only adds `<Suspense>` constraints.
- **`@neondatabase/serverless` over HTTP + Drizzle.** Fits Vercel's serverless model with no
  connection management. Trade-off: no interactive transactions, so writes are single statements
  (upserts) or `db.batch()`.
- **Mock auth** (see above) to keep the focus on ownership, sharing and permission enforcement.
- **Last write wins** for content saves; there is no real-time collaboration or conflict
  resolution.

## What I would do with more time
