import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../../db/schema";

/**
 * The app's managed PostgreSQL database. Keep this module server-only: the
 * connection URL is a runtime secret and must never enter a browser bundle.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;

/** Backwards-compatible accessor for existing template-derived applications. */
export function getDb(): Db {
  return db;
}
