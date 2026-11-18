# Collab Docs

A lightweight, Google Docs–inspired document editor. Sign in as one of three demo users, write
rich text with autosave, import `.txt` / `.md` / `.docx` files, and share documents with other
users as **viewer** or **editor**. Next.js + TipTap + Postgres (Neon); everything runs on free tiers.
The database is on a free serverless tier, so the very first request after a period of inactivity can take a few seconds.

- [Features](#features) · [Demo users](#demo-users) · [Setup](#setup) · [Running the tests](#running-the-tests) ·
  [Running the e2e suites](#running-the-e2e-suites) · [Deploying](#deploying-vercel--neon) ·
  [File import](#file-import) · [API](#api-overview) · [Known limitations](#known-limitations)
- How it is built, and what was cut on purpose: [ARCHITECTURE.md](./ARCHITECTURE.md).
  How AI was used: [AI_WORKFLOW.md](./AI_WORKFLOW.md). Hand-in notes: [SUBMISSION.md](./SUBMISSION.md).

## Features

- **Users:** a "pick a user" login (mock auth, see [Known limitations](#known-limitations)), a user switcher in the header and Log out.
- **Documents:** "My documents" / "Shared with me" lists (owner, last-updated time, Owner / Shared · Editor / Shared · Viewer badge); create, rename inline (Enter or blur; Esc cancels) and **delete** (owner only, with a confirmation dialog).
- **Editor:** bold, italic, underline, Heading 1/2, bullet and numbered lists, with keyboard shortcuts and a toolbar that shows the active formatting.
- **Autosave** about 0.8 s after you stop typing, with a Saved / Saving… / Unsaved changes / Couldn't save · Retry indicator. One save is in flight at a time (newer content can never be overwritten by older), edits are flushed on blur and when the tab is hidden, and a "leave page?" warning appears only while there are unsaved changes.
- **Roles, enforced on the server and reflected in the UI:** owners can do everything; editors can edit; viewers get a read-only editor with a "View only" badge; documents you cannot access show a "not found" page.
- **Sharing:** owners get a **Share** button. The dialog lists who has access (change Viewer/Editor, or Remove), and adds people from a list or by typing an email. It updates in place, is keyboard accessible (focus is trapped, Esc closes, focus returns to the button) and shows readable errors.
- **Import** a `.txt`, `.md` or `.docx` file as a new document ([details and limits](#file-import)).
- Works on phones and tablets (checked at 390 px and 768 px), with visible keyboard focus.

## Demo users

There are **no passwords**: the login page lists the demo users, pick one. You can switch users at any time from the header.

| User  | Email               | Seeded documents                                                                          |
| ----- | ------------------- | ----------------------------------------------------------------------------------------- |
| Alice | `alice@example.com` | owns "Welcome to Collab Docs" (shared with Bob as **editor**); **viewer** on Carol's plan |
| Bob   | `bob@example.com`   | owns "Bob's meeting notes" (private); **editor** on "Welcome to Collab Docs"              |
| Carol | `carol@example.com` | owns "Carol's project plan" (shared with Alice as **viewer**)                             |

A quick tour: sign in as Alice → open "Welcome to Collab Docs" → **Share** → add Carol as Viewer → switch to Carol in the
header: the document is under "Shared with me" and read-only → switch back to Alice and change Carol to Editor.

## Setup

**Requirements:** Node.js **22 LTS** recommended (20.12 or newer works; enforced by `engines`, see `.nvmrc`), npm,
and a free [Neon](https://neon.com) Postgres database (the app uses Neon's HTTP driver, so a plain local Postgres will not work).

1. **Create a Neon database.** In the Neon console create a free project, open **Connect** and copy the connection string
   (`postgresql://…`). The pooled one (hostname contains `-pooler`) is fine.
2. **Get the code, install and configure.**

   ```bash
   git clone <repository-url> collab-docs
   cd collab-docs
   npm install
   ```

   `npm install` may print an `install-scripts` warning about `esbuild`. It is harmless: everything works without running
   that script.

   Create `.env.local` from the template and put your connection string in it:

   | Shell                         | Command                                  |
   | ----------------------------- | ---------------------------------------- |
   | macOS / Linux / Git Bash      | `cp .env.example .env.local`             |
   | PowerShell                    | `Copy-Item .env.example .env.local`      |
   | Windows cmd                   | `copy .env.example .env.local`           |

   Then edit `.env.local` so it reads `DATABASE_URL=postgresql://…` (one line, no quotes).
   `.env.local` is git-ignored. Never put the real value in `.env.example`: it is committed and must stay `DATABASE_URL=`.
3. **Create the tables and the demo data.**

   ```bash
   npm run db:migrate   # applies the SQL in ./drizzle
   npm run db:seed      # demo users + 3 sample documents
   ```

   `db:migrate` may print a harmless warning about the Neon driver and websockets. `db:seed` is idempotent: run it again at any
   time to reset the sample documents and their shares to their original state (other documents are left alone).
4. **Run it.**

   ```bash
   npm run dev          # http://localhost:3000
   ```

   or, as in production: `npm run build` then `npm start`. If port 3000 is busy, pick another one:
   `npm run dev -- -p 3001` or `npm start -- -p 3001` (PowerShell: the same; the variable form is `$env:PORT = "3001"`).

If `DATABASE_URL` is missing the app starts, but pages that need the database show a generic error and the server log says
exactly what is missing.

## Running the tests

```bash
npm test             # unit tests (Vitest): permissions, validation, import, autosave, sharing, ...
npm run lint         # ESLint (src, tests, scripts, config files)
npm run typecheck    # generates Next's route types, then runs tsc --noEmit
npm run build        # production build (does not need a database)
```

`npm test` needs neither a database nor a browser. The suites below are separate and optional.

## Running the e2e suites

Two optional end-to-end suites exercise the real app. **They are not part of `npm test`.**

**Prerequisites**

1. The app is **running** (`npm run build && npm start`, or `npm run dev`) at `http://localhost:3000`, or pass another URL.
2. The database is **seeded** (`npm run db:seed`) and `.env.local` is present (the suites re-seed afterwards).
3. For the browser suite only: **Google Chrome or Microsoft Edge installed** (it uses `playwright-core` with your installed browser; nothing is downloaded).

```bash
npm run e2e:api                              # HTTP only: auth, documents, shares, pages, import, malformed-input fuzz
npm run e2e:browser                          # a real browser: editor, autosave, import, sharing, responsive, focus, delete
npm run e2e:api -- http://localhost:3100     # different URL
```

> **Warning: these suites change data.** They create, rename, share, import and delete documents and then **reset the demo data
> with `npm run db:seed`** using the database in your `.env.local`. Use a development database. For safety they **refuse to run
> unless the URL is `localhost` / `127.0.0.1`**; setting `E2E_ALLOW_REMOTE=1` overrides this (they then do not re-seed). They never print `DATABASE_URL`.

Options (environment variables): `E2E_BASE_URL`, `E2E_ALLOW_REMOTE=1`, `E2E_HEADED=1` (show the browser),
`E2E_BROWSER_CHANNEL` (`chrome` or `msedge`) or `E2E_BROWSER_PATH`, `E2E_OUT` (screenshot folder, default `./e2e-output`, git-ignored).

## Deploying (Vercel + Neon)

`vercel.json` pins the function region to `fra1` (Frankfurt) because the Neon database is in `eu-central-1`; change both together
if you use another region.

1. **Neon:** use the project's default branch (new projects call it `production`) or create a dedicated branch for production.
   Copy that branch's connection string (**Connect** → pick the branch).
2. **Vercel:** import the GitHub repository. Framework preset **Next.js** is detected. In **Project Settings → Environment
   Variables** add `DATABASE_URL` (Production, and Preview if you want previews to work) with the Neon connection string.
   In **Settings → General** set **Node.js Version** to `22.x` (Vercel does not read `.nvmrc`).
3. **Create the tables and the demo data in the production database.** Run these from your local shell, passing
   `DATABASE_URL` for just these commands. A value set in the shell **takes precedence** over `.env.local` (checked), so your
   local development database is not used.

   PowerShell:

   ```powershell
   $env:DATABASE_URL = "postgresql://…your production connection string…"
   npm run db:migrate
   npm run db:seed
   Remove-Item Env:DATABASE_URL        # clear it from this terminal session
   ```

   bash / zsh (the variable exists only for that one command):

   ```bash
   DATABASE_URL='postgresql://…' npm run db:migrate
   DATABASE_URL='postgresql://…' npm run db:seed
   ```

   If migrations fail on a pooled connection string, use the **direct** (non-pooled) one for this step.
4. **Deploy** (push to the connected branch, or **Redeploy** after adding the variable). Environment variables are read at
   runtime, so changing `DATABASE_URL` needs a redeploy.

**Smoke test after deploying**

- [ ] The site root redirects to `/login`, which lists Alice, Bob and Carol.
- [ ] Sign in as Alice: the list shows "Welcome to Collab Docs" (Owner) and "Carol's project plan" (Shared · Viewer).
- [ ] Open "Welcome to Collab Docs", type something, wait for **Saved**, reload: the text is still there.
- [ ] In the browser dev tools, the `collab_user_id` cookie has **HttpOnly** and **Secure**.
- [ ] Share the document with Carol as Viewer; in a private window sign in as Carol: it is read-only under "Shared with me".
- [ ] Import a small `.md` or `.docx` file: it opens with headings and lists intact.
- [ ] Open `/documents/00000000-0000-4000-8000-000000000000`: a "Document not found" page (and a 404 in the network tab).
- [ ] Log out, then open `/documents`: you are sent to `/login`.
- [ ] Vercel → **Logs** shows no errors; the deployment's functions run in `fra1`.

Notes: the first request after the database has been idle can take a second or two (Neon free tier suspends idle databases).
Vercel's Hobby plan caps request bodies at about 4.5 MB; the 2 MB import limit stays well under it.

## File import

Use **Import file** on the documents page, or `POST /api/documents/import` (multipart, field `file`).

- **Supported types:** `.txt`, `.md`, `.docx` (extension matched case-insensitively). Anything else is rejected with "Unsupported file type. Use .txt, .md or .docx."
- **Two limits:** the **file** may be at most **2 MB** (larger uploads get HTTP 413), **and** the resulting text must fit in one document, which holds about **1 MB of text**. A 2 MB plain-text file therefore imports only if its content stays under that; otherwise you get a clear message ("The text in this file is too large for one document (the limit is about 1 MB of text…). Split the file into smaller parts…"). Both limits are stated next to the Import button.
- The new document is owned by you; its title is the file name without the extension (max 200 characters, "Imported document" if the name is empty).
- Empty or whitespace-only files, binary files renamed to `.txt`/`.md`, and corrupt `.docx` files get a readable 400, never a server error.

**What is imported:** paragraphs; Heading 1 and 2 (deeper headings become Heading 2); bold, italic, underline; bullet and numbered lists (nested ones included); line breaks. For `.txt`, a blank line starts a new paragraph and a single newline becomes a line break.

**What is NOT imported:** images (including embedded ones and their alt text), tables (the cell text is kept as plain paragraphs), links (the link text is kept, the address is dropped), code blocks and inline code, block quotes, horizontal rules, strikethrough, text colour/size/fonts, comments, tracked changes, headers/footers and footnotes. HTML such as `<script>`, `<style>` or `<iframe>` inside a Markdown file is dropped, not executed or stored: the editor schema simply has no place for it (see [ARCHITECTURE.md](./ARCHITECTURE.md#file-import)).

## API overview

All endpoints return JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.
Authentication is the mock session cookie set by `POST /api/auth/login`.

| Method & path                                    | What it does                                             | Who                 |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------- |
| `POST /api/auth/login` `{ email }`               | Sign in as an existing user (sets cookie)                | anyone              |
| `POST /api/auth/logout`                          | Clear the cookie                                         | anyone              |
| `GET /api/auth/me`                               | Current user                                             | signed in           |
| `GET /api/users`                                 | All users (id, name, email), for the share dialog        | signed in           |
| `GET /api/documents`                             | `{ owned, shared }`, newest first, no content            | signed in           |
| `POST /api/documents` `{ title? }`               | Create a document (201)                                  | signed in           |
| `GET /api/documents/:id`                         | Document with content + your `role`                      | owner/editor/viewer |
| `PATCH /api/documents/:id` `{ title?, content? }`| Rename and/or save content (content ≤ 1 MB)              | owner/editor        |
| `DELETE /api/documents/:id`                      | Delete (204); shares are removed too                     | owner               |
| `GET /api/documents/:id/shares`                  | Who the document is shared with                          | owner               |
| `POST /api/documents/:id/shares` `{ email, permission }` | Share, or change a share (`viewer` / `editor`)   | owner               |
| `DELETE /api/documents/:id/shares` `{ userId }`  | Remove a share (204)                                     | owner               |
| `POST /api/documents/import` (multipart `file`)  | Create a document from a `.txt`/`.md`/`.docx` (201 `{ document: { id, title } }`) | signed in |

Status codes: `401` not signed in · `404` document missing **or** you have no access at all (existence is not leaked) ·
`403` you can see it but lack the needed permission · `400` invalid input (the message says which field) · `413` uploaded file over 2 MB.
Malformed input never produces a 5xx (covered by the fuzz suite).

## Scripts

| Script                  | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Start the dev server                                           |
| `npm run build`         | Production build (no database needed)                          |
| `npm start`             | Run the production build                                       |
| `npm run lint`          | ESLint                                                         |
| `npm run typecheck`     | Generate Next's route types, then `tsc --noEmit`               |
| `npm test`              | Unit tests once (Vitest)                                       |
| `npm run test:watch`    | Vitest in watch mode                                           |
| `npm run e2e:api`       | API end-to-end suites (needs a running server)                 |
| `npm run e2e:browser`   | Browser end-to-end suites (needs a running server + Chrome/Edge) |
| `npm run db:generate`   | Generate SQL migrations from `src/db/schema.ts`                |
| `npm run db:migrate`    | Apply migrations                                               |
| `npm run db:push`       | Push the schema directly (throwaway databases only)            |
| `npm run db:seed`       | Seed / reset the demo users and sample documents               |

## Known limitations

These are deliberate cuts for a time-boxed exercise; ARCHITECTURE.md explains each and what a production version would do.

- **Mock authentication:** the "session" is a cookie holding a user id; anyone who knows an id can act as that user. There is no password, signature, CSRF token or rate limiting.
- **No real-time collaboration, last write wins:** if two people edit the same document at once, the later save overwrites the earlier one. There is no merge and no version history.
- **The editor is deliberately small:** only headings 1–2, bold, italic, underline and lists. Pasted or imported content that uses anything else (images, tables, links, code, …) loses that formatting.
- **Import:** no images or tables; a crafted `.docx` that expands enormously when unzipped is not specifically guarded against (the 2 MB upload cap and Vercel's function limits are the backstop).
- **Titles are single-line:** a very long title is clipped in the title field (it is shown truncated in lists).
- **Neon free tier:** the first request after idle time is slower (the database wakes up).
- **User directory:** the login page and the share dialog list every user's email, which is fine for three demo users but would not be in a real product.
