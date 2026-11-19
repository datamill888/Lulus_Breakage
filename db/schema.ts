/**
 * The app-owned PostgreSQL schema. Define tables with drizzle-orm/pg-core,
 * then run `appdb push` immediately. appdb updates the development database
 * and the generated db/snapshot.json used to plan production changes.
 *
 * Store only data created by this app. Incorta data remains live and
 * per-user, so never copy or cache Incorta query results here.
 *
 * Example:
 *
 *   import { sql } from "drizzle-orm";
 *   import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
 *
 *   export const notes = pgTable("notes", {
 *     id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
 *     authorSub: text("author_sub").notNull(),
 *     body: text("body").notNull(),
 *     createdAt: timestamp("created_at", { withTimezone: true })
 *       .notNull()
 *       .default(sql`now()`),
 *   });
 */

export {};
