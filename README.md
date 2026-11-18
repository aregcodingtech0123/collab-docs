# Collab Docs

> TODO: one-paragraph overview. A lightweight, Google Docs–inspired collaborative
> document editor: create and rich-text edit documents, import files, and share
> with other users as viewer or editor.

## Features

TODO — what is implemented. Planned:

- Create, rename, edit and delete documents (bold, italic, underline, H1/H2, bullet and numbered lists)
- Autosave with a Saved / Saving / Error indicator
- Import `.txt`, `.md` and `.docx` files as new documents
- Share a document with another user as **viewer** or **editor**
- "My documents" / "Shared with me" views
- Seeded users with a cookie-based "pick a user" login (no real auth)

## Stack

- Next.js (App Router) + TypeScript (strict), Tailwind CSS
- TipTap (content stored as JSON in a Postgres `jsonb` column)
- Postgres on Neon + Drizzle ORM / drizzle-kit
- zod, marked, mammoth
- Vitest

Everything runs on free tiers (Vercel Hobby, Neon Free). No paid services or API keys.

## Setup

Requires Node.js 20.12 or newer (Node 22 LTS recommended) and npm. This is enforced
through the `engines` field in `package.json`.

```bash
npm install
cp .env.example .env.local   # then put your DATABASE_URL in .env.local (see below)
npm run db:migrate           # create the tables
npm run db:seed              # seed alice, bob, carol + sample documents
npm run dev                  # http://localhost:3000
```

### Database (Neon, free tier)

1. Create a free project at [neon.com](https://neon.com) and copy its connection string
   (Dashboard → **Connect**). The pooled one (hostname contains `-pooler`) is fine.
2. Put it in `.env.local` as `DATABASE_URL=postgresql://...`. `.env.local` is git-ignored;
   never put the real value in `.env.example`, which is committed and must stay `DATABASE_URL=`.
3. `npm run db:migrate` applies the SQL in `drizzle/`. (`npm run db:push` also works for a
   throwaway database.)
4. `npm run db:seed` is idempotent: run it again at any time to reset the sample documents
   and their shares to their original state.

The app uses the `@neondatabase/serverless` HTTP driver, so it needs a Neon database
(a plain local Postgres will not work with it).

### Seeded users

There are no passwords. The login page lists the users; pick one.

| User  | Email               | Seeded documents                                                          |
| ----- | ------------------- | ------------------------------------------------------------------------- |
| Alice | `alice@example.com` | owns "Welcome to Collab Docs" (shared with Bob as **editor**); **viewer** on Carol's plan |
| Bob   | `bob@example.com`   | owns "Bob's meeting notes" (private); **editor** on "Welcome to Collab Docs" |
| Carol | `carol@example.com` | owns "Carol's project plan" (shared with Alice as **viewer**)             |

## API overview

All endpoints return JSON. Errors look like `{ "error": { "code": "...", "message": "..." } }`.
Authentication is the mock session cookie set by `POST /api/auth/login`.

| Method & path                          | What it does                                             | Who             |
| -------------------------------------- | -------------------------------------------------------- | --------------- |
| `POST /api/auth/login` `{ email }`     | Sign in as an existing user (sets cookie)                | anyone          |
| `POST /api/auth/logout`                | Clear the cookie                                         | anyone          |
| `GET /api/auth/me`                     | Current user                                             | signed in       |
| `GET /api/users`                       | All users (id, name, email), for the share dialog        | signed in       |
| `GET /api/documents`                   | `{ owned, shared }`, newest first, no content            | signed in       |
| `POST /api/documents` `{ title? }`     | Create a document (201)                                  | signed in       |
| `GET /api/documents/:id`               | Document with content + your `role`                      | owner/editor/viewer |
| `PATCH /api/documents/:id` `{ title?, content? }` | Rename and/or save content (content ≤ 1 MB)   | owner/editor    |
| `DELETE /api/documents/:id`            | Delete (204); shares are removed too                     | owner           |
| `GET /api/documents/:id/shares`        | Who the document is shared with                          | owner           |
| `POST /api/documents/:id/shares` `{ email, permission }` | Share, or change an existing share (`viewer` / `editor`) | owner  |
| `DELETE /api/documents/:id/shares` `{ userId }` | Remove a share (204)                            | owner           |

Status codes: `401` not signed in · `404` document missing **or** you have no access at all
(existence is not leaked) · `403` you can see it but lack the needed permission · `400` invalid
input (the message says which field) · `501` endpoints not built yet (`/api/documents/import`).

## Scripts

| Script                | What it does                                  |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start the dev server                          |
| `npm run build`       | Production build                              |
| `npm start`           | Run the production build                      |
| `npm run lint`        | ESLint                                        |
| `npm test`            | Run unit tests once (Vitest)                  |
| `npm run test:watch`  | Vitest in watch mode                          |
| `npm run db:generate` | Generate SQL migrations from `src/db/schema.ts` |
| `npm run db:migrate`  | Apply migrations                              |
| `npm run db:push`     | Push the schema directly (quick local setup)  |
| `npm run db:seed`     | Seed demo users and documents                 |

## Project layout

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Testing

TODO

## Deployment

TODO: Vercel Hobby + Neon, `DATABASE_URL` env var.

## Known limitations / TODO

- TODO
