// Drizzle schema (Postgres / Neon): users, documents, document_shares.

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { SHARE_PERMISSIONS, type TipTapDoc } from "../types";

export const sharePermissionEnum = pgEnum("share_permission", SHARE_PERMISSIONS);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull().default("Untitled"),
    /** TipTap JSON. Defaults to an empty doc with one empty paragraph. */
    content: jsonb("content")
      .$type<TipTapDoc>()
      .notNull()
      .default(sql`'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      // Applied by Drizzle on every UPDATE issued through it (not a DB trigger).
      .$onUpdate(() => new Date()),
  },
  (t) => [index("documents_owner_id_idx").on(t.ownerId)],
);

export const documentShares = pgTable(
  "document_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    permission: sharePermissionEnum("permission").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("document_shares_document_user_unique").on(t.documentId, t.userId),
    index("document_shares_user_id_idx").on(t.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentShareRow = typeof documentShares.$inferSelect;
