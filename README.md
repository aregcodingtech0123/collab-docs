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
cp .env.example .env.local   # then set DATABASE_URL (a free Neon database)
npm run db:push              # create tables (or: db:generate + db:migrate)
npm run db:seed              # seed alice, bob, carol + sample docs (TODO: not implemented yet)
npm run dev                  # http://localhost:3000
```

TODO: how to get a Neon connection string (link to Neon free tier steps).

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
