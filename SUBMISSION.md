# Submission

Collab Docs is a lightweight, Google Docs-inspired document editor: sign in as a demo user, write rich text with autosave,
import `.txt`, `.md` and `.docx` files, and share documents as viewer or editor. It is built with Next.js, TipTap and Postgres
(Neon), deployed on Vercel (free tiers only).

## What is in the Drive folder

1. `collab-docs-source.zip` - the full source (made with `git archive`; no `.env.local`, `node_modules` or build output)
2. `README.md` - what it does, setup, tests, deploying, import rules, known limitations
3. `ARCHITECTURE.md` - how it is built and what I cut on purpose
4. `AI_WORKFLOW.md` - how I used AI, with the full log as an appendix
5. `SUBMISSION.md` - this file
6. `video-url.txt` - the link to the walkthrough video

## Links

- Live app: https://collab-docs-tau.vercel.app/
- Source (GitHub, **private**): https://github.com/aregcodingtech0123/collab-docs - the same source is in `collab-docs-source.zip`.

The database is on a free serverless tier, so the very first request after a period of inactivity can take a few seconds.

## Demo accounts

There are no passwords: the login page lists the users, pick one. You can switch users any time from the header.

| User  | Email               | What they have                                                                            |
| ----- | ------------------- | ----------------------------------------------------------------------------------------- |
| Alice | `alice@example.com` | owns "Welcome to Collab Docs" (shared with Bob as **editor**); **viewer** on Carol's plan |
| Bob   | `bob@example.com`   | owns "Bob's meeting notes" (private); **editor** on "Welcome to Collab Docs"              |
| Carol | `carol@example.com` | owns "Carol's project plan" (shared with Alice as **viewer**)                             |

A quick tour: sign in as Alice, open "Welcome to Collab Docs", click **Share**, add Carol as Viewer, then switch to Carol in the
header. The document is under "Shared with me" and read-only. Switch back to Alice and change Carol to Editor.

## What is working

- **Documents:** create, rename inline, delete (owner only, with a confirmation), "My documents" and "Shared with me" lists.
- **Editor:** bold, italic, underline, Heading 1 and 2, bullet and numbered lists, keyboard shortcuts, and a toolbar that shows the
  active formatting.
- **Autosave:** about 0.8 s after you stop typing, with Saved / Saving / Unsaved / Couldn't save (Retry) feedback. One save runs at a
  time so older content cannot overwrite newer content, and a failure or a revoked permission is shown clearly.
- **Sharing:** owners share with another user as viewer or editor, change or remove a share, and see changes immediately. Viewers get
  a read-only editor. The server enforces every permission; a document you cannot access looks like a missing one (404).
- **Import:** `.txt`, `.md` and `.docx`, up to 2 MB, with the formatting the editor supports. Unsupported content is dropped by the
  editor's schema, and bad files get a readable error.
- **Checks I ran:** 310 unit tests; optional end-to-end suites (454 API checks including a 281-case malformed-input fuzz, and 207
  checks in a real Edge browser) that passed at the last run; layouts viewed at 390 px and 768 px; a fresh clone built, migrated,
  seeded and tested following only the README.

## What is incomplete or deliberately cut

These were conscious decisions for a time-boxed exercise. The same list, with what a production version would do, is in
ARCHITECTURE.md.

- **Mock authentication:** the "session" is a cookie holding a user id, so anyone who knows an id can act as that user. No password.
- **Last write wins, no real-time collaboration:** simultaneous edits overwrite each other.
- **No version history:** every save replaces the content; there is no restore.
- **Schema-restricted editor:** only headings 1-2, bold, italic, underline and lists. Other formatting is dropped on paste and import.
- **Import limits:** 2 MB per file and about 1 MB of resulting text; no images or tables. No zip-bomb guard on `.docx` files.
- **No CSRF token and no rate limiting.**
- **Whole user directory visible:** the login page and share dialog list every email.
- **Single-line title field:** a very long title is clipped in the field.
- **Free-tier cold start:** the first request after inactivity can take a few seconds.
- **Not built at all:** comments, search, export, presence or live cursors.
- **Tested only in Edge** on desktop: not in Firefox, Safari, on real phones, or with a screen reader.

## What I would build next with another 2-4 hours

In this order; the first three fit in about three hours.

1. **Detect conflicting edits (about 1 h).** Add a `version` number to documents, send it with each save, return a 409 when it is
   stale, and show "This document changed elsewhere: reload or keep mine" instead of silently overwriting. This fixes the biggest
   data-loss risk without building real-time collaboration.
2. **Version history (about 1.5 h).** A `document_revisions` table with a snapshot at most every few minutes, a list of revisions
   for owners and editors, and a restore button. It also gives a safety net for the autosave overwrites in item 1.
3. **Zip-bomb guard for `.docx` (about 30 min).** Read the archive's central directory and reject the file before parsing if the
   declared uncompressed size or the compression ratio is too large; add a test with a crafted archive.
4. **Harden the session cookie (about 45 min).** Sign the user id with a `SESSION_SECRET` so ids cannot be forged, and add an
   `Origin` check on the state-changing routes. It stays passwordless, so it is still a demo login.
5. **CI (about 30 min).** A GitHub Actions workflow that runs lint, type check and the unit tests on every push.
6. **If time is left (about 1 h):** an automated accessibility check (axe) in the browser suite, and component tests for the share
   and delete dialogs.
