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

## Pages and rendering

- `/documents` is a server component that calls the same `listDocuments()` as the API (no
  self-fetch). `/documents/[id]` is a server component that loads the document through
  `requireDocumentAccess()` and hands it to a client `Editor`.
- Signed out → redirect to `/login` (checked in the layout **and** in each page, because layouts
  are not re-rendered on every navigation). Missing document, malformed id and "no access" all go
  through `notFound()`, so they look identical.
- `getCurrentUser()` is wrapped in React `cache()`: the layout, the page and `generateMetadata`
  share one user lookup per request.
- **Known framework behaviour:** in this Next version, a `notFound()` thrown by a dynamic page
  responds with HTTP 404 but the server HTML is Next's client-render shell
  (`<html id="__next_error__">`); the not-found UI, with the app header, appears once JS runs. I
  reproduced it with a bare `notFound()` page, so it is not caused by this app. Adding a
  `loading.tsx` renders the not-found HTML on the server but makes the status 200, so I kept the
  404 status and did not add one.

## Editor and autosave

- **Editor:** TipTap with one shared extension list (`src/lib/tiptap.ts`), `immediatelyRender:
  false` to avoid hydration mismatches. Viewers get `editable: false`, no toolbar and no autosave.
- **Autosave** (`src/lib/autosave.ts`, a plain class so it can be unit-tested with fake timers):
  - the editor only calls `markDirty()` on real edits (TipTap's `onUpdate` does not fire for the
    initial content), so nothing is saved on load;
  - debounced 800 ms; flushed on blur and when the tab is hidden; `beforeunload` warns only while
    `hasUnsaved()`;
  - **one request in flight**: edits made meanwhile set a dirty flag, and when the request ends
    the loop reads the editor's *current* content and sends it. Older content therefore cannot
    overwrite newer content, and there is never more than one PATCH at a time;
  - a save is skipped when the content equals what was last saved;
  - failures: network/5xx/400 keep the edits and offer Retry; 401, 403 and 404 stop autosaving and
    show a clear message (signed out / no longer permitted / no longer available).
- **Title** is saved separately from content (`RenameTitle`), on blur or Enter. The two PATCHes
  touch different columns, so they cannot clobber each other.
- **Last write wins:** two people editing the same document at the same time can overwrite each
  other's changes (there is no merge). Autosave only guarantees a single client's ordering.

## Sharing

- **Model:** a share is one row `(document, user, permission)`, with `permission` = `viewer` or
  `editor`; the owner is `documents.owner_id` and never has a share row. Sharing again with the
  same person is an upsert, so there is at most one row per person per document.
- **Who can manage it:** only the owner. The API enforces it (`requireDocumentAccess(..., "share")`:
  403 for editors/viewers, 404 for strangers); the UI only hides the Share button, it is not the
  security boundary.
- **Dialog (`ShareDialog`)** talks to the same API as everything else and keeps its own list in
  state, so every change shows up immediately and nothing reloads the page. The "who can I add"
  list is computed in a pure function (`lib/shares.ts`: everyone except the owner and people already
  shared with); typing an email still goes through the server, which rejects the owner and unknown
  users, and the UI turns those errors into sentences (`describeShareError`).
- **Revocation** takes effect on the next request: the removed person's open editor gets a 403/404
  from autosave and says so; reloading shows the not-found page.
- **Accessibility:** `ui/Dialog` is the native `<dialog>` opened with `showModal()` (page behind
  is inert, Esc closes, `aria-labelledby`), plus explicit Tab/Shift+Tab wrap-around because a
  modal dialog alone still lets Tab escape to the browser UI, and focus is returned to the opener.

## File import

Pipeline (`src/lib/import/`): `upload.ts` (read the multipart body) → `parseImport()` in
`index.ts` (type, size, emptiness) → a parser → `tiptapDocSchema` (the same check PATCH uses) →
insert.

- **Parsers:** `.txt` is converted directly (blank line = paragraph, newline = hard break).
  `.md` goes through `marked` and `.docx` through `mammoth` (with underline mapped and images
  not inlined); both produce **HTML**, which is turned into TipTap JSON by `generateJSON()` from
  `@tiptap/html/server` using the **shared extension list** (`src/lib/tiptap.ts`).
- **Sanitization is the schema, not a regex.** The editor schema has exactly: paragraph, heading
  1-2, bullet/ordered list, list item, hard break, bold, italic, underline. HTML that has no
  place in that schema (script, style, iframe, img, table, links, code, quotes, ...) cannot be
  represented and is dropped by ProseMirror's parser; the editor and the importer can never
  disagree about what is allowed because they use the same extensions. (This meant switching off
  StarterKit's link, code, code block, quote, rule and strike extensions, which the toolbar never
  offered.) Headings 3-6 are given a parse rule that maps them to level 2 instead of losing
  them. Empty paragraphs left behind by dropped content (an image on its own line) are removed.
- **Never a 500 for bad input:** unsupported type, empty/whitespace-only, binary data, corrupt
  `.docx` (random bytes, truncated, or a ZIP that is not Word), "no importable text" (e.g. a file
  that is only an image) and over-limit content are all `ApiError` 400/413 with a message written
  for users.
- **Upload size:** 2 MB per file. `readUploadedFile` refuses by `Content-Length` before reading
  and otherwise counts bytes while streaming. A moderately oversized upload (up to 16 MB) is read
  and *discarded* so the client gets a clean 413 instead of a connection reset (found while
  testing: hanging up mid-upload made the next request on the same connection fail); anything
  bigger is cut off immediately and the client may just see the connection close.
