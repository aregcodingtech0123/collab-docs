# Architecture

## Overview

One Next.js 16 app (App Router, TypeScript strict, Tailwind): pages are server components, the API is route handlers in
`src/app/api`, the editor is TipTap, and documents are stored as TipTap JSON in a Postgres `jsonb` column on Neon
(`@neondatabase/serverless` + Drizzle). It runs on Vercel Hobby with no other services. Code lives in `src/app`, `src/components`,
`src/lib`, `src/db`; unit tests in `tests`, optional end-to-end suites in `scripts/e2e`.

## Data and permissions

Three tables: `users`, `documents` (owner, title, `content` jsonb) and `document_shares` (document, user, `viewer | editor`,
**unique per document and user**, deleted with the document). The owner is `documents.owner_id` and has no share row; sharing
again is one upsert. Owner: view, edit, share, delete. Editor: view, edit. Viewer: view. Anyone else: nothing.

The rules are pure functions in `src/lib/permissions.ts`. **Every document and share handler goes through one function**,
`requireDocumentAccess()`, which loads the document with only the caller's own share row (matched on document *and* user), so a
share on another document can never grant access. Not signed in → 401; missing document *or* no access → 404 (existence is not
leaked); can view but not do this → 403. The UI hides buttons, but the server is the boundary.

## Authentication (mock, on purpose)

`POST /api/auth/login` sets an httpOnly cookie `collab_user_id` (`SameSite=Lax`, 7 days, `Secure` in production) holding the
user's id, and each request looks the user up. Anyone who knows an id can set that cookie. I kept it this simple to spend the time
on ownership, sharing and permissions.

## Editor, autosave and sharing

- One TipTap extension list (`src/lib/tiptap.ts`) serves typing, pasting and import: paragraphs, headings 1–2, bullet and
  numbered lists, bold, italic, underline. Nothing else exists in the schema.
- Autosave (`src/lib/autosave.ts`, a plain class tested with fake timers) saves 800 ms after the last edit, never on load.
  **Only one request is in flight**; edits made meanwhile are sent afterwards using the editor's *current* content, so older
  content cannot overwrite newer content. It flushes on blur, offers Retry on failure, and stops with a clear message on
  401/403/404 (for example when access was revoked).
- The Share dialog (owner only) uses the same API and updates in place. It is a native `<dialog>` with explicit Tab wrap-around.

## File import

`.txt` is converted directly; `.md` goes through `marked` and `.docx` through `mammoth`, producing HTML that `@tiptap/html` turns into
JSON **with the editor's own schema**. I do not sanitize HTML by hand: anything the schema has no place for (script, images, tables,
links, code) is dropped, and importer and editor cannot disagree. Headings 3–6 become level 2. Bad input (wrong type, empty, binary,
corrupt `.docx`, too large) gets a readable 400/413. Limits: 2 MB per file, about 1 MB of resulting text.

## Robustness, testing and deploy

- A fuzz suite (281 malformed requests) found three real bugs, now fixed: NUL characters and unpaired surrogates (Postgres cannot store
  them) caused 500s; content nested thousands of levels deep was accepted (now limited to 64); a malformed `%`-escape in a URL made
  Next return a bare 500 (now a 400 from `src/proxy.ts`). Unexpected errors are logged server-side and answered generically.
- 310 unit tests (`npm test`, no database or browser). Optional e2e suites (`npm run e2e:api`, `npm run e2e:browser`; 454 and 207
  checks at the last run) drive the real app and a real browser; they change data, so they refuse non-local targets.
- `vercel.json` pins functions to `fra1`, next to the Frankfurt database. `next build` never touches the database.

## Scope cuts and trade-offs

Conscious decisions for a time-boxed exercise, not oversights. The same list is in the README and SUBMISSION.md.

| Cut | What it means | A production version would |
| --- | --- | --- |
| **Mock authentication** | Cookie with a user id; spoofable; no password. | Use real auth with a revocable session. |
| **Last write wins, no real-time collaboration** | Simultaneous edits overwrite each other. | Add Yjs / TipTap Collaboration, or at least conflict detection. |
| **No version history** | Each save replaces the content. | Store snapshots and add a history UI. |
| **Schema-restricted editor** | Only headings 1–2, bold, italic, underline, lists; other formatting is dropped on paste and import. | Add the nodes people need, one at a time. |
| **Import limits, no zip-bomb guard** | 2 MB file, about 1 MB of text, no images or tables. A crafted small `.docx` could expand a lot in memory; the cap and Vercel's limits are the only backstop. | Check uncompressed size before parsing; support images and tables. |
| **No CSRF token, no rate limiting** | `SameSite=Lax` is the only CSRF protection. | Add Origin checks and rate limits. |
| **Whole user directory visible** | Login page and share dialog list every email. | Invite by email. |
| **Single-line title field** | A very long title is clipped in the field. | Use an auto-growing textarea. |
| **Free-tier cold start** | The first request after inactivity can take a few seconds. | Use a paid tier or keep-alive. |
| **Next 16 `notFound()`** | The 404 status is right, but the server HTML is Next's client-render shell; the page appears once JS runs (reproduced with a bare page). | Revisit on a newer Next. |

What I would build next is in [SUBMISSION.md](./SUBMISSION.md#what-i-would-build-next-with-another-2-4-hours).