- **Known limits:** a `.docx` is a ZIP, so a deliberately crafted "zip bomb" under 2 MB could
  expand to a lot of memory while mammoth reads it. There is no decompressed-size guard; on
  Vercel the function memory limit and timeout are the backstop. A production version should
  check the decompressed size before parsing.

## Robustness: bad input is never a 500

A fuzz suite (`scripts/e2e/api-fuzz.mjs`, 281 cases) sends broken JSON, wrong content types,
oversized and odd values, strange ids and cookies to every route. It found three real problems,
now fixed and covered by unit tests:

- **Text Postgres cannot store** (a NUL character, an unpaired surrogate) in a title or inside
  document content made the insert throw, which was a 500. `lib/jsonSafety.ts` walks the parsed
  JSON and the schemas reject it with a readable 400.
- **Absurd nesting** (hundreds or thousands of levels) was accepted. Content is now limited to 64
  levels of nesting; the walk is iterative so a deep payload cannot overflow the stack.
- **A malformed percent-escape in a dynamic URL segment** (`/documents/%E0%A4%A`) made Next throw
  a 500 before any of our code ran. `src/proxy.ts` (Next's pre-routing hook) answers 400.

Unexpected server errors are logged on the server and answered with a generic
`{"error":{"code":"internal_error","message":"Something went wrong"}}`; nothing about the
database, paths or stack traces reaches a client. A missing `DATABASE_URL` is the typical
example: the log says exactly what to set, the browser sees nothing specific.

## Testing strategy

- **Unit tests (`npm test`, ~300):** the pure parts: permissions, validation, JSON safety, the
  autosave state machine (fake timers), the import pipeline (real `.docx` files built in a
  helper), upload limits, share helpers, relative times, seed data against the real editor schema.
  No database, no browser.
- **End-to-end (`npm run e2e:api`, `npm run e2e:browser`, optional):** the real app. API suites
  cover auth, documents, shares, pages, import and the fuzz; browser suites drive Chrome or Edge
  through the editor, autosave failure paths, import, the share lifecycle across three users,
  keyboard/focus behaviour, delete, responsive layouts (390 and 768 px) and titles. They mutate
  data, so they refuse non-local targets and re-seed afterwards.
- Not covered by automated tests: the UI components in isolation (no component-test setup), and
  anything needing a screen reader. The accessibility behaviour was checked in a real browser.

## Deploy notes

- `vercel.json` sets the function region to `fra1` to sit next to the Frankfurt Neon database.
- `next build` never touches the database (the client is created lazily), so it works with no
  `DATABASE_URL`. The variable is read at request time.
- The session cookie is `Secure` when `NODE_ENV=production` (which Vercel sets), `HttpOnly`,
  `SameSite=Lax`. Nothing in `src` assumes a host or port.
- Migrations and seed are run by hand against the production database (see the README); they
  are not part of the Vercel build.

## Deliberate scope cuts and trade-offs

Everything below was a conscious decision for a time-boxed exercise, not an oversight.

| Cut / decision | What it means | What a production version would do |
| --- | --- | --- |
| **Mock authentication** | The session is a cookie holding a user id: no password, no signature, no server-side session. Spoofable by anyone who knows an id. | Real auth (passwords/passkeys, magic link or OAuth) with an opaque, revocable session. See "Deliberate cuts" above. |
| **Last write wins, no real-time** | Two people editing at once overwrite each other; autosave only protects a single client's ordering. | CRDT/OT (Yjs, TipTap Collaboration) over WebSockets, or at least optimistic concurrency with a version number and a merge or conflict prompt. |
| **No version history** | Every save replaces the content; there is no undo across sessions and no restore. | Store revisions (periodic snapshots or an event log) and a history UI. |
| **Schema-restricted editor** | Only headings 1-2, bold, italic, underline, lists, line breaks. The same schema is used for typing, pasting and import, so everything else is dropped (images, tables, links, code, quotes, ...). | Add the nodes people actually need, one at a time; the import path picks them up automatically. |
| **No zip-bomb guard on `.docx`** | A small crafted `.docx` could expand to a lot of memory while being read. Backstop: the 2 MB upload cap and the function's memory/time limits. | Inspect the archive's declared uncompressed sizes before parsing, and parse in a worker with a memory cap. |
| **Import limits** | 2 MB file and about 1 MB of resulting text; no images or tables. | Stream-parse large files, support images via object storage, import tables. |
| **No CSRF token, no rate limiting** | `SameSite=Lax` blocks the common cross-site posts; the API can still be hammered. | CSRF token or Origin checks on state-changing routes; per-user/IP rate limits. |
| **Whole user directory is visible** | The login page and share dialog list every user's email. | Invitation by email, org-scoped search. |
| **Single-line title input** | A very long title is clipped in the field (truncated in lists). | An auto-growing textarea. |
| **`neon-http` driver, no interactive transactions** | Writes are single statements (upserts) or `db.batch()`. Fits serverless with no connection management. | `pg` + Vercel Fluid pooling if multi-statement transactions become necessary. |
| **Cache Components off** | Every page depends on the per-user cookie, so prerendering/caching has nothing to offer. | Revisit if public or shared-cacheable pages appear. |
| **Next 16 `notFound()` response shape** | The 404 status is correct, but the server HTML is Next's client-render shell; the not-found UI appears once JS runs. | Upgrade to a Next version where it is server-rendered, or accept it (it is a framework behaviour, reproduced with a bare page). |

## What I would do with more time

- Real authentication and real-time collaboration (the two biggest gaps above).
- Version history with restore, and comments.
- Component-level tests for the dialogs and the editor toolbar, and an automated accessibility
  audit (axe) in the browser suite.
- A CI workflow running lint, type check, unit tests and the API suite against a throwaway Neon branch.
- Image support (object storage) and tables in the editor and in import.
